import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { MigrationService } from '@/services/MigrationService';
import { producaoService } from '@/services/producao.service';
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';

interface SyncStatus {
    isOnline: boolean;
    isSyncing: boolean;
    pendingCount: number;
    lastSync?: Date;
}

interface SyncContextType extends SyncStatus {
    syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, currentLab } = useAuth();
    const { addToast } = useToast();
    const [status, setStatus] = useState<SyncStatus>({
        isOnline: navigator.onLine,
        isSyncing: false,
        pendingCount: 0
    });

    const checkPendingData = useCallback(() => {
        const keys = [
            'fibertech_labs',
            'fibertech_analistas',
            'fibertech_producao_data'
        ];

        let count = 0;
        keys.forEach(key => {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (Array.isArray(parsed)) {
                        count += parsed.length;
                    }
                }
            } catch (e) {
                console.error(`Error checking pending data for key ${key}:`, e);
            }
        });

        setStatus(prev => ({ ...prev, pendingCount: count }));
    }, []);

    // Ref estável para status.isSyncing — evita que syncNow mude de referência a cada render
    const isSyncingRef = useRef(status.isSyncing);
    useEffect(() => { isSyncingRef.current = status.isSyncing; }, [status.isSyncing]);

    const syncNow = useCallback(async () => {
        if (!isAuthenticated || isSyncingRef.current || !navigator.onLine) return;

        setStatus(prev => ({ ...prev, isSyncing: true }));

        try {
            // 1. Sync Base Entities (Labs, Analysts, Machines)
            await MigrationService.pushLocalToCloud();

            // 2. Sync Production Data if Lab is selected
            const localProducaoStr = localStorage.getItem('fibertech_producao_data');
            if (localProducaoStr && currentLab) {
                const data = JSON.parse(localProducaoStr);
                if (data.length > 0) {
                    const success = await producaoService.uploadData(data);
                    if (success) {
                        localStorage.removeItem('fibertech_producao_data');
                    }
                }
            }

            setStatus(prev => ({
                ...prev,
                isSyncing: false,
                pendingCount: 0,
                lastSync: new Date()
            }));

            addToast({
                title: "Sincronização Concluída",
                description: "Todos os dados locais foram salvos na nuvem.",
                type: "success"
            });
        } catch (error) {
            console.error("Sync failed:", error);
            setStatus(prev => ({ ...prev, isSyncing: false }));
            addToast({
                title: "Falha na Sincronização",
                description: "Não foi possível enviar todos os dados. Tentaremos novamente em breve.",
                type: "error"
            });
        }

    }, [isAuthenticated, currentLab, addToast]);

    useEffect(() => {
        const handleOnline = () => setStatus(prev => ({ ...prev, isOnline: true }));
        const handleOffline = () => setStatus(prev => ({ ...prev, isOnline: false }));

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check
        checkPendingData();

        // Periodic check every 5 minutes
        const interval = setInterval(checkPendingData, 5 * 60 * 1000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [checkPendingData]);

    // Ref estável para syncNow — evita que o useEffect abaixo seja reexecutado
    // toda vez que syncNow muda (o que causaria loop infinito)
    const syncNowRef = useRef(syncNow);
    useEffect(() => { syncNowRef.current = syncNow; }, [syncNow]);

    // Auto-sync when coming online if authenticated
    // IMPORTANTE: syncNow não está nas dependências para evitar loop infinito.
    // Usamos syncNowRef.current para chamar sempre a versão mais recente.
    useEffect(() => {
        if (status.isOnline && isAuthenticated && status.pendingCount > 0) {
            syncNowRef.current();
        }
    }, [status.isOnline, isAuthenticated, status.pendingCount]);

    return (
        <SyncContext.Provider value={{ ...status, syncNow }}>
            {children}
            {/* Minimal Background Sync Indicator */}
            <div className="fixed bottom-6 right-24 z-50 pointer-events-none">
                <div className={`
                    flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg transition-all duration-500 pointer-events-auto cursor-help
                    ${status.isSyncing ? 'bg-blue-50 border-blue-200 text-blue-600 animate-pulse' :
                        status.isOnline ? 'bg-white border-neutral-100 text-neutral-400 opacity-20 hover:opacity-100' :
                            'bg-red-50 border-red-100 text-red-500'}
                `}>
                    {status.isSyncing ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : status.isOnline ? (
                        status.pendingCount > 0 ? <AlertCircle className="h-4 w-4 text-amber-500" /> : <Cloud className="h-4 w-4" />
                    ) : (
                        <CloudOff className="h-4 w-4" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                        {status.isSyncing ? 'Sincronizando...' :
                            status.isOnline ? (status.pendingCount > 0 ? `${status.pendingCount} pendentes` : 'Sincronizado') :
                                'Offline'}
                    </span>
                </div>
            </div>
        </SyncContext.Provider>
    );
}

export function useSync() {
    const context = useContext(SyncContext);
    if (context === undefined) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
}

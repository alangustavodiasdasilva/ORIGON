import { useState, useEffect } from "react";
import { Wifi, WifiOff, Activity } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function NetworkMonitor() {
    const [ping, setPing] = useState<number | null>(null);
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
    const [status, setStatus] = useState<'fast' | 'slow' | 'offline' | 'checking'>('checking');

    useEffect(() => {
        // Monitor native online/offline
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => {
            setIsOnline(false);
            setStatus('offline');
            setPing(null);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Ping check function
        const measurePing = async () => {
            if (!navigator.onLine) {
                setStatus('offline');
                return;
            }

            const start = performance.now();
            try {
                // Fazer um select bem leve
                const { error } = await supabase.from('laboratorios').select('id').limit(1);
                const end = performance.now();
                
                if (error) throw error;

                const latency = Math.round(end - start);
                setPing(latency);

                if (latency < 200) setStatus('fast');
                else setStatus('slow');

            } catch (err) {
                // Timeout ou erro de rede (pode estar offline da API mas online de rede local)
                setPing(null);
                setStatus('offline');
            }
        };

        // Measure immediately and then every 10 seconds
        measurePing();
        const interval = setInterval(measurePing, 10000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    if (status === 'checking') return null;

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 border border-neutral-200 rounded-lg bg-neutral-50/50 shadow-sm" title="Status da Conexão com o Banco de Dados">
            {status === 'offline' ? (
                <WifiOff className="h-3.5 w-3.5 text-red-500" />
            ) : status === 'slow' ? (
                <Activity className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            ) : (
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            )}
            
            <div className="flex flex-col">
                <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${
                    status === 'offline' ? 'text-red-600' :
                    status === 'slow' ? 'text-amber-600' :
                    'text-emerald-600'
                }`}>
                    {status === 'offline' ? 'Offline' : status === 'slow' ? 'Instável' : 'Estável'}
                </span>
                
                <span className="text-[8px] font-mono text-neutral-400 mt-0.5">
                    {ping !== null ? `${ping}ms` : '---'}
                </span>
            </div>
        </div>
    );
}

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Activity, Database, Server, ShieldCheck, Users, Trash2, Edit, LogOut, Upload } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AnalistaService, type Analista } from "@/entities/Analista";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import LabsTab from "@/components/admin/LabsTab";
import AnalystsTab from "@/components/admin/AnalystsTab";
import { LabService } from "@/entities/Lab";
import type { Lab } from "@/entities/Lab";
import { MigrationService } from "@/services/MigrationService";
import { Loader2 } from "lucide-react";
import { usePresence } from "@/hooks/usePresence";
import { useAudioAlerts } from "@/hooks/useAudioAlerts";
import AuditLogsTab from "@/components/admin/AuditLogsTab";

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

export default function Admin() {
    const { user, currentLab, deselectLab } = useAuth();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState("dashboard");
    const [allAnalysts, setAllAnalysts] = useState<Analista[]>([]);
    const [onlineAnalysts, setOnlineAnalysts] = useState<Analista[]>([]);
    const { onlineUsers } = usePresence();
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    // Segurança: Redireciona usuários comuns para a Home, permite admin_global e admin_lab
    if (user && user.acesso !== 'admin_global' && user.acesso !== 'admin_lab') {
        return <Navigate to="/" replace />;
    }

    useEffect(() => {
        const loadCount = async () => {
            // Load ALL analysts for the dictionary to resolve names/labs
            const data = await AnalistaService.list();
            
            // Carregar labs se ainda n tiver
            const labsList = await LabService.list();
            setLabs(labsList);

            setAllAnalysts(data); // Salva o mestre pra fazer o cruzamento com WebSocket
        };

        loadCount();
    }, [user, currentLab]);

    // O presence effect escuta o websocket global e atualiza em tempo real
    useEffect(() => {
        if (allAnalysts.length === 0) return;
        
        const onlineIds = onlineUsers.map(u => u.user_id);
        const filtered = allAnalysts.filter(a => {
            if (!onlineIds.includes(a.id)) return false;
            
            // Sempre exibe o próprio usuário logado, independente de filtros de lab
            if (String(a.id) === String(user?.id)) return true;
            
            // Admin global
            if (user?.acesso === 'admin_global') {
                if (currentLab) return String(a.lab_id) === String(currentLab.id);
                return true;
            }
            
            // Admin de laboratório
            return String(a.lab_id) === String(user?.lab_id);
        });
        setOnlineAnalysts(prev => {
            const isSame = prev.length === filtered.length && prev.every((v, i) => v.id === filtered[i].id);
            return isSame ? prev : filtered;
        });
    }, [onlineUsers, allAnalysts, user, currentLab]);

    const handleSync = async () => {
        if (!isSupabaseEnabled()) {
            addToast({
                title: "Configuração Necessária",
                description: "Adicione as chaves no arquivo .env para habilitar a nuvem.",
                type: "warning"
            });
            return;
        }

        setIsSyncing(true);
        try {
            await MigrationService.pushLocalToCloud();
            addToast({ title: "Sincronização Concluída", description: "Seus dados locais foram enviados para a nuvem.", type: "success" });
            // Forçar reload dos dados das abas
            window.location.reload();
        } catch (error: any) {
            addToast({ title: "Erro na Sincronização", description: error.message, type: "error" });
        } finally {
            setIsSyncing(false);
        }
    };

    // Filtrar abas baseadas no nível de acesso
    const tabs = [
        { id: "dashboard", label: "Visão Geral", icon: Activity },
        // A aba de laboratórios deve estar visível para administradores globais
        { id: "labs", label: "Laboratórios", icon: Database },
        { id: "analysts", label: "Access Control", icon: Users },
        { id: "machines", label: "Máquinas", icon: Server },
        { id: "audit", label: "Auditoria", icon: ShieldCheck }
    ];

    // Se não for admin_global, removemos as abas de labs e auditoria
    const filteredTabs = user?.acesso === 'admin_global'
        ? tabs
        : tabs.filter(t => t.id !== 'labs' && t.id !== 'audit');

    return (
        <div className="max-w-7xl mx-auto space-y-16 animate-fade-in text-black pb-24">
            {/* Header */}
            <div className="flex flex-col gap-8 md:flex-row md:items-end justify-between border-b border-black pb-8">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 border border-black flex items-center justify-center bg-black text-white">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 block">
                                    {user?.acesso === 'admin_global' ? 'Global Administration' : 'Lab Administration'}
                                </span>
                                <span className={cn(
                                    "px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full border",
                                    isSupabaseEnabled()
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                        : "bg-amber-50 text-amber-600 border-amber-200"
                                )}>
                                    {isSupabaseEnabled() ? '● Cloud Sync Active' : '⚠ Local Storage Mode'}
                                </span>
                            </div>
                            <h1 className="text-4xl font-serif text-black leading-none">
                                {currentLab ? `Config: ${currentLab.nome}` : 'System Config'}
                            </h1>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Botão de sair do laboratório (apenas admin_global e se tiver lab selecionado) */}
                    {user?.acesso === 'admin_global' && currentLab && (
                        <Button
                            onClick={() => deselectLab()}
                            variant="destructive"
                            className="rounded-none h-12 px-6 font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-none"
                        >
                            <LogOut className="h-4 w-4" />
                            Sair do Lab
                        </Button>
                    )}

                    <Button
                        onClick={() => addToast({ title: "Audit Log Generated", type: "info" })}
                        className="rounded-none h-12 px-6 border border-black bg-transparent text-black hover:bg-neutral-50 font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                        Export Logs
                    </Button>
                    <Button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="rounded-none h-12 px-6 bg-black text-white hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isSyncing ? 'Sincronizando...' : 'Sync Nodes (Push)'}
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-8 border-b border-neutral-200 pb-px">
                {filteredTabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "group flex items-center gap-3 pb-4 border-b-2 text-xs font-bold uppercase tracking-widest transition-all",
                            activeTab === tab.id
                                ? "border-black text-black"
                                : "border-transparent text-neutral-400 hover:text-black hover:border-neutral-300"
                        )}
                    >
                        <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-black" : "text-neutral-400")} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
                {activeTab === "dashboard" && <DashboardTab onlineAnalysts={onlineAnalysts} labs={labs} />}
                {activeTab === "labs" && <LabsTab />}
                {activeTab === "analysts" && <AnalystsTab />}
                {activeTab === "machines" && <SystemConfigTab />}
                {activeTab === "audit" && <AuditLogsTab />}
            </div>
        </div>
    );
}

// Subcomponents
function DashboardTab({ onlineAnalysts, labs }: { onlineAnalysts: Analista[], labs: Lab[] }) {
    const { user } = useAuth();
    return (
        <div className="grid gap-8 md:grid-cols-3">
            {/* Stat Card */}
            <div className="p-8 border border-black bg-white flex flex-col justify-between h-64 hover:bg-neutral-50 transition-colors cursor-default">
                <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Online Analysts</span>
                    <Users className="h-5 w-5 text-black" />
                </div>
                <div className="flex flex-col h-full justify-end pb-2">
                    <span className="text-6xl font-serif leading-none mb-4">{onlineAnalysts.length}</span>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-hide">
                        {onlineAnalysts.map(analyst => {
                            const labName = labs.find(l => String(l.id) === String(analyst.lab_id))?.nome || 'Admin Global / Não Atr.';
                            return (
                                <div key={analyst.id} className="flex flex-col justify-center gap-0 group/item border-b border-neutral-100 last:border-0 pb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            {analyst.foto ? (
                                                <>
                                                <img 
                                                    src={analyst.foto} 
                                                    className="w-6 h-6 rounded-full object-cover" 
                                                    alt={analyst.nome} 
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        const fallback = e.currentTarget.parentElement?.querySelector('.fallback-initials');
                                                        if (fallback) fallback.classList.remove('hidden');
                                                    }}
                                                />
                                                <div className="fallback-initials hidden w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[8px] font-bold">
                                                    {analyst.nome.substring(0, 2).toUpperCase()}
                                                </div>
                                                </>
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[8px] font-bold">
                                                    {analyst.nome.substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)] border border-white z-10"></span>
                                        </div>
                                        <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 group-hover/item:text-black transition-colors truncate">
                                            {analyst.nome}
                                        </span>
                                    </div>
                                    <span className="text-[9px] uppercase font-mono tracking-widest text-neutral-400 pl-3.5">
                                        {labName}
                                    </span>
                                </div>
                            );
                        })}
                        {onlineAnalysts.length === 0 && (
                            <span className="text-[10px] uppercase tracking-widest text-neutral-400">No active sessions</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Status Card */}
            <div className="md:col-span-2 p-8 bg-black text-white flex flex-col justify-between h-64 relative overflow-hidden">
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{user?.acesso.replace('_', ' ')}</span>
                    </div>
                    <h3 className="text-3xl font-serif text-white">{user?.nome}</h3>
                    <div className="text-xs font-mono text-neutral-400 max-w-md space-y-1">
                        <p className="flex items-center gap-2">
                            <span className="text-neutral-600">EMAIL:</span>
                            <span className="text-white">{user?.email}</span>
                        </p>
                        <p className="flex items-center gap-2">
                            <span className="text-neutral-600">CARGO:</span>
                            <span className="text-white">{user?.cargo || "N/A"}</span>
                        </p>
                        <p className="pt-2 text-neutral-500 border-t border-white/10 mt-2">
                            Sistema de Análise HVI Avançada - Versão 3.1
                            <br />
                            Última atualização: 14/02/2026 09:13
                            <br />
                            Todos os direitos reservados.
                        </p>
                    </div>
                </div>
                {/* PAC-MAN ANIMADO - CORRIGIDO VISIBILIDADE */}
                <div className="absolute bottom-0 right-0 w-full overflow-hidden opacity-30 pointer-events-none">
                    <div className="flex animate-marquee whitespace-nowrap text-6xl text-white/50 font-black">
                        <span className="mx-4">ᗧ • • • 🍒 • • 👻</span>
                        <span className="mx-4">ᗧ • • • 🍒 • • 👻</span>
                        <span className="mx-4">ᗧ • • • 🍒 • • 👻</span>
                        <span className="mx-4">ᗧ • • • 🍒 • • 👻</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Interfaces
import { MachineService } from "@/entities/Machine";
import type { Machine } from "@/entities/Machine";

function SystemConfigTab() {
    const { user, currentLab } = useAuth();
    const { addToast } = useToast();
    const { config: audioConfig, updateConfig: updateAudioConfig, playAlert } = useAudioAlerts();
    const [machines, setMachines] = useState<Machine[]>([]);
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isUploadingSound, setIsUploadingSound] = useState(false);

    // Flag para bloquear o realtime durante operações de delete (evita race condition)
    const isDeleteInProgressRef = useRef(false);

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formMachineId, setFormMachineId] = useState("");
    const [formSerialNumber, setFormSerialNumber] = useState("");
    const [formModel, setFormModel] = useState<'USTER' | 'PREMIER'>("USTER");
    const [formLabId, setFormLabId] = useState("");

    useEffect(() => {
        const targetLabId = (currentLab?.id || (user?.acesso === 'admin_lab' ? user.lab_id : "")) || "";
        setFormLabId(targetLabId);
        loadData();
        // Subscribe to real-time changes — ignora eventos durante delete
        const unsubscribe = MachineService.subscribe(() => {
            if (!isDeleteInProgressRef.current) {
                loadData();
            }
        });
        return () => unsubscribe();
    }, [user, currentLab]);

    const loadData = async () => {
        // Load Labs for name resolution
        try {
            const labsData = await LabService.list();
            setLabs(labsData);
        } catch (e) {
            console.error("Failed to load labs", e);
        }

        // Load Machines
        try {
            // Limpeza automática de máquinas fantasma ao entrar no admin
            if (user?.acesso === 'admin_global') {
                const cleanedCount = await MachineService.cleanupGhostMachines();
                if (cleanedCount > 0) {
                    addToast({ title: "Limpeza de Máquinas", description: `${cleanedCount} máquinas fantasma foram removidas.`, type: "info" });
                }
            }

            const isGlobalAdmin = user?.acesso === 'admin_global';
            const targetLabId = currentLab?.id || (user?.acesso === 'admin_lab' ? user.lab_id : null);
            let data: Machine[] = [];

            if (targetLabId && !isGlobalAdmin) {
                // Fetch only for the specific lab
                data = await MachineService.listByLab(targetLabId);
            } else {
                // Fetch all if global admin or no specific lab context
                data = await MachineService.list();
            }

            // Ordenar por machineId (ex: HVI 01, HVI 02, HVI 10...)
            data.sort((a, b) => a.machineId.localeCompare(b.machineId, undefined, { numeric: true, sensitivity: 'base' }));
            setMachines(data);
        } catch (error) {
            console.error("Failed to load machines:", error);
            addToast({ title: "Erro ao carregar máquinas", type: "error" });
        }
    };

    const handleSaveMachine = async () => {
        if (!formMachineId.trim()) {
            addToast({ title: "ID da Máquina obrigatório", type: "error" });
            return;
        }
        if (!formSerialNumber.trim()) {
            addToast({ title: "Número de Série obrigatório", type: "error" });
            return;
        }

        if (!formLabId) {
            addToast({ title: "Erro: Nenhum laboratório selecionado", type: "error" });
            return;
        }

        try {
            const payload = {
                machineId: formMachineId.toUpperCase(),
                serialNumber: formSerialNumber.toUpperCase(),
                model: formModel,
                labId: formLabId
            };

            if (editingId) {
                await MachineService.update(editingId, payload);
                addToast({ title: "Máquina Atualizada", type: "success" });
            } else {
                await MachineService.create(payload as any);
                addToast({ title: "Máquina Adicionada", type: "success" });
            }

            // Reload data
            loadData();
            resetForm();

        } catch (error) {
            console.error("Error saving machine", error);
            addToast({ title: "Erro ao salvar máquina", type: "error" });
        }
    };

    const handleEditClick = (machine: Machine) => {
        setEditingId(machine.id);
        setFormMachineId(machine.machineId);
        setFormSerialNumber(machine.serialNumber);
        setFormModel(machine.model);
        setFormLabId(machine.labId);
    };

    const handleRemoveMachine = async (id: string) => {
        if (!confirm("Remover esta máquina?")) return;

        // Bloqueia realtime durante o delete para evitar race condition
        isDeleteInProgressRef.current = true;

        // Atualização otimista: remove da lista imediatamente
        setMachines(prev => prev.filter(m => m.id !== id));
        if (editingId === id) resetForm();

        try {
            await MachineService.delete(id);
            addToast({ title: "Máquina Removida", type: "info" });
        } catch (error) {
            console.error("Error deleting machine", error);
            addToast({ title: "Erro ao remover máquina", type: "error" });
            // Em caso de erro, restaura a lista do banco
            await loadData();
        } finally {
            // Libera o realtime após delay para garantir propagação
            setTimeout(() => {
                isDeleteInProgressRef.current = false;
            }, 3000);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setFormMachineId("");
        setFormSerialNumber("");
        setFormModel("USTER");
    };

    // Helper to get lab name
    const getLabName = (id: string) => {
        return labs.find(l => l.id === id)?.nome || "Lab Desconhecido";
    };

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>, color: 'green' | 'red') => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Limite de 500KB para base64 para evitar sobrecarregar o Supabase Realtime
        if (file.size > 500 * 1024) {
            addToast({ title: "Arquivo muito grande", description: "Para usar sem o Storage na nuvem, o áudio deve ter no máximo 500KB.", type: "warning" });
            return;
        }

        setIsUploadingSound(true);
        try {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                
                updateAudioConfig({
                    ...audioConfig,
                    [color === 'green' ? 'greenUrl' : 'redUrl']: base64String
                });

                addToast({ title: "Sucesso", description: "Áudio local configurado!", type: "success" });
                setIsUploadingSound(false);
            };
            reader.onerror = () => { throw new Error("Falha ao ler o arquivo"); };
            reader.readAsDataURL(file);
        } catch (err: any) {
            console.error("Erro ao processar áudio:", err);
            addToast({ title: "Erro", description: "Falha ao ler o arquivo de áudio.", type: "error" });
            setIsUploadingSound(false);
        }
    };

    const handleUrlBlur = async (color: 'green' | 'red') => {
        const url = (color === 'green' ? audioConfig.greenUrl : audioConfig.redUrl).trim();
        
        if (url.includes('myinstants.com/en/instant/')) {
            try {
                // Extrai o nome do som da URL (ex: auraa-81623 -> auraa)
                const match = url.match(/\/instant\/([^/]+)/);
                if (match) {
                    let slug = match[1];
                    // Remove números no final que o site adiciona
                    slug = slug.replace(/-\d+$/, '');
                    const newUrl = `https://www.myinstants.com/media/sounds/${slug}.mp3`;
                    
                    updateAudioConfig({
                        ...audioConfig,
                        [color === 'green' ? 'greenUrl' : 'redUrl']: newUrl
                    });
                    addToast({ title: "Link Convertido", description: "Detectamos um link do MyInstants e convertemos para MP3 automaticamente!", type: "success" });
                }
            } catch (e) {
                console.error("Erro ao converter link do myinstants", e);
            }
        }
    };

    return (
        <div className="grid gap-8 lg:grid-cols-12">
            
            {/* Configurações Globais (Apenas Admin Global) */}
            {user?.acesso === 'admin_global' && (
                <div className="lg:col-span-12 border border-neutral-200 bg-white p-10 space-y-8 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black pb-4">
                        <h3 className="text-xl font-serif">Preferências Globais (Áudio)</h3>
                        <div className="flex gap-2">
                            <button onClick={() => playAlert('green')} className="w-5 h-5 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] border border-emerald-400" title="Test Green Alert" />
                            <button onClick={() => playAlert('red')} className="w-5 h-5 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 transition-all shadow-[0_0_10px_rgba(220,38,38,0.3)] border border-red-500" title="Test Red Alert" />
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Alerta Verde (Sucesso)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={audioConfig.greenUrl}
                                    onChange={(e) => updateAudioConfig({ ...audioConfig, greenUrl: e.target.value })}
                                    onBlur={() => handleUrlBlur('green')}
                                    className="flex-1 h-12 border border-neutral-300 px-4 text-xs focus:border-black focus:ring-0 rounded-none bg-neutral-50"
                                    placeholder="Cole o link ou faça upload..."
                                />
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept="audio/*"
                                        onChange={(e) => handleAudioUpload(e, 'green')}
                                        disabled={isUploadingSound}
                                        title="Fazer upload de áudio verde"
                                        aria-label="Fazer upload de áudio verde"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                    <button disabled={isUploadingSound} title="Upload Áudio Verde" aria-label="Upload Áudio Verde" className="h-12 px-4 border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 flex items-center justify-center">
                                        <Upload className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Alerta Vermelho (Erro)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={audioConfig.redUrl}
                                    onChange={(e) => updateAudioConfig({ ...audioConfig, redUrl: e.target.value })}
                                    onBlur={() => handleUrlBlur('red')}
                                    className="flex-1 h-12 border border-neutral-300 px-4 text-xs focus:border-black focus:ring-0 rounded-none bg-neutral-50"
                                    placeholder="Cole o link ou faça upload..."
                                />
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        accept="audio/*"
                                        onChange={(e) => handleAudioUpload(e, 'red')}
                                        disabled={isUploadingSound}
                                        title="Fazer upload de áudio vermelho"
                                        aria-label="Fazer upload de áudio vermelho"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                    <button disabled={isUploadingSound} title="Upload Áudio Vermelho" aria-label="Upload Áudio Vermelho" className="h-12 px-4 border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 flex items-center justify-center">
                                        <Upload className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest">
                        Aviso: Alterações aqui são sincronizadas em tempo real para todos os laboratórios online.
                    </p>
                </div>
            )}

            {/* Coluna Principal: Máquinas */}
            <div className="lg:col-span-12 border border-neutral-200 bg-white p-10 space-y-8 shadow-sm">
                <div className="flex items-center justify-between border-b border-black pb-4">
                    <h3 className="text-xl font-serif">Máquinas Registradas (HVI)</h3>
                    <Server className="h-5 w-5" />
                </div>

                {/* Lista de Máquinas */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {machines.map(machine => (
                        <div key={machine.id} className={cn(
                            "group relative flex flex-col justify-between p-6 bg-neutral-50 border transition-all",
                            editingId === machine.id ? "border-black ring-1 ring-black bg-white" : "border-neutral-200 hover:border-black"
                        )}>
                            <div className="space-y-4 mb-4">
                                <div className="flex items-center justify-between">
                                    <div className="h-10 w-10 bg-white border border-neutral-200 flex items-center justify-center font-bold text-sm font-serif">
                                        {(machine.machineId || "??").substring(0, 2)}
                                    </div>
                                    <span className={cn(
                                        "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full inline-block",
                                        machine.model === 'USTER' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                    )}>
                                        {machine.model || "N/A"}
                                    </span>
                                </div>

                                <div className="pt-2 border-t border-dashed border-neutral-200">
                                    <span className="text-[9px] font-mono text-neutral-400 uppercase block mb-1">Laboratório Vinculado</span>
                                    <div className="flex items-center gap-2">
                                        <Database className="h-3 w-3 text-neutral-400" />
                                        <span className="text-xs font-bold text-black uppercase truncate max-w-[150px]">
                                            {getLabName(machine.labId)}
                                        </span>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] font-mono text-neutral-400 uppercase">ID da Máquina</span>
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-black">{machine.machineId}</h4>
                                </div>
                                <div>
                                    <span className="text-[10px] font-mono text-neutral-400 uppercase">Número de Série</span>
                                    <p className="text-xs font-mono text-neutral-600">{machine.serialNumber}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-4 border-t border-neutral-100 opacity-40 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditClick(machine)}
                                    className="flex-1 h-8 text-[9px] uppercase tracking-widest hover:bg-black hover:text-white"
                                >
                                    <Edit className="h-3 w-3 mr-2" /> Editar
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveMachine(machine.id)}
                                    className="h-8 w-8 text-neutral-400 hover:text-red-600"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {machines.length === 0 && (
                        <div className="col-span-full text-center p-12 border-2 border-dashed border-neutral-200 text-neutral-400 text-xs font-mono uppercase">
                            Nenhuma máquina HVI cadastrada.
                        </div>
                    )}
                </div>

                {/* Formulário de Adição/Edição */}
                <div className={cn(
                    "pt-8 border-t border-dashed border-neutral-200 space-y-6 transition-all",
                    editingId ? "bg-neutral-50 -mx-10 px-10 py-10 border-b border-black" : ""
                )}>
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                            {editingId ? "Editando Máquina" : "Adicionar Nova Máquina"}
                        </h4>
                        {editingId && (
                            <button onClick={resetForm} className="text-[10px] font-bold uppercase text-red-500 hover:underline">
                                Cancelar Edição
                            </button>
                        )}
                    </div>

                    <div className="grid md:grid-cols-12 gap-4 items-end">
                        {/* Campo ID */}
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-[9px] font-bold uppercase text-neutral-400">ID da Máquina</label>
                            <input
                                type="text"
                                placeholder="EX: HVI 02"
                                value={formMachineId}
                                onChange={e => setFormMachineId(e.target.value)}
                                className="w-full h-12 px-4 border border-neutral-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-black transition-colors"
                            />
                        </div>

                        {/* Campo Serial */}
                        <div className="md:col-span-3 space-y-1">
                            <label className="text-[9px] font-bold uppercase text-neutral-400">Número de Série</label>
                            <input
                                type="text"
                                placeholder="EX: 123456789"
                                value={formSerialNumber}
                                onChange={e => setFormSerialNumber(e.target.value)}
                                className="w-full h-12 px-4 border border-neutral-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-black transition-colors"
                            />
                        </div>                        {/* Campo Lab (Only for Global Admin) */}
                        <div className="md:col-span-3 space-y-1">
                            <label className="text-[9px] font-bold uppercase text-neutral-400">Laboratório</label>
                            <select
                                value={formLabId}
                                onChange={e => setFormLabId(e.target.value)}
                                disabled={user?.acesso !== 'admin_global' && !!(currentLab?.id || user?.lab_id)}
                                className="w-full h-12 px-4 border border-neutral-200 text-xs font-mono uppercase bg-white focus:outline-none focus:border-black transition-colors disabled:opacity-50"
                                title="Selecione o laboratório"
                                aria-label="Selecione o laboratório"
                            >
                                <option value="">SELECIONE O LAB</option>
                                {labs.map(l => (
                                    <option key={l.id} value={l.id}>{l.nome} ({l.codigo})</option>
                                ))}
                            </select>
                        </div>
                        {/* Campo Modelo */}
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-[9px] font-bold uppercase text-neutral-400">Modelo HVI</label>
                            <div className="flex h-12 border border-neutral-200 bg-white">
                                <button
                                    onClick={() => setFormModel("USTER")}
                                    className={cn(
                                        "flex-1 text-[9px] font-bold uppercase tracking-widest transition-colors border-r border-neutral-200",
                                        formModel === "USTER" ? "bg-black text-white" : "text-neutral-400 hover:text-black"
                                    )}
                                >
                                    USTER
                                </button>
                                <button
                                    onClick={() => setFormModel("PREMIER")}
                                    className={cn(
                                        "flex-1 text-[9px] font-bold uppercase tracking-widest transition-colors",
                                        formModel === "PREMIER" ? "bg-black text-white" : "text-neutral-400 hover:text-black"
                                    )}
                                >
                                    PREMIER
                                </button>
                            </div>
                        </div>

                        {/* Botão de Ação */}
                        <div className="md:col-span-2">
                            <Button
                                onClick={handleSaveMachine}
                                className={cn(
                                    "w-full h-12 rounded-none font-bold uppercase text-[10px] tracking-widest",
                                    editingId ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-black hover:bg-neutral-800 text-white"
                                )}
                            >
                                {editingId ? "Atualizar" : "Adicionar"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

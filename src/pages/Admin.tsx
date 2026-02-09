import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Activity, Database, Server, ShieldCheck, Users, Trash2, Edit, LogOut } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AnalistaService, type Analista } from "@/entities/Analista";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import LabsTab from "@/components/admin/LabsTab";
import AnalystsTab from "@/components/admin/AnalystsTab";
import { LabService } from "@/entities/Lab";
import type { Lab } from "@/entities/Lab";

export default function Admin() {
    const { user, currentLab, deselectLab } = useAuth();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState("dashboard");
    const [onlineAnalysts, setOnlineAnalysts] = useState<Analista[]>([]);

    // Segurança: Redireciona usuários comuns para a Home, permite admin_global e admin_lab
    if (user && user.acesso !== 'admin_global' && user.acesso !== 'admin_lab') {
        return <Navigate to="/" replace />;
    }

    useEffect(() => {
        const loadCount = async () => {
            let data = [];

            // If we have a currentLab context, filter by it
            if (currentLab) {
                data = await AnalistaService.listByLab(currentLab.id);
            } else if (user?.acesso === 'admin_lab' && user.lab_id) {
                // Fallback for admin_lab if currentLab not set
                data = await AnalistaService.listByLab(user.lab_id);
            } else {
                // Global view (only if no lab selected)
                data = await AnalistaService.list();
            }

            const now = new Date().getTime();
            const onlineList = data.filter(a =>
                a.last_active && (now - new Date(a.last_active).getTime() < 12000)
            );

            setOnlineAnalysts(onlineList);
        };

        loadCount();
        const interval = setInterval(loadCount, 2000);
        return () => clearInterval(interval);
    }, [user, currentLab]);

    // Filtrar abas baseadas no nível de acesso
    const tabs = [
        { id: "dashboard", label: "Visão Geral", icon: Activity },
        // Admin Lab não gerencia Labs, apenas visualiza o seu (ou removemos a aba)
        ...(user?.acesso === 'admin_global' ? [{ id: "labs", label: "Laboratories", icon: Database }] : []),
        { id: "analysts", label: "Access Control", icon: Users },
        { id: "machines", label: "Máquinas", icon: Server },
    ];

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
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 block mb-1">
                                {user?.acesso === 'admin_global' ? 'Global Administration' : 'Lab Administration'}
                            </span>
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
                        onClick={() => addToast({ title: "System Synced", type: "success" })}
                        className="rounded-none h-12 px-6 bg-black text-white hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                        Sync Nodes
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-8 border-b border-neutral-200 pb-px">
                {tabs.map((tab) => (
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
                {activeTab === "dashboard" && <DashboardTab onlineAnalysts={onlineAnalysts} />}
                {activeTab === "labs" && <LabsTab />}
                {activeTab === "analysts" && <AnalystsTab />}
                {activeTab === "machines" && <SystemConfigTab />}
            </div>
        </div>
    );
}

// Subcomponents
function DashboardTab({ onlineAnalysts }: { onlineAnalysts: Analista[] }) {
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
                        {onlineAnalysts.map(analyst => (
                            <div key={analyst.id} className="flex items-center gap-2 group/item">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 group-hover/item:text-black transition-colors truncate">
                                    {analyst.nome}
                                </span>
                            </div>
                        ))}
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
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">DESENVOLVEDOR & ADMIN</span>
                    </div>
                    <h3 className="text-3xl font-serif text-white">Alan Dias</h3>
                    <div className="text-xs font-mono text-neutral-400 max-w-md space-y-1">
                        <p className="flex items-center gap-2">
                            <span className="text-neutral-600">EMAIL:</span>
                            <span className="text-white">alangds03@gmail.com</span>
                        </p>
                        <p className="flex items-center gap-2">
                            <span className="text-neutral-600">CARGO:</span>
                            <span className="text-white">ANALISTA DE INFORMAÇÕES</span>
                        </p>
                        <p className="pt-2 text-neutral-500 border-t border-white/10 mt-2">
                            Sistema de Análise HVI Avançada - Versão 3.0
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
import { Machine, MachineService } from "@/entities/Machine";

function SystemConfigTab() {
    const { user, currentLab } = useAuth();
    const { addToast } = useToast();
    const [machines, setMachines] = useState<Machine[]>([]);
    const [labs, setLabs] = useState<Lab[]>([]);

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formMachineId, setFormMachineId] = useState("");
    const [formSerialNumber, setFormSerialNumber] = useState("");
    const [formModel, setFormModel] = useState<'USTER' | 'PREMIER'>("USTER");

    useEffect(() => {
        loadData();
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
            const targetLabId = currentLab?.id || (user?.acesso === 'admin_lab' ? user.lab_id : null);
            let data: Machine[] = [];

            if (targetLabId) {
                // Fetch only for the specific lab
                data = await MachineService.listByLab(targetLabId);
            } else if (user?.acesso === 'admin_global') {
                // Fetch all if global admin
                data = await MachineService.list();
            }

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

        const targetLabId = currentLab?.id || (user?.acesso === 'admin_lab' ? user.lab_id : null);
        if (!targetLabId) {
            addToast({ title: "Erro: Nenhum laboratório selecionado", type: "error" });
            return;
        }

        try {
            if (editingId) {
                // Update
                // Note: Security check handles by RLS on backend ideally, but we can double check logic if needed.
                // For now, assuming UI context is correct.

                await MachineService.update(editingId, {
                    machineId: formMachineId.toUpperCase(),
                    serialNumber: formSerialNumber.toUpperCase(),
                    model: formModel,
                    labId: targetLabId
                });

                addToast({ title: "Máquina Atualizada", type: "success" });
            } else {
                // Create
                await MachineService.create({
                    machineId: formMachineId.toUpperCase(),
                    serialNumber: formSerialNumber.toUpperCase(),
                    model: formModel,
                    labId: targetLabId
                });

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
    };

    const handleRemoveMachine = async (id: string) => {
        if (confirm("Remover esta máquina?")) {
            try {
                await MachineService.delete(id);
                addToast({ title: "Máquina Removida", type: "info" });
                loadData();
                if (editingId === id) resetForm();
            } catch (error) {
                console.error("Error deleting machine", error);
                addToast({ title: "Erro ao remover máquina", type: "error" });
            }
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

    return (
        <div className="grid gap-8 lg:grid-cols-12">
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

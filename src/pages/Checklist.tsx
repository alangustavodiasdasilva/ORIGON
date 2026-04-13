import { useState, useEffect } from "react";
import {
    Plus,
    X,
    Search,
    LayoutGrid,
    List,
    CheckCircle2,
    Trash2,
    Calendar,
    ClipboardCheck,
    CheckCircle,
    ChevronRight,
    SearchCheck,
    Briefcase
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/contexts/ToastContext";
import { AuditService, type AuditDocument } from "@/entities/Audit";
import { LabService } from "@/entities/Lab";
import { AnalistaService, type Analista } from "@/entities/Analista";
import { cn } from "@/lib/utils";

/**
 * Checklist Page - Modern Implementation
 */
export default function Checklist() {
    const { user, currentLab, selectLab } = useAuth();
    const { addToast } = useToast();

    // Access control
    if (user && !['admin_global', 'admin_lab', 'quality_admin'].includes(user.acesso)) {
        return <Navigate to="/" replace />;
    }

    // State
    const [items, setItems] = useState<AuditDocument[]>([]);
    const [labs, setLabs] = useState<any[]>([]);
    const [analysts, setAnalysts] = useState<Analista[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');

    // Sidebar State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        assignedTo: "",
        deadline: "",
        observation: ""
    });

    useEffect(() => {
        loadData();
        const unsubscribe = AuditService.subscribe(() => {
            loadData();
        });
        return () => {
            unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, currentLab]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const labsData = await LabService.list().catch(() => []);
            setLabs(labsData);

            const targetLabId = currentLab?.id || user?.lab_id;
            const [docs, anals] = await Promise.all([
                targetLabId ? AuditService.listByLab(targetLabId) : AuditService.list(),
                AnalistaService.list()
            ]);

            setItems(docs);
            setAnalysts(anals);
        } catch (error) {
            addToast({ title: "Erro na sincronização", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            addToast({ title: "O título é obrigatório", type: "error" });
            return;
        }

        try {
            const targetLabId = currentLab?.id || user?.lab_id;
            await AuditService.createTask({
                name: formData.name,
                labId: targetLabId || undefined,
                isTask: true,
                deadline: formData.deadline || undefined,
                assignedTo: formData.assignedTo || undefined,
                observation: formData.observation || undefined,
                category: 'Checklist Operacional',
                createdBy: user?.nome || undefined,
            });

            addToast({ title: 'Atividade Registrada!', type: 'success' });
            setFormData({ name: "", assignedTo: "", deadline: "", observation: "" });
            setIsSidebarOpen(false);
            loadData();
        } catch (error: any) {
            addToast({ title: 'Erro ao registrar', description: error.message, type: 'error' });
        }
    };

    const handleToggleStatus = async (item: AuditDocument) => {
        try {
            const { supabase } = await import('@/lib/supabase');
            const nextStatus = item.status === 'completed' ? 'verified' : 'completed';

            const { error } = await supabase
                .from('auditoria_documentos')
                .update({ status: nextStatus })
                .eq('id', item.id);

            if (error) throw error;

            loadData();
            addToast({
                title: nextStatus === 'completed' ? 'Atividade Concluída' : 'Atividade Reaberta',
                type: 'success'
            });
        } catch (e) {
            addToast({ title: 'Erro ao atualizar status', type: 'error' });
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (confirm("Confirmar exclusão deste item?")) {
            try {
                await AuditService.delete(id);
                addToast({ title: "Item removido", type: "info" });
                loadData();
            } catch (error) {
                console.error("Error deleting:", error);
                addToast({ title: "Erro ao remover item", type: "error" });
            }
        }
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.observation?.toLowerCase().includes(searchTerm.toLowerCase()));

        if (!matchesSearch) return false;
        
        if (filterStatus === 'all') return true;
        
        return filterStatus === 'completed' ? item.status === 'completed' : item.status !== 'completed';
    });

    // const pendingCount = items.filter(i => i.status !== 'completed').length;
    // const completedCount = items.filter(i => i.status === 'completed').length;

    // Unit Selection for Global Admins
    if (user?.acesso === 'admin_global' && !currentLab) {
        return (
            <div className="min-h-[85vh] flex flex-col items-center justify-center p-8 bg-white">
                <div className="max-w-4xl w-full space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center justify-center h-16 w-16 bg-neutral-900 rounded-3xl shadow-2xl mb-4">
                            <ClipboardCheck className="h-8 w-8 text-white" />
                        </div>
                        <h1 className="text-6xl font-serif text-black tracking-tighter">
                            Checklist <span className="font-light italic text-neutral-300">Estratégico</span>
                        </h1>
                        <p className="text-lg text-neutral-500 font-light max-w-lg mx-auto leading-relaxed">
                            Selecione uma unidade de operação para gerenciar as atividades de conformidade e auditorias.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {labs.map((lab) => (
                            <button
                                key={lab.id}
                                onClick={() => selectLab(lab.id)}
                                className="group relative p-8 bg-neutral-50/50 border border-neutral-100 rounded-[2rem] transition-all duration-500 hover:bg-white hover:border-black hover:shadow-2xl text-left"
                            >
                                <h3 className="text-2xl font-serif text-black mb-1 group-hover:translate-x-1 transition-transform">{lab.nome}</h3>
                                <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest mb-10">{lab.cidade || 'Unidade Geral'}</p>

                                <div className="flex items-center justify-between mt-auto">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-black animate-pulse" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Ativo</span>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-neutral-200 group-hover:text-black group-hover:translate-x-1 transition-all" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-12 animate-in fade-in duration-500 pb-32 pt-8 px-4">
            {/* Minimal Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-black/5 pb-16">
                <div className="space-y-6">
                    <div className="flex items-center gap-3 text-neutral-400">
                        <ClipboardCheck className="h-6 w-6 text-black" />
                        <div className="h-4 w-[1px] bg-neutral-200" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Operations Control</span>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-7xl font-serif text-black tracking-tighter leading-none">
                            Checklist <span className="font-light text-neutral-300 italic">Global</span>
                        </h1>
                        <p className="text-xl text-neutral-500 font-light max-w-2xl leading-relaxed">
                            Gestão de conformidade integrada para o <span className="text-black font-medium">{currentLab?.nome}</span>.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center bg-neutral-50 px-2 py-1.5 rounded-2xl border border-neutral-100">
                        <button
                            onClick={() => setFilterStatus('all')}
                            className={cn("px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl", filterStatus === 'all' ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-black")}
                        >
                            Ver Tudo
                        </button>
                        <button
                            onClick={() => setFilterStatus('pending')}
                            className={cn("px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl", filterStatus === 'pending' ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-black")}
                        >
                            Pendentes
                        </button>
                        <button
                            onClick={() => setFilterStatus('completed')}
                            className={cn("px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl", filterStatus === 'completed' ? "bg-white text-black shadow-lg" : "text-neutral-400 hover:text-black")}
                        >
                            Concluídos
                        </button>
                    </div>
                    <Button
                        onClick={() => setIsSidebarOpen(true)}
                        className="h-16 px-10 bg-black text-white rounded-2xl font-bold text-[10px] uppercase tracking-[0.3em] hover:bg-neutral-800 transition-all shadow-2xl hover:shadow-black/20"
                    >
                        <Plus className="mr-3 h-5 w-5" /> Registrar Atividade
                    </Button>
                </div>
            </div>

            {/* Quick Stats Toolbar */}
            <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-1 w-full group relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-300 group-focus-within:text-black transition-colors" />
                    <Input
                        placeholder="Filtrar atividades por título ou responsável..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-14 h-16 border-none bg-neutral-50 rounded-[1.5rem] focus-visible:ring-1 focus-visible:ring-black placeholder:text-neutral-400 font-medium text-lg"
                    />
                </div>

                <div className="flex p-1.5 bg-neutral-50 rounded-2xl border border-neutral-100">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn("p-4 rounded-xl transition-all", viewMode === 'grid' ? "bg-white text-black shadow-md" : "text-neutral-300 hover:text-black")}
                        title="Visualização em Grade"
                    >
                        <LayoutGrid className="h-5 w-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn("p-4 rounded-xl transition-all", viewMode === 'list' ? "bg-white text-black shadow-md" : "text-neutral-300 hover:text-black")}
                        title="Visualização em Lista"
                    >
                        <List className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-64 bg-neutral-50 rounded-[2.5rem] animate-pulse" />
                    ))}
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="py-40 flex flex-col items-center justify-center text-center space-y-8 bg-neutral-50/50 rounded-[4rem] border border-dashed border-neutral-200">
                    <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-2xl">
                        <SearchCheck className="h-10 w-10 text-neutral-200" />
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-3xl font-serif text-black tracking-tight">Vazio por enquanto</h4>
                        <p className="text-neutral-400 max-w-sm mx-auto font-light leading-relaxed">Nenhuma atividade registrada nos critérios selecionados. Comece criando um novo item.</p>
                    </div>
                    <Button onClick={() => setIsSidebarOpen(true)} variant="outline" className="h-14 px-8 border-black font-bold text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all rounded-2xl">
                        Criar Primeiro Item
                    </Button>
                </div>
            ) : (
                <div className={cn(
                    "grid gap-8 transition-all duration-700",
                    viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
                )}>
                    {filteredItems.map(item => (
                        <ChecklistItemCard
                            key={item.id}
                            item={item}
                            viewMode={viewMode}
                            onToggle={() => handleToggleStatus(item)}
                            onDelete={() => handleDeleteItem(item.id)}
                        />
                    ))}
                </div>
            )}

            {/* Add Sidebar Drawer */}
            {isSidebarOpen && (
                <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsSidebarOpen(false)} />
                    <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in slide-in-from-right duration-500 p-12 overflow-y-auto flex flex-col">
                        <div className="flex items-center justify-between mb-16">
                            <div className="space-y-1">
                                <h3 className="text-4xl font-serif tracking-tight">Nova Atividade</h3>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-300">Registro de Conformidade</p>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="p-3 hover:bg-neutral-100 rounded-2xl transition-colors" title="Fechar">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateItem} className="space-y-10 flex-1">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 block ml-1">O que será feito?</label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ex: Auditoria de Amostragem"
                                    className="h-16 border-none bg-neutral-50 rounded-2xl px-6 font-bold text-lg focus-visible:ring-1 focus-visible:ring-black"
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 block ml-1">Para quem?</label>
                                <select
                                    value={formData.assignedTo}
                                    onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                                    className="w-full h-16 bg-neutral-50 border-none rounded-2xl px-6 text-sm font-bold focus:ring-1 focus:ring-black outline-none appearance-none"
                                    title="Selecione o responsável"
                                >
                                    <option value="">Equipe Geral</option>
                                    {analysts.map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)}
                                </select>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 block ml-1">Data Limite</label>
                                <Input
                                    type="date"
                                    value={formData.deadline}
                                    onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                                    className="h-16 border-none bg-neutral-50 rounded-2xl px-6"
                                />
                            </div>

                            <div className="space-y-4 flex-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 block ml-1">Instruções</label>
                                <textarea
                                    className="w-full min-h-[160px] bg-neutral-50 border-none rounded-3xl p-6 text-base font-medium focus:ring-1 focus:ring-black outline-none resize-none"
                                    placeholder="Detalhe o procedimento..."
                                    value={formData.observation}
                                    onChange={e => setFormData({ ...formData, observation: e.target.value })}
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-20 bg-black text-white rounded-[2rem] font-black text-[12px] uppercase tracking-[0.4em] shadow-2xl hover:bg-neutral-900 transition-all mt-6"
                            >
                                Registrar Agora
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function ChecklistItemCard({ item, viewMode, onToggle, onDelete }: {
    item: AuditDocument,
    viewMode: 'grid' | 'list',
    onToggle: () => void,
    onDelete: () => void
}) {
    const isCompleted = item.status === 'completed';

    if (viewMode === 'list') {
        return (
            <div className={cn(
                "group flex items-center gap-8 p-6 bg-white border border-neutral-100 rounded-[2.5rem] transition-all hover:shadow-2xl hover:-translate-y-1",
                isCompleted ? "opacity-60 grayscale-[0.5]" : ""
            )}>
                <button
                    onClick={onToggle}
                    className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center transition-all",
                        isCompleted ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-neutral-50 text-neutral-200 hover:bg-black hover:text-white"
                    )}
                >
                    {isCompleted ? <CheckCircle2 className="h-7 w-7" /> : <Plus className="h-6 w-6" />}
                </button>
                <div className="flex-1">
                    <h4 className={cn("text-xl font-serif text-black", isCompleted && "line-through text-neutral-400")}>{item.name}</h4>
                    <div className="flex items-center gap-8 mt-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Briefcase className="h-3.5 w-3.5" /> {item.assignedTo || "Coletiva"}
                        </span>
                        {item.deadline && (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5" /> {new Date(item.deadline).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4 relative z-50">
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete();
                        }} 
                        className="p-3 text-neutral-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 relative z-50 cursor-pointer flex items-center justify-center isolate" 
                        title="Remover atividade" 
                        aria-label="Remover atividade"
                    >
                        <Trash2 className="h-5 w-5 pointer-events-none" />
                    </button>
                    <ChevronRight className="h-5 w-5 text-neutral-200" />
                </div>
            </div>
        );
    }

    return (
        <div className={cn(
            "group relative p-12 bg-white border border-neutral-100 flex flex-col justify-between min-h-[380px] rounded-[3.5rem] transition-all duration-700 hover:shadow-[0_60px_100px_-40px_rgba(0,0,0,0.12)] hover:-translate-y-3 hover:border-black/10 text-black",
            isCompleted ? "border-emerald-100/50" : ""
        )}>
            {/* Status Badge Top Left */}
            <div className="absolute top-12 left-12 flex items-center gap-3">
                <div className={cn("h-2.5 w-2.5 rounded-full", isCompleted ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-neutral-200")} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isCompleted ? "text-emerald-500" : "text-neutral-300")}>
                    {isCompleted ? "Documentado" : "Em Aberto"}
                </span>
            </div>

            {/* Check Button Top Right */}
            <div className="absolute top-10 right-10">
                <button
                    onClick={onToggle}
                    className={cn(
                        "h-16 w-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-500",
                        isCompleted
                            ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 scale-105"
                            : "bg-neutral-50 text-neutral-200 hover:bg-black hover:text-white hover:rotate-90"
                    )}
                >
                    {isCompleted ? <CheckCircle className="h-8 w-8" /> : <Plus className="h-7 w-7" />}
                </button>
            </div>

            <div className="space-y-8 mt-12 flex-1">
                <div className="space-y-4">
                    <h4 className={cn(
                        "text-4xl font-serif tracking-tight leading-[1.15]",
                        isCompleted ? "text-neutral-300 line-through" : "text-black group-hover:underline decoration-1 underline-offset-8"
                    )}>
                        {item.name}
                    </h4>
                    {item.observation && (
                        <p className={cn("text-base font-medium leading-relaxed max-w-[90%] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500", isCompleted ? "text-neutral-200" : "text-neutral-500")}>
                            {item.observation}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-auto pt-10 flex items-center justify-between border-t border-neutral-50">
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-300">Executor</span>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-neutral-900 rounded-2xl flex items-center justify-center text-white text-xs font-black shadow-lg">
                            {item.assignedTo?.split(' ')[0][0] || 'E'}
                        </div>
                        <span className="text-sm font-bold text-black uppercase tracking-wider">{item.assignedTo || "Coletiva"}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 relative z-50">
                    {item.deadline && (
                        <div className="text-right flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-300 mb-0.5">Prazo Final</span>
                            <span className="text-xs font-mono font-bold text-black border-b-2 border-neutral-100">{new Date(item.deadline).toLocaleDateString()}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all duration-300 shadow-sm opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 relative z-50 cursor-pointer flex items-center justify-center isolate"
                        title="Remover Atividade"
                    >
                        <Trash2 className="h-5 w-5 pointer-events-none" />
                    </button>
                </div>
            </div>
        </div>
    );
}

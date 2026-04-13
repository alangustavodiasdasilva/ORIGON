import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Edit2, Landmark, X, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabService } from "@/entities/Lab";
import type { Lab } from "@/entities/Lab";
import { MachineService } from "@/entities/Machine";
import { AnalistaService } from "@/entities/Analista";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";

export default function LabsTab() {
    const { addToast } = useToast();
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<Lab | null>(null);
    const [deletingLab, setDeletingLab] = useState<Lab | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

    // Form States
    const [nome, setNome] = useState("");
    const [codigo, setCodigo] = useState("");
    const [cidade, setCidade] = useState("");
    const [estado, setEstado] = useState("");

    // Flag para bloquear o realtime durante operações de delete (evita race condition)
    const isDeleteInProgressRef = useRef(false);

    useEffect(() => {
        loadLabs();
        // Sincronização Realtime — atualiza automaticamente sem F5
        // quando qualquer usuário altera labs no banco de dados
        const unsubscribe = LabService.subscribe(() => {
            // Se estiver no meio de um delete, ignora o evento realtime
            // para evitar que o item deletado volte para a tela
            if (!isDeleteInProgressRef.current) {
                loadLabs();
            }
        });
        return unsubscribe;
    }, []);

    const loadLabs = async () => {
        const data = await LabService.list();
        setLabs(data);
    };

    const handleOpenDialog = (lab?: Lab) => {
        if (lab) {
            setEditingLab(lab);
            setNome(lab.nome);
            setCodigo(lab.codigo);
            setCidade(lab.cidade || "");
            setEstado(lab.estado || "");
        } else {
            setEditingLab(null);
            setNome("");
            setCodigo("");
            setCidade("");
            setEstado("");
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        try {
            if (editingLab) {
                await LabService.update(editingLab.id, { nome, codigo, cidade, estado });
                addToast({ title: "Laboratório Atualizado", type: "success" });
            } else {
                await LabService.create({ nome, codigo, cidade, estado });
                addToast({ title: "Laboratório Criado", type: "success" });
            }
            setIsDialogOpen(false);
            loadLabs();
        } catch (error) {
            console.error(error);
            addToast({ title: "Erro ao Salvar", description: "Verifique os dados e tente novamente.", type: "error" });
        }
    };

    // Exclusão em cascata — sem portal, sem modal overlay
    // Usa painel inline para evitar o erro de DOM "insertBefore"
    const handleDelete = (lab: Lab) => {
        setDeleteSuccess(null);
        setDeletingLab(lab);
    };

    const cancelDelete = () => {
        setDeletingLab(null);
        setDeleteSuccess(null);
    };

    const confirmDelete = async () => {
        if (!deletingLab || isDeleting) return;
        setIsDeleting(true);

        const labId = deletingLab.id;
        const labNome = deletingLab.nome;

        // Bloqueia realtime durante o delete para evitar race condition
        isDeleteInProgressRef.current = true;

        // Atualização otimista: remove da lista IMEDIATAMENTE
        setLabs(prev => prev.filter(l => l.id !== labId));
        setDeletingLab(null);

        try {
            // Passo 1: Apagar máquinas vinculadas
            const machines = await MachineService.listByLab(labId);
            for (const m of machines) {
                await MachineService.delete(m.id);
            }

            // Passo 2: Desvincular analistas (null, não undefined — para Supabase)
            const analistas = await AnalistaService.listByLab(labId);
            for (const a of analistas) {
                await AnalistaService.update(a.id, { lab_id: null } as any);
            }

            // Passo 3: Excluir o laboratório
            await LabService.delete(labId);

            setDeleteSuccess(`Laboratório "${labNome}" removido com sucesso.`);

            // Toast após tudo estabilizar
            setTimeout(() => {
                addToast({
                    title: `${labNome} removido`,
                    description: `${machines.length} máquina(s) e ${analistas.length} analista(s) desvinculados.`,
                    type: "success"
                });
                setDeleteSuccess(null);
            }, 2500);

        } catch (err: unknown) {
            console.error("Erro ao excluir laboratório:", err);
            // Em caso de erro: restaura o item na lista
            await loadLabs();
            addToast({
                title: "Erro ao Excluir",
                description: (err instanceof Error ? err.message : null) || "Falha ao remover o laboratório.",
                type: "error"
            });
        } finally {
            setIsDeleting(false);
            // Libera o realtime após delay para garantir propagação
            // Usa 5s pois o delete em cascata (máquinas + analistas + lab) pode demorar mais
            setTimeout(() => {
                isDeleteInProgressRef.current = false;
            }, 5000);
        }
    };

    return (
        <div className="animate-fade-in space-y-8">
            <div className="flex justify-between items-end border-b border-black pb-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-serif text-black uppercase tracking-wide">Lab Network</h2>
                    <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Management of physical laboratory units</p>
                </div>
                <Button
                    onClick={() => handleOpenDialog()}
                    className="h-9 px-5 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                    <Plus className="h-3 w-3" /> Add Unit
                </Button>
            </div>

            {/* Banner de sucesso inline */}
            {deleteSuccess && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-800 animate-fade-slide-down">
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="font-medium">{deleteSuccess}</span>
                </div>
            )}

            {/* Painel de confirmação inline — SEM portal/modal para evitar erro insertBefore */}
            {deletingLab && (
                <div
                    className="border border-red-200 bg-red-50/80 rounded-xl p-4 space-y-3 overflow-hidden animate-fade-slide-down"
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <p className="font-bold text-red-900 text-sm">
                                Excluir laboratório: <span className="font-black">{deletingLab.nome}</span>?
                            </p>
                            <p className="text-xs text-red-600 mt-1">
                                Todas as máquinas HVI vinculadas serão removidas. Analistas serão desvinculados (não excluídos). Os dados de O.S. não serão apagados.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            onClick={cancelDelete}
                            disabled={isDeleting}
                            variant="ghost"
                            className="h-9 px-5 rounded-none border border-neutral-300 hover:bg-white text-[10px] font-bold uppercase tracking-widest"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            className="h-9 px-5 rounded-none bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                        >
                            {isDeleting ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> Removendo...</>
                            ) : (
                                <><Trash2 className="h-3 w-3" /> Sim, Excluir</>
                            )}
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-black">
                            <th className="py-3 pl-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-500 w-12"></th>
                            <th className="py-3 text-left text-[9px] font-black uppercase tracking-widest text-neutral-500">Laboratory</th>
                            <th className="py-3 text-left text-[9px] font-black uppercase tracking-widest text-neutral-500">Code</th>
                            <th className="py-3 text-left text-[9px] font-black uppercase tracking-widest text-neutral-500">Location</th>
                            <th className="py-3 pr-4 text-right text-[9px] font-black uppercase tracking-widest text-neutral-500">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                        {labs.map(lab => (
                            <tr
                                key={lab.id}
                                className={`group hover:bg-neutral-50 transition-colors ${deletingLab?.id === lab.id ? 'bg-red-50/50' : ''}`}
                            >
                                <td className="py-4 pl-4 text-center">
                                    <div className="h-8 w-8 mx-auto flex items-center justify-center border border-black bg-white rounded-none">
                                        <Landmark className="h-3 w-3 text-black" />
                                    </div>
                                </td>
                                <td className="py-4 font-bold text-sm text-black">{lab.nome}</td>
                                <td className="py-4">
                                    <span className="font-mono text-xs bg-neutral-100 px-2 py-1">{lab.codigo}</span>
                                </td>
                                <td className="py-4 font-mono text-xs text-neutral-500 uppercase">
                                    {lab.cidade}, {lab.estado}
                                </td>
                                <td className="py-4 text-right pr-4 space-x-2">
                                    <Button
                                        title="Editar laboratório"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleOpenDialog(lab)}
                                        className="rounded-none h-8 w-8 hover:bg-black hover:text-white border border-transparent hover:border-black transition-all"
                                    >
                                        <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        title="Excluir laboratório"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDelete(lab)}
                                        disabled={isDeleting}
                                        className="rounded-none h-8 w-8 hover:bg-red-600 hover:text-white border border-transparent hover:border-red-600 transition-all"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Criar/Editar Laboratório */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden border border-black shadow-2xl bg-white rounded-none">
                    <div className="border-b border-black p-6 bg-neutral-50 flex items-center justify-between">
                        <h3 className="text-lg font-serif font-bold text-black uppercase">
                            {editingLab ? "Editar Laboratório" : "Novo Laboratório"}
                        </h3>
                        <button
                            onClick={() => setIsDialogOpen(false)}
                            title="Fechar modal"
                            className="p-2 hover:bg-black hover:text-white transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Nome do Laboratório</Label>
                            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Sorriso" className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Código</Label>
                            <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="ex: LAB-01" className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm uppercase" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Cidade</Label>
                                <Input value={cidade} onChange={e => setCidade(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Estado (UF)</Label>
                                <Input value={estado} onChange={e => setEstado(e.target.value)} maxLength={2} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm uppercase" />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-neutral-100 mt-4">
                            <Button
                                onClick={() => setIsDialogOpen(false)}
                                variant="ghost"
                                className="flex-1 h-12 rounded-none border border-black hover:bg-neutral-100 text-[10px] font-bold uppercase tracking-widest"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="flex-[2] h-12 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest shadow-lg"
                            >
                                Salvar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

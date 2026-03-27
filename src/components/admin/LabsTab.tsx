import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabService } from "@/entities/Lab";
import type { Lab } from "@/entities/Lab";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";

export default function LabsTab() {
    const { addToast } = useToast();
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<Lab | null>(null);
    const [nome, setNome] = useState("");
    const [codigo, setCodigo] = useState("");
    const [cidade, setCidade] = useState("");
    const [estado, setEstado] = useState("");

    const loadData = async () => {
        const data = await LabService.list();
        setLabs(data);
    };

    useEffect(() => {
        loadData();
        const unsubscribe = LabService.subscribe(() => loadData());
        return () => unsubscribe();
    }, []);

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
        if (!nome.trim() || !codigo.trim()) {
            alert("Nome e Código são obrigatórios.");
            return;
        }
        try {
            const payload = { nome: nome.trim(), codigo: codigo.trim().toUpperCase(), cidade: cidade.trim(), estado: estado.trim() };
            if (editingLab) {
                await LabService.update(editingLab.id, payload);
                addToast({ title: "Laboratório Atualizado", type: "success" });
            } else {
                await LabService.create(payload);
                addToast({ title: "Laboratório Criado", type: "success" });
            }
            setIsDialogOpen(false);
            loadData();
        } catch (error) {
            console.error(error);
            addToast({ title: "Erro ao salvar laboratório", type: "error" });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este laboratório? Esta ação não pode ser desfeita.")) return;
        try {
            await LabService.delete(id);
            addToast({ title: "Laboratório Removido", type: "info" });
            loadData();
        } catch (error) {
            console.error(error);
            addToast({ title: "Erro ao remover laboratório", type: "error" });
        }
    };

    return (
        <div className="animate-fade-in space-y-8">
            <div className="flex justify-between items-end border-b border-black pb-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-serif text-black uppercase tracking-wide">Laboratórios</h2>
                    <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Gerenciar unidades de laboratório</p>
                </div>
                <Button
                    onClick={() => handleOpenDialog()}
                    className="rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest px-6 h-10 transition-all"
                >
                    <Plus className="mr-2 h-3 w-3" /> Novo Laboratório
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {labs.map(lab => (
                    <div key={lab.id} className="group relative flex flex-col justify-between p-6 bg-neutral-50 border border-neutral-200 hover:border-black transition-all">
                        <div className="space-y-3 mb-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="text-[9px] font-mono text-neutral-400 uppercase block">Código</span>
                                    <span className="text-xs font-bold font-mono text-black">{lab.codigo}</span>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-serif text-black">{lab.nome}</h3>
                                {(lab.cidade || lab.estado) && (
                                    <p className="text-[10px] font-mono text-neutral-500 uppercase mt-1">
                                        {[lab.cidade, lab.estado].filter(Boolean).join(" — ")}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pt-4 border-t border-neutral-100 opacity-40 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDialog(lab)}
                                className="flex-1 h-8 text-[9px] uppercase tracking-widest hover:bg-black hover:text-white rounded-none"
                            >
                                <Edit2 className="h-3 w-3 mr-1" /> Editar
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(lab.id)}
                                className="h-8 w-8 text-neutral-400 hover:text-red-600 rounded-none"
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ))}
                {labs.length === 0 && (
                    <div className="col-span-full text-center p-12 border-2 border-dashed border-neutral-200 text-neutral-400 text-xs font-mono uppercase">
                        Nenhum laboratório cadastrado.
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden border border-black shadow-2xl bg-white rounded-none">
                    <div className="border-b border-black p-6 bg-neutral-50 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-serif font-bold text-black uppercase">
                                {editingLab ? "Editar Laboratório" : "Novo Laboratório"}
                            </h3>
                            <p className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest mt-1">GESTÃO DE UNIDADES</p>
                        </div>
                        <button
                            onClick={() => setIsDialogOpen(false)}
                            className="p-2 hover:bg-black hover:text-white transition-colors"
                            title="Fechar"
                            aria-label="Fechar"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-8 space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">NOME *</Label>
                                <Input value={nome} onChange={e => setNome(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" placeholder="Ex: Lab Cuiabá" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">CÓDIGO *</Label>
                                <Input value={codigo} onChange={e => setCodigo(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" placeholder="Ex: CBA01" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">CIDADE</Label>
                                <Input value={cidade} onChange={e => setCidade(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">ESTADO (UF)</Label>
                                <Input value={estado} onChange={e => setEstado(e.target.value)} maxLength={2} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" placeholder="MT" />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-neutral-100">
                            <Button onClick={() => setIsDialogOpen(false)} variant="ghost" className="flex-1 h-12 rounded-none border border-black hover:bg-neutral-100 text-[10px] font-bold uppercase tracking-widest">
                                CANCELAR
                            </Button>
                            <Button onClick={handleSave} className="flex-1 h-12 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest">
                                SALVAR
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

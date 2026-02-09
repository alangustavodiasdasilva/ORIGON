import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Landmark, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabService } from "@/entities/Lab";
import type { Lab } from "@/entities/Lab";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function LabsTab() {
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<Lab | null>(null);

    // Form States
    const [nome, setNome] = useState("");
    const [codigo, setCodigo] = useState("");
    const [cidade, setCidade] = useState("");
    const [estado, setEstado] = useState("");

    useEffect(() => {
        loadLabs();
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
            } else {
                await LabService.create({ nome, codigo, cidade, estado });
            }
            setIsDialogOpen(false);
            loadLabs();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar laboratório");
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Tem certeza que deseja excluir este laboratório?")) {
            await LabService.delete(id);
            loadLabs();
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
                    className="rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest px-6 h-10 transition-all"
                >
                    <Plus className="mr-2 h-3 w-3" /> New Unit
                </Button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="py-4 pl-4 text-[10px] font-bold text-black uppercase tracking-widest w-12 text-center">Icon</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest">Laboratory Name</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest">Code</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest">Location</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest text-right pr-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                        {labs.map(lab => (
                            <tr key={lab.id} className="group hover:bg-neutral-50 transition-colors">
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
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(lab)} className="rounded-none h-8 w-8 hover:bg-black hover:text-white border border-transparent hover:border-black transition-all">
                                        <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(lab.id)} className="rounded-none h-8 w-8 hover:bg-red-600 hover:text-white border border-transparent hover:border-red-600 transition-all">
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden border border-black shadow-2xl bg-white rounded-none">
                    <div className="border-b border-black p-6 bg-neutral-50 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-serif font-bold text-black uppercase">
                                {editingLab ? "Edit Unit" : "Register Unit"}
                            </h3>
                        </div>
                        <button
                            onClick={() => setIsDialogOpen(false)}
                            className="p-2 hover:bg-black hover:text-white transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Laboratory Name</Label>
                            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="e.g. FiberTech Main" className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Unit Code</Label>
                            <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="e.g. LAB-01" className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm uppercase" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">City</Label>
                                <Input value={cidade} onChange={e => setCidade(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">State (UF)</Label>
                                <Input value={estado} onChange={e => setEstado(e.target.value)} maxLength={2} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm uppercase" />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-neutral-100 mt-4">
                            <Button
                                onClick={() => setIsDialogOpen(false)}
                                variant="ghost"
                                className="flex-1 h-12 rounded-none border border-black hover:bg-neutral-100 text-[10px] font-bold uppercase tracking-widest"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="flex-[2] h-12 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest shadow-lg"
                            >
                                Save Unit
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

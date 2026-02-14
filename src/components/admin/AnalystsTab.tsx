import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Edit2, Shield, X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnalistaService } from "@/entities/Analista";
import type { Analista, AccessLevel } from "@/entities/Analista";
import { LabService } from "@/entities/Lab";
import type { Lab } from "@/entities/Lab";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";


export default function AnalystsTab() {
    const { user: currentUser, refreshUser, currentLab } = useAuth();
    const [analistas, setAnalistas] = useState<Analista[]>([]);
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAnalista, setEditingAnalista] = useState<Analista | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form
    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [cargo, setCargo] = useState("");
    const [acesso, setAcesso] = useState<AccessLevel>("user");
    const [labId, setLabId] = useState("");
    const [foto, setFoto] = useState<string | undefined>(undefined);

    useEffect(() => {
        loadData();
    }, [currentUser, currentLab]);

    const loadData = async () => {
        // Prepare promises
        const promises: Promise<any>[] = [LabService.list()];

        // Check scope
        const isGlobalAdmin = currentUser?.acesso === 'admin_global';
        const targetLabId = currentLab?.id || (currentUser?.acesso === 'admin_lab' ? currentUser.lab_id : null);

        // Global admin sees EVERYTHING, lab admin sees only their lab
        if (targetLabId && !isGlobalAdmin) {
            promises.push(AnalistaService.listByLab(targetLabId));
        } else {
            promises.push(AnalistaService.list());
        }

        const [lData, aData] = await Promise.all(promises);
        setLabs(lData);
        setAnalistas(aData);
    };

    const handleOpenDialog = (a?: Analista) => {
        // Default labId for new analyst
        const defaultLabId = currentLab?.id || (currentUser?.acesso === 'admin_lab' ? (currentUser.lab_id || "") : "") || "";

        if (a) {
            setEditingAnalista(a);
            setNome(a.nome);
            setEmail(a.email);
            setSenha(""); // Limpa campo de senha na edição por segurança
            setCargo(a.cargo);
            setAcesso(a.acesso);
            setLabId(a.lab_id || "");
            setFoto(a.foto || undefined);
        } else {
            setEditingAnalista(null);
            setNome("");
            setEmail("");
            setSenha("");
            setCargo("");
            setAcesso("user");
            setLabId(defaultLabId);
            setFoto(undefined);
        }
        setIsDialogOpen(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFoto(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        // Validate required fields
        if (!nome || !email || (!editingAnalista && !senha) || !cargo) {
            alert("Por favor, preencha todos os campos obrigatórios.");
            return;
        }

        // If not global admin, labId validation logic might vary, but usually required unless admin_global creating global admin
        // But here we enforce labId if we are in a lab context
        if (!labId && acesso !== 'admin_global') {
            alert("Vínculo com laboratório é obrigatório para este nível de acesso.");
            return;
        }

        try {
            const payload = {
                nome, email, cargo, acesso, foto,
                ...(senha ? { senha } : {}),
                lab_id: labId
            };

            if (editingAnalista) {
                await AnalistaService.update(editingAnalista.id, payload);
                // Se o analista editado for o usuário logado, atualiza o contexto
                if (editingAnalista.id === currentUser?.id) {
                    await refreshUser();
                }
            } else {
                await AnalistaService.create(payload as any);
            }
            setIsDialogOpen(false);
            loadData();
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar analista: " + (error instanceof Error ? error.message : "Erro desconhecido"));
        }
    };



    const handleDelete = async (id: string) => {
        if (confirm("Tem certeza que deseja excluir este analista?")) {
            await AnalistaService.delete(id);
            loadData();
        }
    };

    const getLabName = (id?: string) => {
        if (!id) return "Global / N/A";
        return labs.find(l => l.id === id)?.nome || "Lab Desconhecido";
    };

    const getInitials = (name: string) => {
        return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    };

    const targetLabId = currentLab?.id || (currentUser?.acesso === 'admin_lab' ? currentUser.lab_id : null);

    return (
        <div className="animate-fade-in space-y-8">
            <div className="flex justify-between items-end border-b border-black pb-4">
                <div className="space-y-1">
                    <h2 className="text-xl font-serif text-black uppercase tracking-wide">Analyst Registry</h2>
                    <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Manage access credentials & roles</p>
                </div>
                <Button
                    onClick={() => handleOpenDialog()}
                    className="rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest px-6 h-10 transition-all"
                >
                    <Plus className="mr-2 h-3 w-3" /> New Analyst
                </Button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest pl-4">Profile</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest">Name / Role</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest">Credentials</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest">Unit Access</th>
                            <th className="py-4 text-[10px] font-bold text-black uppercase tracking-widest text-right pr-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                        {analistas.map(a => (
                            <tr key={a.id} className="group hover:bg-neutral-50 transition-colors">
                                <td className="py-4 pl-4">
                                    {a.foto ? (
                                        <div className="h-10 w-10 overflow-hidden border border-black grayscale">
                                            <img src={a.foto} alt={a.nome} className="h-full w-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className="h-10 w-10 flex items-center justify-center border border-black bg-neutral-100 font-bold text-xs">
                                            {getInitials(a.nome)}
                                        </div>
                                    )}
                                </td>
                                <td className="py-4">
                                    <div className="font-bold text-sm text-black">{a.nome}</div>
                                    <div className="text-[10px] font-mono text-neutral-500 uppercase mt-1">{a.cargo}</div>
                                </td>
                                <td className="py-4">
                                    <div className="font-mono text-xs text-black">{a.email}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Shield className="h-3 w-3 text-neutral-400" />
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">{a.acesso.replace('_', ' ')}</span>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <span className="text-xs font-mono border-b border-neutral-300 pb-0.5">{getLabName(a.lab_id)}</span>
                                </td>
                                <td className="py-4 text-right pr-4 space-x-2">
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(a)} className="rounded-none h-8 w-8 hover:bg-black hover:text-white border border-transparent hover:border-black transition-all">
                                        <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} className="rounded-none h-8 w-8 hover:bg-red-600 hover:text-white border border-transparent hover:border-red-600 transition-all">
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-lg p-0 overflow-hidden border border-black shadow-2xl bg-white rounded-none">
                    <div className="border-b border-black p-6 bg-neutral-50 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-serif font-bold text-black uppercase">
                                {editingAnalista ? "EDITAR PERFIL" : "CADASTRAR ANALISTA"}
                            </h3>
                            <p className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest mt-1">
                                GESTÃO DE CREDENCIAIS
                            </p>
                        </div>
                        <button
                            onClick={() => setIsDialogOpen(false)}
                            className="p-2 hover:bg-black hover:text-white transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        {/* Imagem de Perfil */}
                        <div className="flex flex-col items-center gap-4 py-2 border-b border-neutral-100 pb-6">
                            <div
                                className="h-24 w-24 border border-black flex items-center justify-center relative group cursor-pointer overflow-hidden bg-neutral-50 hover:bg-neutral-100 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {foto ? (
                                    <img src={foto} alt="Preview" className="h-full w-full object-cover grayscale" />
                                ) : (
                                    <Camera className="h-6 w-6 text-neutral-400 group-hover:text-black transition-colors" />
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <span className="text-[9px] font-bold text-white uppercase tracking-widest">ALTERAR</span>
                                </div>
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            <p className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">AVATAR DO USUÁRIO</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">NOME COMPLETO</Label>
                                <Input value={nome} onChange={e => setNome(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">FUNÇÃO / CARGO</Label>
                                <Input value={cargo} onChange={e => setCargo(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">ENDEREÇO DE E-MAIL</Label>
                            <Input value={email} onChange={e => setEmail(e.target.value)} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm" />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">SENHA</Label>
                            <Input value={senha} onChange={e => setSenha(e.target.value)} type="password" placeholder={editingAnalista ? "••••••" : "min. 6 caracteres"} className="h-10 rounded-none border-neutral-300 focus:border-black font-mono text-sm placeholder:text-neutral-300" />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest min-h-[24px] flex items-center">NÍVEL DE ACESSO</Label>
                                <select
                                    className="w-full h-10 rounded-none border border-neutral-300 px-3 text-xs font-mono uppercase focus:ring-0 focus:border-black focus:outline-none transition-all"
                                    value={acesso}
                                    onChange={(e) => setAcesso(e.target.value as AccessLevel)}
                                >
                                    <option value="user">ANALISTA</option>
                                    <option value="quality_admin">QUALIDADE (ADM)</option>
                                    <option value="admin_lab">ADMIN LAB</option>
                                    {/* SUPER ADMIN option only visible to current super admins */}
                                    {currentUser?.acesso === 'admin_global' && (
                                        <option value="admin_global">SUPER ADMIN</option>
                                    )}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[9px] font-bold uppercase text-neutral-500 tracking-widest min-h-[24px] flex items-center">
                                    UNIDADE DE LABORATÓRIO
                                    {labs.length > 0 && (
                                        <span className="ml-2 text-neutral-400">({labs.length} DISPONÍVEIS)</span>
                                    )}
                                </Label>
                                {labs.length === 0 ? (
                                    <div className="w-full h-10 rounded-none border border-dashed border-amber-400 bg-amber-50 px-3 flex items-center text-xs font-mono text-amber-700">
                                        ⚠ NENHUM LAB
                                    </div>
                                ) : (
                                    <select
                                        className="w-full h-10 rounded-none border border-neutral-300 px-3 text-xs font-mono uppercase focus:ring-0 focus:border-black focus:outline-none transition-all disabled:opacity-50 disabled:bg-neutral-100"
                                        value={labId}
                                        onChange={(e) => setLabId(e.target.value)}
                                        disabled={!!targetLabId && currentUser?.acesso !== 'admin_global'}
                                        title="Selecione a unidade do laboratório"
                                    >
                                        <option value="">SELECIONE A UNIDADE...</option>
                                        {labs.map(l => (
                                            <option key={l.id} value={l.id}>{l.nome} ({l.codigo})</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-neutral-100 mt-4">
                            <Button
                                onClick={() => setIsDialogOpen(false)}
                                variant="ghost"
                                className="flex-1 h-12 rounded-none border border-black hover:bg-neutral-100 text-[10px] font-bold uppercase tracking-widest"
                            >
                                CANCELAR
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="flex-1 h-12 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-widest shadow-lg"
                            >
                                SALVAR CREDENCIAIS
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

import { useState, useEffect } from "react";
import {
    Plus as PlusIcon,
    Search as SearchIcon,
    Trash2 as Trash2Icon,
    PencilLine as PencilLineIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
// import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Lote, LoteService } from "@/entities/Lote";
import { SampleService } from "@/entities/Sample";
import { type Lab, LabService } from "@/entities/Lab";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Modal } from "@/components/shared/Modal";

export default function Home() {
    const [lotes, setLotes] = useState<Lote[]>([]);
    const [sampleCounts, setSampleCounts] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const [isByLoteModalOpen, setIsByLoteModalOpen] = useState(false);
    const [newLoteName, setNewLoteName] = useState("");
    const [newLoteCidade, setNewLoteCidade] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // Edit/Delete states
    const [loteToEdit, setLoteToEdit] = useState<Lote | null>(null);
    const [editName, setEditName] = useState("");
    const [editCidade, setEditCidade] = useState("");
    const [loteToDelete, setLoteToDelete] = useState<Lote | null>(null);

    const navigate = useNavigate();

    const { addToast } = useToast();
    const { user, currentLab } = useAuth();
    const { t } = useLanguage();

    useEffect(() => {
        loadLotes();
    }, [user, currentLab]);

    // Auto-fill city from user's lab or selected lab
    useEffect(() => {
        const fetchLabCity = async () => {
            const targetLabId = currentLab?.id || user?.lab_id;

            if (targetLabId) {
                try {
                    const lab = await LabService.get(targetLabId);
                    if (lab && lab.cidade) {
                        const cityState = lab.estado ? `${lab.cidade}/${lab.estado}` : lab.cidade;
                        setNewLoteCidade(cityState);
                    }
                } catch (error) {
                    console.error("Failed to fetch lab details", error);
                }
            }
        };
        fetchLabCity();
    }, [user, currentLab, isByLoteModalOpen]);

    const [labs, setLabs] = useState<Lab[]>([]);

    useEffect(() => {
        // Load labs for name resolution
        LabService.list().then(setLabs).catch(console.error);
    }, []);

    const loadLotes = async () => {
        setIsLoading(true);
        try {
            let data = await LoteService.list();

            // Filter logic (CORRECTED):
            // 1. If currentLab is selected → Show ONLY batches from that lab
            // 2. If NO currentLab AND admin_global → Show ALL batches
            // 3. If admin_lab → Always show only their assigned lab

            if (currentLab) {
                // Lab context is selected → filter by that lab
                data = data.filter(l => l.lab_id === currentLab.id);
            } else if (user?.acesso === 'admin_lab' && user.lab_id) {
                // Lab admin without selection → their assigned lab only
                data = data.filter(l => l.lab_id === user.lab_id);
            }
            // If admin_global with NO currentLab → show ALL (no filter)

            setLotes(data);

            const counts: Record<string, number> = {};
            for (const lote of data) {
                const samples = await SampleService.listByLote(lote.id);
                counts[lote.id] = samples.length;
            }
            setSampleCounts(counts);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const getLabName = (labId?: string) => {
        if (!labId) return "N/A";
        const lab = labs.find(l => l.id === labId);
        return lab ? `${lab.nome} - ${lab.cidade}` : "Unknown Lab";
    };

    const handleCreateLote = async () => {
        if (!newLoteName.trim() || !user) return;

        const targetLabId = currentLab?.id || user.lab_id;
        if (!targetLabId && user.acesso !== 'admin_global') {
            addToast({ title: "Error: No Lab Context", type: "error" });
            return;
        }

        setIsCreating(true);
        try {
            const newLote = await LoteService.create({
                nome: newLoteName,
                cidade: newLoteCidade,
                analista_responsavel: user.nome,
                lab_id: targetLabId, // Bind Lote to current context
                status: 'aberto'
            });
            addToast({
                title: "Created",
                description: `Batch ${newLoteName} initialized.`,
                type: "success"
            });
            setNewLoteName("");
            setNewLoteCidade("");
            setIsByLoteModalOpen(false);
            navigate(`/registro?loteId=${newLote.id}`);
        } catch (error) {
            addToast({ title: "Creation Error", type: "error" });
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdateLote = async () => {
        if (!loteToEdit || !editName.trim()) return;
        try {
            await LoteService.update(loteToEdit.id, { nome: editName, cidade: editCidade });
            addToast({ title: "Updated", type: "success" });
            setLoteToEdit(null);
            loadLotes();
        } catch (error) {
            addToast({ title: "Update Error", type: "error" });
        }
    };

    const handleToggleStatus = async (lote: Lote) => {
        try {
            const newStatus = lote.status === 'aberto' ? 'finalizado' : 'aberto';
            await LoteService.update(lote.id, { status: newStatus });
            addToast({
                title: "Status Updated",
                description: `Batch ${lote.nome} is now ${newStatus === 'aberto' ? 'Open' : 'Locked'}.`,
                type: "success"
            });
            loadLotes();
        } catch (error) {
            addToast({ title: "Status Update Error", type: "error" });
        }
    };

    const handleDeleteLote = async () => {
        if (!loteToDelete) return;
        try {
            await LoteService.delete(loteToDelete.id);
            addToast({
                title: "Items Removed",
                type: "info"
            });
            setLoteToDelete(null);
            loadLotes();
        } catch (error) {
            addToast({ title: "Delete Error", type: "error" });
        }
    };

    const filteredLotes = lotes.filter(l =>
        l.nome.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <div className="space-y-16 animate-fade-in text-black pb-24">

            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-end justify-between border-b border-black pb-8 gap-8">
                <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 font-mono">{t('home.subtitle')}</span>
                    <h1 className="text-4xl lg:text-5xl font-serif text-black leading-none">
                        {t('home.title')}
                    </h1>
                </div>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    <div className="relative w-full md:w-80">
                        <SearchIcon className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                        <Input
                            placeholder={t('home.search_placeholder')}
                            className="h-12 pl-8 border-b border-neutral-300 rounded-none bg-transparent focus:border-black focus:ring-0 text-xs font-mono placeholder:text-neutral-300 px-0"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        onClick={() => setIsByLoteModalOpen(true)}
                        className="h-12 px-8 bg-black text-white hover:bg-neutral-800 rounded-none text-[10px] uppercase tracking-[0.2em] font-bold"
                    >
                        <PlusIcon className="mr-2 h-4 w-4" />
                        {t('home.init_batch')}
                    </Button>
                </div>
            </div>

            {/* Grid */}
            <div>
                {isLoading ? (
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-64 border border-neutral-100 bg-neutral-50 animate-pulse" />)}
                    </div>
                ) : filteredLotes.length === 0 ? (
                    <div className="py-24 text-center border border-dashed border-neutral-300">
                        <p className="text-neutral-400 font-mono uppercase tracking-widest text-xs">{t('home.no_batches')}</p>
                    </div>
                ) : (
                    <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
                        {filteredLotes.map((lote) => (
                            <div key={lote.id} className="group flex flex-col justify-between border border-neutral-200 hover:border-black transition-colors duration-300 min-h-[320px] bg-white relative z-10">
                                <div className="p-8 space-y-8">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${lote.status === 'aberto' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                                <span className={`text-[10px] uppercase tracking-widest font-mono ${lote.status === 'aberto' ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {lote.status === 'aberto' ? t('home.active') : t('home.locked')}
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-serif text-black leading-tight">
                                                {lote.nome}
                                            </h3>
                                        </div>

                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleToggleStatus(lote); }}
                                                className="p-2 hover:bg-neutral-100 transition-colors"
                                                title={lote.status === 'aberto' ? t('home.lock_batch') : t('home.unlock_batch')}
                                            >
                                                {lote.status === 'aberto' ? (
                                                    <LockIcon className="h-4 w-4 text-neutral-400 hover:text-black" />
                                                ) : (
                                                    <LockOpenIcon className="h-4 w-4 text-red-500 hover:text-red-700" />
                                                )}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setLoteToEdit(lote);
                                                    setEditName(lote.nome);
                                                    setEditCidade(lote.cidade || "");
                                                }}
                                                className="p-2 hover:bg-neutral-100 transition-colors"
                                                title={t('home.rename_batch')}
                                            >
                                                <PencilLineIcon className="h-4 w-4 text-black" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setLoteToDelete(lote); }}
                                                className="p-2 hover:bg-neutral-100 transition-colors"
                                                title={t('home.destroy_batch')}
                                            >
                                                <Trash2Icon className="h-4 w-4 text-black" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8 border-t border-neutral-100 pt-6">
                                        <div>
                                            <span className="text-[9px] uppercase tracking-widest text-neutral-400 block mb-1">{t('home.created')}</span>
                                            <span className="font-mono text-xs">{new Date(lote.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] uppercase tracking-widest text-neutral-400 block mb-1">{t('home.analyst')}</span>
                                            <span className="font-mono text-xs flex items-center gap-1">
                                                {lote.analista_responsavel}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] uppercase tracking-widest text-neutral-400 block mb-1">{t('home.origin')}</span>
                                            <span className="font-mono text-xs uppercase text-neutral-600 truncate block">
                                                {lote.cidade || "N/A"}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] uppercase tracking-widest text-neutral-400 block mb-1">{t('home.unit')}</span>
                                            <span className="font-mono text-xs uppercase text-black font-bold truncate block" title={getLabName(lote.lab_id)}>
                                                {getLabName(lote.lab_id).split(' - ')[0]}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-[9px] uppercase tracking-widest text-neutral-400 block mb-2">{t('home.data_points')}</span>
                                        <div className="text-3xl font-mono">
                                            {(sampleCounts[lote.id] || 0).toString().padStart(2, '0')}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 border-t border-neutral-200 divide-x divide-neutral-200">
                                    <button
                                        onClick={() => navigate(`/registro?loteId=${lote.id}`)}
                                        className="h-12 flex items-center justify-center gap-2 hover:bg-black hover:text-white transition-colors text-[10px] uppercase tracking-widest font-bold"
                                    >
                                        {t('home.digitize')}
                                    </button>
                                    <button
                                        onClick={() => navigate(`/analysis?loteId=${lote.id}`)}
                                        className="h-12 flex items-center justify-center gap-2 hover:bg-black hover:text-white transition-colors text-[10px] uppercase tracking-widest font-bold"
                                    >
                                        {t('home.analyze')}
                                        <ArrowRight className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                isOpen={isByLoteModalOpen}
                onClose={() => setIsByLoteModalOpen(false)}
                title={t('home.initialize_batch_title')}
                description={t('home.enter_params')}
            >
                <div className="space-y-8 pt-4">
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t('home.batch_identifier')}</label>
                        <Input
                            autoFocus
                            placeholder="e.g. YEAR-2025-A"
                            value={newLoteName}
                            onChange={(e) => setNewLoteName(e.target.value)}
                            className="h-12 border-b border-black rounded-none text-xl font-mono text-black placeholder:text-neutral-200 px-0 bg-transparent focus:ring-0 border-t-0 border-x-0"
                        />
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t('home.origin_city')}</label>
                        <Input
                            placeholder="e.g. Primavera do Leste/MT"
                            value={newLoteCidade}
                            onChange={(e) => setNewLoteCidade(e.target.value)}
                            className="h-12 border-b border-black rounded-none text-sm font-mono text-black placeholder:text-neutral-200 px-0 bg-transparent focus:ring-0 border-t-0 border-x-0"
                        />
                    </div>
                    <Button
                        onClick={handleCreateLote}
                        disabled={!newLoteName.trim() || isCreating}
                        className="w-full h-14 rounded-none bg-black text-white hover:bg-neutral-800 font-bold uppercase text-[11px] tracking-[0.3em]"
                    >
                        {isCreating ? t('home.initializing') : t('home.confirm_initialization')}
                    </Button>
                </div>
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={!!loteToEdit}
                onClose={() => setLoteToEdit(null)}
                title={t('home.rename_batch')}
            >
                <div className="space-y-6 pt-4">
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t('home.new_identifier')}</label>
                        <Input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-12 border-b border-black rounded-none text-xl font-mono text-black placeholder:text-neutral-200 px-0 bg-transparent focus:ring-0 border-t-0 border-x-0"
                        />
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{t('home.origin_city')}</label>
                        <Input
                            value={editCidade}
                            onChange={(e) => setEditCidade(e.target.value)}
                            className="h-12 border-b border-black rounded-none text-sm font-mono text-black placeholder:text-neutral-200 px-0 bg-transparent focus:ring-0 border-t-0 border-x-0"
                        />
                    </div>
                    <Button
                        onClick={handleUpdateLote}
                        disabled={!editName.trim()}
                        className="w-full h-14 rounded-none bg-black text-white hover:bg-neutral-800 font-bold uppercase text-[11px] tracking-[0.3em]"
                    >
                        {t('home.save_changes')}
                    </Button>
                </div>
            </Modal>

            {/* Delete Modal */}
            <Modal
                isOpen={!!loteToDelete}
                onClose={() => setLoteToDelete(null)}
                title={t('home.destroy_batch')}
            >
                <div className="space-y-8 pt-4 text-center">
                    <p className="text-sm text-neutral-600">
                        {t('home.permanently_delete')} <span className="font-bold text-black border-b border-black">{loteToDelete?.nome}</span>?
                        <br /><span className="text-[10px] uppercase text-red-600 font-bold mt-2 block">{t('home.data_loss_warning')}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <Button
                            onClick={() => setLoteToDelete(null)}
                            variant="ghost"
                            className="h-12 font-bold uppercase text-[10px] tracking-widest"
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            onClick={handleDeleteLote}
                            className="h-12 rounded-none bg-red-600 text-white hover:bg-red-700 font-bold uppercase text-[10px] tracking-widest"
                        >
                            {t('home.confirm_deletion')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

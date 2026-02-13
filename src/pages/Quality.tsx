import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, FileText, Download, Trash2, CheckSquare, Eye, X as CloseIcon, ArrowLeft, Plus, Settings, Edit3, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/contexts/ToastContext";
import { AuditService, type AuditDocument, type AuditCategory } from "@/entities/Audit";
import { cn } from "@/lib/utils";

export default function Quality() {
    const { user, currentLab, selectLab, deselectLab } = useAuth();
    const { addToast } = useToast();

    // Role check: Only admins or quality_admin
    if (user && !['admin_global', 'admin_lab', 'quality_admin'].includes(user.acesso)) {
        return <Navigate to="/" replace />;
    }



    // Audit State
    const [categories, setCategories] = useState<AuditCategory[]>([]);
    const [documents, setDocuments] = useState<AuditDocument[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [previewDoc, setPreviewDoc] = useState<AuditDocument | null>(null);

    // Category Management State
    const [isConfigMode, setIsConfigMode] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Partial<AuditCategory> | null>(null);
    const [labs, setLabs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadInitialData();
    }, [user, currentLab]);

    const loadInitialData = async () => {
        setIsLoading(true);
        try {
            // 1. Load Labs (Critical for navigation)
            // 1. Load Labs (Critical for navigation)
            const { LabService } = await import('@/entities/Lab');
            const labsData = await LabService.list().catch(e => {
                console.error("Failed to load labs:", e);
                addToast({ title: "Aviso: Falha ao carregar laboratórios", description: "Tente recarregar a página.", type: "warning" });
                return [];
            });
            setLabs(labsData);

            // 2. Load Audit Data (Can fail without blocking navigation)
            try {
                const targetLabId = currentLab?.id || user?.lab_id;
                const [docs, cats] = await Promise.all([
                    targetLabId ? AuditService.listByLab(targetLabId) : AuditService.list(),
                    AuditService.listCategories()
                ]);

                setDocuments(docs);
                setCategories(cats);
            } catch (auditError: any) {
                console.error("Audit data load error:", auditError);
                // Alert the user more specifically
                const msg = auditError.message || JSON.stringify(auditError);
                addToast({
                    title: "Erro ao carregar auditoria (" + (auditError.code || "?") + ")",
                    description: msg,
                    type: "error"
                });
            }

        } catch (error: any) {
            console.error("Critical error in Quality load:", error);
            addToast({
                title: "Erro de Carregamento",
                description: error.message || "Falha crítica ao inicializar módulo.",
                type: "error"
            });
        } finally {
            setIsLoading(false);
        }
    };



    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const category = categories.find(c => c.id === selectedCategoryId);
        if (!file || !user || !category) return;

        const targetLabId = currentLab?.id || user?.lab_id;
        if (!targetLabId && user.acesso !== 'admin_global') {
            addToast({ title: "Erro: Laboratório não identificado", type: "error" });
            return;
        }

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const base64 = event.target?.result as string;

                    await AuditService.upload({
                        name: file.name.split('.')[0],
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                        data: base64,
                        category: category.name,
                        analystName: user.nome,
                        labId: targetLabId || undefined
                    }, file);

                    addToast({ title: "Documento Anexado", type: "success" });
                    loadInitialData();
                } catch (err: any) {
                    console.error("Upload errored:", err);
                    addToast({ title: "Erro ao anexar: " + (err.message || 'Desconhecido'), type: "error" });
                } finally {
                    setIsUploading(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            addToast({ title: "Erro no Upload", type: "error" });
            setIsUploading(false);
        }
    };

    const handleDownload = async (doc: AuditDocument) => {
        let fileData = doc.data;
        try {
            let data = doc.data;
            // Se não tem dados ou parece ser um caminho relativo (storage path), busca URL assinada nova
            if (!data || (!data.startsWith('http') && !data.startsWith('data:'))) {
                console.log("DEBUG: Buscando URL assinada para download...", doc.fileName);
                const refreshed = await AuditService.getContent(doc.id);
                if (refreshed) data = refreshed;
            }

            if (!data) {
                addToast({ title: "Arquivo indisponível", description: "Não foi possível gerar o link de download.", type: "error" });
                return;
            }

            // Cria link temporário para download forçado
            const link = document.createElement('a');
            link.href = data;
            link.download = doc.fileName || 'documento';

            // Se for URL externa (Storage), abre em nova aba para garantir
            if (data.startsWith('http')) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Erro no download:", error);
            addToast({ title: "Erro ao baixar", type: "error" });
        }
    };

    const handlePreview = async (doc: AuditDocument) => {
        try {
            let data = doc.data;
            if (!data || (!data.startsWith('http') && !data.startsWith('data:'))) {
                const content = await AuditService.getContent(doc.id);
                if (content) data = content;
            }

            if (!data) {
                addToast({ title: "Erro ao carregar visualização", type: "error" });
                return;
            }

            setPreviewDoc({ ...doc, data: data });
        } catch (e) {
            console.error("Erro preview:", e);
            addToast({ title: "Erro ao abrir visualização", type: "error" });
        }
    };

    const handleDeleteDoc = async (id: string) => {
        if (confirm("Deseja remover este documento do checklist?")) {
            await AuditService.delete(id);
            addToast({ title: "Documento Removido", type: "info" });
            loadInitialData();
        }
    };

    // Category Methods
    const handleSaveCategory = async () => {
        if (!editingCategory?.name) {
            addToast({ title: "Nome da categoria obrigatório", type: "error" });
            return;
        }
        try {
            const targetLabId = currentLab?.id || user?.lab_id;
            const categoryToSave = {
                ...editingCategory,
                labId: targetLabId
            } as AuditCategory;

            await AuditService.saveCategory(categoryToSave);
            addToast({ title: "Categoria Salva", type: "success" });
            setEditingCategory(null);
            loadInitialData();
        } catch (error: any) {
            console.error("Failed to save category:", error);
            const errorMsg = error.message || "Erro desconhecido";
            // Alert in case toast is missed
            alert(`Erro ao salvar categoria: ${errorMsg}`);
            addToast({
                title: "Erro ao salvar categoria",
                description: errorMsg,
                type: "error"
            });
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (confirm("Remover esta categoria? Isso não excluirá os documentos já enviados, mas eles ficarão órfãos.")) {
            await AuditService.deleteCategory(id);
            addToast({ title: "Categoria Removida", type: "info" });
            loadInitialData();
        }
    };

    const getLabInfo = (labId?: string) => {
        if (!labId) return null;
        const lab = labs.find(l => l.id === labId);
        if (!lab) return null;
        return { name: lab.nome, city: lab.cidade };
    };

    // Lab Selection Screen for Global Admin (similar to Inicio.tsx)
    if (user?.acesso === 'admin_global' && !currentLab) {
        return (
            <div className="min-h-full flex flex-col items-center justify-center p-8 space-y-12 animate-fade-in">
                <div className="text-center space-y-6 max-w-2xl">
                    <div className="inline-flex items-center justify-center p-4 bg-black rounded-2xl mb-6 shadow-2xl">
                        <ShieldCheck className="h-12 w-12 text-white" />
                    </div>
                    <h1 className="text-5xl lg:text-6xl font-serif text-black leading-tight">
                        Selecione o Laboratório
                    </h1>
                    <p className="text-xl text-neutral-600 font-light">
                        Escolha um laboratório para visualizar e gerenciar seus documentos de qualidade e conformidade.
                    </p>
                </div>

                {isLoading ? (
                    <div className="animate-pulse flex gap-4">
                        <div className="h-48 w-64 bg-neutral-200 rounded-2xl"></div>
                        <div className="h-48 w-64 bg-neutral-200 rounded-2xl"></div>
                    </div>
                ) : labs.length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-neutral-300 rounded-2xl">
                        <p className="text-neutral-500 font-mono">Nenhum laboratório encontrado.</p>
                        <div className="mt-4 p-2 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200">
                            Verifique se existem laboratórios cadastrados no módulo Admin.
                        </div>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                        {labs.map((lab) => {
                            const labDocs = documents.filter(d => d.labId === lab.id);
                            const docCount = labDocs.length;

                            return (
                                <button
                                    key={lab.id}
                                    onClick={() => selectLab(lab.id)}
                                    className="group relative flex flex-col p-8 bg-white border-2 border-neutral-200 hover:border-black rounded-2xl transition-all duration-300 text-left hover:shadow-xl hover:-translate-y-1"
                                >
                                    <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ArrowRight className="h-6 w-6 text-black" />
                                    </div>
                                    <div className="h-12 w-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-black group-hover:text-white transition-colors">
                                        <ShieldCheck className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-2xl font-serif text-black mb-2">{lab.nome}</h3>
                                    <p className="text-sm font-mono text-neutral-500 uppercase tracking-wider mb-4">
                                        {lab.cidade || 'N/A'} - {lab.estado || 'N/A'}
                                    </p>
                                    <div className="mt-auto pt-6 border-t border-neutral-100 w-full flex justify-between items-center">
                                        <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 group-hover:text-black">
                                            {docCount} Documento{docCount !== 1 ? 's' : ''}
                                        </span>
                                        <span className="text-xs font-mono text-neutral-300 group-hover:text-black">
                                            {lab.codigo}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    const currentCategory = categories.find(c => c.id === selectedCategoryId);
    const categoryDocs = documents.filter(d => d.category === currentCategory?.name);

    return (
        <div className="space-y-12 animate-fade-in text-black pb-24">
            {/* Header Section */}
            <div className="border-b border-black pb-8">
                <div className="flex flex-col md:flex-row items-end justify-between gap-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-4">
                            {(selectedCategoryId || isConfigMode) && (
                                <button
                                    onClick={() => { setSelectedCategoryId(null); setIsConfigMode(false); }}
                                    className="h-10 w-10 border border-neutral-200 flex items-center justify-center hover:border-black transition-colors"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                            )}
                            <div>
                                <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 font-mono block">
                                    {isConfigMode ? "Configurações do Checklist" : selectedCategoryId ? "Categoria Detalhada" : "Quality Assurance & Compliance"}
                                </span>
                                {currentLab && <span className="text-[9px] font-bold text-black uppercase tracking-widest bg-neutral-100 px-2 py-0.5 rounded-sm">{currentLab.nome}</span>}
                            </div>
                        </div>
                        <h1 className="text-4xl font-serif text-black leading-none mt-1">
                            {isConfigMode ? "Gerenciar Categorias" : selectedCategoryId ? currentCategory?.name : "Checklist de Auditoria"}
                        </h1>
                    </div >

                    <div className="flex items-center gap-4">
                        {/* Exit Lab Button for Global Admin */}
                        {user?.acesso === 'admin_global' && currentLab && (
                            <Button
                                onClick={() => deselectLab()}
                                variant="destructive"
                                className="h-12 px-6 font-bold text-[10px] uppercase tracking-widest rounded-none bg-red-600 hover:bg-red-700 text-white border-none"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Sair do Lab
                            </Button>
                        )}

                        {!selectedCategoryId && !isConfigMode && (
                            <Button
                                onClick={() => setIsConfigMode(true)}
                                variant="outline"
                                className="h-12 border-black rounded-none text-[10px] font-bold uppercase tracking-widest px-8"
                            >
                                <Settings className="mr-2 h-4 w-4" />
                                Configurar
                            </Button>
                        )}

                        {selectedCategoryId && (
                            <div className="flex flex-col gap-4">
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="h-12 bg-black text-white hover:bg-neutral-800 rounded-none text-[10px] font-bold uppercase tracking-widest px-8"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    {isUploading ? "ANEXANDO..." : "ADICIONAR DOCUMENTO"}
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.jpg,.png,.xlsx,.xls,.pptx,.csv"
                                />
                            </div>
                        )}

                        {isConfigMode && (
                            <Button
                                onClick={() => setEditingCategory({ id: '', name: '', description: '' })}
                                className="h-12 bg-black text-white hover:bg-neutral-800 rounded-none text-[10px] font-bold uppercase tracking-widest px-8"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Nova Categoria
                            </Button>
                        )}
                    </div>
                </div >
            </div >

            {/* Content Area */}
            {
                isConfigMode ? (
                    /* CONFIG MODE: List categories for editing */
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {categories.map((cat) => (
                            <div key={cat.id} className="p-8 border border-neutral-200 bg-white flex flex-col justify-between h-64">
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-xl font-serif">{cat.name}</h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setEditingCategory(cat)}
                                                className="h-8 w-8 border border-neutral-100 flex items-center justify-center hover:border-black transition-colors"
                                            >
                                                <Edit3 className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteCategory(cat.id)}
                                                className="h-8 w-8 border border-neutral-100 flex items-center justify-center hover:text-red-600 hover:border-red-600 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 leading-relaxed truncate-2-lines">
                                        {cat.description}
                                    </p>
                                </div>
                                <div className="text-[9px] font-mono text-neutral-300 mt-4">
                                    ID: {cat.id}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : !selectedCategoryId ? (
                    /* DASHBOARD VIEW: Category Cards */
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {categories.map((cat) => {
                            const count = documents.filter(d => d.category === cat.name).length;
                            const isComplete = count > 0;

                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategoryId(cat.id)}
                                    className="group text-left flex flex-col h-64 border border-neutral-200 bg-white hover:border-black transition-all p-8 relative"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={cn(
                                            "h-10 w-10 border flex items-center justify-center transition-colors",
                                            isComplete ? "bg-black border-black text-white" : "border-neutral-200 text-neutral-300"
                                        )}>
                                            <CheckSquare className="h-5 w-5" />
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-neutral-400 group-hover:text-black transition-colors">
                                            {count.toString().padStart(2, '0')} DOCS
                                        </span>
                                    </div>
                                    <div className="mt-auto">
                                        <h3 className="text-xl font-serif mb-2">{cat.name}</h3>
                                        <p className="text-[10px] uppercase tracking-wider text-neutral-400 leading-relaxed max-w-[80%]">
                                            {cat.description}
                                        </p>
                                    </div>
                                    <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Plus className="h-4 w-4" />
                                    </div>
                                </button>
                            );
                        })}

                        {categories.length === 0 && (
                            <div className="col-span-full py-32 border border-dashed border-neutral-100 flex flex-col items-center justify-center text-center">
                                <h3 className="text-lg font-serif mb-2">Checklist Vazio</h3>
                                <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-8">Nenhuma categoria cadastrada</p>
                                <Button onClick={() => setIsConfigMode(true)} variant="outline" className="border-black rounded-none">
                                    <Settings className="mr-2 h-4 w-4" /> Configurar Checklist
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* DETAIL VIEW: Document Grid */
                    <div className="space-y-8 animate-fade-in-up">
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {categoryDocs.map((doc) => (
                                <div key={doc.id} className="group/card flex flex-col border border-neutral-200 bg-white hover:border-black transition-all h-full animate-fade-in">
                                    <div className="aspect-[4/3] bg-neutral-50 border-b border-neutral-100 relative overflow-hidden flex items-center justify-center group-hover/card:bg-white transition-colors">
                                        {doc.fileType.startsWith('image/') ? (
                                            <img src={doc.data} alt={doc.fileName} className="w-full h-full object-cover opacity-80 group-hover/card:opacity-100 transition-opacity" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2">
                                                <FileText className="h-10 w-10 text-neutral-300" />
                                                <span className="text-[9px] font-mono text-neutral-400 uppercase">{doc.fileType.split('/')[1] || 'FILE'}</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                                            <button onClick={() => handlePreview(doc)} className="h-10 w-10 bg-white flex items-center justify-center hover:bg-neutral-100 transition-colors">
                                                <Eye className="h-5 w-5 text-black" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-4 flex-1 flex flex-col justify-between">
                                        <div className="space-y-1 mb-4">
                                            <p className="text-xs font-bold uppercase tracking-wider truncate mb-1">{doc.fileName}</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-neutral-400 font-mono">{(doc.fileSize / 1024).toFixed(1)} KB</span>
                                                <span className="text-[9px] text-neutral-400 font-mono italic">{new Date(doc.uploadDate).toLocaleDateString()}</span>
                                            </div>
                                            {/* Lab/City Info Badge */}
                                            {doc.labId && (() => {
                                                const labInfo = getLabInfo(doc.labId);
                                                return labInfo ? (
                                                    <div className="mt-2 pt-2 border-t border-neutral-100">
                                                        <span className="text-[8px] font-mono font-bold text-black uppercase tracking-widest bg-neutral-100 px-2 py-1 rounded-sm inline-block">
                                                            📍 {labInfo.name} - {labInfo.city}
                                                        </span>
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2 pt-4 border-t border-neutral-100">
                                            <button onClick={() => handleDownload(doc)} className="flex-1 flex items-center justify-center py-2 border border-black hover:bg-black hover:text-white transition-colors text-[9px] font-bold uppercase tracking-widest">
                                                <Download className="mr-2 h-3 w-3" /> DOWNLOAD
                                            </button>
                                            <button onClick={() => handleDeleteDoc(doc.id)} className="p-2 text-neutral-300 hover:text-red-600 transition-colors">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {categoryDocs.length === 0 && (
                                <div className="col-span-full py-24 border border-dashed border-neutral-100 flex flex-col items-center justify-center text-center">
                                    <FileText className="h-12 w-12 text-neutral-100 mb-4" />
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-300 font-bold max-w-xs">
                                        Nenhum documento anexado para esta categoria ainda.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Global Summary Status (Only on Main Dashboard) */}
            {
                !selectedCategoryId && !isConfigMode && (
                    <div className="border border-black p-8 bg-black text-white flex flex-col md:flex-row items-center justify-between gap-8 animate-fade-in">
                        <div className="flex-1 flex flex-col md:flex-row items-center gap-8">
                            <div className="h-12 w-12 border border-white/20 flex items-center justify-center shrink-0">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div className="flex-1 w-full space-y-4">
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-neutral-400 mb-1">Progresso de Conformidade</p>
                                        <h4 className="text-xl font-serif">
                                            {categories.filter(cat => documents.some(d => d.category === cat.name)).length} de {categories.length} Categorias Atendidas
                                        </h4>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-3xl font-serif leading-none italic">
                                            {categories.length > 0 ? Math.round((categories.filter(cat => documents.some(d => d.category === cat.name)).length / categories.length) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>

                                <div className="h-[2px] w-full bg-white/10 overflow-hidden relative">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-white transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                        style={{ width: `${categories.length > 0 ? (categories.filter(cat => documents.some(d => d.category === cat.name)).length / categories.length) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="shrink-0 text-right hidden md:block border-l border-white/10 pl-8">
                            <p className="text-[9px] font-mono text-neutral-500 uppercase">Status da Sessão</p>
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Ambiente Criptografado</p>
                        </div>
                    </div>
                )
            }

            {/* MODAL: Edit Category */}
            {
                editingCategory && createPortal(
                    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
                        <div className="bg-white w-full max-w-lg border border-black p-10 space-y-8 animate-fade-in-up">
                            <div className="space-y-2">
                                <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-mono">Editor de Checklist</span>
                                <h3 className="text-2xl font-serif">{editingCategory.id ? "Editar Categoria" : "Nova Categoria"}</h3>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] uppercase font-bold tracking-widest">Nome da Categoria</label>
                                    <Input
                                        value={editingCategory.name || ''}
                                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                        placeholder="Ex: Certificados de Calibração"
                                        className="h-12 border-b border-black rounded-none bg-transparent placeholder:text-neutral-200 focus:border-black focus:ring-0"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] uppercase font-bold tracking-widest">Descrição / Observações</label>
                                    <Input
                                        value={editingCategory.description || ''}
                                        onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                                        placeholder="Breve descrição dos requisitos..."
                                        className="h-12 border-b border-black rounded-none bg-transparent placeholder:text-neutral-200 focus:border-black focus:ring-0"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <Button
                                    onClick={() => setEditingCategory(null)}
                                    variant="outline"
                                    className="flex-1 h-12 border-black rounded-none text-[10px] font-bold uppercase tracking-widest"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSaveCategory}
                                    className="flex-1 h-12 bg-black text-white hover:bg-neutral-800 rounded-none text-[10px] font-bold uppercase tracking-widest"
                                >
                                    Salvar Categoria
                                </Button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

            {/* MODAL: Preview Document */}
            {
                previewDoc && createPortal(
                    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
                        <div className="bg-white w-full max-w-5xl h-full max-h-[90vh] flex flex-col relative">
                            <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
                                <h3 className="text-sm font-bold uppercase tracking-widest">{previewDoc.fileName}</h3>
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    className="h-10 w-10 flex items-center justify-center hover:bg-neutral-50"
                                >
                                    <CloseIcon className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="flex-1 bg-neutral-100 overflow-auto flex items-center justify-center p-4">
                                {previewDoc.fileType.startsWith('image/') ? (
                                    <img src={previewDoc.data || ''} className="max-w-full max-h-full object-contain shadow-2xl" />
                                ) : previewDoc.fileType === 'application/pdf' ? (
                                    <iframe src={previewDoc.data || ''} className="w-full h-full border-none" title="PDF Preview" />
                                ) : (
                                    <div className="text-center p-20 bg-white border border-neutral-200">
                                        <FileText className="h-16 w-16 text-neutral-200 mx-auto mb-4" />
                                        <p className="text-sm font-serif">Visualização não disponível para este tipo de arquivo.</p>
                                        <p className="text-[10px] text-neutral-400 font-mono mt-2 uppercase">Use o botão de download para visualizar conteúdo completo</p>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-neutral-100 flex justify-end">
                                <Button
                                    onClick={() => handleDownload(previewDoc)}
                                    className="h-12 bg-black text-white hover:bg-neutral-800 rounded-none text-[10px] font-bold uppercase tracking-[0.2em] px-10"
                                >
                                    <Download className="mr-2 h-4 w-4" /> Baixar Documento
                                </Button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }
        </div >
    );
}

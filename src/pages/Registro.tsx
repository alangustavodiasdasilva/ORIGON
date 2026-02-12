import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    Trash2,
    Database,
    ArrowRight,
    Activity,
    FileDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HVIUpload from "@/components/registro/HVIUpload";
import type { Lote } from "@/entities/Lote";
import { LoteService } from "@/entities/Lote";
import type { Sample } from "@/entities/Sample";
import { SampleService } from "@/entities/Sample";
import { OCRExtractionService, formatDecimalBR, type ExtractionResult, type HVIDataRow } from "@/services/ocrExtraction";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { AnalistaService } from "@/entities/Analista";
import { Modal } from "@/components/shared/Modal";
import { HVIFileGeneratorService } from "@/services/HVIFileGeneratorService";
import { cn } from "@/lib/utils";

const classifySample = (row: HVIDataRow): string => {
    const { mic, len, str } = row;

    // Critérios Premium (Verde)
    const isMicOk = mic >= 3.8 && mic <= 4.5;
    const isLenOk = len >= 1.12;
    const isStrOk = str >= 29;

    if (isMicOk && isLenOk && isStrOk) return "#10b981"; // Green (Premium)

    // Critérios Regular (Amarelo)
    const isMicRegular = (mic >= 3.5 && mic < 3.8) || (mic > 4.5 && mic <= 4.9);
    const isLenRegular = len >= 1.08;
    const isStrRegular = str >= 27;

    if (isMicRegular || (isLenRegular && isStrRegular)) return "#f59e0b"; // Yellow (Regular)

    // Fora dos padrões (Vermelho)
    return "#ef4444";
};

type PendingConfirmation = {
    file: File;
    previewUrl: string;
    data: ExtractionResult;
};

export default function Registro() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const loteId = searchParams.get("loteId");

    const [lote, setLote] = useState<Lote | null>(null);
    const [samples, setSamples] = useState<Sample[]>([]);

    // States for the review flow
    // States for the review flow
    const [isProcessing, setIsProcessing] = useState(false); // Processamento bloqueante (foreground)
    const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false); // Processamento em background
    const [ocrProgress, setOcrProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState("");

    const [uploadQueue, setUploadQueue] = useState<File[]>([]); // Arquivos aguardando
    const [processedQueue, setProcessedQueue] = useState<PendingConfirmation[]>([]); // Arquivos prontos para revisão

    // Item sendo revisado atualmente
    const [pendingReview, setPendingReview] = useState<PendingConfirmation | null>(null);

    // Efeito para processar filas em background enquanto o usuário trabalha
    useEffect(() => {
        const processNextInBackground = async () => {
            if (uploadQueue.length === 0 || isBackgroundProcessing || isProcessing) return;

            // Só processa em background se ainda tivermos trabalho pela frente
            // e não tivermos acumulado muitos processados (para economizar memória)
            if (processedQueue.length > 5) return;

            setIsBackgroundProcessing(true);
            const nextFile = uploadQueue[0];

            try {
                // Remove da fila de upload imediatamente para evitar duplicidade
                setUploadQueue(prev => prev.slice(1));

                const data = await OCRExtractionService.extractFromImage(nextFile, () => { }); // Progresso ignorado no background
                const previewUrl = URL.createObjectURL(nextFile);

                setProcessedQueue(prev => [...prev, { file: nextFile, previewUrl, data }]);
            } catch (error) {
                console.error("Erro no processamento background", error);
                // Se der erro, descartamos silenciosamente
            } finally {
                setIsBackgroundProcessing(false);
            }
        };

        const timer = setTimeout(processNextInBackground, 500); // Debounce
        return () => clearTimeout(timer);
    }, [uploadQueue, isBackgroundProcessing, isProcessing, processedQueue.length]);


    // Função que assume um item para revisão (seja da fila processada ou processando na hora)
    const loadNextForReview = async (item?: PendingConfirmation) => {
        let reviewItem = item;

        // Se não passou item, tenta pegar da fila de processados
        if (!reviewItem && processedQueue.length > 0) {
            reviewItem = processedQueue[0];
            setProcessedQueue(prev => prev.slice(1));
        }

        // Se ainda não tem item, mas tem na fila de upload (caso background não tenha terminado)
        // Processamos com prioridade (foreground)
        if (!reviewItem && uploadQueue.length > 0) {
            const nextFile = uploadQueue[0];
            setUploadQueue(prev => prev.slice(1));

            setIsProcessing(true);
            setOcrProgress(0);
            setProcessingStatus("Processando próxima imagem...");

            try {
                const data = await OCRExtractionService.extractFromImage(nextFile, (p) => setOcrProgress(p));
                const previewUrl = URL.createObjectURL(nextFile);
                reviewItem = { file: nextFile, previewUrl, data };
            } catch (error) {
                console.error(error);
                addToast({ title: "Erro no OCR", description: "Falha ao processar imagem.", type: "error" });
                setIsProcessing(false);
                setProcessingStatus("");
                return; // Aborta
            } finally {
                setIsProcessing(false);
                setProcessingStatus("");
            }
        }

        if (reviewItem) {
            // Setup do review
            setPendingReview(reviewItem);
            setEditingMala(reviewItem.data.mala || '');
            setEditingEtiqueta(reviewItem.data.etiqueta || '');

            setEditingRows(reviewItem.data.rows.length > 0 ? [...reviewItem.data.rows] : [{
                numero: '1', hvi: '1', data_analise: new Date().toLocaleDateString('pt-BR'), hora_analise: new Date().toLocaleTimeString('pt-BR'),
                mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0
            }]);
            setCurrentRowIndex(0);
            setSelectedRows(new Set(reviewItem.data.rows.length > 0 ? reviewItem.data.rows.map((_, i) => i) : [0]));

            addToast({
                title: "Imagem Carregada",
                description: reviewItem.data.rows.length > 0 ? `${reviewItem.data.rows.length} registros.` : "Sem dados automáticos.",
                type: "success"
            });
        }
    };

    const handleUpload = async (files: File[]) => {
        if (!loteId || files.length === 0) return;

        // Se não tiver nada sendo revisado, o primeiro arquivo vai direto para review (caminho rápido)
        // O resto vai para a fila de upload para ser pego pelo background
        if (!pendingReview && processedQueue.length === 0 && uploadQueue.length === 0) {
            const [first, ...rest] = files;
            setUploadQueue(rest); // Fila para background

            // Processa o primeiro imediatamente
            setIsProcessing(true);
            setOcrProgress(0);
            try {
                const data = await OCRExtractionService.extractFromImage(first, p => setOcrProgress(p));
                const previewUrl = URL.createObjectURL(first);
                loadNextForReview({ file: first, previewUrl, data });
            } catch (e) {
                console.error(e);
            } finally {
                setIsProcessing(false);
            }
        } else {
            // Se já tem coisa rolando, joga tudo na fila
            setUploadQueue(prev => [...prev, ...files]);
            addToast({ title: "Adicionado à Fila", description: `${files.length} imagens adicionadas.`, type: "info" });
        }
    };

    // Nova estrutura para edição de múltiplas linhas
    const [editingMala, setEditingMala] = useState('');
    const [editingEtiqueta, setEditingEtiqueta] = useState('');
    const [editingRows, setEditingRows] = useState<HVIDataRow[]>([]);
    const [currentRowIndex, setCurrentRowIndex] = useState(0);
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

    // Modal Confirmation State
    const [modalAction, setModalAction] = useState<{ type: 'delete', id?: string } | null>(null);

    const { user } = useAuth();

    useEffect(() => {
        if (loteId) {
            loadData();

            // Subscribe to real-time changes for samples
            const unsubSamples = SampleService.subscribe(() => {
                loadData();
            });
            const unsubLotes = LoteService.subscribe(() => {
                loadData();
            });

            return () => {
                unsubSamples();
                unsubLotes();
            };
        }
    }, [loteId, user]);



    const loadData = async () => {
        if (!loteId) return;
        const l = await LoteService.get(loteId);

        if (l) {
            // Security Check
            if (user?.acesso !== 'admin_global' && user?.lab_id && l.lab_id && l.lab_id !== user.lab_id) {
                addToast({ title: "Access Denied", description: "You cannot manage samples for other laboratories.", type: "error" });
                navigate("/");
                return;
            }
            setLote(l);
        }

        const s = await SampleService.listByLote(loteId);
        setSamples(s);
    };

    const handleDeleteSample = async (sampleId: string) => {
        try {
            await SampleService.delete(sampleId);
            addToast({ title: "Registro Removido", type: "info" });
            setModalAction(null);
            loadData();
        } catch (error) {
            addToast({ title: "Erro ao Remover", type: "error" });
        }
    };

    const handleExportHVI = async (sample: Sample) => {
        const result = await HVIFileGeneratorService.generateFileForSample(sample);
        addToast({
            title: result.success ? "Arquivo HVI Gerado" : "Erro",
            description: result.message,
            type: result.success ? "success" : "error"
        });
    };



    const updateCurrentRow = (field: keyof HVIDataRow, value: string | number) => {
        setEditingRows(rows => {
            const updated = [...rows];
            updated[currentRowIndex] = { ...updated[currentRowIndex], [field]: value };
            return updated;
        });
    };

    const handleSaveSelectedSamples = async () => {
        if (!loteId || !pendingReview || selectedRows.size === 0) return;

        try {
            let savedCount = 0;
            const rowsToSave = editingRows.filter((_, index) => selectedRows.has(index));

            for (const row of rowsToSave) {
                if (samples.length + savedCount >= 28) {
                    addToast({ title: "Limite Atingido", description: "Máximo de 28 amostras por lote.", type: "warning" });
                    break;
                }

                const nextId = (samples.length + savedCount + 1).toString().padStart(2, '0');
                await SampleService.create({
                    lote_id: loteId,
                    amostra_id: nextId,
                    hvi: row.hvi, // Número da máquina HVI
                    mala: editingMala,
                    etiqueta: editingEtiqueta,
                    data_analise: row.data_analise,
                    hora_analise: row.hora_analise,
                    mic: row.mic,
                    len: row.len,
                    unf: row.unf,
                    str: row.str,
                    rd: row.rd,
                    b: row.b,
                    cor: classifySample(row), // Auto-classificação precisa
                    historico_modificacoes: []
                });
                savedCount++;
            }

            addToast({ title: "Amostras Salvas", description: `${savedCount} registro(s) adicionado(s).`, type: "success" });
            URL.revokeObjectURL(pendingReview.previewUrl);
            setPendingReview(null);
            setEditingRows([]);
            setEditingMala('');
            setEditingEtiqueta('');
            setSelectedRows(new Set());
            await loadData();

            // Carrega próximo
            loadNextForReview();
        } catch (error) {
            addToast({ title: "Erro ao Salvar", type: "error" });
        }
    };

    const handleAbortReview = () => {
        if (pendingReview) {
            URL.revokeObjectURL(pendingReview.previewUrl);
        }
        setPendingReview(null);
        setEditingRows([]);
        setEditingMala('');
        setEditingEtiqueta('');
        setSelectedRows(new Set());

        // Carrega próximo
        loadNextForReview();
    };

    if (!loteId) return <div className="p-4 text-center font-black text-slate-300 uppercase tracking-widest text-[8px]">ID_LOTE_MISSING</div>;
    if (!lote) return <div className="p-4 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-[8px]">Carregando...</div>;

    // --- SIDE-BY-SIDE CONFIRMATION VIEW ---
    if (pendingReview && editingRows.length > 0) {
        const currentRow = editingRows[currentRowIndex];
        // Safety check to prevent crashes if index is out of bounds
        if (!currentRow) {
            console.error("Critical Error: Current row index out of bounds", currentRowIndex, editingRows.length);
            // Attempt recovery
            if (editingRows.length > 0) {
                setCurrentRowIndex(0);
                return null;
            } else {
                setPendingReview(null);
                return null;
            }
        }

        return createPortal(

            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="w-full max-w-6xl h-full lg:h-[85vh] max-h-screen bg-white flex flex-col lg:flex-row shadow-2xl border border-black overflow-hidden relative">

                    {/* Header Controls */}
                    <div className="absolute top-0 left-0 right-0 h-16 bg-white border-b border-black flex items-center justify-between px-8 z-20">
                        <div className="flex items-center gap-6">
                            <Button variant="ghost" size="icon" onClick={handleAbortReview} className="hover:bg-neutral-100 rounded-none h-10 w-10 border border-neutral-200">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <h3 className="text-sm font-bold uppercase tracking-widest text-black">Verification Console</h3>
                                <p className="text-[10px] font-mono text-neutral-400 uppercase">Reviewing Digitized Data</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3 px-4 border-r border-neutral-200">
                                <div className="text-right">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Current Sample</p>
                                    <p className="text-xs font-mono font-bold">{currentRowIndex + 1} <span className="text-neutral-300">/</span> {editingRows.length}</p>
                                </div>
                            </div>
                            <Button onClick={handleSaveSelectedSamples} className="h-10 rounded-none bg-black text-white hover:bg-neutral-800 text-[10px] uppercase tracking-widest px-8 font-bold shadow-lg transition-all hover:scale-105">
                                Confirm & Save to Database
                            </Button>
                        </div>
                    </div>

                    {/* Left: Image Viewer Area */}
                    <div className="w-full lg:w-1/2 h-[40vh] lg:h-auto bg-neutral-100 border-b lg:border-b-0 lg:border-r border-black pt-16 flex flex-col relative group shrink-0">
                        <div className="absolute top-20 left-6 z-10 flex gap-2">
                            <div className="bg-black text-white text-[9px] uppercase tracking-widest px-3 py-1 font-bold shadow-sm">
                                Original Source
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6 lg:p-12 flex items-center justify-center">
                            <img
                                src={pendingReview.previewUrl}
                                alt="Source"
                                className="max-w-full max-h-full object-contain shadow-2xl border-4 border-white transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                        </div>

                        {/* Filmstrip Navigation */}
                        {editingRows.length > 1 && (
                            <div className="h-16 lg:h-24 bg-white border-t border-black p-0 flex divide-x divide-black overflow-x-auto items-center shrink-0">
                                {editingRows.map((row, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentRowIndex(idx)}
                                        className={cn(
                                            "h-full min-w-[60px] lg:min-w-[80px] flex flex-col items-center justify-center transition-all px-2 relative group-hover/strip:opacity-50 hover:!opacity-100",
                                            currentRowIndex === idx
                                                ? "bg-black text-white"
                                                : "bg-white text-black hover:bg-neutral-50"
                                        )}
                                    >
                                        <span className="text-[8px] lg:text-[10px] font-bold uppercase mb-1">Sample</span>
                                        <span className="font-mono text-lg lg:text-xl font-bold">#{row.numero}</span>
                                        {currentRowIndex === idx && (
                                            <div className="absolute bottom-2 w-1 h-1 bg-white rounded-full" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Data Editor Form */}
                    <div className="w-full lg:w-1/2 bg-white lg:pt-16 overflow-y-auto flex-1 h-auto">
                        <div className="p-10 space-y-10">

                            {/* Section: Identifiers */}
                            <div className="space-y-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
                                <div className="flex items-center gap-3 border-b-2 border-black pb-3">
                                    <div className="h-2 w-2 bg-blue-600 rounded-full animate-pulse" />
                                    <h3 className="text-sm font-bold uppercase tracking-[0.2em]">Identification</h3>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Bag ID</label>
                                        <Input
                                            value={editingMala}
                                            onChange={(e) => setEditingMala(e.target.value)}
                                            className="h-12 border-b-2 border-l-0 border-r-0 border-t-0 border-neutral-200 rounded-none font-mono text-lg bg-transparent px-0 focus:border-black focus:ring-0 placeholder:text-neutral-200"
                                            placeholder="UNIDENTIFIED"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Tag Reference</label>
                                        <Input
                                            value={editingEtiqueta}
                                            onChange={(e) => setEditingEtiqueta(e.target.value)}
                                            className="h-12 border-b-2 border-l-0 border-r-0 border-t-0 border-neutral-200 rounded-none font-mono text-lg bg-transparent px-0 focus:border-black focus:ring-0 placeholder:text-neutral-200"
                                            placeholder="NO TAG"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Metrics */}
                            <div className="space-y-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
                                <div className="flex items-center gap-3 border-b border-neutral-200 pb-3">
                                    <Activity className="h-4 w-4 text-neutral-400" />
                                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Fiber Metrics</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                                    {[
                                        { label: "Micronaire", short: "MIC", key: "mic" as keyof HVIDataRow, decimals: 2 },
                                        { label: "Length", short: "LEN", key: "len" as keyof HVIDataRow, decimals: 2 },
                                        { label: "Uniformity", short: "UNF", key: "unf" as keyof HVIDataRow, decimals: 1 },
                                        { label: "Strength", short: "STR", key: "str" as keyof HVIDataRow, decimals: 1 },
                                        { label: "Reflectance", short: "RD", key: "rd" as keyof HVIDataRow, decimals: 1 },
                                        { label: "Yellowness", short: "+b", key: "b" as keyof HVIDataRow, decimals: 1 }
                                    ].map((field) => (
                                        <div key={field.key} className="flex items-center justify-between group">
                                            <div className="space-y-0.5">
                                                <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest block group-hover:text-black transition-colors">{field.short}</label>
                                                <span className="text-[8px] font-mono text-neutral-300 uppercase">{field.label}</span>
                                            </div>
                                            <Input
                                                key={`${currentRowIndex}-${field.key}`}
                                                defaultValue={formatDecimalBR(currentRow[field.key] as number || 0, field.decimals)}
                                                onBlur={(e) => {
                                                    const inputValue = e.target.value.replace(',', '.');
                                                    const numValue = parseFloat(inputValue);
                                                    updateCurrentRow(field.key, isNaN(numValue) ? 0 : numValue);
                                                }}
                                                className="w-24 h-10 bg-neutral-50 border-transparent focus:bg-white focus:border-black rounded-none font-mono text-xl text-right focus:ring-0 transition-all font-bold"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    // Presence Logic
    const [coWorkers, setCoWorkers] = useState<any[]>([]);
    useEffect(() => {
        const checkPresence = async () => {
            const all = await AnalistaService.list();
            const now = new Date().getTime();
            const others = all.filter(a =>
                a.id !== user?.id &&
                a.current_lote_id === loteId &&
                a.last_active && (now - new Date(a.last_active).getTime() < 15000)
            );
            setCoWorkers(others);
        };
        const interval = setInterval(checkPresence, 3000);
        checkPresence();
        return () => clearInterval(interval);
    }, [loteId, user?.id]);

    // --- MAIN VIEW ---
    return (
        <div className="w-full h-screen flex flex-col bg-white text-black overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="h-20 border-b border-black flex items-center justify-between px-8 shrink-0">
                <div className="flex items-center gap-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                        className="rounded-none hover:bg-neutral-100 text-black h-10 w-10 border border-neutral-200"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-serif text-black leading-none">
                                Sample Registration
                            </h1>
                            {coWorkers.length > 0 && (
                                <div className="flex items-center gap-2 bg-yellow-100 px-2 py-1 rounded-full border border-yellow-200 animate-pulse">
                                    <span className="text-[9px] font-bold uppercase text-yellow-700">{coWorkers.length} other(s) editing</span>
                                    <div className="flex -space-x-1">
                                        {coWorkers.map(cw => (
                                            <div key={cw.id} className="w-5 h-5 rounded-full bg-neutral-200 border border-white overflow-hidden" title={cw.nome || 'Unknown'}>
                                                {cw.foto ? (
                                                    <img src={cw.foto} className="w-full h-full object-cover" alt={cw.nome} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[8px] font-bold">
                                                        {(cw.nome && cw.nome[0] ? cw.nome[0] : "?").toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-mono">
                            BATCH: {lote.nome}
                        </p>
                    </div>
                </div>

                <Button
                    onClick={() => navigate(`/analysis?loteId=${loteId}`)}
                    className="h-12 px-8 bg-black text-white hover:bg-neutral-800 rounded-none text-[10px] uppercase tracking-[0.2em] font-bold transition-all"
                >
                    Analysis View
                    <ArrowRight className="ml-2 h-3 w-3" />
                </Button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Upload Section - Top */}
                <div className="w-full h-[280px] border-b border-black flex flex-col bg-neutral-50 shrink-0 transition-all duration-300">
                    <div className="p-3 border-b border-black flex items-center justify-between bg-white shrink-0">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-black flex items-center gap-2">
                            Digitization Station
                        </h3>
                        <span className="text-xs font-mono font-bold">{samples.length} / 28</span>
                    </div>

                    <div className="p-4 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {isProcessing ? (
                            <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
                                <div className="w-16 h-16 border-4 border-neutral-200 border-t-black rounded-full animate-spin" />
                                <div className="space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-black">
                                        Processing Image
                                    </p>
                                    <p className="text-[10px] font-mono text-neutral-400 uppercase">
                                        {processingStatus || "EXTRACTING DATA..."} {ocrProgress > 0 && `• ${ocrProgress}%`}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 max-w-4xl mx-auto w-full">
                                <HVIUpload
                                    onUpload={handleUpload}
                                    isProcessing={isProcessing}
                                    maxFiles={28}
                                />
                                <div className="bg-white border border-neutral-200 p-3 space-y-2 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">Instruction</h4>
                                        <p className="text-[10px] text-neutral-600 font-mono leading-none">Upload HVI printouts. System auto-detects parameters.</p>
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-300">AUTO-OCR v2.0</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Table Section */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                    <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-white shrink-0">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Registry Buffer</h3>
                        <div className="text-[10px] uppercase font-mono text-neutral-400">
                            Live Database Connection
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                        {samples.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-20">
                                <Database className="h-12 w-12 text-black" />
                                <span className="text-xs font-bold uppercase tracking-[0.25em]">No Records Found</span>
                            </div>
                        ) : (
                            <div className="w-full overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead className="bg-white sticky top-0 z-10 border-b border-black">
                                        <tr className="text-[9px] font-bold text-black uppercase tracking-widest">
                                            <th className="px-6 py-4 w-[60px] text-center font-mono">#ID</th>
                                            <th className="px-4 py-4">Bag ID</th>
                                            <th className="px-4 py-4">Tag</th>
                                            <th className="px-4 py-4">Timestamp</th>
                                            <th className="px-2 py-4 text-right font-mono">MIC</th>
                                            <th className="px-2 py-4 text-right font-mono">LEN</th>
                                            <th className="px-2 py-4 text-right font-mono">UNF</th>
                                            <th className="px-2 py-4 text-right font-mono">STR</th>
                                            <th className="px-2 py-4 text-right font-mono">RD</th>
                                            <th className="px-2 py-4 text-right font-mono">+B</th>
                                            <th className="px-6 py-4 text-right w-[120px]">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {samples.slice().reverse().map((s) => (
                                            <tr key={s.id} className="group hover:bg-neutral-50 transition-colors">
                                                <td className="px-6 py-4 font-mono text-xs text-neutral-400 text-center">#{s.amostra_id}</td>
                                                <td className="px-4 py-4 font-mono text-xs font-bold text-black">{s.mala || "-"}</td>
                                                <td className="px-4 py-4 font-mono text-xs text-neutral-500">{s.etiqueta || "-"}</td>
                                                <td className="px-4 py-4 text-[10px] font-mono text-neutral-400">
                                                    {s.data_analise} <span className="opacity-50">{s.hora_analise}</span>
                                                </td>
                                                <td className="px-2 py-4 text-right font-mono text-xs tabular-nums">{formatDecimalBR(s.mic ?? 0, 2)}</td>
                                                <td className="px-2 py-4 text-right font-mono text-xs tabular-nums text-neutral-500">{formatDecimalBR(s.len ?? 0, 2)}</td>
                                                <td className="px-2 py-4 text-right font-mono text-xs tabular-nums text-neutral-500">{formatDecimalBR(s.unf ?? 0, 1)}</td>
                                                <td className="px-2 py-4 text-right font-mono text-xs tabular-nums text-neutral-500">{formatDecimalBR(s.str ?? 0, 1)}</td>
                                                <td className="px-2 py-4 text-right font-mono text-xs tabular-nums text-neutral-500">{formatDecimalBR(s.rd ?? 0, 1)}</td>
                                                <td className="px-2 py-4 text-right font-mono text-xs tabular-nums text-neutral-500">{formatDecimalBR(s.b ?? 0, 1)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-neutral-300 hover:text-white hover:bg-blue-600 rounded-none transition-all"
                                                            onClick={() => handleExportHVI(s)}
                                                            title="Gerar arquivo HVI"
                                                        >
                                                            <FileDown className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-neutral-300 hover:text-white hover:bg-black rounded-none transition-all"
                                                            onClick={() => setModalAction({ type: 'delete', id: s.id })}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Deletion Modal */}
            <Modal
                isOpen={modalAction?.type === 'delete'}
                onClose={() => setModalAction(null)}
                title="Confirm Deletion"
            >
                <div className="space-y-8 py-2 text-center">
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest leading-relaxed">
                        Permanently remove sample <span className="text-black font-black border-b border-black">#{samples.find(s => s.id === modalAction?.id)?.amostra_id}</span>?
                    </p>
                    <div className="grid grid-cols-1 gap-3 pt-2">
                        <Button
                            onClick={() => modalAction?.id && handleDeleteSample(modalAction.id)}
                            className="h-12 rounded-none bg-black text-white font-black uppercase text-[10px] tracking-widest hover:bg-neutral-800"
                        >
                            Confirm Delete
                        </Button>
                        <Button variant="ghost" onClick={() => setModalAction(null)} className="h-10 font-bold uppercase text-[9px] text-neutral-400 hover:text-black">Cancel</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

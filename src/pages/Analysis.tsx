import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    Plus,
    Download,
    Filter,
    Wand2,
    Activity,
    Palette,
    ImagePlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sample } from "@/entities/Sample";
import type { Lote } from "@/entities/Lote";
import { SampleService } from "@/entities/Sample";
import { LoteService } from "@/entities/Lote";
import AnalysisTable from "@/components/analysis/AnalysisTable";

import MovingAverageChart from "@/components/analysis/MovingAverageChart";
import PatternAnalysisModal from "@/components/analysis/PatternAnalysisModal";
import ColorTemplatesModal from "@/components/analysis/ColorTemplatesModal";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import HVIStatisticalReportModal from "@/components/analysis/HVIStatisticalReportModal";
import { cn } from "@/lib/utils";

interface ColorSummary {
    samples: number;
}

export default function Analysis() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const loteId = searchParams.get("loteId");
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [lote, setLote] = useState<Lote | null>(null);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [filterColor, setFilterColor] = useState<string | null>(null);
    const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
    const [activeColorForTemplate, setActiveColorForTemplate] = useState<string | null>(null);
    const [tolerancias, setTolerancias] = useState({
        mic: 0.05,
        len: 0.25,
        unf: 0.5,
        str: 0.75,
        rd: 0.5,
        b: 0.25
    });

    const metricsByColor = useMemo(() => {
        const categories = {
            "#3b82f6": { label: "AZUL", border: "border-blue-500", samples: 0, mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 },
            "#ef4444": { label: "VERMELHO", border: "border-red-500", samples: 0, mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 },
            "#10b981": { label: "VERDE", border: "border-emerald-500", samples: 0, mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 },
            "#f59e0b": { label: "AMARELO", border: "border-amber-500", samples: 0, mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 },
        };

        samples.forEach(s => {
            if (categories[s.cor as keyof typeof categories]) {
                const cat = categories[s.cor as keyof typeof categories];
                cat.samples++;
                cat.mic += Number(s.mic || 0);
                cat.len += Number(s.len || 0);
                cat.unf += Number(s.unf || 0);
                cat.str += Number(s.str || 0);
                cat.rd += Number(s.rd || 0);
                cat.b += Number(s.b || 0);
            }
        });

        // Calculate averages
        Object.values(categories).forEach(cat => {
            if (cat.samples > 0) {
                cat.mic /= cat.samples;
                cat.len /= cat.samples;
                cat.unf /= cat.samples;
                cat.str /= cat.samples;
                cat.rd /= cat.samples;
                cat.b /= cat.samples;
            }
        });

        return categories;
    }, [samples]);

    const handleExportCSV = () => {
        if (!samples.length || !lote) return;

        const headers = ["Amostra", "Mala", "Etiqueta", "HVI", "MIC", "LEN", "UNF", "STR", "RD", "B", "Cor"];
        const rows = samples.map(s => [
            s.amostra_id,
            s.mala || "",
            s.etiqueta || "",
            s.hvi || "",
            s.mic?.toString().replace(".", ",") || "",
            s.len?.toString().replace(".", ",") || "",
            s.unf?.toString().replace(".", ",") || "",
            s.str?.toString().replace(".", ",") || "",
            s.rd?.toString().replace(".", ",") || "",
            s.b?.toString().replace(".", ",") || "",
            s.cor || ""
        ]);

        const csvContent = [
            headers.join(";"),
            ...rows.map(r => r.join(";"))
        ].join("\n");

        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Analise_${lote.nome}_${new Date().toLocaleDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        addToast({ title: "Report Generated", description: "CSV file downloaded successfully.", type: "success" });
    };

    const { user } = useAuth();

    useEffect(() => {
        if (loteId) {
            loadData();

            // Subscribe to real-time changes
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
            if (user?.acesso !== 'admin_global' && user?.lab_id && l.lab_id && l.lab_id !== user.lab_id) {
                addToast({ title: "Access Denied", description: "You cannot access batches from other laboratories.", type: "error" });
                navigate("/");
                return;
            }
            setLote(l);
        }

        const s = await SampleService.listByLote(loteId);
        setSamples(s);
    };

    const handleUpdateSample = async (id: string, field: string, value: any) => {
        setIsProcessing(true);
        try {
            await SampleService.update(id, { [field]: value });
            await loadData();
            addToast({ title: "Value Updated", type: "success" });
        } catch (error) {
            addToast({ title: "Update Failed", type: "error" });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleColorChange = async (id: string, color: string) => {
        setIsProcessing(true);
        try {
            await SampleService.update(id, { cor: color });
            await loadData();
            addToast({ title: "Classified", type: "success" });
        } catch (error) {
            addToast({ title: "Error", type: "error" });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteSample = async (id: string) => {
        if (!confirm("This action is irreversible. Delete sample?")) return;
        setIsProcessing(true);
        try {
            await SampleService.delete(id);
            await loadData();
            addToast({ title: "Sample Removed", type: "success" });
        } catch (error) {
            addToast({ title: "Remove Failed", type: "error" });
        } finally {
            setIsProcessing(false);
        }
    };

    const [isPatternModalOpen, setIsPatternModalOpen] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

    const handleBulkColorUpdate = async (updates: Record<string, string>) => {
        setIsProcessing(true);
        try {
            const bulkPayload: Record<string, Partial<Sample>> = {};
            Object.entries(updates).forEach(([id, color]) => {
                bulkPayload[id] = { cor: color };
            });

            await SampleService.bulkUpdate(bulkPayload);
            await loadData();
            addToast({ title: "Patterns Applied", description: "Samples classified successfully.", type: "success" });
        } catch (error) {
            addToast({ title: "Classification Failed", type: "error" });
        } finally {
            setIsProcessing(false);
        }
    };

    if (!loteId) return <div className="p-10 text-center font-mono uppercase tracking-widest text-[10px]">NO_BATCH_ID</div>;
    if (!lote) return <div className="p-10 text-center animate-pulse font-mono uppercase tracking-widest text-[10px]">LOADING_METRICS...</div>;

    const filteredSamples = filterColor
        ? samples.filter(s => s.cor === filterColor)
        : samples;

    return (
        <div className="space-y-12 animate-fade-in relative pb-24 text-black">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-black pb-8">
                <div className="space-y-4">
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
                                <h1 className="text-3xl font-serif text-black leading-none">
                                    Global Analysis <span className="text-[10px] text-slate-400 align-top">v1.1</span>
                                </h1>
                                <span className={`text-[9px] font-bold uppercase tracking-widest border border-black px-2 py-0.5 ${lote.status === 'aberto' ? 'bg-black text-white' : 'bg-transparent text-black'}`}>
                                    {lote.status === 'aberto' ? 'Active' : 'Archived'}
                                </span>
                            </div>
                            <p className="font-mono text-neutral-500 text-xs uppercase tracking-widest">
                                BATCH: {lote.nome}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        onClick={() => setIsPatternModalOpen(true)}
                        className="rounded-none h-12 px-6 bg-white border border-black text-black hover:bg-black hover:text-white font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        <Wand2 className="h-4 w-4" />
                        Auto-Classify
                    </Button>
                    <Button
                        onClick={() => setIsStatsModalOpen(true)}
                        className="rounded-none h-12 px-6 bg-white border border-black text-black hover:bg-black hover:text-white font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        <Activity className="h-4 w-4" />
                        AI Patterns
                    </Button>
                    <Button
                        onClick={handleExportCSV}
                        className="rounded-none h-12 px-6 bg-white border border-black text-black hover:bg-black hover:text-white font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                        <Download className="mr-2 h-3 w-3" /> Export CSV
                    </Button>
                    <Button
                        onClick={() => navigate(`/registro?loteId=${loteId}`)}
                        className="rounded-none h-12 px-6 bg-black text-white hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest transition-colors"
                    >
                        <Plus className="mr-2 h-3 w-3" /> Add Sample
                    </Button>
                </div>
            </div>

            <div className="space-y-12">
                {/* Metrics Header */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-neutral-200 p-6 bg-neutral-50">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-black" />
                            <span className="text-[10px] uppercase tracking-widest font-bold">Grade Filter</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {(['#10b981', '#f59e0b', '#ef4444', '#3b82f6'] as const).map(c => (
                                <button
                                    key={c}
                                    title={`Filtrar por cor: ${c === '#ef4444' ? 'Vermelho' : c === '#3b82f6' ? 'Azul' : c === '#10b981' ? 'Verde' : 'Alerta'}`}
                                    onClick={() => setFilterColor(filterColor === c ? null : c)}
                                    className={cn(
                                        "w-8 h-8 transition-all border border-neutral-300",
                                        filterColor === c ? 'ring-2 ring-black ring-offset-2' : 'hover:opacity-80',
                                        c === '#10b981' ? 'bg-[#10b981]' : 
                                        c === '#f59e0b' ? 'bg-[#f59e0b]' : 
                                        c === '#ef4444' ? 'bg-[#ef4444]' : 
                                        'bg-[#3b82f6]'
                                    )}
                                />
                            ))}
                            {filterColor && (
                                <Button variant="ghost" size="sm" onClick={() => setFilterColor(null)} className="h-8 px-4 ml-2 rounded-none text-[9px] font-bold text-black border border-black hover:bg-black hover:text-white uppercase">
                                    Clear
                                </Button>
                            )}
                            <div className="h-8 w-[1px] bg-neutral-300 mx-4 hidden md:block" />
                            <span className="text-xs font-mono font-bold">
                                {filteredSamples.length} RECORDS
                            </span>
                        </div>
                    </div>

                    {/* Barra de Tolerâncias para Lotes */}
                    <div className="bg-white border border-neutral-100 p-4 shadow-sm flex items-center gap-6 overflow-x-auto min-w-0">
                        <div className="flex flex-col leading-none border-r border-neutral-200 pr-4 shrink-0">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Configuração</span>
                            <span className="text-sm font-serif font-bold text-black">Geração HVI (Variação)</span>
                        </div>
                        <div className="flex items-center gap-4">
                            {[
                                { id: 'mic', label: 'Mic' },
                                { id: 'len', label: 'Len' },
                                { id: 'unf', label: 'Unf' },
                                { id: 'str', label: 'Str' },
                                { id: 'rd', label: 'Rd' },
                                { id: 'b', label: '+b' }
                            ].map((tol) => (
                                <div key={tol.id} className="flex flex-col items-center gap-1">
                                    <label className="text-[10px] font-bold text-neutral-400 uppercase">{tol.label}</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        title={`Tolerância ${tol.label}`}
                                        value={tolerancias[tol.id as keyof typeof tolerancias]}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            if (!isNaN(val)) {
                                                setTolerancias(prev => ({ ...prev, [tol.id]: val }));
                                            }
                                        }}
                                        className="w-14 h-8 text-center border border-neutral-200 rounded text-[11px] font-black text-black bg-neutral-50/30 focus:border-black outline-none transition-all disabled:opacity-50"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="ml-auto shrink-0 flex items-center gap-4">

                            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-[9px] font-bold text-blue-700 uppercase tracking-tight">
                                <span className="opacity-70 mr-1 italic">Objetivo:</span> 
                                Calibrar variação das sub-medições no arquivo TXT
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Container */}
                <div className="overflow-hidden border border-black">
                    <div className="overflow-x-auto">
                        <AnalysisTable
                            key={`analysis-table-${refreshTrigger}`}
                            samples={filteredSamples}
                            onUpdateSample={handleUpdateSample}
                            onColorChange={handleColorChange}
                            onDeleteSample={handleDeleteSample}
                            isProcessing={isProcessing}
                            highlightedSampleId={null}
                            tolerancias={tolerancias}
                        />
                    </div>
                </div>
            </div>

            {/* Individual Performance & Generation Metrics - Moved Bottom */}
            <div className="space-y-12 pt-12 border-t border-neutral-200">
                <div className="space-y-6">
                    <h2 className="text-2xl font-serif font-bold tracking-tight text-neutral-900 px-1">Performance Metrics</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {(Object.entries(metricsByColor) as [string, any][])
                            .filter(([color, data]) => data.samples > 0 && (!filterColor || color === filterColor))
                            .map(([color, data]) => (
                            <div key={color} className={`bg-white border-2 ${data.border} p-6 shadow-sm flex flex-col gap-6 hover:shadow-md transition-shadow relative group`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">{data.label}</span>
                                    <span className="text-[10px] font-bold px-2 py-1 bg-neutral-100 text-neutral-400 rounded uppercase">{samples.filter(s => s.cor === color).length} amostras</span>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { label: 'MIC', val: data.mic, d: 2 },
                                        { label: 'LEN', val: data.len, d: 2 },
                                        { label: 'UNF', val: data.unf, d: 1 },
                                        { label: 'STR', val: data.str, d: 1 },
                                        { label: 'RD', val: data.rd, d: 1 },
                                        { label: '+B', val: data.b, d: 1 },
                                    ].map(metric => (
                                        <div key={metric.label} className="flex items-center justify-between border-b border-neutral-50 pb-2 last:border-none">
                                            <span className="text-[9px] font-black text-neutral-400 font-mono tracking-widest">{metric.label}</span>
                                            <span className="text-xl font-serif font-bold text-neutral-800 tracking-tight">
                                                {metric.val.toLocaleString('pt-BR', { minimumFractionDigits: metric.d, maximumFractionDigits: metric.d })}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-2 pt-4 border-t border-neutral-100 flex flex-col gap-3">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => {
                                            setActiveColorForTemplate(color);
                                            setIsTemplatesModalOpen(true);
                                        }}
                                        className="w-full h-8 rounded-none border-neutral-200 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-black hover:border-black flex items-center justify-center gap-2"
                                    >
                                        <ImagePlus className="h-3.5 w-3.5" />
                                        Vincular Print ({data.label})
                                    </Button>
                                    <div className="flex items-center justify-center gap-2">
                                        <Activity className="h-3 w-3 text-[#10b981]" />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#10b981]">Métricas Estáveis</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-12">
                    <MovingAverageChart
                        samples={samples}
                    />
                </div>
            </div>

            <PatternAnalysisModal
                isOpen={isPatternModalOpen}
                onClose={() => setIsPatternModalOpen(false)}
                samples={samples}
                onApplyColors={handleBulkColorUpdate}
            />

            <ColorTemplatesModal 
                isOpen={isTemplatesModalOpen}
                onClose={() => {
                    setIsTemplatesModalOpen(false);
                    setActiveColorForTemplate(null);
                    setRefreshTrigger(prev => prev + 1); // FORCE UI UPDATE AFTER SAVING PRINT
                }}
                specificColor={activeColorForTemplate || undefined}
            />

            <HVIStatisticalReportModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                samples={samples}
            />
        </div>
    );
}

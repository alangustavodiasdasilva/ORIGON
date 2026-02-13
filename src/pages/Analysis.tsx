import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    Plus,
    Download,
    Filter,
    Wand2,
    Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sample } from "@/entities/Sample";
import type { Lote } from "@/entities/Lote";
import { SampleService } from "@/entities/Sample";
import { LoteService } from "@/entities/Lote";
import AnalysisTable from "@/components/analysis/AnalysisTable";
import StatisticsPanel from "@/components/analysis/StatisticsPanel";
import MovingAverageChart from "@/components/analysis/MovingAverageChart";
import PatternAnalysisModal from "@/components/analysis/PatternAnalysisModal";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import HVIStatisticalReportModal from "@/components/analysis/HVIStatisticalReportModal";

export default function Analysis() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const loteId = searchParams.get("loteId");

    const [lote, setLote] = useState<Lote | null>(null);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [filterColor, setFilterColor] = useState<string | null>(null);

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
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-neutral-200 p-6 bg-neutral-50">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-black" />
                        <span className="text-[10px] uppercase tracking-widest font-bold">Grade Filter</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {(['#10b981', '#f59e0b', '#ef4444', '#3b82f6'] as const).map(c => (
                            <button
                                key={c}
                                onClick={() => setFilterColor(filterColor === c ? null : c)}
                                className={`w-8 h-8 transition-all border border-neutral-300 ${filterColor === c ? 'ring-2 ring-black ring-offset-2' : 'hover:opacity-80'}`}
                                style={{ backgroundColor: c }}
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

                {/* Table Container */}
                <div className="overflow-hidden border border-black">
                    <div className="overflow-x-auto">
                        <AnalysisTable
                            samples={filteredSamples}
                            onUpdateSample={handleUpdateSample}
                            onColorChange={handleColorChange}
                            onDeleteSample={handleDeleteSample}
                            isProcessing={isProcessing}
                            highlightedSampleId={null}
                        />
                    </div>
                </div>
            </div>

            {/* Statistics */}
            <div className="space-y-8 pt-12 border-t border-neutral-200">
                <h2 className="font-serif text-2xl text-black">Performance Metrics</h2>
                <StatisticsPanel samples={samples} selectedColor={filterColor} />

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

            <HVIStatisticalReportModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                samples={samples}
            />
        </div>
    );
}

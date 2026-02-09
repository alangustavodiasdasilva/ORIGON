import { useState } from "react";
import type { Sample } from "@/entities/Sample";
import { cn } from "@/lib/utils";
import { calculateStatistics } from "@/lib/stats";
import { AlertTriangle, Palette, Box, Tag, Cpu, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Calendar, Hash, FileDown } from "lucide-react";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { HVIFileGeneratorService, type HVIPreviewData } from "@/services/HVIFileGeneratorService";
import HVIPreviewModal from "@/components/HVIPreviewModal";
import { useLanguage } from "@/contexts/LanguageContext";

interface AnalysisTableProps {
    samples: Sample[];
    onUpdateSample: (id: string, field: string, value: any) => void;
    onColorChange: (id: string, color: string) => void;
    onDeleteSample: (id: string) => void;
    isProcessing: boolean;
    highlightedSampleId?: string | null;
}

const COLORS = [
    { value: "#ef4444", label: "Vermelho", name: "red" },
    { value: "#3b82f6", label: "Azul", name: "blue" },
    { value: "#10b981", label: "Verde", name: "green" },
    { value: "#f59e0b", label: "Amarelo", name: "yellow" },
];

export default function AnalysisTable({ samples, onUpdateSample, onColorChange, onDeleteSample, isProcessing, highlightedSampleId }: AnalysisTableProps) {
    const { t } = useLanguage();
    const fields = ['mic', 'len', 'unf', 'str', 'rd', 'b'] as const;
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; data: HVIPreviewData | null; sample: Sample | null }>({ isOpen: false, data: null, sample: null });

    const statsByField = fields.reduce((acc, field) => {
        const values = samples
            .map(s => ({ id: s.id, val: (s as any)[field] }))
            .filter(v => typeof v.val === 'number');
        acc[field] = calculateStatistics(values);
        return acc;
    }, {} as Record<string, ReturnType<typeof calculateStatistics>>);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedSamples = [...samples].sort((a, b) => {
        if (!sortConfig) return 0;
        const valA = (a as any)[sortConfig.key];
        const valB = (b as any)[sortConfig.key];

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Highlight visual only - no scroll

    return (
        <div className="relative w-full bg-white">
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-[3.5rem]">
                        <th
                            className="px-2 w-[50px] cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => handleSort('amostra_id')}
                        >
                            <div className="flex items-center gap-1">
                                <Hash className="h-3.5 w-3.5 hidden lg:inline" /> ID
                                {sortConfig?.key === 'amostra_id' ? (
                                    sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                ) : (
                                    <ArrowUpDown className="h-3 w-3 opacity-20" />
                                )}
                            </div>
                        </th>
                        <th className="px-2 w-[8%]">
                            <div className="flex items-center gap-1">
                                <Box className="h-3.5 w-3.5 hidden lg:inline" /> MALA
                            </div>
                        </th>
                        <th className="px-2 w-[12%]">
                            <div className="flex items-center gap-1">
                                <Tag className="h-3.5 w-3.5 hidden lg:inline" /> LABEL
                            </div>
                        </th>
                        <th className="px-2 w-[8%]">
                            <div className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 hidden lg:inline" /> DATA
                            </div>
                        </th>
                        <th
                            className="px-1 text-center w-[35px] cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => handleSort('hvi')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                <Cpu className="h-3.5 w-3.5 inline" />
                                {sortConfig?.key === 'hvi' ? (
                                    sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                ) : null}
                            </div>
                        </th>
                        <th
                            className="px-1 text-center w-[70px] cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => handleSort('cor')}
                        >
                            <div className="flex items-center justify-center gap-1">
                                <Palette className="h-3.5 w-3.5 inline" />
                                {sortConfig?.key === 'cor' ? (
                                    sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                ) : null}
                            </div>
                        </th>
                        {fields.map(f => (
                            <th
                                key={f}
                                onClick={() => handleSort(f)}
                                className="px-4 text-right italic font-black text-slate-500 cursor-pointer hover:text-blue-600 transition-colors"
                            >
                                <div className="flex items-center justify-end gap-1">
                                    {f === 'b' ? '+b' : f.toUpperCase()}
                                    {sortConfig?.key === f ? (
                                        sortConfig.direction === 'asc' ?
                                            <ArrowUp className="h-3 w-3 text-blue-600" /> :
                                            <ArrowDown className="h-3 w-3 text-blue-600" />
                                    ) : (
                                        <ArrowUpDown className="h-3 w-3 opacity-20" />
                                    )}
                                </div>
                            </th>
                        ))}
                        <th className="px-2 w-[70px]"></th>
                    </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                    {sortedSamples.map((sample) => {
                        // Define cor de fundo baseada na classificação
                        let rowBgClass = "hover:bg-slate-50";
                        if (sample.cor === "#ef4444") rowBgClass = "bg-red-50/5 hover:bg-red-100/10";
                        else if (sample.cor === "#3b82f6") rowBgClass = "bg-blue-50/5 hover:bg-blue-100/10";
                        else if (sample.cor === "#10b981") rowBgClass = "bg-emerald-50/5 hover:bg-emerald-100/10";
                        else if (sample.cor === "#f59e0b") rowBgClass = "bg-amber-50/5 hover:bg-amber-100/10";

                        const isHighlighted = highlightedSampleId === sample.id;

                        return (
                            <tr
                                key={sample.id}
                                id={`sample-row-${sample.id}`}
                                className={cn(
                                    "transition-all text-xs border-b",
                                    rowBgClass,
                                    isHighlighted ? "bg-black text-white !border-black scale-[1.01] shadow-xl z-20 relative" : "border-slate-100"
                                )}
                            >
                                <td className="px-2 py-4 font-mono font-black text-black text-center border-r border-slate-100/50">
                                    <span className={cn(
                                        "text-sm",
                                        isHighlighted && "text-white"
                                    )}>
                                        #{sample.amostra_id}
                                    </span>
                                </td>
                                <td className="px-2 py-4 font-bold truncate border-r border-slate-100/50">
                                    <div className={cn(
                                        "inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight shadow-sm",
                                        sample.cor === "#ef4444" ? "bg-red-100 text-red-700" :
                                            sample.cor === "#3b82f6" ? "bg-blue-100 text-blue-700" :
                                                sample.cor === "#10b981" ? "bg-emerald-100 text-emerald-700" :
                                                    sample.cor === "#f59e0b" ? "bg-amber-100 text-amber-700" :
                                                        "bg-slate-50 text-slate-400"
                                    )}>
                                        {sample.mala || "-"}
                                    </div>
                                </td>
                                <td className="px-2 py-4 font-bold text-slate-400 text-[10px] truncate border-r border-slate-100/50">{sample.etiqueta || "-"}</td>
                                <td className="px-2 py-4 font-mono font-bold text-slate-500 text-[9px] border-r border-slate-100/50">
                                    <div className="flex flex-col leading-tight">
                                        <span>{sample.data_analise || "--/--/--"}</span>
                                        <span className="text-[8px] opacity-70">{sample.hora_analise || "--:--"}</span>
                                    </div>
                                </td>
                                <td className="px-1 py-4 font-black text-blue-600 text-center border-r border-slate-100/50">{sample.hvi || "-"}</td>
                                <td className="px-2 py-4 border-r border-slate-100/50">
                                    <div className="flex gap-1 justify-center items-center min-w-fit px-1">
                                        {COLORS.map((c) => (
                                            <button
                                                key={c.value}
                                                onClick={() => {
                                                    // Se clicar na cor já selecionada, REMOVE a cor
                                                    if (sample.cor === c.value) {
                                                        onColorChange(sample.id, ""); // Remove a cor
                                                    } else {
                                                        onColorChange(sample.id, c.value); // Aplica a cor
                                                    }
                                                }}
                                                className={cn(
                                                    "w-5 h-5 rounded-full border-2 border-white shadow-md transition-all hover:scale-110 focus:outline-none",
                                                    sample.cor === c.value
                                                        ? "scale-110 ring-2 ring-slate-900 ring-offset-1 opacity-100"
                                                        : "opacity-30 hover:opacity-100 hover:ring-2 hover:ring-slate-300 hover:ring-offset-1"
                                                )}
                                                style={{ backgroundColor: c.value }}
                                                title={sample.cor === c.value ? `Remover cor ${c.label}` : `Aplicar ${c.label}`}
                                            />
                                        ))}
                                    </div>
                                </td>
                                {fields.map((field) => {
                                    const value = (sample as any)[field];
                                    const isOutlier = statsByField[field].outliers.includes(sample.id);
                                    const decimals = field === 'mic' || field === 'len' ? 2 : 1;

                                    return (
                                        <td key={field} className="px-4 py-4 text-right border-r border-slate-100/50 last:border-none">
                                            <div className="relative flex items-center justify-end">
                                                {isOutlier && (
                                                    <AlertTriangle className="h-3 w-3 text-amber-500 absolute -left-2 animate-pulse" />
                                                )}
                                                <input
                                                    className={cn(
                                                        "w-full text-right bg-transparent border-none focus:ring-0 p-0 font-mono font-black transition-all",
                                                        "text-lg tracking-tight",
                                                        isOutlier ? "text-amber-600" : (isHighlighted ? "text-white" : "text-slate-900"),
                                                        isProcessing && "opacity-50"
                                                    )}
                                                    defaultValue={formatDecimalBR(value ?? 0, decimals)}
                                                    onBlur={(e) => {
                                                        const inputValue = e.target.value.replace(',', '.');
                                                        const val = parseFloat(inputValue);
                                                        if (!isNaN(val) && val !== value) {
                                                            onUpdateSample(sample.id, field, val);
                                                        }
                                                        e.target.value = formatDecimalBR(isNaN(val) ? (value ?? 0) : val, decimals);
                                                    }}
                                                    disabled={isProcessing}
                                                />
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className="px-1 py-3 text-center">
                                    <div className="flex items-center justify-center gap-0.5">
                                        <button
                                            onClick={async () => {
                                                const result = await HVIFileGeneratorService.generatePreviewForSample(sample, samples);
                                                if (!result.success) {
                                                    alert(result.message);
                                                } else if (result.data) {
                                                    setPreviewModal({ isOpen: true, data: result.data, sample });
                                                }
                                            }}
                                            className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                            title="Gerar arquivo HVI"
                                        >
                                            <FileDown className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => onDeleteSample(sample.id)}
                                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                                            title={t('analysis.delete_sample')}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {samples.length === 0 && (
                <div className="p-24 text-center text-slate-200 font-bold uppercase tracking-[0.4em] italic text-[10px]">
                    {t('analysis.no_records')}
                </div>
            )}

            {/* HVI Preview Modal */}
            {previewModal.data && previewModal.sample && (
                <HVIPreviewModal
                    isOpen={previewModal.isOpen}
                    onClose={() => setPreviewModal({ isOpen: false, data: null, sample: null })}
                    onConfirm={() => {
                        if (previewModal.data) {
                            HVIFileGeneratorService.downloadHVIFile(previewModal.data.content, previewModal.data.filename);
                            setPreviewModal({ isOpen: false, data: null, sample: null });
                        }
                    }}
                    content={previewModal.data.content}
                    filename={previewModal.data.filename}
                    machineModel={previewModal.data.machineModel}
                    originalSample={previewModal.sample}
                    generatedValues={previewModal.data.generatedValues}
                />
            )}
        </div>
    );
}

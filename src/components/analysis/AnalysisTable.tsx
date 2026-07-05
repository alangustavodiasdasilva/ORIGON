import { useState, useEffect } from "react";
import { type Sample } from "@/entities/Sample";
import { type Machine, MachineService } from "@/entities/Machine";
import { cn } from "@/lib/utils";
import { calculateStatistics } from "@/lib/stats";
import { AlertTriangle, Palette, Box, Tag, Cpu, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Hash, FileDown, CheckCircle2 } from "lucide-react";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { HVIFileGeneratorService, type HVIPreviewData } from "@/services/HVIFileGeneratorService";
import HVIPreviewModal from "@/components/HVIPreviewModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface AnalysisTableProps {
    samples: Sample[];
    onUpdateSample: (id: string, field: string, value: any) => Promise<void>;
    onColorChange: (id: string, color: string) => void;
    onDeleteSample: (id: string) => void;
    isProcessing: boolean;
    highlightedSampleId?: string | null;
    loteId?: string;
    tolerancias?: {
        mic: number;
        len: number;
        unf: number;
        str: number;
        rd: number;
        b: number;
    };
    configuracoesAnalise?: Record<string, any>;
}

const COLORS = [
    { value: "#ef4444", label: "Vermelho", name: "red" },
    { value: "#3b82f6", label: "Azul", name: "blue" },
    { value: "#10b981", label: "Verde", name: "green" },
    { value: "#f59e0b", label: "Amarelo", name: "yellow" },
];

export default function AnalysisTable({ samples, onUpdateSample, onColorChange, onDeleteSample, isProcessing, highlightedSampleId, loteId, tolerancias, configuracoesAnalise }: AnalysisTableProps) {
    const { t } = useLanguage();
    const { user, currentLab, isLoading } = useAuth();
    const fields = ['mic', 'len', 'unf', 'str', 'rd', 'b'] as const;
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; data: HVIPreviewData | null; sample: Sample | null }>({ isOpen: false, data: null, sample: null });
    const [machines, setMachines] = useState<Machine[]>([]);

    useEffect(() => {
        if (isLoading) return;
        
        let isActive = true;
        const targetLabId = currentLab?.id || user?.lab_id;
        
        const fetchMachines = async () => {
            try {
                const fetched = targetLabId 
                    ? await MachineService.listByLab(targetLabId)
                    : await MachineService.list();
                    
                if (isActive) {
                    setMachines(fetched);
                }
            } catch (error) {
                console.error("Erro ao buscar máquinas:", error);
            }
        };
        
        fetchMachines();
        
        return () => {
            isActive = false;
        };
    }, [currentLab?.id, user?.lab_id, isLoading]);

    const statsByField = fields.reduce((acc, field) => {
        const values = samples
            .filter(s => s.cor !== 'ANULADA')
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

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>, sample: Sample, field: string, value: any, decimals: number) => {
        if (sample.locked) {
            e.target.value = formatDecimalBR(value ?? 0, decimals);
            return;
        }

        let numStr = e.target.value.replace(',', '.');
        let hasDot = numStr.includes('.');
        
        if (numStr && !hasDot) {
            if (field === 'mic') {
                if (numStr.length > 1) numStr = numStr.slice(0, 1) + '.' + numStr.slice(1);
            } else if (field === 'len') {
                if (numStr.length > 2) numStr = numStr.slice(0, 2) + '.' + numStr.slice(2);
            } else if (['unf', 'str', 'rd'].includes(field)) {
                if (numStr.length > 2) numStr = numStr.slice(0, 2) + '.' + numStr.slice(2);
            } else if (['elg', 'b', 'sfi'].includes(field)) {
                if (numStr.length >= 2) numStr = numStr.slice(0, -1) + '.' + numStr.slice(-1);
            } else if (['area', 'mat'].includes(field)) {
                if (numStr.length >= 2) numStr = '0.' + numStr;
                else if (numStr.length === 1 && numStr !== '0') numStr = '0.0' + numStr;
            }
        }

        let val = parseFloat(numStr);
        if (!isNaN(val)) {
            if (field === 'mat') {
                if (val >= 70 && val <= 100) val = val / 100;
                else if (val >= 700 && val <= 1000) val = val / 1000;
            } else if (field === 'mic') {
                if (val >= 20 && val <= 90) val = val / 10;
                else if (val >= 200 && val <= 900) val = val / 100;
            } else if (field === 'len') {
                if (val >= 200 && val <= 400) val = val / 100;
            }
        }

        if (!isNaN(val) && val !== value) {
            onUpdateSample(sample.id, field, val);
        }
        e.target.value = formatDecimalBR(isNaN(val) ? (value ?? 0) : val, decimals);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number, rowsCount: number) => {
        const key = e.key;
        if (['ArrowUp', 'ArrowDown', 'Enter'].includes(key)) {
            e.preventDefault();
            let nextRow = rowIdx;
            
            if (key === 'ArrowUp') nextRow = Math.max(0, rowIdx - 1);
            if (key === 'ArrowDown' || key === 'Enter') nextRow = Math.min(rowsCount - 1, rowIdx + 1);

            if (nextRow !== rowIdx) {
                const nextInput = document.querySelector(`input[data-tablerow="${nextRow}"][data-tablecol="${colIdx}"]`) as HTMLInputElement;
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
            }
        }
    };

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

                        <th
                             className="px-1 text-center w-[75px] cursor-pointer hover:text-blue-600 transition-colors"
                             onClick={() => handleSort('hvi')}
                         >
                             <div className="flex items-center justify-center gap-1">
                                 <Cpu className="h-3.5 w-3.5 inline" />
                                 <span className="hidden lg:inline text-[9px] font-black">HVI</span>
                                 {sortConfig?.key === 'hvi' ? (
                                     sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                 ) : null}
                             </div>
                         </th>
                        <th
                            className="px-1 text-center w-[130px] cursor-pointer hover:text-blue-600 transition-colors"
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
                    {sortedSamples.map((sample, rowIdx) => {
                        // Define cor de fundo baseada na classificação
                        let rowBgClass = "hover:bg-slate-50";
                        if (sample.cor === "#ef4444") rowBgClass = "bg-red-50/5 hover:bg-red-100/10";
                        else if (sample.cor === "#3b82f6") rowBgClass = "bg-blue-50/5 hover:bg-blue-100/10";
                        else if (sample.cor === "#10b981") rowBgClass = "bg-emerald-50/5 hover:bg-emerald-100/10";
                        else if (sample.cor === "#f59e0b") rowBgClass = "bg-amber-50/5 hover:bg-amber-100/10";

                        const isHighlighted = highlightedSampleId === sample.id;

                        const isAnulada = sample.cor === 'ANULADA';

                        return (
                            <tr
                                key={sample.id}
                                id={`sample-row-${sample.id}`}
                                className={cn(
                                    "transition-all text-xs border-b",
                                    isAnulada ? "bg-slate-100 opacity-50 grayscale" : rowBgClass,
                                    isHighlighted ? "bg-black text-white !border-black scale-[1.01] shadow-xl z-20 relative grayscale-0 opacity-100" : "border-slate-100"
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

                                <td className="px-1 py-4 text-center border-r border-slate-100/50">
                                     <select
                                         value={sample.hvi || (machines.length > 0 ? machines[0].machineId : "1")}
                                         disabled={isProcessing || sample.locked}
                                         onChange={(e) => onUpdateSample(sample.id, 'hvi', e.target.value)}
                                         title="Selecionar HVI"
                                         className="font-black text-blue-600 bg-transparent hover:bg-neutral-50 p-1 border-0 focus:ring-0 focus:outline-none cursor-pointer rounded text-[11px] text-center w-full focus:bg-white appearance-none"
                                     >
                                         {machines.length > 0 ? machines.map(m => (
                                             <option key={m.id} value={m.machineId}>{m.machineId} ({m.model === 'USTER' ? 'U' : 'P'})</option>
                                         )) : [1, 2, 3, 4, 5, 6, 7].map(n => (
                                             <option key={n} value={String(n)}>HVI 0{n}</option>
                                         ))}
                                         {machines.length > 0 && sample.hvi && !machines.some(m => m.machineId === sample.hvi) && (
                                             <option value={sample.hvi}>{sample.hvi}</option>
                                         )}
                                     </select>
                                 </td>
                                <td className="px-2 py-4 border-r border-slate-100/50">
                                    <div className="flex gap-1 justify-center items-center min-w-fit px-1">
                                        {COLORS.map((c) => (
                                            <button
                                                type="button"
                                                key={c.value}
                                                disabled={sample.locked}
                                                onClick={() => {
                                                    // Se clicar na cor já selecionada, REMOVE a cor
                                                    if (sample.cor === c.value) {
                                                        onColorChange(sample.id, ""); // Remove a cor
                                                    } else {
                                                        onColorChange(sample.id, c.value); // Aplica a cor
                                                    }
                                                }}
                                                className={cn(
                                                    "w-5 h-5 rounded-full border-2 border-white shadow-md transition-all focus:outline-none",
                                                    sample.locked ? "cursor-not-allowed opacity-50" : "hover:scale-110",
                                                    sample.cor === c.value
                                                        ? "scale-110 ring-2 ring-slate-900 ring-offset-1 opacity-100"
                                                        : "opacity-30 hover:opacity-100 hover:ring-2 hover:ring-slate-300 hover:ring-offset-1",
                                                    c.value === "#ef4444" && "bg-red-500",
                                                    c.value === "#3b82f6" && "bg-blue-500",
                                                    c.value === "#10b981" && "bg-emerald-500",
                                                    c.value === "#f59e0b" && "bg-amber-500"
                                                )}
                                                title={sample.locked ? "Amostra bloqueada" : (sample.cor === c.value ? `Remover cor ${c.label}` : `Aplicar ${c.label}`)}
                                            />
                                        ))}
                                        {/* Botão de Anular */}
                                        <button
                                            type="button"
                                            disabled={sample.locked}
                                            onClick={() => {
                                                if (sample.cor === 'ANULADA') {
                                                    onColorChange(sample.id, ""); // Restaura
                                                } else {
                                                    onColorChange(sample.id, 'ANULADA'); // Anula
                                                }
                                            }}
                                            className={cn(
                                                "ml-1 w-5 h-5 rounded-full border-2 border-white shadow-md transition-all flex items-center justify-center font-black text-[10px]",
                                                sample.locked ? "cursor-not-allowed opacity-50" : "hover:scale-110",
                                                sample.cor === 'ANULADA'
                                                    ? "bg-slate-800 text-white scale-110 ring-2 ring-slate-900 ring-offset-1 opacity-100"
                                                    : "bg-slate-200 text-slate-400 opacity-30 hover:opacity-100 hover:ring-2 hover:ring-slate-300 hover:ring-offset-1"
                                            )}
                                            title={sample.locked ? "Amostra bloqueada" : (sample.cor === 'ANULADA' ? "Restaurar Amostra" : "Anular Amostra (Ignorar médias)")}
                                        >
                                            ∅
                                        </button>
                                    </div>
                                </td>
                                {fields.map((field, colIdx) => {
                                    const value = (sample as any)[field];
                                    const stats = statsByField[field];
                                    const isOutlier = stats.outliers.includes(sample.id);
                                    
                                    const decimals = field === 'mic' || field === 'len' ? 2 : 1;

                                    return (
                                        <td key={field} className="px-4 py-4 text-right border-r border-slate-100/50 last:border-none">
                                            <div className="relative flex items-center justify-end">
                                                {isOutlier && (
                                                    <AlertTriangle className="h-3 w-3 text-amber-500 absolute -left-2 animate-pulse" />
                                                )}
                                                <input
                                                    aria-label={`Valor de ${field}`}
                                                    className={cn(
                                                        "w-full text-right bg-transparent border-none focus:ring-0 p-0 font-mono font-black transition-all",
                                                        "text-lg tracking-tight",
                                                        isOutlier ? "text-amber-600" : (isHighlighted ? "text-white" : "text-slate-900"),
                                                        (sample.locked) && "opacity-50 cursor-not-allowed"
                                                    )}
                                                    defaultValue={formatDecimalBR(value ?? 0, decimals)}
                                                    onBlur={(e) => handleBlur(e, sample, field, value, decimals)}
                                                    onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx, sortedSamples.length)}
                                                    data-tablerow={rowIdx}
                                                    data-tablecol={colIdx}
                                                    disabled={sample.locked}
                                                />
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className="px-1 py-3 text-center">
                                    <div className="flex items-center justify-center gap-0.5">
                                        {sample.locked ? (
                                            <button
                                                onClick={() => {
                                                    if (confirm("Deseja desbloquear esta amostra para edição?")) {
                                                        onUpdateSample(sample.id, 'locked', false);
                                                    }
                                                }}
                                                className="p-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                                                title="Amostra Finalizada (Clique para Desbloquear)"
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={async () => {
                                                    const result = await HVIFileGeneratorService.generatePreviewForSample(sample, samples, tolerancias, undefined, undefined, undefined, undefined, undefined, configuracoesAnalise);
                                                    if (!result.success) {
                                                        alert(result.message);
                                                    } else if (result.data) {
                                                        setPreviewModal({ isOpen: true, data: result.data, sample });
                                                    }
                                                }}
                                                className={cn(
                                                    "p-1 rounded transition-all",
                                                    HVIFileGeneratorService.hasColorPrint(sample.cor, loteId || sample.lote_id, configuracoesAnalise) 
                                                        ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50" 
                                                        : "text-slate-200 cursor-not-allowed"
                                                )}
                                                title={HVIFileGeneratorService.hasColorPrint(sample.cor, loteId || sample.lote_id, configuracoesAnalise) 
                                                    ? "Gerar arquivo HVI" 
                                                    : "Trava Ativa: Vincule o print desta cor no painel de templates primeiro"
                                                }
                                            >
                                                <FileDown className="h-3.5 w-3.5" />
                                            </button>
                                        )}

                                        {!sample.locked && (
                                            <button
                                                onClick={() => onDeleteSample(sample.id)}
                                                className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                                                title={t('analysis.delete_sample')}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
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
                    machines={machines}
                    onClose={() => setPreviewModal({ isOpen: false, data: null, sample: null })}
                    onConfirm={async () => {
                        if (previewModal.data && previewModal.sample) {
                            try {
                                await HVIFileGeneratorService.downloadHVIFile(previewModal.data.content, previewModal.data.filename, previewModal.data.files);
                                
                                const br = previewModal.data.balancedReadings as any;
                                if (br && br.mic) {
                                    const count = br.mic.length;
                                    const leituras = [];
                                    for (let i = 0; i < count; i++) {
                                        leituras.push({
                                            mic: br.mic[i], len: br.len[i], unf: br.unf[i], str: br.str[i],
                                            rd: br.rd[i], b: br.b[i], elg: br.elg[i], sfi: br.sfi[i],
                                            sci: br.sci[i], mat: br.mat[i], csp: br.csp[i], leaf: br.leaf[i],
                                            area: br.area[i], count: br.count[i], cg: br.cg?.[i]
                                        });
                                    }
                                    await onUpdateSample(previewModal.sample.id, 'leituras_geradas', leituras);
                                }

                                await onUpdateSample(previewModal.sample.id, 'locked', true);
                                
                                setPreviewModal({ isOpen: false, data: null, sample: null });
                            } catch (e) {
                                alert("Erro ao salvar o bloqueio da amostra no banco de dados.");
                                console.error(e);
                            }
                        }
                    }}
                    onSaveField={async (field: string, value: any) => {
                        if (previewModal.sample) {
                            await onUpdateSample(previewModal.sample.id, field, value);
                        }
                    }}
                    content={previewModal.data.content}
                    filename={previewModal.data.filename}
                    machineModel={previewModal.data.machineModel}
                    originalSample={previewModal.sample}
                    generatedValues={previewModal.data.generatedValues}
                    balancedReadings={previewModal.data.balancedReadings}
                    onRegenerate={async (newReadings, config) => {
                        if (previewModal.sample) {
                            const result = await HVIFileGeneratorService.generatePreviewForSample(
                                previewModal.sample, 
                                samples, 
                                tolerancias, 
                                newReadings,
                                config?.customEtiqueta,
                                config?.customDate,
                                config?.customTime,
                                (config as any)?.customHvi,
                                configuracoesAnalise
                            );
                            if (result.success && result.data) {
                                setPreviewModal(prev => ({
                                    ...prev,
                                    data: result.data || null
                                }));
                            } else {
                                alert(result.message || 'Erro ao regenerar o arquivo HVI. A máquina selecionada pode não estar cadastrada.');
                            }
                        }
                    }}
                />
            )}
        </div>
    );
}

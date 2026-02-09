import { useState, useEffect, useRef } from "react";
import { X, Activity, ChevronRight, Binary, ShieldCheck } from "lucide-react";
import { HVIAnalysisService, type HVIAnalysisReport, type ParameterAnalysis } from "@/services/HVIAnalysisService";
import { type Sample } from "@/entities/Sample";
import { cn } from "@/lib/utils";

// HVI Statistical Report Modal Component
interface HVIStatisticalReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    samples: Sample[];
}

export default function HVIStatisticalReportModal({ isOpen, onClose, samples }: HVIStatisticalReportModalProps) {
    const [reports, setReports] = useState<HVIAnalysisReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const reportRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && samples.length > 0) {
            const fetchReport = async () => {
                setLoading(true);
                try {
                    const reportData = await HVIAnalysisService.analyze(samples);
                    setReports(reportData);
                    if (activeTab >= reportData.length) setActiveTab(0);
                } catch (error) {
                    console.error("Erro ao gerar relatório:", error);
                } finally {
                    setLoading(false);
                }
            };
            fetchReport();
        }
    }, [isOpen, samples]);

    useEffect(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    }, [activeTab]);

    const currentReport = reports[activeTab];



    const getInterpretation = (analysis: ParameterAnalysis, count: number) => {
        if (count === 1) return { label: "INDIVIDUAL", color: "text-neutral-600", bg: "bg-neutral-50", desc: "Amostra única. Medição pontual sem base estatística." };
        const cv = analysis.stats.cv;
        const prob = analysis.prediction.probabilityWithinRange;
        if (cv <= 2.5 && prob > 85) return { label: "EXCELENTE", color: "text-green-600", bg: "bg-green-50", desc: "Uniformidade excepcional. Ideal para fiação de alta performance." };
        if (cv <= 5.0 && prob > 65) return { label: "ESTÁVEL", color: "text-blue-600", bg: "bg-blue-50", desc: "Variação controlada dentro dos padrões técnicos." };
        if (cv <= 8.0) return { label: "ALERTA", color: "text-amber-600", bg: "bg-amber-50", desc: "Dispersão moderada. Requer atenção no processo." };
        return { label: "CRÍTICO", color: "text-red-600", bg: "bg-red-50", desc: "Alta heterogeneidade. Risco elevado de irregularidades." };
    };

    const getParamMeaning = (param: string) => {
        const meanings: Record<string, string> = {
            'MIC': 'Micronaire (Finura e Maturidade)',
            'LEN': 'Comprimento UHML (Polegadas)',
            'STR': 'Resistência (G/Tex)',
            'UNF': 'Uniformidade de Comprimento (%)',
            'RD': 'Refletância da Cor (Rd)',
            'B': 'Grau de Amarelamento (+b)'
        };
        return meanings[param.toUpperCase()] || param;
    };

    const getCleanLabel = (label: string, type: 'CONSOLIDATED' | 'MACHINE' | 'COLOR') => {
        if (type === 'CONSOLIDATED') return 'PANORAMA GLOBAL DO LOTE';
        if (type === 'MACHINE') return 'UNIDADE HVI ' + label.replace('MÁQUINA: ', '').replace('HVI ', '');
        if (type === 'COLOR') {
            const raw = label.replace('QUALIDADE: ', '');
            if (raw === '#3b82f6') return 'CLASSE AZUL (PREMIUM)';
            if (raw === '#10b981') return 'CLASSE VERDE (PADRÃO)';
            if (raw === '#f59e0b') return 'CLASSE AMARELA (MÉDIO)';
            if (raw === '#ef4444') return 'CLASSE VERMELHA (REJEITO)';
            return 'CLASSE: ' + raw;
        }
        return label;
    };

    if (!isOpen) return null;

    const activeColor = currentReport?.groupType === 'COLOR' ? currentReport.machine.replace('QUALIDADE: ', '') : null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-300 p-0 md:p-4">
            <div className="bg-white w-full max-w-[1600px] h-full md:h-[96vh] flex flex-col border-2 border-black overflow-hidden relative shadow-2xl">

                {/* HEADER */}
                <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b-2 border-black bg-white">
                    <div className="flex items-center gap-6">
                        <div className="h-10 w-10 bg-black flex items-center justify-center rotate-3 shadow-lg">
                            <ShieldCheck className="text-white h-6 w-6" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-serif font-black tracking-tighter text-black uppercase italic leading-none">ORIGO INTELLIGENCE</h2>
                            <p className="text-[9px] font-mono font-black text-black/40 uppercase tracking-[0.4em] mt-0.5">Fiber Quality Audit System</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2.5 hover:bg-black hover:text-white transition-all border-2 border-black rounded-full shadow-[3px_3px_0px_#ddd] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-white">

                    {/* SIDEBAR */}
                    <div className="w-full md:w-[320px] border-b-2 md:border-b-0 md:border-r-2 border-black bg-[#fafafa] flex flex-col shrink-0">
                        <div className="p-6 space-y-8 overflow-y-auto">
                            <div className="space-y-3">
                                <p className="text-[10px] font-mono text-black font-black uppercase tracking-[0.3em] border-b border-black/20 pb-2">
                                    Segmentos Auditados
                                </p>
                                <div className="space-y-1.5">
                                    {reports.map((r, idx) => (
                                        <button
                                            key={`${r.machine}-${idx}`}
                                            onClick={() => setActiveTab(idx)}
                                            className={cn(
                                                "w-full text-left px-4 py-3 text-[10px] font-mono uppercase tracking-wide font-black transition-all border-2 flex items-center justify-between group",
                                                activeTab === idx ? "bg-black text-white border-black shadow-[4px_4px_0px_rgba(0,0,0,0.1)]" : "bg-white text-black border-black/10 hover:border-black"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                {r.groupType === 'COLOR' && (
                                                    <div className="h-3 w-3 rounded-full border border-black/30 shadow-sm" style={{ backgroundColor: r.machine.replace('QUALIDADE: ', '') }} />
                                                )}
                                                <span className="truncate max-w-[180px]">{getCleanLabel(r.machine, r.groupType)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[8px] opacity-50 font-bold">{r.cleanedCount}</span>
                                                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", activeTab === idx ? "translate-x-0.5" : "opacity-0 group-hover:opacity-30")} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>


                        </div>
                    </div>

                    {/* CONTENT */}
                    <div className="flex-1 overflow-y-auto bg-white" ref={scrollContainerRef}>
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-6">
                                <Activity className="h-10 w-10 animate-spin text-black" />
                                <p className="font-mono text-[10px] uppercase font-black tracking-widest text-black/60">Processando Análise Estatística...</p>
                            </div>
                        ) : !currentReport ? (
                            <div className="h-full flex items-center justify-center opacity-5"><Binary className="h-32 w-32" /></div>
                        ) : (
                            <div key={activeTab} ref={reportRef} className="p-8 md:p-16 space-y-20 max-w-[1200px] mx-auto">

                                {/* BANNER */}
                                <div className="space-y-8">
                                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-4 border-black pb-8">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-5">
                                                {activeColor && <div className="h-16 w-4 rounded-sm shadow-lg" style={{ backgroundColor: activeColor }} />}
                                                <h3 className="text-4xl md:text-6xl font-serif font-black tracking-tighter text-black uppercase italic leading-none">
                                                    {getCleanLabel(currentReport.machine, currentReport.groupType)}
                                                </h3>
                                            </div>
                                            <div className="flex items-center gap-3 ml-1">
                                                <div className="text-[11px] font-mono text-black/50 font-black uppercase tracking-[0.3em]">
                                                    Lote: {samples[0]?.lote_id || 'N/A'} • {currentReport.cleanedCount} Amostras Válidas
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-black text-white p-6 shadow-[8px_8px_0px_rgba(0,0,0,0.08)] border-2 border-black">
                                            <p className="text-[9px] font-mono uppercase tracking-widest opacity-60 mb-1">Confiabilidade Global</p>
                                            <p className="text-4xl font-serif font-black italic leading-none">{Math.round(currentReport.consolidated.globalProbability)}%</p>
                                            <p className="text-[8px] font-mono uppercase opacity-40 mt-1">
                                                {currentReport.consolidated.status === 'OK' ? 'Aprovado' : currentReport.consolidated.status === 'ALERTA' ? 'Atenção' : 'Crítico'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* RESUMO EXECUTIVO */}
                                    <div className="border-2 border-black p-6 bg-gradient-to-br from-white to-neutral-50">
                                        <h4 className="text-base font-serif font-black italic uppercase mb-3 flex items-center gap-2">
                                            <div className="h-1 w-8 bg-black" />
                                            Resumo Executivo
                                        </h4>
                                        <p className="text-sm font-mono font-bold leading-relaxed">
                                            {currentReport.cleanedCount > 1
                                                ? `Este segmento foi auditado com base em ${currentReport.cleanedCount} amostras válidas. A análise estatística indica uma confiabilidade global de ${currentReport.consolidated.globalProbability.toFixed(1)}%, caracterizando o lote como ${currentReport.consolidated.globalProbability > 85 ? 'EXCELENTE para processamento industrial' : currentReport.consolidated.globalProbability > 70 ? 'ADEQUADO com ressalvas técnicas' : 'REQUER ATENÇÃO ESPECIAL'}. Os parâmetros críticos apresentam variação média controlada.`
                                                : "Análise baseada em amostra única. Os valores apresentados são medições pontuais e não permitem inferência estatística sobre a variabilidade do lote completo. Recomenda-se análise de amostras adicionais para validação."
                                            }
                                        </p>
                                    </div>
                                </div>

                                {/* TABELA TÉCNICA CONSOLIDADA */}
                                <div className="space-y-4">
                                    <h4 className="text-lg font-serif font-black italic uppercase flex items-center gap-3">
                                        <div className="h-1 w-10 bg-black" />
                                        Parâmetros Técnicos Consolidados
                                    </h4>
                                    <div className="border-2 border-black overflow-hidden shadow-lg">
                                        <table className="w-full">
                                            <thead className="bg-black text-white">
                                                <tr className="text-[10px] font-mono uppercase tracking-wider">
                                                    <th className="p-3 text-left border-r border-white/20">Parâmetro</th>
                                                    <th className="p-3 text-center border-r border-white/20">Média</th>
                                                    <th className="p-3 text-center border-r border-white/20">Desvio</th>
                                                    <th className="p-3 text-center border-r border-white/20">CV%</th>
                                                    <th className="p-3 text-center border-r border-white/20">Min</th>
                                                    <th className="p-3 text-center">Max</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white">
                                                {currentReport?.parameterAnalyses?.map((analysis: ParameterAnalysis, idx: number) => (
                                                    <tr key={analysis.param} className={cn("border-b border-black/10 hover:bg-neutral-50 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-neutral-50/30")}>
                                                        <td className="p-3 font-serif font-black italic text-base border-r border-black/10">
                                                            {analysis.displayName}
                                                            <div className="text-[9px] font-mono font-normal opacity-50 mt-0.5">{getParamMeaning(analysis.param)}</div>
                                                        </td>
                                                        <td className="p-3 text-center font-mono font-black text-lg border-r border-black/10">{analysis.stats.mean.toFixed(2)}</td>
                                                        <td className="p-3 text-center font-mono text-sm text-neutral-500 border-r border-black/10">{analysis.stats.stdDev.toFixed(3)}</td>
                                                        <td className={cn("p-3 text-center font-mono font-black border-r border-black/10", analysis.stats.cv > 5 ? "text-red-600" : "text-blue-600")}>
                                                            {currentReport.cleanedCount > 1 ? analysis.stats.cv.toFixed(2) + '%' : '—'}
                                                        </td>
                                                        <td className="p-3 text-center font-mono text-sm opacity-60 border-r border-black/10">{analysis.stats.min.toFixed(2)}</td>
                                                        <td className="p-3 text-center font-mono text-sm opacity-60">{analysis.stats.max.toFixed(2)}</td>
                                                    </tr>
                                                )) || []}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* ANÁLISE VISUAL POR PARÂMETRO */}
                                <div className="space-y-16">
                                    <h4 className="text-lg font-serif font-black italic uppercase flex items-center gap-3">
                                        <div className="h-1 w-10 bg-black" />
                                        Análise Visual de Distribuição
                                    </h4>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {currentReport?.parameterAnalyses?.map((analysis: ParameterAnalysis) => {
                                            const interpretation = getInterpretation(analysis, currentReport.cleanedCount);
                                            return (
                                                <div key={analysis.param} className="border-2 border-black p-6 bg-white shadow-md hover:shadow-xl transition-shadow">
                                                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-black/10">
                                                        <div className="flex items-center gap-3">
                                                            <h5 className="text-xl font-serif font-black italic">{analysis.displayName}</h5>
                                                            <span className={cn("px-2 py-0.5 text-[8px] font-mono font-black uppercase border border-black", interpretation.bg, interpretation.color)}>
                                                                {interpretation.label}
                                                            </span>
                                                        </div>
                                                        <span className="text-2xl font-serif font-black italic">{analysis.stats.mean.toFixed(2)}</span>
                                                    </div>

                                                    <div className="h-32 border border-black/20 bg-neutral-50/50 p-3 flex items-end gap-1 relative mb-3">
                                                        <div className="absolute top-1 left-1 text-[7px] font-mono opacity-20 uppercase font-black">Distribuição</div>
                                                        {(analysis.distribution || []).map((d: { label: string; value: number; percent: number }, i: number) => (
                                                            <div
                                                                key={i}
                                                                className="flex-1 bg-black/90 hover:bg-black transition-all cursor-pointer relative group"
                                                                style={{ height: `${d.percent}%` }}
                                                                title={`${d.label}: ${d.percent.toFixed(1)}%`}
                                                            >
                                                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[7px] px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                    {d.percent.toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-3 text-center text-[10px] font-mono">
                                                        <div>
                                                            <div className="opacity-40 uppercase mb-0.5">Min</div>
                                                            <div className="font-black">{analysis.stats.min.toFixed(2)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="opacity-40 uppercase mb-0.5">CV%</div>
                                                            <div className={cn("font-black", analysis.stats.cv > 5 ? "text-red-600" : "text-blue-600")}>
                                                                {currentReport.cleanedCount > 1 ? analysis.stats.cv.toFixed(2) + '%' : '—'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="opacity-40 uppercase mb-0.5">Max</div>
                                                            <div className="font-black">{analysis.stats.max.toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) || []}
                                    </div>
                                </div>

                                {/* RODAPÉ */}
                                <div className="border-t-4 border-black pt-10 flex flex-col md:flex-row justify-between items-center gap-6 opacity-40">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 border-2 border-black flex items-center justify-center font-black text-sm italic bg-black text-white">OR</div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-serif font-black italic uppercase">Laudo Técnico Certificado</span>
                                            <span className="text-[8px] font-mono font-black uppercase">Emitido em: {new Date().toLocaleString('pt-BR')}</span>
                                        </div>
                                    </div>
                                    <div className="text-[8px] font-mono font-black uppercase text-right">
                                        ORIGO Intelligence • Fiberscan Analytics Engine v4.3
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import React from "react";
import { AlertCircle, BarChart3, Loader2, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntelligenceAnalyticsProps {
    innerRef: React.RefObject<HTMLDivElement | null>;
    analysisMetrics: any;
    analysisPeriod: number;
    setAnalysisPeriod: (period: number) => void;
    handleExportAnaliticoPDF: () => void;
    isGeneratingPDF: boolean;
    labs: any[];
    globalLabId?: string;
    analyticsLabId: string;
    setAnalyticsLabId: (labId: string) => void;
}

const SimpleWeekAverage = ({
    title,
    data,
    dataKey,
}: {
    title: string;
    data: any[];
    dataKey: string;
}) => {
    if (!data || data.length === 0) return null;

    const sum = data.reduce((acc, d) => acc + (Number(d[dataKey]) || 0), 0);
    const avg = data.length > 0 ? sum / data.length : 0;

    return (
        <div className="flex flex-col mb-10 overflow-hidden w-full border border-neutral-200 rounded-3xl bg-white shadow-sm font-sans animate-fade-in group/container">
            <div className="p-5 border-b border-neutral-200 bg-neutral-50/50 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-black shrink-0"></div>
                <h4 className="font-serif text-lg font-bold text-black uppercase tracking-widest">{title}</h4>
            </div>

            <div className="w-full overflow-x-auto overflow-y-hidden custom-scrollbar pb-2 bg-white">
                <table className="w-full border-collapse text-[11px] min-w-max">
                    <thead>
                        <tr>
                            <th className="border-b-2 border-r-2 border-black bg-white p-0 w-[180px] min-w-[180px] h-[40px] align-middle sticky left-0 z-30 shadow-[4px_0_10px_rgba(0,0,0,0.03)] focus:outline-none">
                                <div className="flex items-center justify-center w-full h-full text-center font-bold tracking-widest uppercase text-[10px] text-black">
                                    Últimos {data.length} Dias
                                </div>
                            </th>
                            {data.map((d, i) => (
                                <th key={i} className="border-b-2 border-r border-black/10 bg-white p-0 w-[60px] min-w-[60px] h-[40px] align-top z-10 transition-colors hover:bg-neutral-50 focus:outline-none">
                                    <div className="flex flex-col h-full w-full">
                                        <div className="h-1/2 flex items-center justify-center border-b border-black/10 text-black font-bold bg-neutral-100/30 text-[10px]">
                                            {d.name}
                                        </div>
                                    </div>
                                </th>
                            ))}
                            <th className="border-b-2 border-l-2 border-black bg-neutral-900 p-0 w-[100px] min-w-[100px] h-[40px] align-middle sticky right-0 z-30 shadow-[-4px_0_10px_rgba(0,0,0,0.1)] focus:outline-none">
                                <div className="flex items-center justify-center w-full h-full text-center font-bold tracking-widest uppercase text-[10px] text-white">
                                    Média Diária
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="hover:bg-neutral-50/50 transition-colors group">
                            <td className="border-b border-r-2 border-black/10 border-r-black bg-white p-0 h-[32px] sticky left-0 z-20 shadow-[4px_0_10px_rgba(0,0,0,0.03)]">
                                <div className="flex h-full w-full relative">
                                    <div className="w-[105px] flex items-center justify-center font-bold px-1 text-[9px] relative z-10 border-r border-black/10 shadow-sm"
                                        style={{ backgroundColor: '#fdf036', color: 'black' }}>
                                        {data[0]?.name} a {data[data.length - 1]?.name}
                                        <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[4px] border-y-transparent border-l-[4px]" style={{ borderLeftColor: '#fdf036' }}></div>
                                    </div>
                                    <div className="flex-1 flex items-center justify-end pr-4 pl-2 font-mono font-black text-[12px] text-black bg-white">
                                        Total: {sum.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </div>
                                </div>
                            </td>

                            {data.map((d, i) => (
                                <td key={i} className="p-0 h-[32px] relative border-b border-r border-black/5 align-middle">
                                    <div
                                        className={cn(
                                            "absolute inset-0 z-10 transition-colors border-y border-black/20 group-hover:brightness-105 shadow-sm",
                                            i === 0 && "border-l border-black/20",
                                            i === data.length - 1 && "border-r border-black/20"
                                        )}
                                        style={{ backgroundColor: '#fdf036' }}
                                    />
                                    <div className="relative z-20 flex items-center justify-center h-full w-full font-mono font-black text-[11px] text-black">
                                        {(Number(d[dataKey]) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                                    </div>
                                </td>
                            ))}

                            <td className="border-b border-l-2 border-black bg-black p-0 h-[32px] sticky right-0 z-20 shadow-[-4px_0_10px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center justify-center w-full h-full font-mono font-black text-[14px] text-white">
                                    {avg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export const IntelligenceAnalytics: React.FC<IntelligenceAnalyticsProps> = ({
    innerRef,
    analysisMetrics,
    analysisPeriod,
    setAnalysisPeriod,
    handleExportAnaliticoPDF,
    isGeneratingPDF,
    labs,
    globalLabId,
    analyticsLabId,
    setAnalyticsLabId
}) => {

    const chartData = [...analysisMetrics.smoothedData];

    return (
        <div ref={innerRef} className="space-y-6 mb-12 animate-fade-in transition-all duration-700 bg-white/50 p-6 rounded-[3rem] border border-neutral-100 mt-8">
            <div className="flex flex-col lg:flex-row items-stretch gap-6">
                {/* KPI Cards Secundários - Análise Analítica */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-neutral-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Eficiência de Absorção</span>
                            <div className={cn(
                                "px-2 py-1 rounded-full text-[9px] font-bold flex items-center gap-1",
                                analysisMetrics.absorptionRate >= 1 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                                <div key={analysisMetrics.absorptionRate >= 1 ? "up" : "down"} className="shrink-0 flex items-center">
                                    {analysisMetrics.absorptionRate >= 1 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                </div>
                                <span>{(analysisMetrics.absorptionRate * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                        <div className="text-xl font-serif text-black">{analysisMetrics.currentProduced.toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] font-bold text-neutral-400 mt-1">Produzido nos últimos {analysisPeriod}d</div>
                    </div>

                    <div className="bg-white border border-neutral-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Eficiência Ponderada</span>
                            <div className={cn(
                                "h-2 w-16 bg-neutral-100 rounded-full overflow-hidden"
                            )}>
                                <div
                                    className={cn("h-full transition-all duration-1000", analysisMetrics.weightedEfficiencyIndex > 0.9 ? "bg-emerald-500" : analysisMetrics.weightedEfficiencyIndex > 0.65 ? "bg-amber-400" : "bg-red-400")}
                                    style={{ width: `${Math.min(100, analysisMetrics.weightedEfficiencyIndex * 100)}%` }}
                                />
                            </div>
                        </div>
                        <div className="text-xl font-serif text-black">{(analysisMetrics.weightedEfficiencyIndex * 100).toFixed(1)}%</div>
                        <div className="text-[10px] font-bold text-neutral-400 mt-1">Índice Ponderado de O.S. Finalizadas</div>
                    </div>

                    <div className="bg-white border border-neutral-100 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Taxa de Revisão</span>
                            <div className={cn(
                                "px-2 py-1 rounded-full text-[9px] font-bold flex items-center gap-1",
                                analysisMetrics.revisionRate >= 0.85 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                                <span>{(analysisMetrics.revisionRate * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                        <div className="text-xl font-serif text-black">{analysisMetrics.currentReceived.toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] font-bold text-neutral-400 mt-1">Amostras Recebidas · {(analysisMetrics.revisionRate * 100).toFixed(1)}% revisadas</div>
                    </div>
                </div>

                {/* Alertas e Insights */}
                {analysisMetrics.alerts.length > 0 && (
                    <div className="lg:w-1/3 bg-neutral-900 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertCircle className="h-4 w-4 text-amber-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Insights e Alertas</span>
                            </div>
                            <div className="space-y-3">
                                {analysisMetrics.alerts.map((alert: any) => (
                                    <div key={alert.message} className="flex items-start gap-3 bg-white/5 border border-white/10 p-3 rounded-xl">
                                        <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", alert.type === 'warning' ? "bg-amber-500" : "bg-blue-500")} />
                                        <p className="text-[10px] leading-relaxed text-neutral-300 font-bold">{alert.message}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Novo Gráfico Cascata (Gantt) - Balanço Operacional */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div>
                        <h3 className="text-xl font-serif text-black leading-tight flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-neutral-400" />
                            Balanço Operacional Dinâmico (Últimos {analysisPeriod} Dias)
                        </h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">Comparação de volumes com média diária ponderada</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 bg-neutral-100/50 p-1.5 rounded-2xl border border-neutral-200">
                        {[7, 14, 30, 90, 180, 365].map((period) => (
                            <button
                                key={period}
                                onClick={() => setAnalysisPeriod(period)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                                    analysisPeriod === period
                                        ? "bg-black text-white shadow-lg scale-105"
                                        : "text-neutral-400 hover:text-black hover:bg-white"
                                )}
                            >
                                {period === 365 ? '1 ANO' : period === 180 ? 'SAFRA' : `${period}D`}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        {globalLabId === 'all' && labs && (
                            <select
                                title="Filtrar por Laboratório"
                                value={analyticsLabId}
                                onChange={(e) => setAnalyticsLabId(e.target.value)}
                                className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-yellow-50 text-yellow-800 border-2 border-yellow-200 outline-none hover:bg-yellow-100 transition-colors cursor-pointer shadow-sm min-w-[200px]"
                            >
                                <option value="all">TODOS OS LABORATÓRIOS</option>
                                {labs.map(l => (
                                    <option key={l.id} value={l.id}>{l.nome}</option>
                                ))}
                            </select>
                        )}
                        <button
                            onClick={handleExportAnaliticoPDF}
                            disabled={isGeneratingPDF}
                            className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg"
                        >
                            <div key={isGeneratingPDF ? "generating" : "idle"} className="shrink-0 flex items-center">
                                {isGeneratingPDF ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                            </div>
                            <span>Gerar Relatório Analítico</span>
                        </button>
                    </div>
                </div>

                <div className="w-full bg-neutral-50/50 rounded-2xl p-6 border border-neutral-100 overflow-hidden">
                    <SimpleWeekAverage title="PRODUÇÃO HVI" data={chartData} dataKey="Volume Produzido (Análise)" />
                    <SimpleWeekAverage title="RECEBIMENTO (VIA STATUS O.S)" data={chartData} dataKey="Volume Recebido" />
                    <SimpleWeekAverage title="REVISÃO ANALISTAS" data={chartData} dataKey="Total Revisado (Analistas)" />
                </div>
            </div>
        </div>
    );
};

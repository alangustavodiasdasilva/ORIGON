import React from "react";
import { Activity, Inbox, Users, LayoutGrid } from "lucide-react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Line, Brush } from "recharts";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";
import { cn } from "@/lib/utils";
import type { OSItem } from "@/components/monitoramento/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReviewerPerformanceSectionProps {
    activeTab: 'geral' | 'revisores' | 'clientes' | 'saldo_diario';
    toggleReviewerSelection: (key: string) => void;
    selectedReviewers: string[];
    revisorDailyStats: any;
    osList: OSItem[];
    labId: string | null | undefined;
}

const PERIOD_OPTIONS = [
    { label: '30 dias', value: 30 },
    { label: '60 dias', value: 60 },
    { label: '90 dias', value: 90 },
    { label: 'Todos', value: 99999 },
];

export const ReviewerPerformanceSection: React.FC<ReviewerPerformanceSectionProps> = ({
    activeTab,
    toggleReviewerSelection,
    selectedReviewers,
    revisorDailyStats,
    osList,
    labId
}) => {
    const [viewMode, setViewMode] = React.useState<'grafico' | 'dest'>('grafico');
    const [periodoExibicao, setPeriodoExibicao] = React.useState(99999);

    React.useEffect(() => {
        if (activeTab === 'geral' && viewMode === 'dest') {
            setViewMode('grafico');
        }
    }, [activeTab, viewMode]);

    // ── Pivot por Dest (Revisor) ────────────────────────────────────────────────
    const destPivot = React.useMemo(() => {
        const matrix: Record<string, {
            destName: string;
            total: number;
            dates: Record<string, number>;
            clientes: Record<string, number>;
        }> = {};
        const datesSet = new Set<string>();

        osList.forEach((os: OSItem) => {
            const rev = os.revisor?.trim();
            if (!rev) return;
            const recepcaoStr = String(os.data_recepcao || '').trim();
            const hasRec = recepcaoStr !== '' && recepcaoStr !== 'null' && recepcaoStr !== '0';
            if (!hasRec) return;
            try {
                const dateObj = new Date(os.data_recepcao);
                if (isNaN(dateObj.getTime())) return;
                const dateKey = format(dateObj, 'yyyy-MM-dd');
                datesSet.add(dateKey);

                if (!matrix[rev]) matrix[rev] = { destName: rev, total: 0, dates: {}, clientes: {} };
                const g = matrix[rev];
                const am = os.total_amostras || 0;
                g.total += am;
                g.dates[dateKey] = (g.dates[dateKey] || 0) + am;

                const cli = os.tomador || os.cliente || 'NÃO INFORMADO';
                g.clientes[cli] = (g.clientes[cli] || 0) + am;
            } catch { /**/ }
        });

        const sortedDates = Array.from(datesSet).sort().slice(-periodoExibicao);
        const sorted = Object.values(matrix).sort((a, b) => b.total - a.total);
        const totalGeral = sorted.reduce((acc, v) => acc + v.total, 0);
        return { sorted, sortedDates, totalGeral };
    }, [osList, periodoExibicao]);

    return (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-100">
                    <div>
                        <h3 className="text-xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                            <div key={`tab-icon-${activeTab}`} className="shrink-0 flex items-center">
                                {activeTab === 'geral' ? <Activity className="h-6 w-6 text-neutral-400" /> : <Users className="h-6 w-6 text-neutral-400" />}
                            </div>
                            {activeTab === 'geral' ? 'Produção Geral' : 'Performance por Revisor'}
                        </h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">
                            {activeTab === 'geral' ? 'Visão global de entrada e saída' : 'Produtividade diária dos analistas e volume total'}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 items-end">
                        {activeTab === 'revisores' && (
                            <div className="flex items-center gap-2 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                                <button
                                    onClick={() => setViewMode('grafico')}
                                    className={cn("flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                        viewMode === 'grafico' ? "bg-black text-white shadow" : "text-neutral-400 hover:text-black"
                                    )}
                                >
                                    <Activity className="h-3.5 w-3.5" /> Gráfico
                                </button>
                                <button
                                    onClick={() => setViewMode('dest')}
                                    className={cn("flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                        viewMode === 'dest' ? "bg-black text-white shadow" : "text-neutral-400 hover:text-black"
                                    )}
                                >
                                    <Users className="h-3.5 w-3.5" /> Por Dest (Revisor)
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {viewMode === 'grafico' && (
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                toggleReviewerSelection('Volume Produzido (Análise)');
                            }}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all cursor-pointer hover:shadow-sm",
                                selectedReviewers.includes('Volume Produzido (Análise)')
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-neutral-400 border-neutral-100 hover:border-black hover:text-black"
                            )}
                        >
                            <div key="icon-prod-btn" className="shrink-0 flex items-center"><Activity className="h-3.5 w-3.5" /></div>
                            <span className="text-[10px] font-black uppercase tracking-widest">Volume Produzido</span>
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                toggleReviewerSelection('Total Revisado (Analistas)');
                            }}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all cursor-pointer hover:shadow-sm",
                                selectedReviewers.includes('Total Revisado (Analistas)')
                                    ? "bg-red-600 text-white border-red-600"
                                    : "bg-white text-neutral-400 border-neutral-100 hover:border-red-600 hover:text-red-600"
                            )}
                        >
                            <div key="icon-rev-btn" className="shrink-0 flex items-center"><Users className="h-3.5 w-3.5" /></div>
                            <span className="text-[10px] font-black uppercase tracking-widest">Total Revisado</span>
                        </button>
                        {activeTab === 'geral' && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    toggleReviewerSelection('Volume Recebido');
                                }}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all cursor-pointer hover:shadow-sm",
                                    selectedReviewers.includes('Volume Recebido')
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-white text-neutral-400 border-neutral-100 hover:border-blue-600 hover:text-blue-600"
                                )}
                            >
                                <div className="shrink-0 flex items-center"><Inbox className="h-3.5 w-3.5" /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest">Volume Recebido</span>
                            </button>
                        )}
                    </div>
                )}

                {(viewMode === 'grafico' && activeTab === 'revisores') && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Analistas:</span>
                            <span className="text-[8px] font-bold text-neutral-300 uppercase italic">Arraste para ver a lista completa →</span>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                            {revisorDailyStats.keys.map((rev: string) => {
                                const totalRev = osList.filter(o => {
                                    const finStr = String(o.data_finalizacao || '').trim();
                                    const isFinalizada = finStr !== '' && finStr !== 'null' && finStr !== 'undefined' && finStr !== '0';
                                    return o.revisor === rev && isFinalizada;
                                }).reduce((sum, o) => sum + (o.total_amostras || 0), 0);
                                return (
                                    <button
                                        key={rev}
                                        onClick={() => toggleReviewerSelection(rev)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit relative overflow-hidden",
                                            selectedReviewers.includes(rev)
                                                ? "text-white border-transparent"
                                                : "bg-neutral-50/50 text-neutral-400 border-transparent hover:bg-white hover:border-neutral-200"
                                        )}
                                    >
                                        {selectedReviewers.includes(rev) && (
                                            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                                                <rect width="100%" height="100%" fill={revisorDailyStats.keyColors[rev]} />
                                            </svg>
                                        )}
                                        <div className="relative z-10 flex items-center gap-3 pointer-events-none">
                                            <svg width="6" height="6" viewBox="0 0 6 6" className="shrink-0 pointer-events-none">
                                                <circle cx="3" cy="3" r="3" fill={selectedReviewers.includes(rev) ? 'white' : (revisorDailyStats.keyColors[rev] || '#e5e5e5')} />
                                            </svg>
                                            <span className="text-[9px] font-black uppercase tracking-wider">{rev}</span>
                                            <span className="text-[10px] font-mono font-bold opacity-80 pl-2 border-l border-white/20">{totalRev.toLocaleString('pt-BR')}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {viewMode === 'grafico' ? (
                <div className="h-[300px] w-full min-w-0 max-w-full bg-neutral-50/30 rounded-2xl p-4">
                    <ResponsiveContainer key={`reviewer-chart-${activeTab}-${labId}-${revisorDailyStats.data.length}-${selectedReviewers.join(',')}`} width="100%" height="100%">
                        <LineChart data={revisorDailyStats.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis
                                dataKey="name"
                                axisLine={false} tickLine={false}
                                tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false} tickLine={false}
                                tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }}
                            />
                            <RechartsTooltip content={<CustomTooltip />} />
                            {selectedReviewers.includes('Volume Produzido (Análise)') && (
                                <Line type="monotone" name="Volume Produzido" dataKey="Volume Produzido (Análise)" stroke="#000" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            )}
                            {selectedReviewers.includes('Total Revisado (Analistas)') && (
                                <Line type="monotone" name="Total Revisado" dataKey="Total Revisado (Analistas)" stroke="#dc2626" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            )}
                            {(activeTab === 'geral' && selectedReviewers.includes('Volume Recebido')) && (
                                <Line type="monotone" name="Volume Recebido" dataKey="Volume Recebido" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            )}
                            {activeTab === 'revisores' && revisorDailyStats.keys.filter((k: string) => selectedReviewers.includes(k)).map((rev: string) => (
                                <Line key={rev} type="monotone" dataKey={rev} stroke={revisorDailyStats.keyColors[rev]} strokeWidth={2} dot={false} />
                            ))}
                            {revisorDailyStats.data.length > 15 && (
                                <Brush dataKey="name" height={30} stroke="#e5e5e5" />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                /* ── TABELA POR DEST (REVISOR) ── */
                <div className="space-y-6">
                    {/* Cards de destino */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {destPivot.sorted.map((dest, idx) => {
                            const colors = ['#f59e0b', '#6366f1', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];
                            const color = colors[idx % colors.length];
                            const topClientes = Object.entries(dest.clientes).sort(([, a], [, b]) => b - a);
                            return (
                                <div key={dest.destName} className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white text-[10px] font-black shrink-0"
                                            style={{ background: color }}>
                                            {dest.destName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black uppercase tracking-wider text-neutral-800 truncate">{dest.destName}</p>
                                            <p className="text-[10px] font-bold text-neutral-400">Dest / Revisor</p>
                                        </div>
                                    </div>
                                    <div className="text-3xl font-serif font-black text-black mb-1">{dest.total.toLocaleString('pt-BR')}</div>
                                    <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-4">amostras recebidas</div>
                                    <div className="space-y-1.5 border-t border-neutral-100 pt-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                        {topClientes.map(([cli, am]) => (
                                            <div key={cli} className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${(am / dest.total) * 100}%`, background: color }} />
                                                </div>
                                                <span className="text-[9px] font-bold text-neutral-500 shrink-0 max-w-[120px] truncate">{cli}</span>
                                                <span className="text-[9px] font-black text-neutral-700 shrink-0">{am.toLocaleString('pt-BR')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        {destPivot.sorted.length === 0 && (
                            <div className="col-span-4 text-center py-16 text-neutral-400 text-sm font-medium">
                                Nenhuma O.S. com Dest (Revisor) preenchido encontrada no período selecionado.
                            </div>
                        )}
                    </div>

                    {/* Tabela detalhe por Dest × Dia */}
                    <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-neutral-100">
                            <h3 className="text-xl font-serif text-black flex items-center gap-2">
                                <Users className="h-5 w-5 text-neutral-400" />
                                Recebimento por Dest × Dia
                            </h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1">
                                Total de amostras entregues por analista responsável
                            </p>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar pb-2">
                            <table className="w-full min-w-max text-[10px] text-left border-collapse">
                                <thead className="sticky top-0 bg-neutral-50 z-30 border-b border-neutral-200">
                                    <tr>
                                        <th className="p-3 sticky left-0 bg-neutral-50 z-40 font-bold uppercase tracking-widest border-r border-neutral-100 min-w-[200px]">Dest / Revisor</th>
                                        {destPivot.sortedDates.map(d => (
                                            <th key={d} className="p-3 text-center border-r border-neutral-100 min-w-[65px] uppercase tracking-tighter">
                                                {format(new Date(d + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                                            </th>
                                        ))}
                                        <th className="p-3 text-right sticky right-0 bg-neutral-50 z-30 font-bold uppercase tracking-widest border-l border-neutral-100">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 font-mono">
                                    {destPivot.sorted.map((dest, idx) => {
                                        const colors = ['#f59e0b', '#6366f1', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];
                                        const color = colors[idx % colors.length];
                                        return (
                                            <tr key={dest.destName} className="hover:bg-neutral-50 transition-colors">
                                                <td className="p-3 sticky left-0 bg-white z-10 border-r border-neutral-100 font-black text-[11px]"
                                                    style={{ borderLeft: `3px solid ${color}` }}>
                                                    {dest.destName}
                                                </td>
                                                {destPivot.sortedDates.map(date => (
                                                    <td key={date} className="p-3 text-center border-r border-neutral-100 font-bold text-neutral-700">
                                                        {dest.dates[date] ? dest.dates[date].toLocaleString('pt-BR') : '—'}
                                                    </td>
                                                ))}
                                                <td className="p-3 text-right sticky right-0 bg-white z-10 font-black text-black border-l border-neutral-200">
                                                    {dest.total.toLocaleString('pt-BR')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-black text-white z-50">
                                    <tr>
                                        <td className="p-2 pl-4 sticky left-0 bg-black z-10 border-r border-neutral-800 uppercase text-[8px] tracking-widest">Total do Dia</td>
                                        {destPivot.sortedDates.map(date => {
                                            const t = destPivot.sorted.reduce((acc, d) => acc + (d.dates[date] || 0), 0);
                                            return <td key={date} className="p-2 text-center border-r border-neutral-800 text-[10px]">{t > 0 ? t.toLocaleString('pt-BR') : '—'}</td>;
                                        })}
                                        <td className="p-2 text-right sticky right-0 bg-black z-10 border-l border-neutral-800">{destPivot.totalGeral.toLocaleString('pt-BR')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

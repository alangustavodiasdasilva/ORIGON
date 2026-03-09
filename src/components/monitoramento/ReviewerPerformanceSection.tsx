import React from "react";
import { Activity, Inbox, Users } from "lucide-react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Line, Brush } from "recharts";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";
import { cn } from "@/lib/utils";
import type { OSItem } from "@/components/monitoramento/types";

interface ReviewerPerformanceSectionProps {
    activeTab: 'geral' | 'revisores' | 'clientes' | 'saldo_diario';
    toggleReviewerSelection: (key: string) => void;
    selectedReviewers: string[];
    revisorDailyStats: any;
    osList: OSItem[];
    labId: string | null | undefined;
}

export const ReviewerPerformanceSection: React.FC<ReviewerPerformanceSectionProps> = ({
    activeTab,
    toggleReviewerSelection,
    selectedReviewers,
    revisorDailyStats,
    osList,
    labId
}) => {
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
                </div>

                {activeTab === 'revisores' && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Analistas:</span>
                            <span className="text-[8px] font-bold text-neutral-300 uppercase italic">Arraste para ver a lista completa →</span>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                            {revisorDailyStats.keys.map((rev: string) => {
                                const totalRev = osList.filter(o => o.revisor === rev).reduce((sum, o) => sum + (o.total_amostras || 0), 0);
                                return (
                                    <button
                                        key={rev}
                                        onClick={() => toggleReviewerSelection(rev)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit",
                                            selectedReviewers.includes(rev)
                                                ? "text-white border-transparent bg-dynamic shadow-dynamic"
                                                : "bg-neutral-50/50 text-neutral-400 border-transparent hover:bg-white hover:border-neutral-200"
                                        )}
                                        style={selectedReviewers.includes(rev) ? {
                                            '--bg-color': revisorDailyStats.keyColors[rev],
                                            '--dynamic-shadow': `0 4px 12px ${revisorDailyStats.keyColors[rev]}33`
                                        } as React.CSSProperties : {}}
                                    >
                                        <div
                                            className="h-1.5 w-1.5 rounded-full bg-dynamic"
                                            style={{
                                                '--bg-color': selectedReviewers.includes(rev) ? 'white' : (revisorDailyStats.keyColors[rev] || '#e5e5e5')
                                            } as React.CSSProperties}
                                        />
                                        <span className="text-[9px] font-black uppercase tracking-wider">{rev}</span>
                                        <span className="text-[10px] font-mono font-bold opacity-80 pl-2 border-l border-white/20">{totalRev.toLocaleString('pt-BR')}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="h-[300px] w-full bg-neutral-50/30 rounded-2xl p-4">
                <ResponsiveContainer key={`reviewer-chart-${activeTab}-${labId}`} width="100%" height="100%">
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
        </div>
    );
};

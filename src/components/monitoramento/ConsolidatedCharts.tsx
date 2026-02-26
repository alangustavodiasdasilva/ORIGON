import React from "react";
import { Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Line } from "recharts";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";

interface ConsolidatedChartsProps {
    data: any[];
    keys: string[];
    keyColors: Record<string, string>;
    selectedKeys: string[];
    labs: { id: string; nome: string }[];
}

export const ConsolidatedCharts: React.FC<ConsolidatedChartsProps> = ({ data, keyColors, selectedKeys, labs }) => {
    return (
        <div className="flex flex-col gap-6">
            {/* Gráfico 1 — Volume Recebido por Dia */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-3 w-3 rounded-full bg-black" />
                    <h3 className="text-lg font-serif text-black leading-tight tracking-tight">Volume Recebido por Dia</h3>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-6">O.S. recebidas em cada laboratório ao longo do tempo</p>

                {data.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-neutral-300">
                        <div className="text-center">
                            <Activity className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">Sem dados disponíveis</p>
                        </div>
                    </div>
                ) : (
                    <div className="h-[300px] w-full bg-neutral-50/30 rounded-2xl p-3">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                {labs
                                    .filter(lab => selectedKeys.includes(lab.nome + ' (Recebido)'))
                                    .map(lab => (
                                        <Line
                                            key={lab.nome + '-rec'}
                                            type="monotone"
                                            dataKey={lab.nome + ' (Recebido)'}
                                            name={lab.nome}
                                            stroke={keyColors[lab.nome + ' (Recebido)']}
                                            strokeWidth={2}
                                            dot={{ r: 3, strokeWidth: 0, fill: keyColors[lab.nome + ' (Recebido)'] }}
                                            activeDot={{ r: 6, strokeWidth: 0 }}
                                            connectNulls={true}
                                        />
                                    ))
                                }
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Gráfico 2 — Volume Produzido por Dia */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-500" />
                    <h3 className="text-lg font-serif text-black leading-tight tracking-tight">Volume Produzido por Dia</h3>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-6">Amostras analisadas em cada laboratório ao longo do tempo</p>

                {data.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-neutral-300">
                        <div className="text-center">
                            <Activity className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">Sem dados disponíveis</p>
                        </div>
                    </div>
                ) : (
                    <div className="h-[300px] w-full bg-neutral-50/30 rounded-2xl p-3">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                                <RechartsTooltip content={<CustomTooltip />} />
                                {labs
                                    .filter(lab => selectedKeys.includes(lab.nome + ' (Produzido)'))
                                    .map(lab => (
                                        <Line
                                            key={lab.nome + '-prod'}
                                            type="monotone"
                                            dataKey={lab.nome + ' (Produzido)'}
                                            name={lab.nome}
                                            stroke={keyColors[lab.nome + ' (Produzido)']}
                                            strokeWidth={2}
                                            dot={{ r: 3, strokeWidth: 0, fill: keyColors[lab.nome + ' (Produzido)'] }}
                                            activeDot={{ r: 6, strokeWidth: 0 }}
                                            connectNulls={true}
                                        />
                                    ))
                                }
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
};

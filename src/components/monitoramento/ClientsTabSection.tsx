import React from "react";
import { LayoutGrid, Database, Star, PlusSquare, MinusSquare } from "lucide-react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Line, Brush } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";
import { cn } from "@/lib/utils";

interface ClientsTabSectionProps {
    clienteDailyStats: any;
    clienteStats: any;
    selectedChartClients: string[];
    toggleClientSelection: (client: string) => void;
    carteiraClientesPivotStats: any;
    expandedClients: string[];
    toggleClientCollapse: (client: string) => void;
    labId: string | null | undefined;
    rankingType: 'tomador' | 'fazenda';
    setRankingType: (type: 'tomador' | 'fazenda') => void;
}

export const ClientsTabSection: React.FC<ClientsTabSectionProps> = ({
    clienteDailyStats,
    clienteStats,
    selectedChartClients,
    toggleClientSelection,
    carteiraClientesPivotStats,
    expandedClients,
    toggleClientCollapse,
    labId,
    rankingType,
    setRankingType
}) => {
    return (
        <div key="content-clientes" className="space-y-8 animate-fade-in pb-32">
            
            {/* 1. Gráfico de Distribuição */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex flex-col gap-6 mb-8">
                    <div>
                        <h3 className="text-2xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                            <LayoutGrid className="h-6 w-6 text-neutral-400" />
                            Distribuição Temporária
                        </h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">Volume recebido ao longo do tempo</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
                        {clienteDailyStats.keys.includes('Total Recebido') && (
                            <button
                                onClick={() => toggleClientSelection('Total Recebido')}
                                className={cn(
                                    "flex items-center gap-3 px-5 py-3 rounded-xl border-2 transition-all shrink-0 min-w-fit shadow-sm",
                                    selectedChartClients.includes('Total Recebido')
                                        ? "bg-black text-white border-black"
                                        : "bg-neutral-100 text-neutral-500 border-transparent hover:bg-neutral-200 hover:text-black"
                                )}
                            >
                                <div className={cn("h-2 w-2 rounded-full", selectedChartClients.includes('Total Recebido') ? "bg-white" : "bg-black")} />
                                <span className="text-[11px] font-black uppercase tracking-widest">Total Recebido</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="h-[380px] w-full bg-neutral-50/30 rounded-2xl p-2">
                    <ResponsiveContainer key={`client-chart-${labId}`} width="100%" height="100%">
                        <LineChart data={clienteDailyStats.data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            {clienteDailyStats.keys.filter((key: string) => selectedChartClients.includes(key)).map((key: string) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    connectNulls={true}
                                    dataKey={key}
                                    stroke={clienteDailyStats.keyColors[key]}
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: clienteDailyStats.keyColors[key] }}
                                    activeDot={{ r: 7, fill: clienteDailyStats.keyColors[key] }}
                                />
                            ))}
                            <Brush dataKey="name" height={30} stroke="#e5e5e5" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>


            {/* 3. Matriz de Detalhamento por Data (Com Totais solicitado) */}
            <div className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-12 w-full">
                <div className="p-8 pb-4 border-b border-neutral-100 flex items-center gap-4">
                    <div className="h-10 w-10 bg-neutral-100 text-neutral-500 rounded-xl flex items-center justify-center">
                        <Database className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-xl font-serif text-black leading-tight">Recebimento Diário (Detalhamento Completo)</h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-0.5">Visão matricial por dia de trabalho</p>
                    </div>
                </div>
                <div className="overflow-x-auto no-scrollbar max-h-[1000px] overflow-y-auto w-full relative">
                    <table className="w-full text-[10px] text-left border-collapse">
                        <thead className="sticky top-0 bg-neutral-50 z-30 shadow-sm border-b border-neutral-200">
                            <tr>
                                <th className="p-3 bg-neutral-50 border-r border-neutral-100 font-bold uppercase tracking-widest text-[10px] sticky left-0 z-40">Clientes</th>
                                {carteiraClientesPivotStats.sortedDates.slice(-15).map((d: string) => (
                                    <th key={d} className="p-3 text-center border-r border-neutral-100 min-w-[70px] uppercase text-[10px] tracking-tighter">{format(new Date(d + 'T12:00:00'), 'dd/MM', { locale: ptBR })}</th>
                                ))}
                                <th className="p-3 text-right bg-neutral-50 font-bold uppercase tracking-widest text-[10px] sticky right-0 z-30">Total Geral</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono divide-y divide-neutral-100">
                            {carteiraClientesPivotStats.sortedClients.map((client: any) => (
                                <React.Fragment key={client.clientName}>
                                    <tr 
                                        className="hover:bg-neutral-50 transition-colors group cursor-pointer bg-white border-b-2 border-neutral-200" 
                                        onClick={() => toggleClientCollapse(client.clientName)}
                                    >
                                        <td className="p-4 pl-4 font-black text-black bg-white sticky left-0 z-10 border-l-4 border-l-black border-r border-neutral-200 min-w-[300px] max-w-[400px] shadow-sm flex items-center gap-3">
                                            <div className="shrink-0 flex items-center justify-center">
                                                {expandedClients.includes(client.clientName) ? 
                                                    <MinusSquare className="h-4.5 w-4.5 text-black" /> : 
                                                    <PlusSquare className="h-4.5 w-4.5 text-neutral-300" />
                                                }
                                            </div>
                                            <span className="truncate uppercase text-[12px] tracking-tight">{client.clientName}</span>
                                        </td>
                                        {carteiraClientesPivotStats.sortedDates.slice(-15).map((date: string) => (
                                            <td key={date} className="p-4 text-center border-r border-neutral-100 font-bold text-neutral-900 text-[13px] bg-white">
                                                {client.dates[date]?.total || "-"}
                                            </td>
                                        ))}
                                        <td className="p-4 font-black text-right bg-neutral-100 sticky right-0 z-10 shadow-sm border-l border-neutral-300 text-black text-[14px]">
                                            {client.total.toLocaleString('pt-BR')}
                                        </td>
                                    </tr>
                                    {expandedClients.includes(client.clientName) && client.sortedClientes.map((clienteNode: any) => (
                                        <tr key={`${client.clientName}-${clienteNode.name}`} className="bg-neutral-50/10 hover:bg-neutral-50/50 transition-colors border-b border-neutral-200">
                                            <td className="p-2.5 pl-12 text-[10px] text-neutral-600 bg-neutral-50/80 sticky left-0 z-10 border-r border-neutral-200 min-w-[300px] max-w-[400px] font-medium flex items-center gap-2 border-l-2 border-l-neutral-200">
                                                <span className="text-neutral-400">└─</span>
                                                <span className="truncate">{clienteNode.name}</span>
                                            </td>
                                            {carteiraClientesPivotStats.sortedDates.slice(-15).map((date: string) => (
                                                <td key={date} className="p-2.5 text-center border-r border-neutral-100/50 text-neutral-500 text-[11px] font-bold">
                                                    {clienteNode.dates[date]?.total || "-"}
                                                </td>
                                            ))}
                                            <td className="p-2.5 text-right bg-neutral-50/80 sticky right-0 z-10 font-bold text-neutral-600 text-[11px] border-l border-neutral-200">
                                                {clienteNode.total.toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-black text-white font-bold z-50">
                            <tr>
                                <td className="p-2 pl-4 sticky left-0 bg-black z-10 border-r border-neutral-800 uppercase text-[8px] tracking-widest">Total do Dia</td>
                                {carteiraClientesPivotStats.sortedDates.slice(-15).map((date: string) => {
                                    const totalDia = carteiraClientesPivotStats.sortedClients.reduce((sum: number, c: any) => sum + (c.dates[date]?.total || 0), 0);
                                    return <td key={date} className="p-2 text-center border-r border-neutral-800">{totalDia > 0 ? totalDia.toLocaleString('pt-BR') : "-"}</td>
                                })}
                                <td className="p-2 text-right sticky right-0 bg-black z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.5)] border-l border-neutral-800">{carteiraClientesPivotStats.totalGeral.toLocaleString('pt-BR')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

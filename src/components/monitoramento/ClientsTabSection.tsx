import React from "react";
import { LayoutGrid, Trash2, PlusSquare, MinusSquare, Database } from "lucide-react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Line } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";
import { cn } from "@/lib/utils";

interface ClientsTabSectionProps {
    clienteDailyStats: any;
    clienteStats: any;
    selectedChartClients: string[];
    toggleClientSelection: (client: string) => void;
    setSelectedChartClients: (clients: string[]) => void;
    carteiraClientesPivotStats: any;
    collapsedClients: string[];
    toggleClientCollapse: (client: string) => void;
    labId: string | null | undefined;
}

export const ClientsTabSection: React.FC<ClientsTabSectionProps> = ({
    clienteDailyStats,
    clienteStats,
    selectedChartClients,
    toggleClientSelection,
    setSelectedChartClients,
    carteiraClientesPivotStats,
    collapsedClients,
    toggleClientCollapse,
    labId
}) => {
    return (
        <div key="content-clientes" className="space-y-8 animate-fade-in">
            <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex flex-col gap-6 mb-8">
                    <div>
                        <h3 className="text-2xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                            <LayoutGrid className="h-6 w-6 text-neutral-400" />
                            Distribuição por Cliente
                        </h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">Volume de amostras recebidas por cliente no tempo</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Clientes Ativos:</span>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setSelectedChartClients([])}
                                    className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:text-red-500 transition-colors flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-red-50 rounded-lg cursor-pointer"
                                >
                                    <Trash2 className="h-3 w-3" /> Limpar Filtros
                                </button>
                                <span className="text-[8px] font-bold text-neutral-300 uppercase italic">Arraste para ver mais clientes →</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-4 -mx-2 px-2 no-scrollbar">
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
                                    <div className="flex flex-col items-start">
                                        <span className="text-[11px] font-black uppercase tracking-widest">Total Recebido</span>
                                    </div>
                                </button>
                            )}
                            <div className="w-px h-8 bg-neutral-200 mx-2 flex-shrink-0" />
                            {clienteDailyStats.keys.filter((k: string) => k !== 'Total Recebido').slice(0, 30).map((cName: string) => {
                                const cInfo = clienteStats.find((item: any) => item.name === cName) || { avgTime: '-', total: 0 };
                                return (
                                    <button
                                        key={cName}
                                        onClick={() => toggleClientSelection(cName)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit",
                                            selectedChartClients.includes(cName)
                                                ? "text-white border-transparent bg-dynamic shadow-dynamic"
                                                : "bg-neutral-50/50 text-neutral-400 border-transparent hover:bg-white hover:border-neutral-200"
                                        )}
                                        style={selectedChartClients.includes(cName) ? {
                                            '--bg-color': clienteDailyStats.keyColors[cName],
                                            '--dynamic-shadow': `0 4px 12px ${clienteDailyStats.keyColors[cName]}33`
                                        } as React.CSSProperties : {}}
                                    >
                                        <div
                                            className="h-1.5 w-1.5 rounded-full bg-dynamic"
                                            style={{
                                                '--bg-color': selectedChartClients.includes(cName)
                                                    ? 'white'
                                                    : (clienteDailyStats.keyColors[cName] || '#e5e5e5')
                                            } as React.CSSProperties}
                                        />
                                        <div className="flex flex-col items-start">
                                            <span className="text-[9px] font-black uppercase tracking-wider">{cName}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[7px] font-mono opacity-60">Avg: {cInfo.avgTime}h</span>
                                                <span className="text-[8px] font-mono font-bold opacity-80 pl-2 border-l border-current/20">{cInfo.total.toLocaleString('pt-BR')}</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="h-[450px] w-full bg-neutral-50/30 rounded-2xl p-4">
                    <ResponsiveContainer key={`client-chart-${labId}`} width="100%" height="100%">
                        <LineChart data={clienteDailyStats.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                                    dot={{ r: 4, strokeWidth: 0, fill: clienteDailyStats.keyColors[key] }}
                                    activeDot={{ r: 7, strokeWidth: 0, fill: clienteDailyStats.keyColors[key] }}
                                    strokeDasharray={key === 'Outros' ? "5 5" : "0"}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* New Pivot Table */}
            <div className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-12 w-full">
                <div className="p-8 pb-4 border-b border-neutral-100 flex items-center gap-4">
                    <div className="h-10 w-10 bg-neutral-100 text-neutral-500 rounded-xl flex items-center justify-center">
                        <Database className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-xl font-serif text-black leading-tight tracking-tight">Recebimento Diário (Detalhado)</h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-0.5">Amostras recebidas por cliente agrupadas por data</p>
                    </div>
                </div>
                <div className="overflow-x-auto no-scrollbar max-h-[600px] overflow-y-auto w-full relative">
                    <table className="w-full text-[11px] text-left border-collapse">
                        <thead className="sticky top-0 bg-white shadow-sm z-30 border-b-2 border-neutral-200">
                            <tr className="bg-neutral-50/50">
                                <th className="p-3 text-left border-b border-r border-neutral-200 bg-neutral-50 sticky left-0 z-40 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Rótulos de Linha</span>
                                </th>
                                {carteiraClientesPivotStats.sortedDates.map((d: string) => (
                                    <th key={d} className="p-3 text-center border-b border-r border-neutral-100 min-w-[85px] whitespace-nowrap bg-neutral-50/50">
                                        <div className="text-[11px] font-serif text-black">{format(new Date(d + 'T12:00:00'), 'dd/MMM', { locale: ptBR })}</div>
                                    </th>
                                ))}
                                <th className="p-3 text-right border-b border-neutral-200 bg-neutral-100/50 sticky right-0 z-30 w-28 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Total Geral</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 font-mono">
                            {carteiraClientesPivotStats.sortedClients.map((client: any) => (
                                <React.Fragment key={client.clientName}>
                                    <tr className="bg-white hover:bg-neutral-50 transition-colors group cursor-pointer" onClick={() => toggleClientCollapse(client.clientName)}>
                                        <td className="p-3 flex items-center gap-2 font-bold text-black border-l-4 border-l-black border-r border-neutral-200 sticky left-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            <div key={collapsedClients.includes(client.clientName) ? "plus" : "minus"} className="shrink-0 flex items-center">
                                                {collapsedClients.includes(client.clientName) ? <PlusSquare className="h-3.5 w-3.5 text-black" /> : <MinusSquare className="h-3.5 w-3.5 text-black" />}
                                            </div>
                                            <span className="truncate" title={client.clientName}>{client.clientName}</span>
                                        </td>
                                        {carteiraClientesPivotStats.sortedDates.map((date: string) => {
                                            const total = client.dates[date]?.total || 0;
                                            return (
                                                <td key={date} className="p-1.5 text-center border-r border-neutral-100 transition-colors relative overflow-hidden text-black font-bold group-hover:bg-neutral-50">
                                                    {total > 0 ? total : ""}
                                                </td>
                                            );
                                        })}
                                        <td className="p-3 text-right font-black text-base text-black border-neutral-200 sticky right-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                            {client.total.toLocaleString('pt-BR')}
                                        </td>
                                    </tr>
                                    {!collapsedClients.includes(client.clientName) && client.sortedClientes.map((clienteNode: any, idx: number) => (
                                        <tr key={`${client.clientName}-${clienteNode.name}`} className={cn("bg-neutral-50/30 hover:bg-neutral-50/80 transition-colors", idx === client.sortedClientes.length - 1 ? "border-b-2 border-b-neutral-200" : "")}>
                                            <td className="p-3 pl-10 text-[10px] font-bold text-neutral-600 truncate border-r border-neutral-200 sticky left-0 z-10 bg-neutral-50/90 shadow-[2px_0_5px_rgba(0,0,0,0.02)]" title={clienteNode.name}>
                                                {clienteNode.name}
                                            </td>
                                            {carteiraClientesPivotStats.sortedDates.map((date: string) => {
                                                const total = clienteNode.dates[date]?.total || 0;
                                                return (
                                                    <td key={date} className="p-1.5 text-center border-r border-neutral-100/50 text-neutral-500 font-bold">
                                                        {total > 0 ? total : ""}
                                                    </td>
                                                );
                                            })}
                                            <td className="p-3 text-right font-black text-sm text-neutral-600 border-neutral-200 sticky right-0 z-10 bg-neutral-50/90 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                                {clienteNode.total.toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-black text-white font-bold border-t-2 border-black z-20">
                            <tr>
                                <td className="p-3 uppercase tracking-widest text-left font-serif sticky left-0 bg-black z-30 shadow-[2px_0_5px_rgb(0,0,0)]">Total Geral</td>
                                {carteiraClientesPivotStats.sortedDates.map((date: string) => {
                                    const totalCol = carteiraClientesPivotStats.sortedClients.reduce((acc: number, client: any) => acc + (client.dates[date]?.total || 0), 0);
                                    return <td key={date} className="p-3 text-center font-mono text-sm">{totalCol > 0 ? totalCol.toLocaleString('pt-BR') : ''}</td>
                                })}
                                <td className="p-3 text-right font-mono text-sm sticky right-0 bg-black z-30 shadow-[-2px_0_5px_rgb(0,0,0)]">{carteiraClientesPivotStats.totalGeral.toLocaleString('pt-BR')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

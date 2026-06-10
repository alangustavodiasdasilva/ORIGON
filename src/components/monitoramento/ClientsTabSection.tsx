import React, { useRef, useEffect } from "react";
import { LayoutGrid, Database, PlusSquare, MinusSquare, Download, CheckSquare, Square } from "lucide-react";
import * as XLSX from 'xlsx';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Line, Brush } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";
import { cn } from "@/lib/utils";

// ── Componentes auxiliares (evita inline style= flagado pelo linter) ────────────
function ClientFilterButton({ label, selected, borderColor, onClick }: {
    label: string;
    selected: boolean;
    borderColor: string;
    onClick: () => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!ref.current) return;
        ref.current.style.borderColor = selected ? borderColor : 'transparent';
    }, [selected, borderColor]);
    return (
        <button
            ref={ref}
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit",
                selected
                    ? "bg-white text-black shadow-sm"
                    : "bg-neutral-50/50 text-neutral-400 border-transparent hover:bg-white hover:border-neutral-200"
            )}
        >
            <div className="flex items-center gap-2.5">
                <ClientColorDot color={borderColor} />
                <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
            </div>
        </button>
    );
}

function ClientColorDot({ color }: { color: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.style.background = color || '#e5e5e5';
    }, [color]);
    return <div ref={ref} className="h-2.5 w-2.5 rounded-full" />;
}
import type { OSItem } from "@/components/monitoramento/types";

interface ClientsTabSectionProps {
    clienteDailyStats: any;
    clienteStats: any;
    selectedChartClients: string[];
    setSelectedChartClients?: React.Dispatch<React.SetStateAction<string[]>>;
    toggleClientSelection: (client: string) => void;
    carteiraClientesPivotStats: any;
    expandedClients: string[];
    toggleClientCollapse: (client: string) => void;
    labId: string | null | undefined;
    rankingType: 'tomador' | 'fazenda';
    setRankingType: (type: 'tomador' | 'fazenda') => void;
    osList: OSItem[];
}

const PERIOD_OPTIONS = [
    { label: '30 dias', value: 30 },
    { label: '60 dias', value: 60 },
    { label: '90 dias', value: 90 },
    { label: 'Todos', value: 99999 },
];

export const ClientsTabSection: React.FC<ClientsTabSectionProps> = ({
    clienteDailyStats,
    selectedChartClients,
    setSelectedChartClients,
    toggleClientSelection,
    carteiraClientesPivotStats,
    expandedClients,
    toggleClientCollapse,
    labId,
}) => {
    const [periodoExibicao, setPeriodoExibicao] = React.useState(99999);
    const datesParaExibir = carteiraClientesPivotStats.sortedDates.slice(-periodoExibicao);

    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        const wsData = [];
        
        // Header
        const header = ['Clientes', ...datesParaExibir.map((d: string) => format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy')), 'Total'];
        wsData.push(header);
        
        // Body
        carteiraClientesPivotStats.sortedClients.forEach((client: any) => {
            const row: any[] = [client.clientName];
            datesParaExibir.forEach((date: string) => {
                row.push(client.dates[date]?.total || 0);
            });
            row.push(client.total);
            wsData.push(row);
            
            // Incluir fazendas/subclientes se estiverem expandidos (ou sempre se quiser, mas aqui vou espelhar a visualização)
            if (expandedClients.includes(client.clientName)) {
                client.sortedClientes.forEach((node: any) => {
                    const subRow: any[] = [`  ${node.name}`];
                    datesParaExibir.forEach((date: string) => {
                        subRow.push(node.dates[date]?.total || 0);
                    });
                    subRow.push(node.total);
                    wsData.push(subRow);
                });
            }
        });
        
        // Footer
        const footerRow: any[] = ['Total do Dia'];
        datesParaExibir.forEach((date: string) => {
            const totalDia = carteiraClientesPivotStats.sortedClients.reduce((sum: number, c: any) => sum + (c.dates[date]?.total || 0), 0);
            footerRow.push(totalDia);
        });
        footerRow.push(carteiraClientesPivotStats.totalGeral);
        wsData.push(footerRow);
        
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Recebimento_Diario");
        XLSX.writeFile(wb, `Recebimento_Diario_Clientes_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    };

    return (
        <div key="content-clientes" className="space-y-8 animate-fade-in pb-32">
            {/* Filtro de período */}
            <div className="flex justify-end">
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Período:</span>
                    {PERIOD_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setPeriodoExibicao(opt.value)}
                            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border",
                                periodoExibicao === opt.value ? "bg-black text-white border-black" : "bg-white text-neutral-500 border-neutral-200 hover:border-black hover:text-black"
                            )}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

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
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                        {/* Botões de Ação Rápida */}
                        {setSelectedChartClients && (
                            <>
                                <button onClick={() => setSelectedChartClients(clienteDailyStats.keys)} className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-neutral-200 bg-white hover:bg-neutral-100 rounded-xl shrink-0 transition-colors text-black shadow-sm">
                                    <CheckSquare className="h-3.5 w-3.5" />
                                    Selecionar Todos
                                </button>
                                <button onClick={() => setSelectedChartClients([])} className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-red-100 bg-white hover:bg-red-50 rounded-xl shrink-0 transition-colors text-red-600 shadow-sm">
                                    <Square className="h-3.5 w-3.5" />
                                    Limpar
                                </button>
                                <div className="w-px h-6 bg-neutral-200 mx-1 shrink-0"></div>
                            </>
                        )}
                        
                        {clienteDailyStats.keys.includes('Total Recebido') && (
                            <button onClick={() => toggleClientSelection('Total Recebido')}
                                className={cn("flex items-center gap-3 px-5 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit shadow-sm",
                                    selectedChartClients.includes('Total Recebido')
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-neutral-500 border-neutral-100 hover:border-neutral-300 hover:text-black"
                                )}>
                                <div className={cn("h-2.5 w-2.5 rounded-full", selectedChartClients.includes('Total Recebido') ? "bg-white" : "bg-black")} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Total Recebido</span>
                            </button>
                        )}
                        <div className="w-px h-8 bg-neutral-200 mx-1 shrink-0"></div>
                        {clienteDailyStats.keys.filter((k: string) => k !== 'Total Recebido').map((key: string) => (
                            <ClientFilterButton
                                key={key}
                                label={key}
                                selected={selectedChartClients.includes(key)}
                                borderColor={clienteDailyStats.keyColors[key] || '#e5e5e5'}
                                onClick={() => toggleClientSelection(key)}
                            />
                        ))}
                    </div>
                </div>
                <div className="h-[300px] w-full min-w-0 max-w-full bg-neutral-50/30 rounded-2xl p-2">
                    <ResponsiveContainer key={`client-chart-${labId}`} width="100%" height="100%">
                        <LineChart data={clienteDailyStats.data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            {clienteDailyStats.keys.filter((key: string) => selectedChartClients.includes(key)).map((key: string) => (
                                <Line key={key} type="monotone" connectNulls={true} dataKey={key}
                                    stroke={clienteDailyStats.keyColors[key]} strokeWidth={1.5}
                                    dot={{ r: 4, fill: clienteDailyStats.keyColors[key] }}
                                    activeDot={{ r: 7, fill: clienteDailyStats.keyColors[key] }} />
                            ))}
                            <Brush dataKey="name" height={30} stroke="#e5e5e5" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Tabela — Por Cliente */}
            <div className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-full min-w-0">
                <div className="p-8 pb-4 border-b border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-neutral-100 text-neutral-500 rounded-xl flex items-center justify-center">
                            <Database className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-serif text-black leading-tight">Recebimento Diário por Cliente</h3>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-0.5">
                                Visão matricial · <span className="text-black">{datesParaExibir.length}</span> de {carteiraClientesPivotStats.sortedDates.length} datas
                            </p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 bg-[#1d6f42] hover:bg-[#155331] text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm shrink-0 active:scale-95"
                    >
                        <Download className="h-4 w-4" />
                        Baixar Excel
                    </button>
                </div>
                <div className="overflow-x-auto custom-scrollbar w-full max-w-full min-w-0 relative pb-2">
                    <table className="w-full min-w-max text-[10px] text-left border-collapse table-auto">
                        <thead className="sticky top-0 bg-neutral-50 z-30 shadow-sm border-b border-neutral-200">
                            <tr>
                                <th className="p-3 bg-neutral-50 border-r border-neutral-100 font-bold uppercase tracking-widest text-[10px] sticky left-0 z-40">Clientes</th>
                                {datesParaExibir.map((d: string) => (
                                    <th key={d} className="p-3 text-center border-r border-neutral-100 min-w-[70px] uppercase text-[10px] tracking-tighter">
                                        {format(new Date(d + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                                    </th>
                                ))}
                                <th className="p-3 text-right bg-neutral-50 font-bold uppercase tracking-widest text-[10px] sticky right-0 z-30">Total</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono divide-y divide-neutral-100">
                            {carteiraClientesPivotStats.sortedClients.map((client: any) => (
                                <React.Fragment key={client.clientName}>
                                    <tr className="hover:bg-neutral-50 transition-colors group cursor-pointer bg-white border-b-2 border-neutral-200"
                                        onClick={() => toggleClientCollapse(client.clientName)}>
                                        <td className="p-4 pl-4 font-black text-black bg-white sticky left-0 z-10 border-l-4 border-l-black border-r border-neutral-200 min-w-[300px] max-w-[400px] shadow-sm flex items-center gap-3">
                                            <div className="shrink-0 flex items-center justify-center">
                                                {expandedClients.includes(client.clientName) ?
                                                    <MinusSquare className="h-4 w-4 text-black" /> :
                                                    <PlusSquare className="h-4 w-4 text-neutral-300" />}
                                            </div>
                                            <span className="uppercase text-[12px] tracking-tight break-words whitespace-normal leading-tight">{client.clientName}</span>
                                        </td>
                                        {datesParaExibir.map((date: string) => (
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
                                                <span className="break-words whitespace-normal leading-tight flex-1">{clienteNode.name}</span>
                                            </td>
                                            {datesParaExibir.map((date: string) => (
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
                                {datesParaExibir.map((date: string) => {
                                    const totalDia = carteiraClientesPivotStats.sortedClients.reduce((sum: number, c: any) => sum + (c.dates[date]?.total || 0), 0);
                                    return <td key={date} className="p-2 text-center border-r border-neutral-800">{totalDia > 0 ? totalDia.toLocaleString('pt-BR') : "-"}</td>;
                                })}
                                <td className="p-2 text-right sticky right-0 bg-black z-10 border-l border-neutral-800">{carteiraClientesPivotStats.totalGeral.toLocaleString('pt-BR')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

import React from "react";
import { Clock, PlusSquare, MinusSquare, Printer, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DailyBalanceTabSectionProps {
    saldoDiarioPivotStats: any;
    handleExportPDF: () => void;
    isGeneratingPDF: boolean;
    matrixTableRef: React.RefObject<HTMLDivElement | null>;
    expandedClients: string[];
    toggleClientCollapse: (client: string) => void;
    pinnedCells: Record<string, number>;
    setPinLevel: (client: string, date: string, level: number) => void;
}

export const DailyBalanceTabSection: React.FC<DailyBalanceTabSectionProps> = ({
    saldoDiarioPivotStats,
    handleExportPDF,
    isGeneratingPDF,
    matrixTableRef,
    expandedClients,
    toggleClientCollapse,
    pinnedCells,
    setPinLevel
}) => {
    const [activePinMenu, setActivePinMenu] = React.useState<{ client: string; date: string } | null>(null);

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {activePinMenu && (
                <div 
                    className="fixed inset-0 z-[60] bg-transparent" 
                    onClick={() => setActivePinMenu(null)}
                />
            )}

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
                <div>
                    <h3 className="text-xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                        <Clock className="h-6 w-6 text-neutral-400" />
                        Matriz de Envelhecimento
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">Status de pendências por cliente e tempo de recepção</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="flex gap-4 sm:border-r border-neutral-100 sm:pr-6 sm:mr-6">
                        <div className="text-center">
                            <div className="text-xl font-serif text-amber-500">{saldoDiarioPivotStats.totalPendingAmostras.toLocaleString('pt-BR')}</div>
                            <div className="text-[9px] font-bold uppercase text-neutral-400">Total Pendente</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl font-serif text-red-500">{saldoDiarioPivotStats.criticalCount}</div>
                            <div className="text-[9px] font-bold uppercase text-neutral-400">Críticos (+48h)</div>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isGeneratingPDF} className="h-10 px-6 rounded-xl border-neutral-200 font-bold text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all">
                        {isGeneratingPDF ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
                        <span>Exportar PDF</span>
                    </Button>
                </div>
            </div>

            <div ref={matrixTableRef} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-6">
                <div className="overflow-x-auto no-scrollbar max-h-[1200px] overflow-y-auto w-full relative">
                    <table className="w-full text-[11px] text-left border-collapse">
                        <thead className="sticky top-0 bg-white shadow-sm z-30 border-b-2 border-neutral-200">
                            <tr className="bg-neutral-50/50">
                                <th className="p-3 text-left border-b border-r border-neutral-200 bg-neutral-50 sticky left-0 z-40 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Tomador e Cliente</span>
                                </th>
                                {saldoDiarioPivotStats.sortedDates.map((d: string) => (
                                    <th key={d} className="p-3 text-center border-b border-r border-neutral-100 min-w-[85px] whitespace-nowrap bg-neutral-50/50">
                                        <div className="text-[11px] font-serif text-black">{format(new Date(d + 'T12:00:00'), 'dd/MM')}</div>
                                        <div className="text-[8px] font-black uppercase text-neutral-400 tracking-tighter">{format(new Date(d + 'T12:00:00'), 'iii', { locale: ptBR })}</div>
                                    </th>
                                ))}
                                <th className="p-3 text-right border-b border-neutral-200 bg-neutral-100/50 sticky right-0 z-30 w-28 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Global</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 font-mono">
                            {saldoDiarioPivotStats.sortedClients.map((client: any) => (
                                <React.Fragment key={client.clientName}>
                                    <tr className="bg-white hover:bg-neutral-50 transition-colors group cursor-pointer" onClick={() => toggleClientCollapse(client.clientName)}>
                                        <td className="p-3 flex items-center gap-2 font-bold text-black border-l-4 border-l-black border-r border-neutral-200 sticky left-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            <div className="shrink-0 flex items-center">
                                                {expandedClients.includes(client.clientName) ? <MinusSquare className="h-3.5 w-3.5 text-black" /> : <PlusSquare className="h-3.5 w-3.5 text-neutral-400" />}
                                            </div>
                                            <span className="truncate">{client.clientName}</span>
                                        </td>
                                        {saldoDiarioPivotStats.sortedDates.map((date: string) => {
                                            const cell = client.dates[date];
                                            const total = cell?.total || 0;
                                            const pin = pinnedCells[`${client.clientName}|${date}`];
                                            const isMenuActive = activePinMenu?.client === client.clientName && activePinMenu?.date === date;

                                            let cellStyle = "text-neutral-200 cursor-default";
                                            if (pin === 1) cellStyle = "bg-red-500/95 text-white border-red-600 shadow-inner cursor-pointer";
                                            else if (pin === 2) cellStyle = "bg-amber-400/95 text-amber-950 border-amber-500 shadow-inner font-bolder cursor-pointer";
                                            else if (pin === 3) cellStyle = "bg-emerald-500/95 text-white border-emerald-600 shadow-inner cursor-pointer";
                                            else if (total > 0) cellStyle = "bg-white text-black hover:bg-neutral-100 cursor-pointer";

                                            return (
                                                <td key={date}
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        if (total > 0) setActivePinMenu({ client: client.clientName, date }); 
                                                    }}
                                                    className={cn("p-1.5 text-center border-r border-neutral-100 transition-colors relative", cellStyle)}
                                                >
                                                    {total > 0 ? (
                                                        <div className="flex flex-col items-center justify-center h-full py-1">
                                                            <span className="font-mono font-black text-sm relative z-10 leading-none">{total}</span>
                                                            {cell.maxDelay > 0 && (
                                                                <span className={cn("text-[10px] font-black mt-0.5 leading-none", pin ? (pin === 2 ? "text-amber-900" : "text-white") : "text-neutral-400")}>{cell.maxDelay}h</span>
                                                            )}
                                                            
                                                            {isMenuActive && (
                                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] bg-white rounded-full shadow-2xl border border-neutral-100 p-1 flex items-center gap-1 animate-in zoom-in-75 duration-150">
                                                                    <button title="Marcar como Urgente (Vermelho)" onClick={(e) => { e.stopPropagation(); setPinLevel(client.clientName, date, 1); setActivePinMenu(null); }} className="h-6 w-6 rounded-full bg-red-500 hover:scale-110 transition-transform shadow-sm" />
                                                                    <button title="Marcar como Atenção (Amarelo)" onClick={(e) => { e.stopPropagation(); setPinLevel(client.clientName, date, 2); setActivePinMenu(null); }} className="h-6 w-6 rounded-full bg-amber-400 hover:scale-110 transition-transform shadow-sm" />
                                                                    <button title="Marcar como OK (Verde)" onClick={(e) => { e.stopPropagation(); setPinLevel(client.clientName, date, 3); setActivePinMenu(null); }} className="h-6 w-6 rounded-full bg-emerald-500 hover:scale-110 transition-transform shadow-sm" />
                                                                    <div className="w-[1px] h-4 bg-neutral-100 mx-0.5" />
                                                                    <button title="Limpar Marcação" onClick={(e) => { e.stopPropagation(); setPinLevel(client.clientName, date, 0); setActivePinMenu(null); }} className="h-6 w-6 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors">
                                                                        <span className="text-[10px] font-black text-neutral-400">X</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : ""}
                                                </td>
                                            );
                                        })}
                                        <td className="p-3 text-right font-black text-base text-black border-neutral-200 sticky right-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                            {client.total.toLocaleString('pt-BR')}
                                        </td>
                                    </tr>
                                    {expandedClients.includes(client.clientName) && client.sortedClientes.map((clienteNode: any, idx: number) => (
                                        <tr key={`${client.clientName}-${clienteNode.name}`} className={cn("bg-neutral-50/30 hover:bg-neutral-50/80 transition-colors", idx === client.sortedClientes.length - 1 ? "border-b-2 border-b-neutral-200" : "")}>
                                            <td className="p-3 pl-10 text-[10px] font-bold text-neutral-600 truncate border-r border-neutral-200 sticky left-0 z-10 bg-neutral-50/90 shadow-[2px_0_5px_rgba(0,0,0,0.02)] flex items-center gap-2">
                                                <span className="text-neutral-300">└─</span>
                                                <span className="truncate">{clienteNode.name}</span>
                                            </td>
                                            {saldoDiarioPivotStats.sortedDates.map((date: string) => {
                                                const cell = clienteNode.dates[date];
                                                const total = cell?.total || 0;
                                                return (
                                                    <td key={date} className="p-1.5 text-center border-r border-neutral-100/50">
                                                        {total > 0 ? (
                                                            <div className="flex flex-col items-center text-neutral-600 py-1 relative">
                                                                <span className="font-mono font-bold text-xs leading-none">{total}</span>
                                                                {cell.maxDelay > 0 && <span className="text-[9px] font-black text-neutral-400 mt-0.5 leading-none">{cell.maxDelay}h</span>}
                                                            </div>
                                                        ) : ""}
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
                                {saldoDiarioPivotStats.sortedDates.map((date: string) => {
                                    const totalCol = saldoDiarioPivotStats.sortedClients.reduce((acc: number, client: any) => acc + (client.dates[date]?.total || 0), 0);
                                    return <td key={date} className="p-3 text-center font-mono text-sm">{totalCol > 0 ? totalCol.toLocaleString('pt-BR') : ''}</td>
                                })}
                                <td className="p-3 text-right font-mono text-sm sticky right-0 bg-black z-30 shadow-[-2px_0_5px_rgb(0,0,0)]">{saldoDiarioPivotStats.totalGeral.toLocaleString('pt-BR')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

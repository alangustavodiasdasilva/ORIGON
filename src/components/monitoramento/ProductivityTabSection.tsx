import React from "react";
import { BarChart as BarChartIcon, TrendingUp, Calendar, Zap, Layers, Users } from "lucide-react";
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Area } from "recharts";
import { CustomTooltip } from "@/components/monitoramento/CustomTooltip";
import { cn } from "@/lib/utils";
import type { OSItem } from "@/components/monitoramento/types";
import { differenceInHours, format, subDays, startOfDay, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProductivityTabSectionProps {
    osList: OSItem[];
}

function parseSafeDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr || dateStr.trim() === '' || dateStr.trim() === 'null' || dateStr.trim() === '0') return null;
    const str = dateStr.trim();
    if (!isNaN(Number(str)) && Number(str) > 20000 && Number(str) < 70000) return new Date((Number(str) - 25569) * 86400 * 1000);
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    const matchBR = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (matchBR) {
        d = new Date(parseInt(matchBR[3]), parseInt(matchBR[2]) - 1, parseInt(matchBR[1]), matchBR[4] ? parseInt(matchBR[4]) : 0, matchBR[5] ? parseInt(matchBR[5]) : 0, matchBR[6] ? parseInt(matchBR[6]) : 0);
        if (!isNaN(d.getTime())) return d;
    }
    const matchSQL = str.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/);
    if (matchSQL) {
        d = new Date(parseInt(matchSQL[1]), parseInt(matchSQL[2]) - 1, parseInt(matchSQL[3]), matchSQL[4] ? parseInt(matchSQL[4]) : 0, matchSQL[5] ? parseInt(matchSQL[5]) : 0, matchSQL[6] ? parseInt(matchSQL[6]) : 0);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

export const ProductivityTabSection: React.FC<ProductivityTabSectionProps> = ({ osList }) => {
    const stats = React.useMemo(() => {
        let maxFinTime = 0;
        osList.forEach(os => {
            const d = parseSafeDate(os.data_finalizacao);
            if (d && d.getTime() > maxFinTime) maxFinTime = d.getTime();
        });

        const now = maxFinTime > 0 ? new Date(maxFinTime) : new Date();
        const startOfToday = startOfDay(now);
        const startOfThisWeek = subDays(now, 7);
        const startOfThisMonth = subDays(now, 30);

        let processadasHoje = 0;
        let processadasSemana = 0;
        let processadasMes = 0;
        let totalHistorico = 0;
        let amostrasPorHoraHj = 0;

        const volumeDiarioMap: Record<string, number> = {};
        const tomadorStats: Record<string, { total: number; clientes: Record<string, number> }> = {};

        osList.forEach(os => {
            const hasFin = Boolean(os.data_finalizacao && String(os.data_finalizacao).trim() !== '' && String(os.data_finalizacao).trim() !== 'null' && String(os.data_finalizacao).trim() !== '0');
            if (!hasFin) return;

            try {
                const finD = new Date(os.data_finalizacao!);
                if (isNaN(finD.getTime())) return;

                const am = os.total_amostras || 0;
                totalHistorico += am;

                if (isAfter(finD, startOfToday)) {
                    processadasHoje += am;
                }
                if (isAfter(finD, startOfThisWeek)) {
                    processadasSemana += am;
                }
                if (isAfter(finD, startOfThisMonth)) {
                    processadasMes += am;
                }

                // Sazonalidade (últimos 30 dias)
                if (isAfter(finD, startOfThisMonth)) {
                    const k = format(finD, 'yyyy-MM-dd');
                    volumeDiarioMap[k] = (volumeDiarioMap[k] || 0) + am;
                }

                // Relatório por cliente/tomador (todo o histórico ou podemos focar no mês)
                // Vamos focar nos últimos 90 dias para ter relevância
                if (isAfter(finD, subDays(now, 90))) {
                    const t = os.tomador || os.cliente || 'NÃO INFORMADO';
                    const c = os.cliente || 'NÃO INFORMADO';

                    if (!tomadorStats[t]) tomadorStats[t] = { total: 0, clientes: {} };
                    tomadorStats[t].total += am;
                    tomadorStats[t].clientes[c] = (tomadorStats[t].clientes[c] || 0) + am;
                }

            } catch { }
        });

        const hourOfDay = now.getHours();
        amostrasPorHoraHj = hourOfDay > 0 ? processadasHoje / hourOfDay : processadasHoje;

        const sortedDays = Object.keys(volumeDiarioMap).sort();
        const chartData = sortedDays.map(d => ({
            name: format(new Date(d + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
            'Amostras Processadas': volumeDiarioMap[d]
        }));

        const sortedTomadores = Object.entries(tomadorStats)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([t, val]) => ({
                name: t,
                total: val.total,
                clientes: Object.entries(val.clientes).sort(([, a], [, b]) => b - a)
            }));

        return {
            processadasHoje,
            processadasSemana,
            processadasMes,
            totalHistorico,
            amostrasPorHoraHj,
            chartData,
            sortedTomadores
        };
    }, [osList]);

    return (
        <div className="w-full animate-in fade-in duration-300 space-y-6 pb-20">
            {/* KPI Hero Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-gradient-to-br from-indigo-900 to-black text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 opacity-20">
                        <Zap className="h-64 w-64 text-indigo-400" />
                    </div>
                    <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <TrendingUp className="h-5 w-5 text-indigo-400" />
                                <h2 className="text-2xl font-serif">Produtividade Hoje</h2>
                            </div>
                            <div className="flex items-end gap-3">
                                <span className="text-7xl font-black font-mono tracking-tighter text-white">
                                    {stats.processadasHoje.toLocaleString('pt-BR')}
                                </span>
                                <span className="text-xl text-indigo-300 font-bold mb-2 uppercase tracking-widest">amostras</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6 mt-auto">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-1">Ritmo Atual</p>
                                <div className="text-2xl font-mono font-bold text-white flex items-end gap-1">
                                    {stats.amostrasPorHoraHj.toFixed(0)} <span className="text-sm font-normal text-indigo-200 mb-1">/ hora</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-1">Processadas na Semana</p>
                                <div className="text-2xl font-mono font-bold text-white">
                                    {stats.processadasSemana.toLocaleString('pt-BR')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-widest text-black">Mês Atual</h3>
                                <p className="text-xs text-neutral-400 font-bold">Últimos 30 dias</p>
                            </div>
                        </div>
                        <div className="text-5xl font-serif text-black font-black">
                            {stats.processadasMes.toLocaleString('pt-BR')}
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-2">amostras processadas</p>
                    </div>

                    <div className="mt-8 pt-6 border-t border-neutral-100">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Total Histórico</span>
                            <span className="text-sm font-black text-black">{stats.totalHistorico.toLocaleString('pt-BR')}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Gráfico de Sazonalidade / Ritmo Produtivo */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm">
                <div className="mb-8">
                    <h3 className="text-xl font-serif text-black flex items-center gap-2 mb-1">
                        <BarChartIcon className="h-5 w-5 text-indigo-600" />
                        Sazonalidade e Ritmo Produtivo
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        Volume processado diariamente nos últimos 30 dias
                    </p>
                </div>
                
                {stats.chartData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-neutral-400 text-sm font-medium">
                        Nenhum dado de produtividade no último mês.
                    </div>
                ) : (
                    <div className="h-[350px] w-full bg-neutral-50/50 rounded-2xl p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
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
                                <Area 
                                    type="monotone" 
                                    dataKey="Amostras Processadas" 
                                    stroke="#4f46e5" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorProd)" 
                                    activeDot={{ r: 6, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Relatório por Cliente / Tomador */}
            <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-neutral-100 flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-serif text-black flex items-center gap-2 mb-1">
                            <Layers className="h-5 w-5 text-emerald-600" />
                            Relatório de Produtividade por Origem
                        </h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                            Cruzamento: Tomador / Cliente (Últimos 90 dias)
                        </p>
                    </div>
                    <div className="bg-neutral-100 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500">
                        {stats.sortedTomadores.length} Origens
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50">
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">Tomador (Origem Principal)</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">Sub-Clientes Vinculados</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100 text-right">Volume Processado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {stats.sortedTomadores.slice(0, 50).map((tomador, idx) => (
                                <tr key={tomador.name + idx} className="hover:bg-neutral-50 transition-colors group">
                                    <td className="p-4 align-top w-[35%] border-l-4 border-l-transparent group-hover:border-l-emerald-500 transition-all">
                                        <div className="font-bold text-sm text-neutral-900 leading-tight">
                                            {tomador.name}
                                        </div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mt-2 flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {tomador.clientes.length} cliente(s)
                                        </div>
                                    </td>
                                    <td className="p-4 align-top">
                                        <div className="space-y-2">
                                            {tomador.clientes.slice(0, 5).map(([cli, am]) => (
                                                <div key={cli} className="flex items-center justify-between bg-white border border-neutral-100 p-2 rounded-lg shadow-sm">
                                                    <span className="text-xs font-medium text-neutral-700 truncate max-w-[200px] sm:max-w-xs">{cli}</span>
                                                    <span className="text-[10px] font-black bg-neutral-100 px-2 py-1 rounded-md text-neutral-600">{am.toLocaleString('pt-BR')}</span>
                                                </div>
                                            ))}
                                            {tomador.clientes.length > 5 && (
                                                <div className="text-[10px] font-bold text-neutral-400 pl-2">
                                                    + {tomador.clientes.length - 5} outros clientes...
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 align-top text-right">
                                        <div className="text-xl font-serif font-black text-emerald-600 bg-emerald-50 inline-block px-4 py-2 rounded-xl border border-emerald-100">
                                            {tomador.total.toLocaleString('pt-BR')}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {stats.sortedTomadores.length > 50 && (
                        <div className="p-4 text-center text-xs font-bold text-neutral-500 bg-neutral-50 border-t border-neutral-100">
                            Mostrando top 50 origens.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

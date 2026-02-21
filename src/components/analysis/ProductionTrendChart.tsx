import { useEffect, useMemo, useState } from "react";
import * as Lucide from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export const formatName = (name: string) => {
    return name.replace(/Linha\/Mq/gi, "MAQ").replace(/LINHA\/MQ/gi, "MAQ");
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur-sm border border-neutral-200 p-4 shadow-2xl rounded-xl animate-in fade-in zoom-in duration-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 border-b border-neutral-100 pb-1">{label}</p>
                <div className="space-y-1.5">
                    {payload.map((entry: any, index: number) => {
                        const hashId = `hl-${Math.random().toString(36).substr(2, 6)}`;
                        return (
                            <div key={index} className="flex items-center justify-between gap-8">
                                <div className="flex items-center gap-2">
                                    <style>{`.${hashId} { background-color: ${entry.stroke || entry.color}; }`}</style>
                                    <span className={`h-2 w-2 rounded-full shadow-sm ${hashId}`} />
                                    <span className="text-[11px] font-medium text-neutral-600 uppercase pt-0.5">{entry.name}</span>
                                </div>
                                <span className="text-[11px] font-mono font-bold text-black">{Number(entry.value).toLocaleString('pt-BR')}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

interface ProductionData {
    id?: string;
    data_producao: string;
    turno: string;
    peso: number;
    produto?: string;
    offset_peso?: number;
}

interface ProductionTrendChartProps {
    data: ProductionData[];
}

interface SHIFT_CONFIG {
    hex: string;
    bg: string;
    text: string;
}

const SHIFT_COLORS_CONFIG: Record<string, SHIFT_CONFIG> = {
    "TURNO 1": { hex: "#1d4ed8", bg: "bg-blue-700", text: "text-blue-700" },
    "TURNO 2": { hex: "#047857", bg: "bg-emerald-700", text: "text-emerald-700" },
    "TURNO 3": { hex: "#b45309", bg: "bg-amber-700", text: "text-amber-700" },
    "GERAL": { hex: "#4b5563", bg: "bg-gray-600", text: "text-gray-600" },
    "TOTAL DIA": { hex: "#000000", bg: "bg-black", text: "text-black" }
};

const MACHINE_COLORS_CONFIG: SHIFT_CONFIG[] = [
    { hex: "#dc2626", bg: "bg-red-600", text: "text-red-600" },
    { hex: "#ea580c", bg: "bg-orange-600", text: "text-orange-600" },
    { hex: "#ca8a04", bg: "bg-yellow-600", text: "text-yellow-600" },
    { hex: "#65a30d", bg: "bg-lime-600", text: "text-lime-600" },
    { hex: "#0d9488", bg: "bg-teal-600", text: "text-teal-600" },
    { hex: "#0891b2", bg: "bg-cyan-600", text: "text-cyan-600" },
    { hex: "#4f46e5", bg: "bg-indigo-600", text: "text-indigo-600" },
    { hex: "#c026d3", bg: "bg-fuchsia-600", text: "text-fuchsia-600" },
    { hex: "#e11d48", bg: "bg-rose-600", text: "text-rose-600" },
    { hex: "#7c3aed", bg: "bg-violet-600", text: "text-violet-600" }
];

interface ChartPoint {
    date: string;
    val: number;
    id: string;
    type: string;
}

export default function ProductionTrendChart({ data }: ProductionTrendChartProps) {
    const { currentLab, user } = useAuth();
    const labId = currentLab?.id || user?.lab_id;

    type ViewMode = 'general' | 'detailed' | 'machine_comparison' | 'compare_machines_total';
    const [viewMode, setViewMode] = useState<ViewMode>('general');
    const [selectedShift, setSelectedShift] = useState<string>("TURNO 1");
    const [selectedMachine, setSelectedMachine] = useState<string>("");

    const [dateStart, setDateStart] = useState<string>('');
    const [dateEnd, setDateEnd] = useState<string>('');

    const [targetValue, setTargetValue] = useState<number | null>(null);
    const [isSavingTarget, setIsSavingTarget] = useState(false);
    const [showTargetLine, setShowTargetLine] = useState(false);
    const [showMovingAverage, setShowMovingAverage] = useState(false);
    const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');

    useEffect(() => {
        const loadTarget = async () => {
            if (!labId) return;
            const { data: config } = await supabase
                .from('operacao_producao_config')
                .select('meta_producao')
                .eq('lab_id', labId)
                .maybeSingle();

            if (config?.meta_producao) {
                setTargetValue(config.meta_producao);
                setShowTargetLine(true);
            }
        };
        loadTarget();
    }, [labId]);

    const saveTargetToDB = async (val: number) => {
        if (!labId) return;
        setIsSavingTarget(true);
        try {
            await supabase
                .from('operacao_producao_config')
                .upsert({
                    lab_id: labId,
                    meta_producao: val,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'lab_id' });
        } catch (e) {
            console.error("Erro ao salvar meta:", e);
        } finally {
            setIsSavingTarget(false);
        }
    };



    const availableShifts = useMemo(() => Array.from(new Set(data.map(d => d.turno))).sort(), [data]);
    const availableMachines = useMemo(() => {
        const productSums: Record<string, number> = {};
        data.forEach(d => {
            const name = d.produto || "Desconhecido";
            productSums[name] = (productSums[name] || 0) + (d.peso || 0);
        });
        return Array.from(new Set(data.map(d => d.produto || "Desconhecido")))
            .filter(m => productSums[m] > 0)
            .sort();
    }, [data]);

    useEffect(() => {
        if (!selectedMachine && availableMachines.length > 0) {
            setSelectedMachine(availableMachines[0]);
        }
    }, [availableMachines, selectedMachine]);

    const filteredData = useMemo(() => {
        if (data.length === 0) return [];
        if (!dateStart || !dateEnd) return data;

        const start = new Date(dateStart).setHours(0, 0, 0, 0);
        const end = new Date(dateEnd).setHours(23, 59, 59, 999);

        return data.filter(d => {
            const dTime = new Date(d.data_producao).getTime();
            return dTime >= start && dTime <= end;
        }).sort((a, b) => new Date(a.data_producao).getTime() - new Date(b.data_producao).getTime());
    }, [data, dateStart, dateEnd]);

    const kpis = useMemo(() => {
        if (filteredData.length === 0) return { total: 0, avg: 0, peak: 0, peakDate: '-' };
        const dayMap = new Map<string, number>();
        filteredData.forEach(d => {
            const current = dayMap.get(d.data_producao) || 0;
            dayMap.set(d.data_producao, current + d.peso);
        });
        const dailyValues = Array.from(dayMap.values());
        const total = dailyValues.reduce((a, b) => a + b, 0);
        const avg = total / (dailyValues.length || 1);
        const peak = Math.max(...dailyValues);
        const peakEntry = Array.from(dayMap.entries()).find(([, val]) => val === peak);
        const peakDate = peakEntry ? peakEntry[0].split('-').reverse().slice(0, 2).join('/') : '-';
        return { total, avg, peak, peakDate };
    }, [filteredData]);

    const sortedDataResult = useMemo(() => {
        const seriesMap = new Map<string, ChartPoint[]>();
        if (viewMode === 'general') {
            availableShifts.forEach(t => seriesMap.set(t, []));
            seriesMap.set("TOTAL DIA", []);
            const aggregatedMap = new Map<string, Record<string, number>>();
            filteredData.forEach(d => {
                const date = new Date(d.data_producao);
                let key = d.data_producao;
                if (granularity === 'week') {
                    const day = date.getDay() || 7;
                    if (day !== 1) date.setHours(-24 * (day - 1));
                    key = date.toISOString().split('T')[0];
                } else if (granularity === 'month') {
                    key = d.data_producao.substring(0, 7) + '-01';
                }
                if (!aggregatedMap.has(key)) aggregatedMap.set(key, {});
                const periodData = aggregatedMap.get(key)!;
                periodData[d.turno] = (periodData[d.turno] || 0) + d.peso;
                periodData['TOTAL DIA'] = (periodData['TOTAL DIA'] || 0) + d.peso;
            });
            const sortedKeys = Array.from(aggregatedMap.keys()).sort();
            sortedKeys.forEach(dateKey => {
                const values = aggregatedMap.get(dateKey)!;
                availableShifts.forEach(turno => {
                    if (values[turno] > 0) {
                        seriesMap.get(turno)?.push({ date: dateKey, val: values[turno], id: `${dateKey}-${turno}`, type: turno });
                    }
                });
                if (values['TOTAL DIA'] > 0) {
                    seriesMap.get("TOTAL DIA")?.push({ date: dateKey, val: values['TOTAL DIA'], id: `${dateKey}-TOTAL`, type: "TOTAL DIA" });
                }
            });
            return { uniqueDates: sortedKeys, series: seriesMap };
        } else if (viewMode === 'detailed') {
            const shiftData = filteredData.filter(d => d.turno === selectedShift);
            availableMachines.forEach(m => seriesMap.set(m, []));
            const aggregatedMap = new Map<string, Record<string, number>>();
            shiftData.forEach(d => {
                const date = new Date(d.data_producao);
                let key = d.data_producao;
                if (granularity === 'week') {
                    const day = date.getDay() || 7;
                    if (day !== 1) date.setHours(-24 * (day - 1));
                    key = date.toISOString().split('T')[0];
                } else if (granularity === 'month') {
                    key = d.data_producao.substring(0, 7) + '-01';
                }
                if (!aggregatedMap.has(key)) aggregatedMap.set(key, {});
                const periodData = aggregatedMap.get(key)!;
                if (d.produto) periodData[d.produto] = (periodData[d.produto] || 0) + (d.offset_peso ?? d.peso);
                else periodData['???'] = (periodData['???'] || 0) + d.peso;
            });
            const sortedKeys = Array.from(aggregatedMap.keys()).sort();
            sortedKeys.forEach(dateKey => {
                const values = aggregatedMap.get(dateKey)!;
                availableMachines.forEach(mq => {
                    if (values[mq] > 0) seriesMap.get(mq)?.push({ date: dateKey, val: values[mq], id: `${dateKey}-${mq}`, type: mq });
                });
            });
            return { uniqueDates: sortedKeys, series: seriesMap };
        } else if (viewMode === 'machine_comparison') {
            const machineData = filteredData.filter(d => d.produto === selectedMachine);
            availableShifts.forEach(t => seriesMap.set(t, []));
            const aggregatedMap = new Map<string, Record<string, number>>();
            machineData.forEach(d => {
                const date = new Date(d.data_producao);
                let key = d.data_producao;
                if (granularity === 'week') {
                    const day = date.getDay() || 7;
                    if (day !== 1) date.setHours(-24 * (day - 1));
                    key = date.toISOString().split('T')[0];
                } else if (granularity === 'month') {
                    key = d.data_producao.substring(0, 7) + '-01';
                }
                if (!aggregatedMap.has(key)) aggregatedMap.set(key, {});
                const periodData = aggregatedMap.get(key)!;
                periodData[d.turno] = (periodData[d.turno] || 0) + d.peso;
            });
            const sortedKeys = Array.from(aggregatedMap.keys()).sort();
            sortedKeys.forEach(dateKey => {
                const values = aggregatedMap.get(dateKey)!;
                availableShifts.forEach(turno => {
                    const val = values[turno] || 0;
                    if (val > 0) seriesMap.get(turno)?.push({ date: dateKey, val, id: `${dateKey}-${turno}-${selectedMachine}`, type: turno });
                });
            });
            return { uniqueDates: sortedKeys, series: seriesMap };
        } else {
            availableMachines.forEach(m => seriesMap.set(m, []));
            const aggregatedMap = new Map<string, Record<string, number>>();
            filteredData.forEach(d => {
                const date = new Date(d.data_producao);
                let key = d.data_producao;
                if (granularity === 'week') {
                    const day = date.getDay() || 7;
                    if (day !== 1) date.setHours(-24 * (day - 1));
                    key = date.toISOString().split('T')[0];
                } else if (granularity === 'month') {
                    key = d.data_producao.substring(0, 7) + '-01';
                }
                if (!aggregatedMap.has(key)) aggregatedMap.set(key, {});
                const periodData = aggregatedMap.get(key)!;
                if (d.produto) periodData[d.produto] = (periodData[d.produto] || 0) + d.peso;
            });
            const sortedKeys = Array.from(aggregatedMap.keys()).sort();
            sortedKeys.forEach(dateKey => {
                const values = aggregatedMap.get(dateKey)!;
                availableMachines.forEach(mq => {
                    if (values[mq] > 0) seriesMap.get(mq)?.push({ date: dateKey, val: values[mq], id: `${dateKey}-${mq}-TOTAL`, type: mq });
                });
            });
            return { uniqueDates: sortedKeys, series: seriesMap };
        }
    }, [filteredData, viewMode, selectedShift, selectedMachine, availableShifts, availableMachines, granularity]);

    const rechartsData = useMemo(() => {
        if (!sortedDataResult || sortedDataResult.uniqueDates.length === 0) return [];
        return sortedDataResult.uniqueDates.map(date => {
            const point: any = { date, displayDate: date.split('-').reverse().slice(0, 2).join('/') };
            Array.from(sortedDataResult.series.entries()).forEach(([name, points]) => {
                const found = points.find(p => p.date === date);
                if (found) point[name] = found.val;
            });
            return point;
        });
    }, [sortedDataResult]);

    const seriesConfig = useMemo(() => {
        if (!sortedDataResult) return [];
        return Array.from(sortedDataResult.series.keys()).map(name => {
            let color = "#000000";
            if (name === "TOTAL DIA") {
                color = SHIFT_COLORS_CONFIG["TOTAL DIA"].hex;
            } else if (SHIFT_COLORS_CONFIG[name]) {
                color = SHIFT_COLORS_CONFIG[name].hex;
            } else {
                const machIndex = availableMachines.indexOf(name);
                if (machIndex !== -1) {
                    color = MACHINE_COLORS_CONFIG[machIndex % MACHINE_COLORS_CONFIG.length].hex;
                } else {
                    let hash = 0;
                    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
                    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
                    color = "#" + "00000".substring(0, 6 - c.length) + c;
                }
            }
            return { name, color, isTotal: name === "TOTAL DIA" };
        });
    }, [sortedDataResult, availableMachines]);

    if (!rechartsData || rechartsData.length === 0) return (
        <div className="w-full h-64 flex flex-col items-center justify-center bg-neutral-50 border border-neutral-200 rounded-xl">
            <Lucide.BarChart3 className="h-8 w-8 text-neutral-300 mb-2" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Dados insuficiente para o período</span>
        </div>
    );

    return (
        <div className="w-full bg-white border border-black p-6 animate-fade-in relative flex flex-col gap-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] rounded-xl">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 border-b border-black pb-6">
                <div className="flex items-center gap-4"><div className="p-3 bg-black text-white rounded shrink-0 shadow-lg"><Lucide.TrendingUp className="h-6 w-6" /></div><div><h3 className="text-xl font-serif text-black leading-none mb-1">Análise de Produção</h3><p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{viewMode === 'general' ? 'Visão Geral da Fábrica' : viewMode === 'detailed' ? 'Performance por Máquina' : 'Detalhamento'}</p></div></div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
                    <div className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-center min-w-[100px]"><span className="text-[9px] font-bold text-neutral-400 uppercase block">Total</span><span className="text-lg font-mono font-black text-black leading-none">{kpis.total.toLocaleString('pt-BR')}</span></div>
                    <div className="w-px h-8 bg-neutral-200 hidden md:block" /><div className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-center min-w-[100px]"><span className="text-[9px] font-bold text-neutral-400 uppercase block">Média</span><span className="text-lg font-mono font-black text-emerald-600 leading-none">{Math.round(kpis.avg).toLocaleString('pt-BR')}</span></div>
                    <div className="w-px h-8 bg-neutral-200 hidden md:block" /><div className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-center min-w-[100px]"><span className="text-[9px] font-bold text-neutral-400 uppercase block">Pico ({kpis.peakDate})</span><span className="text-lg font-mono font-black text-blue-600 leading-none">{kpis.peak.toLocaleString('pt-BR')}</span></div>
                </div>
            </div>
            <div className="bg-neutral-50/50 p-2 rounded-lg border border-neutral-100 flex flex-col lg:flex-row items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto overflow-x-auto">
                    <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded p-1.5 shadow-sm"><span className="text-[10px] font-bold text-neutral-500 uppercase">De:</span><input type="date" aria-label="Início" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-bold uppercase" /><span className="text-neutral-300 mx-1">|</span><span className="text-[10px] font-bold text-neutral-500 uppercase">Até:</span><input type="date" aria-label="Fim" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-bold uppercase" /></div>
                    <div className="h-6 w-px bg-neutral-300 hidden sm:block" />
                    <div className="flex items-center bg-white border border-neutral-200 rounded p-1 shadow-sm">{(['day', 'week', 'month'] as const).map(opt => (<button key={opt} onClick={() => setGranularity(opt)} className={cn("px-3 py-1.5 text-[10px] font-bold uppercase rounded transition-all", granularity === opt ? "bg-neutral-800 text-white shadow" : "text-neutral-400 hover:text-black hover:bg-neutral-50")}>{opt === 'day' ? 'Dia' : opt === 'week' ? 'Sem' : 'Mês'}</button>))}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-end w-full lg:w-auto">
                    <button onClick={() => setShowMovingAverage(!showMovingAverage)} className={cn("flex items-center gap-2 px-3 h-9 rounded border transition-all text-[10px] font-bold uppercase tracking-wide", showMovingAverage ? "bg-orange-50 border-orange-200 text-orange-600 shadow-sm" : "bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-600")}><Lucide.Activity className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tendência</span></button>
                    <div className={cn("flex items-center gap-2 px-3 h-9 bg-white border rounded transition-all focus-within:ring-1 focus-within:ring-red-500", showTargetLine ? "border-red-200 shadow-sm" : "border-neutral-200")}><Lucide.Target className={cn("h-3.5 w-3.5", showTargetLine ? "text-red-500" : "text-neutral-300")} /><input type="number" placeholder="Meta" className="w-20 text-[10px] border-none p-0 font-mono focus:ring-0" value={targetValue || ''} onChange={(e) => { const v = Number(e.target.value); setTargetValue(v); setShowTargetLine(true); }} onBlur={() => targetValue && saveTargetToDB(targetValue)} />{isSavingTarget && <span className="text-[10px]">...</span>}</div>
                    <select title="Modo de Exibição" value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} className="h-9 px-3 text-[10px] font-bold uppercase bg-white border border-neutral-200 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-black cursor-pointer"><option value="general">Geral</option><option value="detailed">Por Máquina (Turno)</option><option value="compare_machines_total">Máquinas (Total)</option><option value="machine_comparison">Detalhamento</option></select>
                    {viewMode === 'detailed' && <select title="Turno" value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} className="h-9 px-3 text-[10px] font-bold uppercase bg-white border border-neutral-200 rounded shadow-sm">{availableShifts.map(s => <option key={s} value={s}>{s}</option>)}</select>}
                    {viewMode === 'machine_comparison' && <select title="Máquina" value={selectedMachine} onChange={(e) => setSelectedMachine(e.target.value)} className="h-9 px-3 text-[10px] font-bold uppercase bg-white border border-neutral-200 rounded shadow-sm">{availableMachines.map(m => <option key={m} value={m}>{formatName(m)}</option>)}</select>}
                </div>
            </div>

            <div className="bg-neutral-50/50 border border-neutral-100 rounded-[1.5rem] p-4 h-[420px] w-full mt-2 shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rechartsData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                        <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => Math.round(val).toLocaleString('pt-BR')} />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e5e5', strokeWidth: 2 }} />
                        {showTargetLine && targetValue && (
                            <ReferenceLine y={targetValue} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" label={{ position: 'insideTopLeft', value: 'META', fill: '#ef4444', fontSize: 10, fontWeight: 900 }} />
                        )}
                        {seriesConfig.map((s) => (
                            <Line key={s.name} type="monotone" dataKey={s.name} name={formatName(s.name)} stroke={s.color} strokeWidth={s.isTotal ? 4 : 2.5} dot={{ r: s.isTotal ? 6 : 4, stroke: s.color, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: s.isTotal ? 8 : 6, stroke: '#fff', strokeWidth: 2, fill: s.color }} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-6 pb-2 border-t border-neutral-100">
                {seriesConfig.map((s) => {
                    const hashName = s.name.replace(/[^a-zA-Z0-9]/g, '');
                    return (
                        <div key={s.name} className="flex items-center gap-2">
                            <style>{`.bg-chart-${hashName} { background-color: ${s.color}; }`}</style>
                            <span className={`w-3 h-3 rounded-full shadow-sm bg-chart-${hashName}`} />
                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{formatName(s.name)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

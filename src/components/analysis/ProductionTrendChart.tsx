import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, Activity, BarChart3, Target, CalendarDays, ChevronDown } from "lucide-react";

interface ProductionData {
    id: string;
    data_producao: string; // YYYY-MM-DD
    turno: string;
    peso: number; // Quantidade Produzida
    produto?: string; // "Linha/Mq 1", etc.
}

interface ProductionTrendChartProps {
    data: ProductionData[];
}

// Cores por Turno
// Cores por Turno mais escuras para melhor contraste
const COLORS_MAP: Record<string, string> = {
    "TURNO 1": "#1d4ed8", // Azul Escuro (blue-700)
    "TURNO 2": "#047857", // Verde Escuro (emerald-700)
    "TURNO 3": "#b45309", // Amarelo Escuro (amber-700)
    "GERAL": "#4b5563",   // Cinza (gray-600)
    "TOTAL DIA": "#000000" // Preto Forte
};

// Paleta para Máquinas (Cores mais vibrantes e escuras)
const MACHINE_COLORS = [
    "#dc2626", "#ea580c", "#ca8a04", "#65a30d", "#0d9488",
    "#0891b2", "#4f46e5", "#c026d3", "#e11d48", "#7c3aed"
];

export default function ProductionTrendChart({ data }: ProductionTrendChartProps) {
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [viewMode, setViewMode] = useState<'general' | 'detailed' | 'machine_comparison' | 'compare_machines_total'>('general');
    const [selectedShift, setSelectedShift] = useState<string>("TURNO 1");
    const [selectedMachine, setSelectedMachine] = useState<string>("");

    // Default é 'all' para garantir que os dados de 2025 apareçam em Fevereiro/26
    const [dateStart, setDateStart] = useState<string>('');
    const [dateEnd, setDateEnd] = useState<string>('');

    const [targetValue, setTargetValue] = useState<number>(0);
    const [showTargetLine, setShowTargetLine] = useState(false);
    const [showMovingAverage, setShowMovingAverage] = useState(false);

    // Filtro interativo pela legenda (Novas lógica de isolamento)
    const [selectedSeries, setSelectedSeries] = useState<string[]>([]);

    // Granularidade Temporal
    const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');

    // Helper para formatar nomes (Remove "LINHA/MQ" -> "MAQ")
    const formatName = (name: string) => {
        return name.replace(/Linha\/Mq/gi, "MAQ").replace(/LINHA\/MQ/gi, "MAQ");
    };

    // 1. Listas Únicas
    const availableShifts = useMemo(() => Array.from(new Set(data.map(d => d.turno))).sort(), [data]);
    const availableMachines = useMemo(() => Array.from(new Set(data.map(d => d.produto || "Desconhecido"))).sort(), [data]);

    // Selecionar primeira máquina se não houver seleção
    // Selecionar primeira máquina se não houver seleção
    useEffect(() => {
        if (!selectedMachine && availableMachines.length > 0) {
            setSelectedMachine(availableMachines[0]);
        }
    }, [availableMachines]);

    // 2. Filtrar Dados por Data
    // 2. Filtrar Dados por Data (Relativo ao último dado disponível)
    // 2. Determinar Range Inicial (Últimos 30 dias dos dados disponíveis) e Filtrar
    useEffect(() => {
        if (data.length > 0 && !dateStart && !dateEnd) {
            const sortedAll = [...data].sort((a, b) => new Date(b.data_producao).getTime() - new Date(a.data_producao).getTime());
            const latest = sortedAll[0].data_producao;

            // Calcular 30 dias atrás a partir da última data
            const d = new Date(latest);
            d.setDate(d.getDate() - 30);
            const start = d.toISOString().split('T')[0];

            setDateEnd(latest);
            setDateStart(start);
        }
    }, [data]);

    const filteredData = useMemo(() => {
        if (data.length === 0) return [];
        if (!dateStart || !dateEnd) return data; // Se não tiver range definido, mostra tudo (ou nada, mas melhor tudo para não quebrar)

        const start = new Date(dateStart).setHours(0, 0, 0, 0);
        const end = new Date(dateEnd).setHours(23, 59, 59, 999);

        return data.filter(d => {
            const dTime = new Date(d.data_producao).getTime();
            return dTime >= start && dTime <= end;
        }).sort((a, b) => new Date(a.data_producao).getTime() - new Date(b.data_producao).getTime());
    }, [data, dateStart, dateEnd]);

    // 3. KPIs
    const kpis = useMemo(() => {
        if (filteredData.length === 0) return { total: 0, avg: 0, peak: 0, peakDate: '-' };

        // Agrupar por dia para calcular Média e Pico DIÁRIO
        const dayMap = new Map<string, number>();
        filteredData.forEach(d => {
            const current = dayMap.get(d.data_producao) || 0;
            dayMap.set(d.data_producao, current + d.peso);
        });

        const dailyValues = Array.from(dayMap.values());
        const total = dailyValues.reduce((a, b) => a + b, 0);
        const avg = total / (dailyValues.length || 1);
        const peak = Math.max(...dailyValues);

        // Encontrar data do pico
        const peakEntry = Array.from(dayMap.entries()).find(([_, val]) => val === peak);
        const peakDate = peakEntry ? peakEntry[0].split('-').reverse().slice(0, 2).join('/') : '-';

        return { total, avg, peak, peakDate };
    }, [filteredData]);

    // 4. Calcular Dados Gráfico
    const sortedData = useMemo(() => {


        const seriesMap = new Map<string, { date: string, val: number, id: string, type: string }[]>();

        if (viewMode === 'general') {
            // -- MODO GERAL: Agrupa por Turno + Total Dia --
            availableShifts.forEach(t => seriesMap.set(t, []));
            seriesMap.set("TOTAL DIA", []);

            // Agregação Temporal
            const aggregatedMap = new Map<string, { [key: string]: number }>();

            filteredData.forEach(d => {
                const date = new Date(d.data_producao);
                let key = d.data_producao; // default 'day'

                if (granularity === 'week') {
                    // Get Start of Week (Monday)
                    const day = date.getDay() || 7;
                    if (day !== 1) date.setHours(-24 * (day - 1));
                    key = date.toISOString().split('T')[0];
                } else if (granularity === 'month') {
                    key = d.data_producao.substring(0, 7) + '-01'; // YYYY-MM-01
                }

                if (!aggregatedMap.has(key)) aggregatedMap.set(key, {});
                const periodData = aggregatedMap.get(key)!;

                // Sum by Turno
                periodData[d.turno] = (periodData[d.turno] || 0) + d.peso;
                // Sum Total
                periodData['TOTAL DIA'] = (periodData['TOTAL DIA'] || 0) + d.peso;
            });

            // Update Unique Dates based on keys
            // Re-sort unique dates from the aggregated keys
            const sortedKeys = Array.from(aggregatedMap.keys()).sort();

            // Rebuild Series
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

            // Override uniqueDates for the return
            // Note: We need to update the 'uniqueDates' constant in the outer scope or return it newly calculated
            // The current logic calculates uniqueDates at the top of useMemo. 
            // We should recalculate it here or grouping logic should be specific per viewMode?
            // Actually, the uniqueDates used for X-axis should be these keys.

            return { uniqueDates: sortedKeys, series: seriesMap };

        } else if (viewMode === 'detailed') {
            // -- MODO DETALHADO: Filtra Turno, Quebra por Máquina --
            const shiftData = filteredData.filter(d => d.turno === selectedShift);
            availableMachines.forEach(m => seriesMap.set(m, []));

            const aggregatedMap = new Map<string, { [key: string]: number }>();

            shiftData.forEach(d => {
                const date = new Date(d.data_producao);
                let key = d.data_producao; // default 'day'

                if (granularity === 'week') {
                    const day = date.getDay() || 7;
                    if (day !== 1) date.setHours(-24 * (day - 1));
                    key = date.toISOString().split('T')[0];
                } else if (granularity === 'month') {
                    key = d.data_producao.substring(0, 7) + '-01';
                }

                if (!aggregatedMap.has(key)) aggregatedMap.set(key, {});
                const periodData = aggregatedMap.get(key)!;
                // Sum by Machine
                if (d.produto) {
                    periodData[d.produto] = (periodData[d.produto] || 0) + d.peso;
                }
            });

            const sortedKeys = Array.from(aggregatedMap.keys()).sort();

            sortedKeys.forEach(dateKey => {
                const values = aggregatedMap.get(dateKey)!;
                availableMachines.forEach(mq => {
                    if (values[mq] > 0) {
                        seriesMap.get(mq)?.push({ date: dateKey, val: values[mq], id: `${dateKey}-${mq}`, type: mq });
                    }
                });
            });

            return { uniqueDates: sortedKeys, series: seriesMap };

        } else if (viewMode === 'machine_comparison') {
            // -- MODO COMPARAÇÃO MÁQUINA --
            const machineData = filteredData.filter(d => d.produto === selectedMachine);
            availableShifts.forEach(t => seriesMap.set(t, []));

            const aggregatedMap = new Map<string, { [key: string]: number }>();

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
                    // Show even if 0 if we assume continuity? No, aggregation sums.
                    const val = values[turno] || 0;
                    if (val > 0) {
                        seriesMap.get(turno)?.push({ date: dateKey, val, id: `${dateKey}-${turno}-${selectedMachine}`, type: turno });
                    }
                });
            });

            return { uniqueDates: sortedKeys, series: seriesMap };
        } else if (viewMode === 'compare_machines_total') {
            // -- MODO COMPARAR MÁQUINAS (TOTAL): Soma todos os turnos por máquina --
            availableMachines.forEach(m => seriesMap.set(m, []));

            const aggregatedMap = new Map<string, { [key: string]: number }>();

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
                // Sum by Machine (Global)
                if (d.produto) {
                    periodData[d.produto] = (periodData[d.produto] || 0) + d.peso;
                }
            });

            const sortedKeys = Array.from(aggregatedMap.keys()).sort();

            sortedKeys.forEach(dateKey => {
                const values = aggregatedMap.get(dateKey)!;
                availableMachines.forEach(mq => {
                    const val = values[mq] || 0;
                    if (val > 0) {
                        seriesMap.get(mq)?.push({ date: dateKey, val, id: `${dateKey}-${mq}-TOTAL`, type: mq });
                    }
                });
            });

            return { uniqueDates: sortedKeys, series: seriesMap };
        }

        return { uniqueDates: [], series: seriesMap }; // Fallback
    }, [filteredData, viewMode, selectedShift, selectedMachine, availableShifts, availableMachines, granularity]);

    // Inicializar séries selecionadas
    useEffect(() => {
        const names = Array.from(sortedData.series.keys());
        setSelectedSeries(names);
    }, [sortedData.series]);

    const toggleSeries = (name: string, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            setSelectedSeries(prev =>
                prev.includes(name)
                    ? prev.filter(n => n !== name)
                    : [...prev, name]
            );
        } else {
            if (selectedSeries.length === 1 && selectedSeries[0] === name) {
                setSelectedSeries(Array.from(sortedData.series.keys()));
            } else {
                setSelectedSeries([name]);
            }
        }
    };

    // 5. Layout Calculate
    const chartCalculations = useMemo(() => {
        const uniqueDates = sortedData.uniqueDates;
        if (uniqueDates.length === 0) return null;

        const allValues: number[] = [];
        sortedData.series.forEach((points) => points.forEach(p => allValues.push(p.val)));
        if (showTargetLine && targetValue > 0) allValues.push(targetValue);

        if (allValues.length === 0) return null;

        const maxVal = Math.max(...allValues);

        const margin = maxVal * 0.1 || 10;
        const yMin = 0;
        const yMax = maxVal + margin;
        const yRange = yMax - yMin || 1;

        const width = 1200;
        const height = 500;
        const padding = { left: 60, right: 40, top: 40, bottom: 60 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const stepX = chartWidth / Math.max(uniqueDates.length - 1, 1);

        const dateToX = (dateStr: string) => {
            const index = uniqueDates.indexOf(dateStr);
            return padding.left + (index * stepX);
        };

        const valToY = (val: number) => {
            const safeVal = Math.max(val, 0); // Evitar valores negativos plotando fora
            return padding.top + chartHeight - ((safeVal - yMin) / yRange) * chartHeight;
        };

        const finalSeries = Array.from(sortedData.series.entries())
            .filter(([name]) => selectedSeries.includes(name))
            .map(([name, points], idx) => {
                const chartPoints = points.map(p => ({
                    x: dateToX(p.date),
                    y: valToY(p.val),
                    original: p,
                    date: p.date
                }));

                const path = chartPoints.length > 1
                    ? `M ${chartPoints[0].x},${chartPoints[0].y} ` + chartPoints.slice(1).map(p => `L ${p.x},${p.y}`).join(" ")
                    : null;

                let color = "#000";
                if (viewMode === 'general' || viewMode === 'machine_comparison') {
                    color = COLORS_MAP[name] || "#888";
                } else {
                    // detailed OR compare_machines_total
                    color = MACHINE_COLORS[idx % MACHINE_COLORS.length];
                }

                const isTotal = name === 'TOTAL DIA';

                return { name, color, points: chartPoints, path, isTotal };
            });

        const gridSteps = 6;
        const gridLines = Array.from({ length: gridSteps }).map((_, i) => {
            const val = yMin + (yRange * i) / (gridSteps - 1);
            return { y: valToY(val), val };
        });

        const targetY = showTargetLine && targetValue > 0 ? valToY(targetValue) : null;

        // --- CALCULAR MÉDIA MÓVEL (7 Dias / 7 Pontos de Dados) ---
        let movingAveragePath = null;
        if (showMovingAverage) {
            // Tenta pegar a série principal para calcular a tendência
            // Se for GERAL -> TOTAL DIA
            // Se for DETALHADO -> A primeira máquina
            // Se for COMPARAÇÃO -> O primeiro turno
            const sourceSeries = finalSeries.find(s =>
                s.name === 'TOTAL DIA' ||
                (viewMode !== 'general' && s.points.length > 5)
            );

            if (sourceSeries && sourceSeries.points.length >= 2) {
                const windowSize = 3; // Janela menor para ficar responsivo com poucos dados
                const smaPoints: { x: number, y: number }[] = [];

                for (let i = 0; i < sourceSeries.points.length; i++) {
                    if (i < windowSize - 1) continue;

                    const subset = sourceSeries.points.slice(i - windowSize + 1, i + 1);
                    const avg = subset.reduce((sum, curr) => sum + curr.original.val, 0) / windowSize;

                    smaPoints.push({
                        x: sourceSeries.points[i].x,
                        y: valToY(avg)
                    });
                }

                if (smaPoints.length > 1) {
                    movingAveragePath = `M ${smaPoints[0].x},${smaPoints[0].y} ` + smaPoints.slice(1).map(p => `L ${p.x},${p.y}`).join(" ");
                }
            }
        }

        return { width, height, padding, uniqueDates, dateToX, finalSeries, gridLines, chartHeight, targetY, movingAveragePath };

    }, [sortedData, viewMode, showTargetLine, targetValue, showMovingAverage]);


    if (!chartCalculations) return (
        <div className="w-full h-64 flex flex-col items-center justify-center bg-neutral-50 border border-neutral-200">
            <BarChart3 className="h-8 w-8 text-neutral-300 mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Sem dados no período</span>
        </div>
    );

    const { width, height, finalSeries, gridLines, uniqueDates, dateToX, targetY, movingAveragePath } = chartCalculations;

    // Helper para o Select Nativo Estilizado
    const StyledSelect = ({ value, onChange, options, disabled }: any) => (
        <div className="relative group">
            <select
                title="Selecione uma opção"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={cn(
                    "appearance-none h-8 pl-3 pr-8 text-[10px] font-bold uppercase tracking-wide bg-white border border-neutral-200 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-black cursor-pointer hover:border-black transition-colors disabled:opacity-50",
                    !disabled && "group-hover:border-neutral-400"
                )}
            >
                {options.map((opt: any) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" />
        </div>
    );

    return (
        <div className="w-full bg-white border border-black p-6 animate-fade-in relative flex flex-col gap-6 shadow-[8px_8px_0px_rgba(0,0,0,1)]">

            {/* Header com Título e KPIs */}
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 border-b border-black pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-black text-white rounded shrink-0 shadow-lg">
                        <TrendingUp className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-serif text-black leading-none mb-1">
                            Análise de Produção
                        </h3>
                        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
                            {viewMode === 'general' ? 'Visão Geral da Fábrica' :
                                viewMode === 'detailed' ? 'Performance por Máquina' :
                                    'Detalhamento por Máquina'}
                        </p>
                    </div>
                </div>

                {/* KPIs Cards - Compactos e Alinhados */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
                    <div className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-center min-w-[100px]">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase block">Total</span>
                        <span className="text-lg font-mono font-black text-black leading-none">{kpis.total.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="w-px h-8 bg-neutral-200 hidden md:block" />
                    <div className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-center min-w-[100px]">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase block">Média</span>
                        <span className="text-lg font-mono font-black text-emerald-600 leading-none">{Math.round(kpis.avg).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="w-px h-8 bg-neutral-200 hidden md:block" />
                    <div className="px-4 py-2 bg-neutral-50 border border-neutral-100 rounded-lg text-center min-w-[100px]">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase block">Pico ({kpis.peakDate})</span>
                        <span className="text-lg font-mono font-black text-blue-600 leading-none">{kpis.peak.toLocaleString('pt-BR')}</span>
                    </div>
                </div>
            </div>

            {/* Toolbar de Controles - Unificada */}
            <div className="bg-neutral-50/50 p-2 rounded-lg border border-neutral-100 flex flex-col lg:flex-row items-center justify-between gap-4">

                {/* Grupo 1: Filtros de Tempo */}
                {/* Grupo 1: Filtros de Tempo e Granularidade */}
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto overflow-x-auto">
                    <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded p-1.5 shadow-sm">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase">De:</span>
                        <input
                            type="date"
                            aria-label="Data de Início"
                            value={dateStart}
                            onChange={(e) => setDateStart(e.target.value)}
                            max={dateEnd} // Validar para não ser maior que data fim
                            className="bg-transparent border-none p-0 text-[10px] font-bold uppercase text-black focus:ring-0 cursor-pointer"
                        />
                        <span className="text-neutral-300 mx-1">|</span>
                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Até:</span>
                        <input
                            type="date"
                            aria-label="Data de Fim"
                            value={dateEnd}
                            onChange={(e) => setDateEnd(e.target.value)}
                            min={dateStart} // Validar para não ser menor que data início
                            className="bg-transparent border-none p-0 text-[10px] font-bold uppercase text-black focus:ring-0 cursor-pointer"
                        />
                    </div>

                    <div className="h-6 w-px bg-neutral-300 hidden sm:block" />

                    {/* Granularidade Selector */}
                    <div className="flex items-center bg-white border border-neutral-200 rounded p-1 shadow-sm">
                        {[
                            { id: 'day', label: 'Dia' },
                            { id: 'week', label: 'Sem' },
                            { id: 'month', label: 'Mês' }
                        ].map((opt: any) => (
                            <button
                                key={opt.id}
                                onClick={() => setGranularity(opt.id)}
                                className={cn(
                                    "px-3 py-1.5 text-[10px] font-bold uppercase rounded transition-all",
                                    granularity === opt.id ? "bg-neutral-800 text-white shadow" : "text-neutral-400 hover:text-black hover:bg-neutral-50"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grupo 2: Visualização e Filtros Específicos */}
                <div className="flex flex-wrap items-center gap-3 justify-end w-full lg:w-auto">

                    {/* Toggle Moving Average */}
                    <button
                        onClick={() => setShowMovingAverage(!showMovingAverage)}
                        className={cn(
                            "flex items-center gap-2 px-3 h-9 rounded border transition-all text-[10px] font-bold uppercase tracking-wide",
                            showMovingAverage
                                ? "bg-orange-50 border-orange-200 text-orange-600 shadow-sm"
                                : "bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-600"
                        )}
                    >
                        <Activity className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Tendência</span>
                    </button>

                    <div className="h-6 w-px bg-neutral-300 mx-1 hidden sm:block" />

                    {/* Meta Input */}
                    <div className={cn(
                        "flex items-center gap-2 px-3 h-9 bg-white border rounded transition-all focus-within:ring-1 focus-within:ring-red-500",
                        showTargetLine ? "border-red-200 shadow-sm" : "border-neutral-200"
                    )}>
                        <Target className={cn("h-3.5 w-3.5", showTargetLine ? "text-red-500" : "text-neutral-300")} />
                        <input
                            type="number"
                            placeholder="Definir Meta"
                            className="w-20 text-[10px] border-none p-0 focus:ring-0 font-mono text-black placeholder:text-neutral-300 bg-transparent"
                            value={targetValue || ''}
                            onChange={(e) => {
                                setTargetValue(Number(e.target.value));
                                setShowTargetLine(true);
                            }}
                        />
                    </div>

                    <div className="h-6 w-px bg-neutral-300 mx-1 hidden sm:block" />

                    {/* View Mode Selector */}
                    <StyledSelect
                        value={viewMode}
                        onChange={(val: any) => {
                            setViewMode(val);
                            setActiveSeries(null);
                        }}
                        options={[
                            { value: 'general', label: 'Visão Geral' },
                            { value: 'detailed', label: 'Por Máquina (Turno)' },
                            { value: 'compare_machines_total', label: 'Comparar Máquinas (Total)' },
                            { value: 'machine_comparison', label: 'Detalhamento (Máquina)' }
                        ]}
                    />

                    {/* Conditional Selectors */}
                    {viewMode === 'detailed' && (
                        <StyledSelect
                            value={selectedShift}
                            onChange={setSelectedShift}
                            options={availableShifts.map(s => ({ value: s, label: s }))}
                        />
                    )}

                    {viewMode === 'machine_comparison' && (
                        <StyledSelect
                            value={selectedMachine}
                            onChange={setSelectedMachine}
                            options={availableMachines.map(m => ({ value: m, label: formatName(m) }))}
                        />
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* SVG CHART SPACE */}
                <div className="relative flex-1 aspect-[21/9] bg-neutral-50/30 border border-neutral-100 group">
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                        {/* Target Line */}
                        {targetY && (
                            <g className="animate-in fade-in slide-in-from-right duration-500">
                                <line x1={60} y1={targetY} x2={width - 40} y2={targetY} stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" opacity="0.6" />
                                <rect x={width - 100} y={targetY - 10} width="60" height="20" rx="4" fill="#ef4444" opacity="0.1" />
                                <text x={width - 70} y={targetY + 4} textAnchor="middle" className="fill-red-600 font-bold text-[10px] uppercase tracking-widest">
                                    Meta
                                </text>
                            </g>
                        )}

                        {/* Moving Average Line */}
                        {movingAveragePath && (
                            <path
                                d={movingAveragePath}
                                fill="none"
                                stroke="#f97316" // Orange-500
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="drop-shadow-sm opacity-80"
                            />
                        )}

                        {/* Grid Y */}
                        {gridLines.map((line, i) => (
                            <g key={i}>
                                <line x1={60} y1={line.y} x2={width - 40} y2={line.y} stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 4" />
                                <text x={50} y={line.y + 4} textAnchor="end" className="fill-neutral-400 font-mono text-[10px] font-bold">
                                    {Math.round(line.val).toLocaleString('pt-BR')}
                                </text>
                            </g>
                        ))}

                        {/* Series Paths */}
                        {finalSeries.map((s) => {
                            const isDimmed = hoveredPoint && hoveredPoint.seriesName !== s.name;
                            return (
                                <g key={s.name} className={cn("transition-opacity duration-300", isDimmed && "opacity-10")}>
                                    {s.path && (
                                        <path
                                            d={s.path}
                                            fill="none"
                                            stroke={s.color}
                                            strokeWidth={s.isTotal ? "4" : "2"}
                                            strokeDasharray={s.isTotal ? "0" : "0"}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="drop-shadow-sm"
                                        />
                                    )}
                                    {s.points.map((p, pIdx) => (
                                        <g key={pIdx}
                                            onMouseEnter={() => setHoveredPoint({ ...p.original, color: s.color, seriesName: s.name })}
                                            onMouseLeave={() => setHoveredPoint(null)}
                                            className="cursor-pointer"
                                        >
                                            <circle cx={p.x} cy={p.y} r="20" fill="transparent" />
                                            <circle
                                                cx={p.x} cy={p.y} r={s.isTotal ? "6" : "4"}
                                                fill={hoveredPoint?.id === p.original.id ? s.color : "white"}
                                                stroke={s.color} strokeWidth="3"
                                                className="transition-all"
                                            />
                                        </g>
                                    ))}
                                </g>
                            );
                        })}

                        {/* Labels X */}
                        {uniqueDates.map((date, i) => {
                            // Lógica para pular labels se houver muitos
                            const totalLabels = uniqueDates.length;
                            const skip = totalLabels > 20 ? 3 : totalLabels > 10 ? 2 : 1;

                            if (i % skip !== 0) return null;

                            return (
                                <text key={i} x={dateToX(date)} y={height - 20} textAnchor="middle" className="fill-neutral-500 font-mono text-[10px] font-bold">
                                    {granularity === 'month'
                                        ? date.split('-').slice(0, 2).reverse().join('/') // MM/YYYY
                                        : date.split('-').reverse().slice(0, 2).join('/') // DD/MM (Original)
                                    }
                                </text>
                            );
                        })}
                    </svg>

                </div>

                {/* Legenda Lateral e Tooltip */}
                <div className="w-full lg:w-48 flex flex-col gap-4">

                    {/* Legenda */}
                    <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100 space-y-3 shadow-sm">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block border-b border-neutral-200 pb-2">
                            Séries Ativas
                        </span>
                        <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                            {finalSeries.map(s => (
                                <div
                                    key={s.name}
                                    onClick={(e) => toggleSeries(s.name, e)}
                                    className={cn(
                                        "flex items-center gap-2 w-full group cursor-pointer p-1 rounded transition-colors",
                                        "hover:bg-neutral-100"
                                    )}
                                >
                                    <span
                                        className="w-3 h-3 rounded-full shrink-0 ring-2 ring-transparent group-hover:ring-black/10 transition-all"
                                        ref={(el) => { if (el) el.style.backgroundColor = s.color || '#000'; }}
                                    ></span>
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase truncate transition-colors",
                                        activeSeries === s.name ? "text-black" : "text-neutral-600"
                                    )}>
                                        {formatName(s.name)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tooltip Fixo na Lateral */}
                    <div className={cn(
                        "bg-white p-4 rounded-lg border border-neutral-200 shadow-md transition-all duration-300",
                        hoveredPoint ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
                    )}>
                        {hoveredPoint ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                                    <span className="text-[10px] font-bold uppercase text-neutral-400 flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" />
                                        {granularity === 'month'
                                            ? `MÊS: ${hoveredPoint.date.substring(5, 7)}/${hoveredPoint.date.substring(0, 4)}`
                                            : granularity === 'week'
                                                ? `SEM: ${hoveredPoint.date.split('-').reverse().slice(0, 2).join('/')}`
                                                : hoveredPoint.date.split('-').reverse().join('/')
                                        }
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold uppercase block text-neutral-400">Série Referência</span>
                                    <span
                                        className="text-xs font-bold uppercase"
                                        ref={(el) => { if (el) el.style.color = hoveredPoint.color || '#000'; }}
                                    >
                                        {formatName(hoveredPoint.seriesName)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold uppercase block text-neutral-400">Volume Produzido</span>
                                    <span className="text-xl font-mono font-black text-black">
                                        {hoveredPoint.val.toLocaleString('pt-BR')} <span className="text-xs text-neutral-400 font-sans">unid.</span>
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="h-24 flex items-center justify-center text-[10px] text-neutral-400 uppercase font-bold text-center">
                                Passe o mouse sobre o gráfico para ver detalhes
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}

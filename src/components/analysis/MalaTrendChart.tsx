import { useMemo, useState } from "react";
import type { Sample } from "@/entities/Sample";
import { cn } from "@/lib/utils";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { TrendingUp, Activity, BarChart3, LineChart, BoxSelect, CircleDot } from "lucide-react";

interface MalaTrendChartProps {
    samples: Sample[];
    onSampleHover?: (malaId: string | null) => void;
}

const FIELDS = [
    { key: 'mic', label: 'MIC' },
    { key: 'len', label: 'LEN' },
    { key: 'unf', label: 'UNF' },
    { key: 'str', label: 'STR' },
    { key: 'rd', label: 'RD' },
    { key: 'b', label: '+b' },
] as const;

const CHART_TYPES = [
    { key: 'box', label: 'Box Plot / Variação', icon: BoxSelect },
    { key: 'line', label: 'Linha de Médias', icon: LineChart },
    { key: 'scatter', label: 'Dispersão', icon: CircleDot },
] as const;

export default function MalaTrendChart({ samples, onSampleHover }: MalaTrendChartProps) {
    const [selectedField, setSelectedField] = useState<typeof FIELDS[number]['key']>('mic');
    const [hoveredMala, setHoveredMala] = useState<any | null>(null);
    const [chartType, setChartType] = useState<typeof CHART_TYPES[number]['key']>('box');

    const chartData = useMemo(() => {
        const fieldKey = selectedField;

        // Limpar dados e extrair números
        const validSamples = samples.filter(s => {
            const rawVal = (s as any)[fieldKey];
            let val = rawVal;
            if (typeof rawVal === 'string') val = parseFloat(rawVal.replace(',', '.'));
            return typeof val === 'number' && !isNaN(val) && val > 0 && s.mala && s.mala.trim() !== '';
        }).map(s => ({
            ...s,
            parsedVal: typeof (s as any)[fieldKey] === 'number'
                ? (s as any)[fieldKey]
                : parseFloat(((s as any)[fieldKey] as string).replace(',', '.'))
        }));

        if (validSamples.length === 0) return null;

        // Agrupar por MALA
        const malasMap = new Map<string, typeof validSamples>();
        validSamples.forEach(s => {
            const m = s.mala!.trim();
            if (!malasMap.has(m)) malasMap.set(m, []);
            malasMap.get(m)!.push(s);
        });

        // Estatísticas por Mala
        const malasData = Array.from(malasMap.entries()).map(([mala, items]) => {
            const vals = items.map(i => i.parsedVal).sort((a, b) => a - b);
            const sum = vals.reduce((a, b) => a + b, 0);
            const avg = sum / vals.length;
            const min = vals[0];
            const max = vals[vals.length - 1];
            
            // Quartis para o Boxplot
            const q1 = vals[Math.floor(vals.length * 0.25)];
            const q3 = vals[Math.floor(vals.length * 0.75)];

            // Determinar cor mais frequente (Grupo)
            const colorFreq = new Map<string, number>();
            items.forEach(i => {
                const c = i.cor || '#000';
                colorFreq.set(c, (colorFreq.get(c) || 0) + 1);
            });
            const mainColor = [...colorFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];

            return { mala, items, avg, min, max, q1, q3, color: mainColor, count: items.length };
        });

        // Ordenar as malas pela ordem de aparição / string natural
        malasData.sort((a, b) => a.mala.localeCompare(b.mala, undefined, { numeric: true }));

        const allValues = validSamples.map(s => s.parsedVal);
        const globalMin = Math.min(...allValues);
        const globalMax = Math.max(...allValues);
        const globalAvg = allValues.reduce((a, b) => a + b, 0) / allValues.length;

        const margin = (globalMax - globalMin) * 0.2 || 1;
        const yMin = Math.max(0, globalMin - margin);
        const yMax = globalMax + margin;
        const yRange = yMax - yMin;

        const width = 1200;
        const height = 400;
        const padding = { left: 60, right: 40, top: 40, bottom: 60 };

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const stepX = chartWidth / Math.max(malasData.length, 1);
        const barWidth = Math.max(Math.min(stepX * 0.6, 40), 10); // Responsivo ao espaço

        // Mapear Coordenadas
        const points = malasData.map((d, i) => {
            const x = padding.left + (i * stepX) + (stepX / 2);
            
            const getY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;
            
            return {
                ...d,
                x,
                yAvg: getY(d.avg),
                yMinC: getY(d.min),
                yMaxC: getY(d.max),
                yQ1: getY(d.q1),
                yQ3: getY(d.q3),
                w: barWidth
            };
        });

        const gridValues = [yMin, yMin + yRange * 0.25, yMin + yRange * 0.5, yMin + yRange * 0.75, yMax];
        const gridLines = gridValues.map(val => ({
            y: padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight,
            val
        }));

        const globalAvgY = padding.top + chartHeight - ((globalAvg - yMin) / yRange) * chartHeight;

        // Path de médias
        const pathData = points.length > 0 
            ? `M ${points[0].x},${points[0].yAvg} ` + points.slice(1).map(p => `L ${p.x},${p.yAvg}`).join(" ")
            : "";

        return { points, gridLines, pathData, globalAvg, globalAvgY, width, height, padding, yMin, yMax };
    }, [samples, selectedField]);

    if (!chartData || chartData.points.length === 0) return null;

    return (
        <div className="w-full bg-white border border-black p-8 animate-fade-in relative flex flex-col gap-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] mt-8">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-black text-white">
                            <BoxSelect className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-black uppercase tracking-widest leading-none mb-1">
                                Padrões por Mala
                            </h3>
                            <p className="text-[10px] text-neutral-500 font-medium">
                                Boxplot e variação estatística agregada
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 text-[10px] bg-neutral-50 px-4 py-2 rounded-lg border border-neutral-100">
                        <div className="flex flex-col items-end">
                            <span className="text-neutral-400 uppercase tracking-widest text-[9px]">Média Global</span>
                            <strong className="text-black text-sm font-mono">{formatDecimalBR(chartData.globalAvg, 2)}</strong>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col xl:flex-row items-center justify-between gap-4 bg-neutral-50 p-2 rounded-xl border border-neutral-200">
                    <div className="flex items-center gap-1 overflow-x-auto w-full xl:w-auto p-1">
                        {FIELDS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setSelectedField(f.key as any)}
                                className={cn(
                                    "px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg whitespace-nowrap flex-1 md:flex-none text-center",
                                    selectedField === f.key ? "bg-black text-white shadow-md" : "text-neutral-500 hover:bg-white hover:text-black hover:shadow-sm"
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="hidden xl:block w-px h-8 bg-neutral-300"></div>

                    <div className="flex flex-wrap items-center justify-center gap-4 w-full xl:w-auto">
                        <div className="flex items-center bg-white rounded-lg p-1 border border-neutral-200 shadow-sm">
                            {CHART_TYPES.map(type => {
                                const Icon = type.icon;
                                return (
                                    <button
                                        key={type.key}
                                        onClick={() => setChartType(type.key)}
                                        title={type.label}
                                        className={cn(
                                            "p-2 rounded-md transition-all flex items-center gap-2",
                                            chartType === type.key ? "bg-neutral-100 text-black mx-1" : "text-neutral-400 hover:text-black"
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="text-[9px] font-bold uppercase hidden sm:block">{type.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                <div className="relative flex-1 min-h-[350px] bg-neutral-50/30 border border-neutral-100 group rounded-xl">
                    <svg viewBox={`0 0 ${chartData.width} ${chartData.height}`} className="w-full h-full overflow-visible">
                        {chartData.gridLines.map((line, i) => (
                            <g key={i}>
                                <line x1={chartData.padding.left} y1={line.y} x2={chartData.width - chartData.padding.right} y2={line.y} stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 4" />
                                <text x={chartData.padding.left - 12} y={line.y + 6} textAnchor="end" className="fill-neutral-900 font-mono font-black text-[11px]">{formatDecimalBR(line.val, 1)}</text>
                            </g>
                        ))}

                        <line x1={chartData.padding.left} y1={chartData.globalAvgY} x2={chartData.width - chartData.padding.right} y2={chartData.globalAvgY} stroke="black" strokeWidth="1" strokeDasharray="2 2" opacity="0.3" />
                        <text x={chartData.width - chartData.padding.right + 5} y={chartData.globalAvgY + 4} className="text-[9px] fill-black font-mono font-bold opacity-50">MÉDIA GLOBAL</text>

                        {/* Linha Conectando Médias */}
                        {chartType === 'line' && (
                            <path d={chartData.pathData} fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
                        )}

                        {chartData.points.map((p, idx) => (
                            <g key={idx} 
                               className="hover:cursor-pointer hover:opacity-80 transition-opacity z-10"
                               onMouseEnter={() => { setHoveredMala(p); if (onSampleHover) onSampleHover(p.mala); }}
                               onMouseLeave={() => { setHoveredMala(null); if (onSampleHover) onSampleHover(null); }}
                            >
                                {/* WHISKER (Min - Max) */}
                                {chartType === 'box' && (
                                    <>
                                        <line x1={p.x} y1={p.yMaxC} x2={p.x} y2={p.yMinC} stroke={p.color} strokeWidth="2" opacity="0.5" />
                                        <line x1={p.x - p.w/4} y1={p.yMaxC} x2={p.x + p.w/4} y2={p.yMaxC} stroke={p.color} strokeWidth="2" opacity="0.8" />
                                        <line x1={p.x - p.w/4} y1={p.yMinC} x2={p.x + p.w/4} y2={p.yMinC} stroke={p.color} strokeWidth="2" opacity="0.8" />
                                        
                                        {/* CAIXA (Q1 - Q3) */}
                                        <rect x={p.x - p.w/2} y={p.yMaxC} width={p.w} height={Math.max(1, p.yMinC - p.yMaxC)} fill={p.color} opacity="0.2" rx="2" />
                                        <rect x={p.x - p.w/2} y={p.yQ3} width={p.w} height={Math.max(1, p.yQ1 - p.yQ3)} fill={p.color} opacity="0.6" rx="2" />
                                    </>
                                )}

                                {/* Ponto da Média (Dispersão ou Linha) */}
                                {(chartType === 'scatter' || chartType === 'line') && (
                                    <circle cx={p.x} cy={p.yAvg} r="6" fill={p.color} stroke="white" strokeWidth="2" />
                                )}

                                {/* Linha da Média no BoxPlot */}
                                {chartType === 'box' && (
                                    <line x1={p.x - p.w/2} y1={p.yAvg} x2={p.x + p.w/2} y2={p.yAvg} stroke="black" strokeWidth="2" />
                                )}

                                {/* Hover Hitbox */}
                                <rect x={p.x - p.w} y={chartData.padding.top} width={p.w * 2} height={chartData.height - chartData.padding.top - chartData.padding.bottom} fill="transparent" />
                            </g>
                        ))}

                        {/* Labels do Eixo X (Nomes das Malas) */}
                        {chartData.points.map((p, i) => {
                            const showLabel = chartData.points.length < 20 || i % Math.ceil(chartData.points.length / 10) === 0;
                            if (!showLabel) return null;
                            return (
                                <text key={`lbl-${i}`} x={p.x} y={chartData.height - 15} textAnchor="middle" className="fill-neutral-900 font-mono font-bold text-[10px]" transform={`rotate(-45 ${p.x} ${chartData.height - 15})`}>
                                    {p.mala.replace('MALA', 'M').trim()}
                                </text>
                            );
                        })}
                    </svg>
                </div>

                {/* Painel lateral do Boxplot */}
                <div className="w-full lg:w-64 min-h-[200px] border-l border-neutral-100 pl-0 lg:pl-10 flex flex-col gap-6">
                    <div className="flex items-center gap-2 border-b border-black pb-2">
                        <Activity className="h-4 w-4 text-black" />
                        <h4 className="text-xs font-bold uppercase tracking-widest">Inspetor de Mala</h4>
                    </div>

                    {hoveredMala ? (
                        <div className="space-y-6 animate-slide-up">
                            <div className="space-y-1">
                                <span className="text-[9px] text-neutral-400 uppercase tracking-widest block">Mala Selecionada</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-mono font-black tracking-tighter text-black">{hoveredMala.mala}</span>
                                </div>
                                <span className="text-[10px] font-bold text-neutral-500 uppercase">{hoveredMala.count} amostras analisadas</span>
                            </div>

                            <div className="space-y-2 border-l-4 pl-3" style={{ borderColor: hoveredMala.color }}>
                                <span className="text-[9px] text-neutral-400 uppercase tracking-widest block">Média da Mala ({selectedField.toUpperCase()})</span>
                                <span className="text-3xl font-mono font-bold">{formatDecimalBR(hoveredMala.avg, 2)}</span>
                            </div>

                            <div className="p-4 bg-neutral-50 border border-neutral-200 space-y-3 rounded-lg">
                                <span className="text-[9px] text-neutral-400 uppercase tracking-widest block border-b border-neutral-200 pb-1">Amplitude & Variação</span>
                                <div className="grid grid-cols-1 gap-y-2 text-[11px] font-mono">
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>Máximo (Pico)</span>
                                        <span className="font-bold text-red-600">{formatDecimalBR(hoveredMala.max, 2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>Mínimo (Vale)</span>
                                        <span className="font-bold text-blue-600">{formatDecimalBR(hoveredMala.min, 2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600 pt-2 border-t border-neutral-200">
                                        <span>Variação Total</span>
                                        <span className="font-bold text-black">{formatDecimalBR(hoveredMala.max - hoveredMala.min, 2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 space-y-4">
                            <BoxSelect className="h-6 w-6 text-neutral-400" />
                            <p className="text-[10px] uppercase font-bold text-neutral-500 max-w-[150px] leading-relaxed">
                                Passe o mouse sobre uma mala para ver a variação interna
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

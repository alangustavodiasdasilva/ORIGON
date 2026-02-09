import { useMemo, useState } from "react";
import type { Sample } from "@/entities/Sample";
import { cn } from "@/lib/utils";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { TrendingUp, Activity, BarChart3, LineChart, AreaChart } from "lucide-react";

interface MovingAverageChartProps {
    samples: Sample[];
    windowSize?: number;
    onSampleHover?: (sampleId: string | null) => void;
}

// Todos os parâmetros HVI incluindo UNF
const FIELDS = [
    { key: 'mic', label: 'MIC' },
    { key: 'len', label: 'LEN' },
    { key: 'unf', label: 'UNF' },
    { key: 'str', label: 'STR' },
    { key: 'rd', label: 'RD' },
    { key: 'b', label: '+b' },
] as const;

// Tipos de gráfico disponíveis
const CHART_TYPES = [
    { key: 'line', label: 'Linhas', icon: LineChart },
    { key: 'area', label: 'Área', icon: AreaChart },
] as const;

// Labels em português sem termos normativos
const COLORS_MAP: Record<string, string> = {
    "#3b82f6": "GRUPO 1",
    "#10b981": "GRUPO 2",
    "#f59e0b": "GRUPO 3",
    "#ef4444": "GRUPO 4",
};

interface ChartSample extends Sample {
    parsedVal: number;
    globalIndex?: number;
}

export default function MovingAverageChart({ samples, windowSize = 3, onSampleHover }: MovingAverageChartProps) {
    const [selectedField, setSelectedField] = useState<typeof FIELDS[number]['key']>('mic');
    const [hoveredSample, setHoveredSample] = useState<ChartSample | null>(null);
    const [chartType, setChartType] = useState<typeof CHART_TYPES[number]['key']>('line');


    // Ordenar amostras por ID para ordem cronológica
    const sortedSamples = useMemo(() =>
        [...samples].sort((a, b) => {
            const idA = parseInt(a.amostra_id.replace(/\D/g, '')) || 0;
            const idB = parseInt(b.amostra_id.replace(/\D/g, '')) || 0;
            return idA - idB;
        }),
        [samples]);

    const chartData = useMemo(() => {
        const fieldKey = selectedField;

        // Parse robusto de dados
        const validSamples = sortedSamples.filter(s => {
            const rawVal = (s as any)[fieldKey];
            let val = rawVal;
            if (typeof rawVal === 'string') {
                val = parseFloat(rawVal.replace(',', '.'));
            }
            return typeof val === 'number' && !isNaN(val) && val > 0;
        }).map(s => ({
            ...s,
            parsedVal: typeof (s as any)[fieldKey] === 'number'
                ? (s as any)[fieldKey]
                : parseFloat(((s as any)[fieldKey] as string).replace(',', '.'))
        })) as ChartSample[];


        if (validSamples.length === 0) return null;

        const values = validSamples.map(s => s.parsedVal);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const globalAvg = values.reduce((a, b) => a + b, 0) / values.length;

        // Calcular desvio padrão
        const variance = values.reduce((acc, val) => acc + Math.pow(val - globalAvg, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const margin = (maxVal - minVal) * 0.2 || (maxVal * 0.1) || 1;
        const yMin = Math.max(0, minVal - margin);
        const yMax = maxVal + margin;
        const yRange = yMax - yMin;

        // Dimensões
        const width = 1200;
        const height = 450;
        const padding = { left: 60, right: 40, top: 40, bottom: 60 };

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const totalPoints = validSamples.length;
        const stepX = chartWidth / (Math.max(totalPoints - 1, 1));

        // Agrupar dados por cor (Séries)
        const series = Object.keys(COLORS_MAP).map(color => {
            const groupSamples = validSamples
                .map((s, i) => ({ ...s, globalIndex: i }))
                .filter(s => s.cor === color);

            if (groupSamples.length === 0) return null;

            // Estatísticas do GRUPO
            const groupValues = groupSamples.map(s => s.parsedVal);
            const groupAvg = groupValues.reduce((a, b) => a + b, 0) / groupValues.length;
            const groupVariance = groupValues.reduce((acc, val) => acc + Math.pow(val - groupAvg, 2), 0) / groupValues.length;
            const groupStdDev = Math.sqrt(groupVariance);

            // Coordenadas baseadas no índice GLOBAL
            const points = groupSamples.map((s) => {
                const x = padding.left + (s.globalIndex * stepX);
                const y = padding.top + chartHeight - ((s.parsedVal - yMin) / yRange) * chartHeight;
                // Detectar outliers (>1.5σ DO GRUPO)
                const isOutlier = Math.abs(s.parsedVal - groupAvg) > 1.5 * groupStdDev;
                return { x, y, val: s.parsedVal, original: s, color, isOutlier };
            });

            // Path conectando APENAS estes pontos
            const path = points.length > 1
                ? `M ${points[0].x},${points[0].y} ` + points.slice(1).map(p => `L ${p.x},${p.y}`).join(" ")
                : null;

            return { color, points, path };
        }).filter(s => s !== null);

        // Linhas de grade baseadas nos valores reais
        const gridValues = [
            minVal,
            minVal + (maxVal - minVal) * 0.25,
            minVal + (maxVal - minVal) * 0.5,
            minVal + (maxVal - minVal) * 0.75,
            maxVal
        ];

        const gridLines = gridValues.map((val) => {
            const y = padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;
            return { y, val };
        });

        // Labels do eixo X
        // Labels do eixo X - Mostrar todos se tiver poucas amostras, senão pular alguns
        const labelInterval = totalPoints <= 30 ? 1 : Math.ceil(totalPoints / 15);
        const xLabels = validSamples
            .map((s, i) => ({ s, i }))
            .filter(({ i }) => i % labelInterval === 0)
            .map(({ s, i }) => ({
                x: padding.left + (i * stepX),
                label: s.amostra_id.length > 2 ? s.amostra_id : `#${s.amostra_id}`
            }));

        const globalAvgY = padding.top + chartHeight - ((globalAvg - yMin) / yRange) * chartHeight;

        // Banda de desvio padrão
        const stdDevUpperY = padding.top + chartHeight - ((globalAvg + stdDev - yMin) / yRange) * chartHeight;
        const stdDevLowerY = padding.top + chartHeight - ((globalAvg - stdDev - yMin) / yRange) * chartHeight;

        return {
            series,
            gridLines,
            xLabels,
            globalAvg,
            globalAvgY,
            width,
            height,
            yMin,
            yMax,
            padding,
            stdDev,
            stdDevUpperY,
            stdDevLowerY
        };

    }, [sortedSamples, selectedField, windowSize]);

    if (!chartData || chartData.series.length === 0) return (
        <div className="w-full h-64 flex flex-col items-center justify-center bg-neutral-50 rounded-none border border-neutral-200">
            <BarChart3 className="h-8 w-8 text-neutral-300 mb-2" />
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Aguardando Dados...</span>
        </div>
    );

    return (
        <div className="w-full bg-white border border-black p-8 animate-fade-in relative flex flex-col gap-8 shadow-[8px_8px_0px_rgba(0,0,0,1)]">

            {/* Cabeçalho Unificado */}
            <div className="space-y-6">
                {/* Linha 1: Título e Status */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-black pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-black text-white">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-black uppercase tracking-widest leading-none mb-1">
                                Análise de Tendência
                            </h3>
                            <p className="text-[10px] text-neutral-500 font-medium">
                                Visualização temporal de indicadores de qualidade
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 text-[10px] bg-neutral-50 px-4 py-2 rounded-lg border border-neutral-100">
                        <div className="flex flex-col items-end">
                            <span className="text-neutral-400 uppercase tracking-widest text-[9px]">Média Global</span>
                            <strong className="text-black text-sm font-mono">{formatDecimalBR(chartData.globalAvg, 2)}</strong>
                        </div>
                        <div className="w-px h-8 bg-neutral-200"></div>
                        <div className="flex flex-col items-end">
                            <span className="text-neutral-400 uppercase tracking-widest text-[9px]">Desvio Padrão</span>
                            <strong className="text-black text-sm font-mono">{formatDecimalBR(chartData.stdDev, 2)}</strong>
                        </div>
                    </div>
                </div>

                {/* Linha 2: Barra de Controle (Parâmetros + Tipo de Gráfico + Legenda) */}
                <div className="flex flex-col xl:flex-row items-center justify-between gap-4 bg-neutral-50 p-2 rounded-xl border border-neutral-200">

                    {/* Grupo Esquerda: Parâmetros */}
                    <div className="flex items-center gap-1 overflow-x-auto w-full xl:w-auto p-1">
                        {FIELDS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setSelectedField(f.key as any)}
                                className={cn(
                                    "px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all rounded-lg whitespace-nowrap flex-1 md:flex-none text-center",
                                    selectedField === f.key
                                        ? "bg-black text-white shadow-md"
                                        : "text-neutral-500 hover:bg-white hover:text-black hover:shadow-sm"
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Divisor Responsivo */}
                    <div className="hidden xl:block w-px h-8 bg-neutral-300"></div>

                    {/* Grupo Direita: Legenda e Tipos */}
                    <div className="flex flex-wrap items-center justify-center gap-4 w-full xl:w-auto">

                        {/* Legenda Compacta */}
                        <div className="flex items-center gap-2 pr-4 border-r border-neutral-300">
                            <div className="flex -space-x-1">
                                <div className="w-3 h-3 rounded-full bg-[#10b981] border border-white"></div>
                                <div className="w-3 h-3 rounded-full bg-[#3b82f6] border border-white"></div>
                                <div className="w-3 h-3 rounded-full bg-[#f59e0b] border border-white"></div>
                                <div className="w-3 h-3 rounded-full bg-[#ef4444] border border-white"></div>
                            </div>
                            <span className="text-[9px] font-bold uppercase text-neutral-400 tracking-wider">Grupos 1-4</span>
                        </div>

                        {/* Seletor de Tipo */}
                        <div className="flex items-center bg-white rounded-lg p-1 border border-neutral-200 shadow-sm">
                            {CHART_TYPES.map(type => {
                                const Icon = type.icon;
                                return (
                                    <button
                                        key={type.key}
                                        onClick={() => setChartType(type.key)}
                                        title={type.label}
                                        className={cn(
                                            "p-2 rounded-md transition-all",
                                            chartType === type.key
                                                ? "bg-neutral-100 text-black mx-1"
                                                : "text-neutral-400 hover:text-black"
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>


            <div className="flex flex-col lg:flex-row gap-8">
                {/* Área do Gráfico */}
                <div className="relative flex-1 aspect-[16/9] bg-neutral-50/30 border border-neutral-100 group">
                    <svg id="trend-chart-svg" viewBox={`0 0 ${chartData.width} ${chartData.height}`} className="w-full h-full overflow-visible">

                        {/* Banda de Desvio Padrão */}
                        <rect
                            x={chartData.padding.left}
                            y={chartData.stdDevUpperY}
                            width={chartData.width - chartData.padding.left - chartData.padding.right}
                            height={chartData.stdDevLowerY - chartData.stdDevUpperY}
                            fill="#f0f0f0"
                            opacity="0.5"
                        />

                        {/* Grade e Eixo Y */}
                        {chartData.gridLines.map((line, i) => (
                            <g key={i}>
                                <line
                                    x1={chartData.padding.left}
                                    y1={line.y}
                                    x2={chartData.width - chartData.padding.right}
                                    y2={line.y}
                                    stroke="#e5e5e5"
                                    strokeWidth="1"
                                    strokeDasharray="4 4"
                                />
                                <text
                                    x={chartData.padding.left - 12}
                                    y={line.y + 6}
                                    textAnchor="end"
                                    className="fill-neutral-900 font-mono font-black"
                                    style={{ fontSize: '16px' }}
                                >
                                    {formatDecimalBR(line.val, 1)}
                                </text>
                            </g>
                        ))}

                        {/* Linha de Média Global */}
                        <line
                            x1={chartData.padding.left}
                            y1={chartData.globalAvgY}
                            x2={chartData.width - chartData.padding.right}
                            y2={chartData.globalAvgY}
                            stroke="black"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                            opacity="0.3"
                        />
                        <text x={chartData.width - chartData.padding.right + 5} y={chartData.globalAvgY + 4} className="text-[9px] fill-black font-mono font-bold opacity-50">MÉDIA</text>

                        {/* Paths e Pontos das Séries - RENDERIZAÇÃO CONDICIONAL */}
                        {chartData.series.map((s, i) => (
                            <g key={s.color}>

                                {/* GRÁFICO DE ÁREA */}
                                {chartType === 'area' && s.path && (
                                    <>
                                        <path
                                            d={`${s.path} L ${s.points[s.points.length - 1].x},${chartData.height - chartData.padding.bottom} L ${s.points[0].x},${chartData.height - chartData.padding.bottom} Z`}
                                            fill={s.color}
                                            opacity="0.2"
                                        />
                                        <path
                                            d={s.path}
                                            fill="none"
                                            stroke={s.color}
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            opacity="0.8"
                                        />
                                    </>
                                )}

                                {/* GRÁFICO DE LINHAS */}
                                {chartType === 'line' && s.path && (
                                    <path
                                        d={s.path}
                                        fill="none"
                                        stroke={s.color}
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="opacity-90"
                                    />
                                )}

                                {/* PONTOS DE DADOS - Comum a ambos */}
                                {s.points.map((p, idx) => (
                                    <g key={`${i}-${idx}`}>
                                        <circle
                                            cx={p.x}
                                            cy={p.y}
                                            r="8"
                                            fill="transparent"
                                            className="hover:cursor-pointer z-10"
                                            onMouseEnter={() => {
                                                setHoveredSample(p.original);
                                                if (onSampleHover) onSampleHover(p.original.id);
                                            }}
                                            onClick={() => {
                                                if (hoveredSample?.id === p.original.id) {
                                                    setHoveredSample(null);
                                                    if (onSampleHover) onSampleHover(null);
                                                } else {
                                                    setHoveredSample(p.original);
                                                    if (onSampleHover) onSampleHover(p.original.id);
                                                }
                                            }}
                                        />
                                        {/* Destaque de Outlier */}
                                        {p.isOutlier && (
                                            <circle
                                                cx={p.x}
                                                cy={p.y}
                                                r="10"
                                                fill="none"
                                                stroke="#ef4444"
                                                strokeWidth="2"
                                                strokeDasharray="2 2"
                                                className="animate-pulse"
                                            />
                                        )}
                                        <circle
                                            cx={p.x}
                                            cy={p.y}
                                            r="4"
                                            fill={p.isOutlier ? "#ef4444" : (chartType === 'area' ? s.color : "white")}
                                            stroke={chartType === 'area' ? "white" : s.color}
                                            strokeWidth="2.5"
                                            className="pointer-events-none transition-all"
                                        />
                                    </g>
                                ))}
                            </g>
                        ))}


                        {/* Anel de Destaque ao Hover - Estático e Discreto */}
                        {hoveredSample && (
                            <circle
                                cx={(chartData.series.flatMap(s => s.points).find(p => p.original.id === hoveredSample.id))?.x || 0}
                                cy={(chartData.series.flatMap(s => s.points).find(p => p.original.id === hoveredSample.id))?.y || 0}
                                r="6"
                                fill="white"
                                stroke="black"
                                strokeWidth="2"
                                className="z-20 shadow-sm"
                            />
                        )}


                        {/* Labels do Eixo X */}
                        {chartData.xLabels.map((lbl, i) => (
                            <text
                                key={i}
                                x={lbl.x}
                                y={chartData.height - 10}
                                textAnchor="middle"
                                className="fill-neutral-900 font-mono font-bold"
                                style={{ fontSize: '12px' }}
                            >
                                {lbl.label}
                            </text>
                        ))}
                    </svg>

                    {/* Legenda */}
                    <div className="absolute bottom-2 left-16 flex items-center gap-4 text-[9px]">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-neutral-200 opacity-50"></div>
                            <span className="text-neutral-500">Banda ±1σ</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full border-2 border-red-500 border-dashed"></div>
                            <span className="text-red-500">Outlier (&gt;2σ)</span>
                        </div>
                    </div>
                </div>

                {/* Painel de Detalhes */}
                <div className="w-full lg:w-64 min-h-[200px] border-l border-neutral-100 pl-0 lg:pl-10 flex flex-col gap-6">
                    <div className="flex items-center gap-2 border-b border-black pb-2 justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-black" />
                            <h4 className="text-xs font-bold uppercase tracking-widest">Inspetor</h4>
                        </div>
                        {hoveredSample && (
                            <button
                                onClick={() => setHoveredSample(null)}
                                className="text-[9px] font-bold text-neutral-400 hover:text-black uppercase tracking-tighter"
                            >
                                [ Desselecionar ]
                            </button>
                        )}
                    </div>

                    {hoveredSample ? (
                        <div className="space-y-6 animate-slide-up">
                            <div className="space-y-1">
                                <span className="text-[9px] text-neutral-400 uppercase tracking-widest block">Amostra Selecionada</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-mono font-black tracking-tighter">#{hoveredSample.amostra_id}</span>
                                    <span className="text-[10px] uppercase font-bold text-neutral-400 max-w-[100px] truncate">{hoveredSample.mala || 'Sem Mala'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <span className="text-[9px] text-neutral-400 uppercase tracking-widest block">Métrica Principal ({selectedField.toUpperCase()})</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-3xl font-mono font-bold border-b-2 border-black">
                                        {formatDecimalBR(hoveredSample.parsedVal || 0, 2)}
                                    </span>
                                    <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase text-white`} style={{ backgroundColor: hoveredSample.cor || '#000' }}>
                                        {COLORS_MAP[hoveredSample.cor || ''] || 'S/COR'}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-neutral-50 border border-neutral-200 space-y-3">
                                <span className="text-[9px] text-neutral-400 uppercase tracking-widest block border-b border-neutral-200 pb-1">Dados Contextuais</span>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px] font-mono">
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>MIC</span>
                                        <span className={selectedField === 'mic' ? 'font-bold text-black' : ''}>{formatDecimalBR(hoveredSample.mic || 0, 2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>LEN</span>
                                        <span className={selectedField === 'len' ? 'font-bold text-black' : ''}>{formatDecimalBR(hoveredSample.len || 0, 2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>UNF</span>
                                        <span className={selectedField === 'unf' ? 'font-bold text-black' : ''}>{formatDecimalBR(hoveredSample.unf || 0, 1)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>STR</span>
                                        <span className={selectedField === 'str' ? 'font-bold text-black' : ''}>{formatDecimalBR(hoveredSample.str || 0, 1)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>RD</span>
                                        <span className={selectedField === 'rd' ? 'font-bold text-black' : ''}>{formatDecimalBR(hoveredSample.rd || 0, 1)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-600">
                                        <span>+b</span>
                                        <span className={selectedField === 'b' ? 'font-bold text-black' : ''}>{formatDecimalBR(hoveredSample.b || 0, 1)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 space-y-4">
                            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center">
                                <Activity className="h-6 w-6 text-neutral-400" />
                            </div>
                            <p className="text-[10px] uppercase font-bold text-neutral-500 max-w-[150px] leading-relaxed">
                                Passe o mouse sobre qualquer ponto para ver os dados HVI
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

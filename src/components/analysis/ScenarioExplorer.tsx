import { useState, useMemo, useEffect } from "react";
import type { Sample } from "@/entities/Sample";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { cn } from "@/lib/utils";
import { Compass, Lightbulb, Activity, Target, Fingerprint, Focus, LayoutGrid, BarChart3, Table as TableIcon, AlignLeft, Share2 } from "lucide-react";

function ClusterTrendChart({ points, yAxis, labelY }: { points: any[], yAxis: string, labelY: string }) {
    const [hoveredPoint, setHoveredPoint] = useState<any>(null);
    const [viewField, setViewField] = useState(yAxis);

    // Quando o cenário pai mudar, resetamos a visualização para acompanhar
    useEffect(() => {
        setViewField(yAxis);
    }, [yAxis]);

    if (!points || points.length === 0) return null;

    const timePoints = [...points].sort((a,b) => {
        const idA = parseInt(a.original.amostra_id.replace(/\D/g, '')) || 0;
        const idB = parseInt(b.original.amostra_id.replace(/\D/g, '')) || 0;
        return idA - idB;
    });

    const FIELDS = [
        { id: 'mic', label: 'MIC' },
        { id: 'len', label: 'LEN' },
        { id: 'str', label: 'STR' },
        { id: 'unf', label: 'UNF' },
        { id: 'rd', label: 'RD' },
        { id: 'b', label: '+B' }
    ];

    const plotPoints = timePoints.map(p => {
        const raw = p.original[viewField];
        const v = typeof raw === 'number' ? raw : parseFloat(String(raw || 0).replace(',', '.'));
        return { ...p, plotY: isNaN(v) ? p.y : v };
    });

    const total = plotPoints.length;
    const padding = { top: 20, right: 40, bottom: 40, left: 60 };
    const width = 1000;
    const height = 250;
    const w = width - padding.left - padding.right;
    const h = height - padding.top - padding.bottom;

    const values = plotPoints.map(p => p.plotY);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const margin = (maxVal - minVal) * 0.1 || (maxVal * 0.1) || 1;
    const yMin = Math.max(0, minVal - margin);
    const yMax = maxVal + margin;
    const yRange = yMax - yMin;

    const stepX = w / Math.max(total - 1, 1);
    const colors = Array.from(new Set(plotPoints.map(p => p.color)));
    
    return (
        <div className="relative w-full h-full flex flex-col gap-4">
            
            {/* Seletor de Parâmetro a Observar */}
            <div className="flex gap-2">
                {FIELDS.map(f => (
                    <button 
                        key={f.id} 
                        onClick={() => setViewField(f.id)}
                        className={cn(
                            "px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors border",
                            viewField === f.id ? "bg-black text-white border-black" : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400"
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full min-h-[250px] overflow-visible" onMouseLeave={() => setHoveredPoint(null)}>
                {/* Grid Y */}
                {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                    const y = padding.top + h - (pct * h);
                    const val = yMin + (pct * yRange);
                    return (
                        <g key={`grid-${pct}`}>
                            <line x1={padding.left} y1={y} x2={padding.left + w} y2={y} stroke="#e5e5e5" strokeWidth="1" />
                            <text x={padding.left - 10} y={y + 3} textAnchor="end" className="text-[10px] font-mono fill-neutral-400">{val.toFixed(2)}</text>
                        </g>
                    );
                })}

                {/* Path contínuo para cada padrão (cada cor se liga à sua cor) */}
                {colors.map(color => {
                    const clusterPoints = plotPoints.map((p, i) => ({...p, index: i})).filter(p => p.color === color);
                    if (clusterPoints.length < 2) return null;
                    const path = clusterPoints.map((p, i) => {
                        const px = padding.left + (p.index * stepX);
                        const py = padding.top + h - ((p.plotY - yMin) / yRange) * h;
                        return `${i === 0 ? 'M' : 'L'} ${px},${py}`;
                    }).join(' ');
                    
                    return <path key={`line-${color}`} d={path} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.5" strokeLinejoin="round" />;
                })}

                {/* Points */}
                {plotPoints.map((p, i) => {
                    const px = padding.left + (i * stepX);
                    const py = padding.top + h - ((p.plotY - yMin) / yRange) * h;
                    const isHovered = hoveredPoint?.original.id === p.original.id;
                    return (
                        <g key={`pt-${i}`} onMouseEnter={() => setHoveredPoint(p)} className="cursor-crosshair">
                            {isHovered && <circle cx={px} cy={py} r="10" fill={p.color} opacity="0.3" className="animate-pulse" />}
                            <circle cx={px} cy={py} r={isHovered ? "6" : "4"} fill={p.color} stroke="white" strokeWidth="1" className="transition-all" />
                        </g>
                    );
                })}

                <text x={15} y={padding.top + h/2} transform={`rotate(-90 15 ${padding.top + h/2})`} textAnchor="middle" className="text-[10px] font-bold fill-neutral-500 uppercase tracking-widest">{viewField}</text>
                <text x={padding.left + w/2} y={height - 5} textAnchor="middle" className="text-[10px] font-bold fill-neutral-500 uppercase tracking-widest">Tempo (Cronologia das Amostras)</text>
            </svg>

            {/* Painel Flutuante Tooltip */}
            {hoveredPoint && (
                <div className="absolute top-0 right-0 bg-white border border-black shadow-2xl p-4 w-52 pointer-events-none z-50 animate-fade-in mt-12">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-3">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">AMOSTRA</span>
                        <div className="w-3 h-3 rounded-full border border-black" style={{backgroundColor: hoveredPoint.color}} />
                    </div>
                    <div className="space-y-1 mb-4">
                        <div className="text-xl font-mono font-black text-black leading-none">#{hoveredPoint.original.amostra_id}</div>
                        <div className="text-[10px] font-bold uppercase text-neutral-500">Mala: {hoveredPoint.original.mala || 'N/A'}</div>
                    </div>
                    <div className="bg-neutral-50 p-2 border border-neutral-200">
                        <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">{viewField}</span>
                        <strong className="text-sm font-mono">{formatDecimalBR(hoveredPoint.plotY, 2)}</strong>
                    </div>
                </div>
            )}
        </div>
    );
}

interface ScenarioExplorerProps {
    samples: Sample[];
    onColorChange?: (id: string, color: string) => void;
}

const PRESETS = [
    {
        id: "cenario_mic",
        label: "CENÁRIO MIC",
        icon: Target,
        x: "len",
        y: "mic",
        descX: "Comprimento (UHML)",
        descY: "Grossura (MIC)",
        description: "Agrupamento focando as semelhanças e desvios guiados pelo Micronaire (MIC)."
    },
    {
        id: "cenario_uhml",
        label: "CENÁRIO UHML",
        icon: Activity,
        x: "mic",
        y: "len",
        descX: "Grossura (MIC)",
        descY: "Comprimento (UHML)",
        description: "Análise de vizinhança priorizando a extensão da fibra (Length/UHML)."
    },
    {
        id: "cenario_str",
        label: "CENÁRIO STR",
        icon: Target,
        x: "unf",
        y: "str",
        descX: "Uniformidade (UNF)",
        descY: "Resistência (STR)",
        description: "Padrões de força estrutural da pluma (Strength) frente à sua uniformidade."
    },
    {
        id: "cenario_unf",
        label: "CENÁRIO UNF",
        icon: Activity,
        x: "str",
        y: "unf",
        descX: "Resistência (STR)",
        descY: "Uniformidade (UNF)",
        description: "Padrões identificados com base na regularidade das fibras (Uniformity)."
    },
    {
        id: "cenario_rd",
        label: "CENÁRIO RD",
        icon: Fingerprint,
        x: "b",
        y: "rd",
        descX: "Amarelamento (+b)",
        descY: "Refletância (Rd)",
        description: "Comportamento visual de brilho e refletância (Rd) sob o K-Means."
    },
    {
        id: "cenario_b",
        label: "CENÁRIO +B",
        icon: Fingerprint,
        x: "rd",
        y: "b",
        descX: "Refletância (Rd)",
        descY: "Amarelamento (+b)",
        description: "Agrupamento colorimétrico ditado pela intensidade do amarelamento (+b)."
    }
];

function getConvexHull(points: {x: number, y: number}[]) {
    // Evitar duplicatas que bugam a matriz
    const unique = [];
    const seen = new Set();
    for (const p of points) {
        const k = `${p.x},${p.y}`;
        if (!seen.has(k)) {
            seen.add(k);
            unique.push(p);
        }
    }

    if (unique.length <= 2) return unique;
    
    const sorted = unique.sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    const cross = (o: any, a: any, b: any) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    
    const lower = [];
    for (let i = 0; i < sorted.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 1e-9) lower.pop();
        lower.push(sorted[i]);
    }
    
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 1e-9) upper.pop();
        upper.push(sorted[i]);
    }
    
    upper.pop();
    lower.pop();
    const hull = lower.concat(upper);

    // Garantir ordenação polar do centro para impedir cruzamento das bordas do balão
    const cx = hull.reduce((a, b) => a + b.x, 0) / hull.length;
    const cy = hull.reduce((a, b) => a + b.y, 0) / hull.length;
    
    return hull.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

// Algoritmo de Agrupamento baseado em Fendas Naturais (Natural Breaks 1D) 
function smartClassify1D(points: {x: number, y: number, original: any, clusterIndex?: number}[]) {
    if (points.length === 0) return [];
    
    // Calcula desvio da variável foco (eixo Y)
    const vals = points.map(p => p.y);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
    const std = Math.sqrt(variance);

    if (std === 0) return points.map(p => ({...p, clusterIndex: 0}));

    // Sort by Y descendente (Top to bottom)
    const sorted = [...points].sort((a,b) => b.y - a.y);
    
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        gaps.push({ index: i, diff: sorted[i].y - sorted[i+1].y });
    }

    // Achar as Fendas que são maiores que a dispersão orgânica (evita cortar vizinhos colados)
    // Filtro robusto: O pulo deve ser pelo menos 40% de um desvio padrão OU 5% do range total do lote
    const totalRange = Math.max(...vals) - Math.min(...vals) || 1;
    gaps.sort((a,b) => b.diff - a.diff);
    const validGaps = gaps.slice(0, 3).filter(g => g.diff >= std * 0.4 && g.diff >= totalRange * 0.05);
    
    const cutIndices = validGaps.map(g => g.index).sort((a,b) => a - b);
    
    let currentCluster = 0;
    let cutPos = 0;
    
    for (let i = 0; i < sorted.length; i++) {
        sorted[i].clusterIndex = currentCluster;
        if (cutPos < cutIndices.length && i === cutIndices[cutPos]) {
            currentCluster++;
            cutPos++;
        }
    }
    
    const clusterMap = new Map();
    sorted.forEach(s => clusterMap.set(s.original.id, s.clusterIndex));
    
    return points.map(p => ({
        ...p,
        clusterIndex: clusterMap.get(p.original.id) ?? 0
    }));
}

export default function ScenarioExplorer({ samples, onColorChange }: ScenarioExplorerProps) {
    const [activePreset, setActivePreset] = useState(PRESETS[0]);
    const [xAxis, setXAxis] = useState<keyof Sample>(PRESETS[0].x as keyof Sample);
    const [yAxis, setYAxis] = useState<keyof Sample>(PRESETS[0].y as keyof Sample);
    
    const [hoveredPoint, setHoveredPoint] = useState<any>(null);
    const [selectingColorPoint, setSelectingColorPoint] = useState<any>(null);
    const [showClusters, setShowClusters] = useState(true);
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    const [viewMode, setViewMode] = useState<'scatter' | 'averages' | 'kpi_table' | 'histogram'>('scatter');

    // Apply Preset
    const applyPreset = (preset: typeof PRESETS[0]) => {
        setActivePreset(preset);
        setXAxis(preset.x as keyof Sample);
        setYAxis(preset.y as keyof Sample);
    };

    // Prepare data
    const chartData = useMemo(() => {
        const basePoints = samples.map(s => {
            const xRaw = s[xAxis];
            const yRaw = s[yAxis];
            const x = typeof xRaw === 'number' ? xRaw : parseFloat(String(xRaw || 0).replace(',', '.'));
            const y = typeof yRaw === 'number' ? yRaw : parseFloat(String(yRaw || 0).replace(',', '.'));
            
            return { original: s, x, y };
        }).filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x > 0 && p.y > 0);

        if (basePoints.length === 0) return null;

        // Classificação pela mesma Lógica do Auto-Classifique (Faixas por Média e Desvio)
        const clustered = smartClassify1D(basePoints);
        
        // Cores idênticas às da Auto-classificação: Azul (Top), Verde (Mid-High), Laranja (Mid-Low), Vermelho (Bottom)
        const CLUSTER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

        const points = clustered.map(p => {
            const over = overrides[p.original.id];
            const cIdx = over !== undefined ? over : p.clusterIndex;
            return {
                ...p,
                clusterIndex: cIdx,
                color: showClusters ? CLUSTER_COLORS[cIdx % CLUSTER_COLORS.length] : (p.original.cor || '#111827')
            };
        });

        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const clusterMap = new Map<number, {color: string, points: {x: number, y: number}[]}>();
        points.forEach(p => {
            if (!clusterMap.has(p.clusterIndex)) clusterMap.set(p.clusterIndex, {color: p.color, points: []});
            clusterMap.get(p.clusterIndex)!.points.push({x: p.x, y: p.y});
        });

        const clusters = Array.from(clusterMap.entries()).map(([index, data]) => {
            const cx = data.points.reduce((a,b) => a+b.x, 0) / data.points.length;
            const cy = data.points.reduce((a,b) => a+b.y, 0) / data.points.length;
            return {
                id: `Padrão ${String.fromCharCode(65 + index)}`,
                color: data.color,
                hull: getConvexHull(data.points),
                cx, cy
            };
        });

        const marginX = (maxX - minX) * 0.1 || 1;
        const marginY = (maxY - minY) * 0.1 || 1;

        const drawMinX = Math.max(0, minX - marginX);
        const drawMaxX = maxX + marginX;
        const drawMinY = Math.max(0, minY - marginY);
        const drawMaxY = maxY + marginY;

        return {
            points,
            clusters,
            drawMinX, drawMaxX,
            drawMinY, drawMaxY,
            rangeX: drawMaxX - drawMinX,
            rangeY: drawMaxY - drawMinY
        };
    }, [samples, xAxis, yAxis, showClusters]);

    return (
        <div className="w-full bg-white border border-black p-8 animate-fade-in relative flex flex-col gap-8 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 border-b border-black pb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-black text-white">
                        <Compass className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-serif text-black uppercase tracking-widest leading-none mb-1">Explorador de Cenários</h3>
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-medium">
                            Análise cruzada de dispersão comportamental
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                
                {/* Lateral Esquerda - Controles e Explicação */}
                <div className="w-full lg:w-72 flex flex-col gap-6">
                    <div className="space-y-3">
                        <span className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest block border-b border-neutral-100 pb-2">Cenários Inteligentes (Presets)</span>
                        <div className="flex flex-col gap-2">
                            {PRESETS.map(preset => {
                                const Icon = preset.icon;
                                const isActive = activePreset.id === preset.id;
                                return (
                                    <button 
                                        key={preset.id}
                                        onClick={() => applyPreset(preset)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 text-left transition-all border",
                                            isActive 
                                                ? "bg-black text-white border-black shadow-md" 
                                                : "bg-white text-neutral-600 border-neutral-200 hover:border-black hover:shadow-sm"
                                        )}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">{preset.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Explicação e Distribuição */}
                    <div className="bg-neutral-50 p-5 border border-neutral-200 rounded-lg space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-neutral-800">
                                <Lightbulb className="h-4 w-4 text-yellow-500" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Inteligência do Cenário</span>
                            </div>
                        </div>
                        
                        <p className="text-[11px] leading-relaxed text-neutral-600">
                            {activePreset.description}
                        </p>

                        <div className="pt-4 border-t border-neutral-200 grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">Eixo X (Horizontal)</span>
                                <strong className="text-[10px] uppercase">{activePreset.descX}</strong>
                            </div>
                            <div>
                                <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">Eixo Y (Vertical)</span>
                                <strong className="text-[10px] uppercase">{activePreset.descY}</strong>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Área do Gráfico */}
                <div className="flex-1 relative min-h-[500px] bg-neutral-50/50 border border-black p-2 sm:p-6 flex flex-col overflow-hidden">
                    
                    {/* Seletor de Modo de Visualização */}
                    <div className="flex items-center gap-1 mb-6 bg-white border border-black p-1 self-start shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                        {[
                            { id: 'scatter', label: 'Mapa 2D', icon: LayoutGrid },
                            { id: 'averages', label: 'Médias', icon: BarChart3 },
                            { id: 'kpi_table', label: 'Tabela KPI', icon: TableIcon },
                            { id: 'histogram', label: 'Distribuição', icon: AlignLeft }
                        ].map(mode => {
                            const Icon = mode.icon;
                            return (
                                <button
                                    key={mode.id}
                                    onClick={() => setViewMode(mode.id as any)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 text-[9px] font-bold uppercase tracking-widest transition-all",
                                        viewMode === mode.id ? "bg-black text-white" : "text-neutral-500 hover:bg-neutral-100"
                                    )}
                                >
                                    <Icon className="h-3 w-3" />
                                    {mode.label}
                                </button>
                            );
                        })}
                    </div>
                    {!chartData ? (
                        <div className="flex-1 flex items-center justify-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
                            Sem dados suficientes
                        </div>
                    ) : (
                        <div className="relative flex-1 group w-full h-full">
                            
                            {/* MODO MAPA 2D (ORIGINAL) */}
                            {viewMode === 'scatter' && (
                                <svg viewBox="0 0 800 400" className="w-full h-full overflow-visible" onMouseLeave={() => setHoveredPoint(null)}>
                                    <defs>
                                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                            <circle cx="2" cy="2" r="1" fill="#e5e5e5" />
                                        </pattern>
                                    </defs>
                                    
                                    <rect x="50" y="20" width="730" height="340" fill="url(#grid)" />

                                    {/* Nuvens de Dispersão */}
                                    {showClusters && chartData.clusters.map(cluster => {
                                        if (cluster.hull.length < 3) return null;
                                        const path = cluster.hull.map(p => {
                                            const px = 50 + ((p.x - chartData.drawMinX) / chartData.rangeX) * 730;
                                            const py = 360 - ((p.y - chartData.drawMinY) / chartData.rangeY) * 340;
                                            return `${px},${py}`;
                                        }).join(' ');

                                        return (
                                            <g key={`hull-${cluster.id}`} className="group/cluster">
                                                <polygon points={path} fill={cluster.color} opacity="0.1" strokeLinejoin="round" className="transition-all duration-300 group-hover/cluster:opacity-30" />
                                                <polygon points={path} fill="none" stroke={cluster.color} strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" opacity="0.5" className="transition-all duration-300 group-hover/cluster:opacity-100 group-hover/cluster:stroke-2" />
                                                <text x={50 + ((cluster.hull[0].x - chartData.drawMinX) / chartData.rangeX) * 730} y={(360 - ((cluster.hull[0].y - chartData.drawMinY) / chartData.rangeY) * 340) - 10} fill={cluster.color} className="text-[10px] font-black uppercase font-mono">{cluster.id}</text>
                                            </g>
                                        );
                                    })}

                                    {/* Médias */}
                                    {showClusters && chartData.clusters.map(cluster => {
                                        if (cluster.hull.length < 3) return null;
                                        const cxPx = 50 + ((cluster.cx - chartData.drawMinX) / chartData.rangeX) * 730;
                                        const cyPx = 360 - ((cluster.cy - chartData.drawMinY) / chartData.rangeY) * 340;
                                        return (
                                            <g key={`centroid-${cluster.id}`}>
                                                <circle cx={cxPx} cy={cyPx} r="4" fill={cluster.color} stroke="white" strokeWidth="1" />
                                                <rect x={cxPx - 16} y={cyPx + 6} width="32" height="12" fill={cluster.color} rx="2" opacity="0.8"/>
                                                <text x={cxPx} y={cyPx + 14} fill="white" textAnchor="middle" className="text-[7px] font-bold font-mono tracking-widest">MÉDIA</text>
                                            </g>
                                        );
                                    })}

                                    {/* Bolinhas */}
                                    {chartData.points.map(p => {
                                        const px = 50 + ((p.x - chartData.drawMinX) / chartData.rangeX) * 730;
                                        const py = 360 - ((p.y - chartData.drawMinY) / chartData.rangeY) * 340;
                                        const isHovered = hoveredPoint?.original.id === p.original.id;
                                        return (
                                            <g key={p.original.id} onMouseEnter={() => setHoveredPoint(p)} onClick={() => setSelectingColorPoint(p)} className="cursor-crosshair">
                                                {isHovered && <circle cx={px} cy={py} r="12" fill={p.color} opacity="0.2" className="animate-pulse" />}
                                                <circle cx={px} cy={py} r={isHovered ? "8" : "6"} fill={p.color} opacity={hoveredPoint && !isHovered ? 0.2 : 0.9} stroke="white" strokeWidth={isHovered ? "2" : "1"} className="transition-all duration-200" />
                                            </g>
                                        );
                                    })}
                                    <text x="415" y="395" textAnchor="middle" className="text-[9px] font-black uppercase tracking-widest fill-black opacity-40">{String(xAxis)} ( {chartData.drawMinX.toFixed(1)} → {chartData.drawMaxX.toFixed(1)} )</text>
                                    <text x="-190" y="15" transform="rotate(-90)" textAnchor="middle" className="text-[9px] font-black uppercase tracking-widest fill-black opacity-40">{String(yAxis)} ( {chartData.drawMinY.toFixed(1)} → {chartData.drawMaxY.toFixed(1)} )</text>
                                </svg>
                            )}

                            {/* MODO TABELA KPI (LAUDO) */}
                            {viewMode === 'kpi_table' && (
                                <div className="w-full h-full overflow-auto bg-white border border-black p-4">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b-2 border-black">
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">Padrão</th>
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest">Qtd</th>
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest">Média</th>
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest">Desvio (SD)</th>
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest">CV (%)</th>
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest">Mínimo</th>
                                                <th className="py-3 px-2 text-[10px] font-black uppercase tracking-widest">Máximo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {chartData.clusters.map(cluster => {
                                                const cPoints = chartData.points.filter(p => p.clusterIndex === (cluster.id.split(' ')[1].charCodeAt(0) - 65)).map(p => p.y);
                                                if (cPoints.length === 0) return null;
                                                
                                                const avg = cPoints.reduce((a,b)=>a+b,0) / cPoints.length;
                                                const variance = cPoints.reduce((acc,v) => acc + Math.pow(v - avg, 2), 0) / cPoints.length;
                                                const sd = Math.sqrt(variance);
                                                const cv = (sd / (avg || 1)) * 100;
                                                const min = Math.min(...cPoints);
                                                const max = Math.max(...cPoints);

                                                return (
                                                    <tr key={cluster.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                                        <td className="py-4 px-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 border border-black" style={{backgroundColor: cluster.color}} />
                                                                <span className="text-[11px] font-black uppercase">{cluster.id}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-2 text-[11px] font-mono">{cPoints.length}</td>
                                                        <td className="py-4 px-2 text-[11px] font-mono font-bold">{avg.toFixed(2)}</td>
                                                        <td className="py-4 px-2 text-[11px] font-mono text-neutral-500">{sd.toFixed(3)}</td>
                                                        <td className="py-4 px-2 text-[11px] font-mono text-neutral-500">{cv.toFixed(1)}%</td>
                                                        <td className="py-4 px-2 text-[11px] font-mono">{min.toFixed(2)}</td>
                                                        <td className="py-4 px-2 text-[11px] font-mono">{max.toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* MODO DISTRIBUIÇÃO (HISTOGRAMA) */}
                            {viewMode === 'histogram' && (
                                <svg viewBox="0 0 800 400" className="w-full h-full overflow-visible">
                                    {(() => {
                                        const field = yAxis as string;
                                        const allVals = chartData.points.map(p => p.y);
                                        const minAll = Math.min(...allVals), maxAll = Math.max(...allVals), range = maxAll - minAll || 1;
                                        
                                        const binCount = 12;
                                        const bins = Array.from({length: binCount}).map((_, i) => {
                                            const binMin = minAll + (i / binCount) * range;
                                            const binMax = minAll + ((i + 1) / binCount) * range;
                                            const clusterCounts = chartData.clusters.map(cluster => {
                                                const count = chartData.points.filter(p => 
                                                    p.clusterIndex === (cluster.id.split(' ')[1].charCodeAt(0) - 65) &&
                                                    p.y >= binMin && (i === binCount - 1 ? p.y <= binMax : p.y < binMax)
                                                ).length;
                                                return { color: cluster.color, count };
                                            });
                                            return { binMin, binMax, clusterCounts };
                                        });

                                        const maxTotalInBin = Math.max(...bins.map(b => b.clusterCounts.reduce((sum, c) => sum + c.count, 0))) || 1;

                                        return (
                                            <g transform="translate(60, 40)">
                                                {bins.map((bin, i) => {
                                                    const x = i * (680 / binCount);
                                                    const barWidth = (680 / binCount) - 4;
                                                    let currentY = 300;

                                                    return (
                                                        <g key={i}>
                                                            {bin.clusterCounts.map((c, ci) => {
                                                                const h = (c.count / maxTotalInBin) * 250;
                                                                if (h === 0) return null;
                                                                const bar = <rect key={ci} x={x} y={currentY - h} width={barWidth} height={h} fill={c.color} opacity="0.8" stroke="white" strokeWidth="1" />;
                                                                currentY -= h;
                                                                return bar;
                                                            })}
                                                            <text x={x + barWidth/2} y="320" textAnchor="middle" className="text-[8px] font-mono fill-neutral-400 rotate-45">{bin.binMin.toFixed(2)}</text>
                                                        </g>
                                                    );
                                                })}
                                                <line x1="0" y1="300" x2="680" y2="300" stroke="black" strokeWidth="2" />
                                                <text x="340" y="360" textAnchor="middle" className="text-[10px] font-black uppercase tracking-widest fill-neutral-400">Frequência de Fardos por Faixa de {field.toUpperCase()}</text>
                                            </g>
                                        );
                                    })()}
                                </svg>
                            )}



                            {/* Menu Flutuante de Forçar Cor */}
                            {selectingColorPoint && (
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border border-black p-4 shadow-2xl z-[60] animate-fade-in flex flex-col gap-3">
                                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-1 gap-8">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-black">Forçar Padrão</span>
                                        <button onClick={() => setSelectingColorPoint(null)} className="text-neutral-400 hover:text-black">✕</button>
                                    </div>
                                    <div className="text-[9px] font-mono font-bold uppercase text-neutral-500 mb-2">Amostra #{selectingColorPoint.original.amostra_id}</div>
                                    <div className="flex gap-2">
                                        {['#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map((c, idx) => (
                                            <button
                                                key={c}
                                                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 shadow-sm"
                                                style={{backgroundColor: c, borderColor: selectingColorPoint.original.cor === c ? 'black' : 'transparent'}}
                                                onClick={() => {
                                                    if (onColorChange) onColorChange(selectingColorPoint.original.id, c);
                                                    setOverrides(prev => ({...prev, [selectingColorPoint.original.id]: idx}));
                                                    setSelectingColorPoint(null);
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Floating Tooltip Customizado */}
                            {hoveredPoint && (
                                <div className="absolute top-2 right-2 bg-white border border-black shadow-2xl p-4 w-60 pointer-events-none z-50 animate-fade-in">
                                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-3">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">AMOSTRA</span>
                                        <div className="w-3 h-3 rounded-full border border-black" style={{backgroundColor: hoveredPoint.color}} />
                                    </div>
                                    
                                    <div className="space-y-1 mb-4">
                                        <div className="text-xl font-mono font-black text-black leading-none">#{hoveredPoint.original.amostra_id}</div>
                                        <div className="text-[10px] font-bold uppercase text-neutral-500">Mala: {hoveredPoint.original.mala || 'N/A'}</div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-2 border border-neutral-200">
                                        <div>
                                            <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">{String(xAxis)} (X)</span>
                                            <strong className="text-sm font-mono">{formatDecimalBR(hoveredPoint.x, 2)}</strong>
                                        </div>
                                        <div>
                                            <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">{String(yAxis)} (Y)</span>
                                            <strong className="text-sm font-mono">{formatDecimalBR(hoveredPoint.y, 2)}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>

            {/* Gráfico de Tendência (Impacto do Cenário) */}
            {chartData && (
                <div className="mt-8 pt-8 border-t border-neutral-300">
                    <div className="mb-8 flex flex-col items-start">
                        <h4 className="text-xl font-serif text-black uppercase tracking-widest leading-none mb-2">Impacto do Cenário (Tendência Temporal)</h4>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium max-w-2xl">
                            Visualização da oscilação de qualidade ao longo da linha de processamento do laboratório. 
                            {showClusters && " As amostras foram pintadas para refletir a sua proximidade de padrões geométricos descobertos pela inteligência Euclidiana no cenário acima."}
                        </p>
                    </div>
                    
                    <div className="bg-white p-4 sm:p-8 border border-neutral-200">
                        <ClusterTrendChart 
                            points={chartData.points} 
                            yAxis={String(yAxis)} 
                            labelY={activePreset.descY}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

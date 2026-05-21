import { useState, useMemo, useEffect, useRef } from "react";
import type { Sample } from "@/entities/Sample";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { cn } from "@/lib/utils";
import { Compass, Lightbulb, Activity, Target, Fingerprint, LayoutGrid, BarChart3, Table as TableIcon, AlignLeft, Sparkles, TrendingUp, AlertTriangle, Tag } from "lucide-react";

// ── Componentes auxiliares (evita inline style= flagado pelo linter) ────────────
function ColorDot({ color, className }: { color: string; className: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { if (ref.current) ref.current.style.backgroundColor = color; }, [color]);
    return <div ref={ref} className={className} />;
}
function ClusterBorderDiv({ color, className, children }: { color: string; className: string; children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { if (ref.current) ref.current.style.borderColor = color; }, [color]);
    return <div ref={ref} className={className}>{children}</div>;
}
function CVSpan({ color, className, children }: { color: string; className: string; children: React.ReactNode }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => { if (ref.current) ref.current.style.color = color; }, [color]);
    return <span ref={ref} className={className}>{children}</span>;
}
function CVBarDiv({ widthPct, color, className }: { widthPct: number; color: string; className: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!ref.current) return;
        ref.current.style.width = `${widthPct}%`;
        ref.current.style.backgroundColor = color;
    }, [widthPct, color]);
    return <div ref={ref} className={className} />;
}
function ScenarioColorBtn({ color, active, onClick, ariaLabel, title, className }: {
    color: string; active: boolean; onClick: () => void; ariaLabel: string; title: string; className: string;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!ref.current) return;
        ref.current.style.backgroundColor = color;
        ref.current.style.borderColor = active ? 'black' : 'transparent';
    }, [color, active]);
    return <button ref={ref} aria-label={ariaLabel} title={title} onClick={onClick} className={className} />;
}

// ── Funções matemáticas e utilitárias de análise ────────────────────────────────
const getNum = (sample: Sample, key: keyof Sample): number => {
    const raw = sample[key];
    if (typeof raw === 'number') return raw;
    const parsed = parseFloat(String(raw || '0').replace(',', '.'));
    return isNaN(parsed) ? 0 : parsed;
};

// Calcula a correlação de Pearson entre dois parâmetros das amostras
function calculatePearson(samples: Sample[], key1: keyof Sample, key2: keyof Sample): number {
    const valid = samples.filter(s => {
        const v1 = getNum(s, key1);
        const v2 = getNum(s, key2);
        return v1 > 0 && v2 > 0;
    });
    if (valid.length < 2) return 0;
    
    const n = valid.length;
    const x = valid.map(s => getNum(s, key1));
    const y = valid.map(s => getNum(s, key2));
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, val, i) => acc + val * y[i], 0);
    const sumX2 = x.reduce((acc, val) => acc + val * val, 0);
    const sumY2 = y.reduce((acc, val) => acc + val * val, 0);
    
    const num = (n * sumXY) - (sumX * sumY);
    const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
    if (den === 0) return 0;
    return num / den;
}

// Calcula um Score de Qualidade de 0 a 100 para cada amostra com base nos padrões HVI
function calculateSampleScore(s: Sample): number {
    let score = 0;
    const mic = getNum(s, 'mic');
    const len = getNum(s, 'len');
    const str = getNum(s, 'str');
    const unf = getNum(s, 'unf');
    const rd = getNum(s, 'rd');
    const b = getNum(s, 'b');

    // MIC premium range: 3.8 - 4.9 (20 pontos)
    if (mic >= 3.8 && mic <= 4.9) score += 20;
    else if (mic > 0) {
        const dist = Math.min(Math.abs(mic - 3.8), Math.abs(mic - 4.9));
        score += Math.max(0, 20 - dist * 15);
    }
    
    // LEN > 1.10 polegadas (20 pontos)
    if (len > 1.10) score += 20;
    else if (len > 0) score += Math.max(0, (len / 1.10) * 20);

    // STR > 30 g/tex (20 pontos)
    if (str > 30) score += 20;
    else if (str > 0) score += Math.max(0, (str / 30) * 20);

    // UNF > 83% (20 pontos)
    if (unf > 83) score += 20;
    else if (unf > 0) score += Math.max(0, (unf / 83) * 20);

    // RD > 76% (10 pontos)
    if (rd > 76) score += 10;
    else if (rd > 0) score += Math.max(0, (rd / 76) * 10);

    // +b no range comercial padrão [7 - 11] (10 pontos)
    if (b >= 7 && b <= 11) score += 10;
    else if (b > 0) {
        const dist = Math.min(Math.abs(b - 7), Math.abs(b - 11));
        score += Math.max(0, 10 - dist * 2);
    }

    return Math.round(score);
}



function ClusterTrendChart({ points, yAxis }: { points: any[], yAxis: string }) {
    const [hoveredPoint, setHoveredPoint] = useState<any>(null);
    const [viewField, setViewField] = useState(yAxis);

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

            {hoveredPoint && (
                <div className="absolute top-0 right-0 bg-white border border-black shadow-2xl p-4 w-52 pointer-events-none z-50 animate-fade-in mt-12">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-3">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">AMOSTRA</span>
                        <ColorDot color={hoveredPoint.color} className="w-3 h-3 rounded-full border border-black" />
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

    const cx = hull.reduce((a, b) => a + b.x, 0) / hull.length;
    const cy = hull.reduce((a, b) => a + b.y, 0) / hull.length;
    
    return hull.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

function smartClassify1D(points: {x: number, y: number, original: any, clusterIndex?: number}[]) {
    if (points.length === 0) return [];
    
    const vals = points.map(p => p.y);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
    const std = Math.sqrt(variance);

    if (std === 0) return points.map(p => ({...p, clusterIndex: 0}));

    const sorted = [...points].sort((a,b) => b.y - a.y);
    
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        gaps.push({ index: i, diff: sorted[i].y - sorted[i+1].y });
    }

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
    const [showClusters, setShowClusters] = useState(false);
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    
    // Suporte aos novos modos de visualização requisitados
    // Suporte aos novos modos de visualização requisitados
    const [viewMode, setViewMode] = useState<'scatter' | 'kpi_table' | 'radar' | 'heatmap'>('scatter');

    const applyPreset = (preset: typeof PRESETS[0]) => {
        setActivePreset(preset);
        setXAxis(preset.x as keyof Sample);
        setYAxis(preset.y as keyof Sample);
    };

    // Processamento central de dados
    const chartData = useMemo(() => {
        const basePoints = samples.map(s => {
            const xRaw = s[xAxis];
            const yRaw = s[yAxis];
            const x = typeof xRaw === 'number' ? xRaw : parseFloat(String(xRaw || 0).replace(',', '.'));
            const y = typeof yRaw === 'number' ? yRaw : parseFloat(String(yRaw || 0).replace(',', '.'));
            
            return { original: s, x, y };
        }).filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x > 0 && p.y > 0);

        if (basePoints.length === 0) return null;

        const clustered = smartClassify1D(basePoints);
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

        const clusterMap = new Map<string | number, {color: string, points: {x: number, y: number}[]}>();
        points.forEach(p => {
            const key = showClusters ? p.clusterIndex : (p.original.cor || 'sem_cor');
            if (!clusterMap.has(key)) {
                clusterMap.set(key, {color: p.color, points: []});
            }
            clusterMap.get(key)!.points.push({x: p.x, y: p.y});
        });

        const clusters = Array.from(clusterMap.entries()).map(([key, data]) => {
            const cx = data.points.reduce((a,b) => a+b.x, 0) / data.points.length;
            const cy = data.points.reduce((a,b) => a+b.y, 0) / data.points.length;
            
            let label = `Padrão ${String.fromCharCode(65 + Number(key))}`;
            if (!showClusters) {
                if (key === '#10b981') label = 'VERDE';
                else if (key === '#3b82f6') label = 'AZUL';
                else if (key === '#f59e0b') label = 'AMARELO';
                else if (key === '#ef4444') label = 'VERMELHO';
                else if (key === 'ANULADA') label = 'ANULADA';
                else label = 'SEM CLASS.';
            }

            return {
                id: label,
                color: data.color,
                hull: getConvexHull(data.points),
                cx, cy,
                key
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
    }, [samples, xAxis, yAxis, showClusters, overrides]);



    // Métricas para cards do cabeçalho
    const summaryMetrics = useMemo(() => {
        if (samples.length === 0) return { total: 0, clusters: 0, avgScore: 0, outliers: 0 };
        
        let scoreSum = 0;
        samples.forEach(s => {
            scoreSum += calculateSampleScore(s);
        });

        // Contar outliers globais usando Micronaire como base de exemplo de anomalia física
        const micVals = samples.map(s => getNum(s, 'mic')).filter(v => v > 0);
        let outliersCount = 0;
        if (micVals.length > 0) {
            const mean = micVals.reduce((a, b) => a + b, 0) / micVals.length;
            const std = Math.sqrt(micVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / micVals.length);
            samples.forEach(s => {
                const v = getNum(s, 'mic');
                if (v > 0 && (v > mean + 2 * std || v < mean - 2 * std)) {
                    outliersCount++;
                }
            });
        }

        return {
            total: samples.length,
            clusters: chartData?.clusters.length || 0,
            avgScore: Math.round(scoreSum / samples.length),
            outliers: outliersCount
        };
    }, [samples, chartData]);



    // Normalização das variáveis para o radar (intervalos dinâmicos do lote)
    const radarData = useMemo(() => {
        if (!chartData || chartData.clusters.length === 0) return null;
        
        const params: (keyof Sample)[] = ['mic', 'len', 'unf', 'str', 'rd', 'b'];
        
        // Achar mínimos e máximos globais para normalização
        const minMax = params.reduce((acc, p) => {
            const vals = samples.map(s => getNum(s, p)).filter(v => v > 0);
            acc[p] = {
                min: vals.length > 0 ? Math.min(...vals) : 0,
                max: vals.length > 0 ? Math.max(...vals) : 100
            };
            return acc;
        }, {} as Record<string, { min: number; max: number }>);

        // Para cada cluster, computar as médias normalizadas
        return chartData.clusters.map(cluster => {
            const clusterPoints = chartData.points.filter(p => showClusters ? p.clusterIndex === cluster.key : (p.original.cor || 'sem_cor') === cluster.key);
            
            const avgs = params.map(p => {
                const vals = clusterPoints.map(pt => getNum(pt.original, p)).filter(v => v > 0);
                const avg = vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
                
                // Normalizar
                const limits = minMax[p];
                const range = limits.max - limits.min || 1;
                const normVal = Math.min(Math.max((avg - limits.min) / range, 0), 1);
                return { key: p, avg, normVal };
            });

            return {
                id: cluster.id,
                color: cluster.color,
                averages: avgs
            };
        });
    }, [samples, chartData]);

    // Matriz de correlação de Pearson
    const correlationMatrix = useMemo(() => {
        const fields: { key: keyof Sample; label: string }[] = [
            { key: 'mic', label: 'MIC' },
            { key: 'len', label: 'LEN' },
            { key: 'unf', label: 'UNF' },
            { key: 'str', label: 'STR' },
            { key: 'rd', label: 'RD' },
            { key: 'b', label: '+B' }
        ];

        const matrix: { x: string; y: string; r: number }[][] = [];
        fields.forEach(f1 => {
            const row: { x: string; y: string; r: number }[] = [];
            fields.forEach(f2 => {
                if (f1.key === f2.key) {
                    row.push({ x: f1.label, y: f2.label, r: 1.0 });
                } else {
                    const r = calculatePearson(samples, f1.key, f2.key);
                    row.push({ x: f1.label, y: f2.label, r });
                }
            });
            matrix.push(row);
        });

        return { fields, matrix };
    }, [samples]);



    return (
        <div className="w-full bg-white border border-black p-4 sm:p-8 animate-fade-in relative flex flex-col gap-6 sm:gap-8 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            
            {/* Cabeçalho Expandido com 3 cards de sumário */}
            <div className="flex flex-col gap-6 border-b border-black pb-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-black text-white shadow-sm">
                            <Compass className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-xl sm:text-2xl font-serif text-black uppercase tracking-widest leading-none mb-1">Explorador de Cenários HVI</h3>
                            <div className="flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                                <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider">Cenários Estatísticos HVI</span>
                            </div>
                            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mt-1">
                                Monitoramento Estatístico de Cenários e Lotes HVI
                            </p>
                        </div>
                    </div>
                </div>

                {/* Grid Premium de Resumo HVI */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                    <div className="bg-neutral-50 border border-neutral-200 p-4 shadow-sm hover:border-black transition-all">
                        <span className="text-[8px] sm:text-[9px] font-bold uppercase text-neutral-400 tracking-wider block">Total de Amostras</span>
                        <div className="text-xl sm:text-2xl font-mono font-black text-black mt-1">
                            {summaryMetrics.total} <span className="text-xs font-serif font-normal text-neutral-400">fardos</span>
                        </div>
                        <span className="text-[8px] text-neutral-500 uppercase tracking-widest mt-1 block">Fardas processadas</span>
                    </div>

                    <div className="bg-neutral-50 border border-neutral-200 p-4 shadow-sm hover:border-black transition-all">
                        <span className="text-[8px] sm:text-[9px] font-bold uppercase text-neutral-400 tracking-wider block">Padrões Identificados</span>
                        <div className="text-xl sm:text-2xl font-mono font-black text-black mt-1">
                            {summaryMetrics.clusters} <span className="text-xs font-serif font-normal text-neutral-400">clusters</span>
                        </div>
                        <span className="text-[8px] text-neutral-500 uppercase tracking-widest mt-1 block">Agrupamento Euclidiano</span>
                    </div>

                    <div className="bg-neutral-50 border border-neutral-200 p-4 shadow-sm hover:border-black transition-all">
                        <span className="text-[8px] sm:text-[9px] font-bold uppercase text-neutral-400 tracking-wider block">Score Médio Geral</span>
                        <div className="text-xl sm:text-2xl font-mono font-black text-emerald-600 mt-1">
                            {summaryMetrics.avgScore} <span className="text-xs font-serif font-normal text-neutral-400">/ 100</span>
                        </div>
                        <span className="text-[8px] text-neutral-500 uppercase tracking-widest mt-1 block">Média ponderada do lote</span>
                    </div>

                    <div className={cn(
                        "border p-4 shadow-sm hover:border-black transition-all",
                        summaryMetrics.outliers > 0 ? "bg-rose-50 border-rose-200" : "bg-neutral-50 border-neutral-200"
                    )}>
                        <span className="text-[8px] sm:text-[9px] font-bold uppercase text-neutral-400 tracking-wider block">Anomalias de Leitura</span>
                        <div className={cn(
                            "text-xl sm:text-2xl font-mono font-black mt-1",
                            summaryMetrics.outliers > 0 ? "text-rose-600" : "text-black"
                        )}>
                            {summaryMetrics.outliers} <span className="text-xs font-serif font-normal text-neutral-400">outliers</span>
                        </div>
                        <span className="text-[8px] text-neutral-500 uppercase tracking-widest mt-1 block">Amostras fora da curva</span>
                    </div>
                </div>
            </div>

            {/* Layout de 3 Colunas: Esquerda (Presets), Centro (Gráfico), Direita (IA) */}
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-stretch">
                
                {/* Coluna Esquerda - Controles e Preset */}
                <div className="w-full lg:w-64 shrink-0 flex flex-col gap-6">
                    <div className="space-y-3">
                        <span className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest block border-b border-neutral-100 pb-2">Cenários de Agrupamento</span>
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
                                                ? "bg-black text-white border-black shadow-[4px_4px_0px_rgba(0,0,0,0.15)]" 
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

                    {/* Distribuição no Eixo */}
                    <div className="bg-neutral-50 p-4 border border-neutral-200 rounded-sm space-y-3">
                        <div className="flex items-center gap-2 text-neutral-800 border-b border-neutral-200 pb-2">
                            <Lightbulb className="h-4 w-4 text-yellow-500" />
                            <span className="text-[9px] font-bold uppercase tracking-widest">Equilíbrio do Cenário</span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-neutral-600">
                            {activePreset.description}
                        </p>
                        <div className="pt-2 grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                                <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">Eixo X</span>
                                <strong className="font-mono font-bold uppercase text-neutral-700">{activePreset.descX}</strong>
                            </div>
                            <div>
                                <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">Eixo Y</span>
                                <strong className="font-mono font-bold uppercase text-neutral-700">{activePreset.descY}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Coluna Central - Gráficos e Seletor de Modo */}
                <div className="flex-1 min-h-[500px] bg-neutral-50/30 border border-black p-4 sm:p-6 flex flex-col overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,0.05)]">
                    
                    {/* Seletor Superior de Visualizações e Modo de Cor */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        {/* Menu Superior - Seleção de Gráficos (Premium) */}
                        <div className="flex flex-wrap items-center gap-1 bg-white border border-black p-1 self-start shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                            {[
                                { id: 'scatter', label: 'Mapa 2D', icon: LayoutGrid },
                                { id: 'radar', label: 'Radar Fibra', icon: Compass },
                                { id: 'heatmap', label: 'Correlação', icon: BarChart3 },
                                { id: 'kpi_table', label: 'Tabela HVI', icon: TableIcon }
                            ].map(mode => {
                                const Icon = mode.icon;
                                return (
                                    <button
                                        key={mode.id}
                                        onClick={() => setViewMode(mode.id as any)}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-2 text-[9px] font-bold uppercase tracking-widest transition-all",
                                            viewMode === mode.id ? "bg-black text-white" : "text-neutral-500 hover:bg-neutral-100"
                                        )}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {mode.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Toggle Visual Premium para Modo de Cor */}
                        <div className="flex items-center gap-1 bg-white border border-black p-1 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                            <button
                                type="button"
                                onClick={() => setShowClusters(false)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 text-[9px] font-bold uppercase tracking-widest transition-all",
                                    !showClusters ? "bg-black text-white" : "text-neutral-500 hover:bg-neutral-100"
                                )}
                            >
                                <Tag className="h-3.5 w-3.5" />
                                Cores do Usuário
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowClusters(true)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 text-[9px] font-bold uppercase tracking-widest transition-all",
                                    showClusters ? "bg-black text-white" : "text-neutral-500 hover:bg-neutral-100"
                                )}
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Clusters da IA
                            </button>
                        </div>
                    </div>

                    {!chartData ? (
                        <div className="flex-1 flex items-center justify-center text-xs font-bold text-neutral-400 uppercase tracking-widest">
                            Sem fardos válidos cadastrados no lote
                        </div>
                    ) : (
                        <div className="relative flex-1 group w-full h-full">
                            
                            {/* 1. MODO MAPA 2D (FIBRA DISPERSÃO ORIGINAL PRESERVADO) */}
                            {viewMode === 'scatter' && (
                                <div className="animate-fade-in w-full h-full">
                                    <svg viewBox="0 0 800 420" className="w-full h-full min-h-[400px] overflow-visible animate-fade-in" onMouseLeave={() => setHoveredPoint(null)}>
                                        <g className="grid-lines">
                                            {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                                                const y = 360 - (pct * 340);
                                                const val = chartData.drawMinY + (pct * chartData.rangeY);
                                                return (
                                                    <g key={`grid-y-${pct}`}>
                                                        <line x1="50" y1={y} x2="780" y2={y} stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 4" />
                                                        <text x="40" y={y + 3} textAnchor="end" className="text-[9px] font-mono fill-neutral-400">{val.toFixed(2)}</text>
                                                    </g>
                                                );
                                            })}
                                            {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                                                const x = 50 + (pct * 730);
                                                const val = chartData.drawMinX + (pct * chartData.rangeX);
                                                return (
                                                    <g key={`grid-x-${pct}`}>
                                                        <line x1={x} y1="20" x2={x} y2="360" stroke="#e5e5e5" strokeWidth="1" strokeDasharray="4 4" />
                                                        <text x={x} y="375" textAnchor="middle" className="text-[9px] font-mono fill-neutral-400">{val.toFixed(2)}</text>
                                                    </g>
                                                );
                                            })}
                                            <line x1="50" y1="360" x2="780" y2="360" stroke="#000" strokeWidth="2" />
                                            <line x1="50" y1="20" x2="50" y2="360" stroke="#000" strokeWidth="2" />
                                        </g>

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
                                                    <polygon points={path} fill="none" stroke={cluster.color} strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" opacity="0.6" className="transition-all duration-300 group-hover/cluster:opacity-100 group-hover/cluster:stroke-2" />
                                                    <text x={50 + ((cluster.hull[0].x - chartData.drawMinX) / chartData.rangeX) * 730} y={(360 - ((cluster.hull[0].y - chartData.drawMinY) / chartData.rangeY) * 340) - 10} fill={cluster.color} className="text-[10px] font-black uppercase font-mono bg-white">{cluster.id}</text>
                                                </g>
                                            );
                                        })}

                                        {showClusters && chartData.clusters.map(cluster => {
                                            if (cluster.hull.length < 3) return null;
                                            const cxPx = 50 + ((cluster.cx - chartData.drawMinX) / chartData.rangeX) * 730;
                                            const cyPx = 360 - ((cluster.cy - chartData.drawMinY) / chartData.rangeY) * 340;
                                            return (
                                                <g key={`centroid-${cluster.id}`}>
                                                    <circle cx={cxPx} cy={cyPx} r="5" fill={cluster.color} stroke="white" strokeWidth="1.5" className="shadow-lg" />
                                                    <rect x={cxPx - 18} y={cyPx + 8} width="36" height="14" fill={cluster.color} rx="3" opacity="0.9"/>
                                                    <text x={cxPx} y={cyPx + 17} fill="white" textAnchor="middle" className="text-[8px] font-bold font-mono tracking-widest">MÉDIA</text>
                                                </g>
                                            );
                                        })}

                                        {chartData.points.map(p => {
                                            const px = 50 + ((p.x - chartData.drawMinX) / chartData.rangeX) * 730;
                                            const py = 360 - ((p.y - chartData.drawMinY) / chartData.rangeY) * 340;
                                            const isHovered = hoveredPoint?.original.id === p.original.id;
                                            return (
                                                <g 
                                                    key={p.original.id} 
                                                    onMouseEnter={() => setHoveredPoint(p)} 
                                                    onMouseLeave={() => setHoveredPoint(null)}
                                                    onClick={(e) => { e.stopPropagation(); setSelectingColorPoint(p); }} 
                                                    className="cursor-crosshair"
                                                >
                                                    {isHovered && <circle cx={px} cy={py} r="12" fill={p.color} opacity="0.3" />}
                                                    <circle cx={px} cy={py} r={isHovered ? "8" : "5"} fill={p.color} opacity={hoveredPoint && !isHovered ? 0.15 : 0.9} stroke="white" strokeWidth={isHovered ? "2" : "1"} className="transition-all duration-200 shadow-sm" />
                                                </g>
                                            );
                                        })}
                                        
                                        <text x="415" y="405" textAnchor="middle" className="text-[11px] font-black uppercase tracking-widest fill-black">Eixo X: {String(xAxis).toUpperCase()}</text>
                                        <text x="-190" y="15" transform="rotate(-90)" textAnchor="middle" className="text-[11px] font-black uppercase tracking-widest fill-black">Eixo Y: {String(yAxis).toUpperCase()}</text>
                                    </svg>
                                </div>
                            )}

                            {/* 2. MODO RADAR CHART (SVG RADIAL PURO) [NOVO] */}
                            {viewMode === 'radar' && radarData && (
                                <div className="animate-fade-in w-full h-full flex flex-col md:flex-row items-center justify-center gap-8 py-4">
                                    <div className="relative w-80 h-80 flex items-center justify-center">
                                        <svg viewBox="0 0 360 360" className="w-full h-full overflow-visible">
                                            {/* Grade Hexagonal de Fundo */}
                                            {[0.2, 0.4, 0.6, 0.8, 1].map((pct, scaleIdx) => {
                                                const r = 120 * pct;
                                                const pts = [0, 1, 2, 3, 4, 5].map(i => {
                                                    const theta = i * (2 * Math.PI / 6);
                                                    const x = 180 + r * Math.sin(theta);
                                                    const y = 180 - r * Math.cos(theta);
                                                    return `${x},${y}`;
                                                }).join(' ');

                                                return (
                                                    <polygon 
                                                        key={`grid-radar-${scaleIdx}`} 
                                                        points={pts} 
                                                        fill="none" 
                                                        stroke="#e5e5e5" 
                                                        strokeWidth="1" 
                                                    />
                                                );
                                            })}

                                            {/* Linhas de Eixos Radiais */}
                                            {[0, 1, 2, 3, 4, 5].map(i => {
                                                const theta = i * (2 * Math.PI / 6);
                                                const x = 180 + 120 * Math.sin(theta);
                                                const y = 180 - 120 * Math.cos(theta);
                                                const labels = ['MIC', 'LEN', 'UNF', 'STR', 'RD', '+B'];

                                                return (
                                                    <g key={`axis-${i}`}>
                                                        <line x1="180" y1="180" x2={x} y2={y} stroke="#d4d4d4" strokeWidth="1" />
                                                        {/* Rótulo de Eixo */}
                                                        <text 
                                                            x={180 + 140 * Math.sin(theta)} 
                                                            y={180 - 140 * Math.cos(theta) + 4} 
                                                            textAnchor="middle" 
                                                            className="text-[10px] font-mono font-black fill-neutral-700 uppercase"
                                                        >
                                                            {labels[i]}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {/* Polígonos de cada Cluster */}
                                            {radarData.map((cd, cdIdx) => {
                                                const polyPts = cd.averages.map((avg, i) => {
                                                    const theta = i * (2 * Math.PI / 6);
                                                    // raio de 15 a 120
                                                    const r = 15 + avg.normVal * 105;
                                                    const x = 180 + r * Math.sin(theta);
                                                    const y = 180 - r * Math.cos(theta);
                                                    return `${x},${y}`;
                                                }).join(' ');

                                                return (
                                                    <g key={`radar-poly-${cd.id}`} className="hover:opacity-100 transition-opacity">
                                                        <polygon 
                                                            points={polyPts} 
                                                            fill={cd.color} 
                                                            fillOpacity="0.15" 
                                                            stroke={cd.color} 
                                                            strokeWidth="2.5" 
                                                            strokeLinejoin="round"
                                                        />
                                                        {/* Vértices circulares */}
                                                        {cd.averages.map((avg, i) => {
                                                            const theta = i * (2 * Math.PI / 6);
                                                            const r = 15 + avg.normVal * 105;
                                                            const x = 180 + r * Math.sin(theta);
                                                            const y = 180 - r * Math.cos(theta);

                                                            return (
                                                                <g key={`radar-dot-${cd.id}-${i}`} className="group/dot relative cursor-pointer">
                                                                    <circle 
                                                                        cx={x} 
                                                                        cy={y} 
                                                                        r="4" 
                                                                        fill={cd.color} 
                                                                        stroke="white" 
                                                                        strokeWidth="1.5" 
                                                                    />
                                                                    <title>{cd.id} - Média: {avg.avg.toFixed(2)}</title>
                                                                </g>
                                                            );
                                                        })}
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>

                                    {/* Legenda Lateral */}
                                    <div className="flex flex-col gap-3 min-w-[140px] bg-white border border-neutral-200 p-4 shadow-sm self-stretch justify-center">
                                        <span className="text-[9px] font-black uppercase text-neutral-400 tracking-wider">Clusters HVI</span>
                                        {radarData.map(cd => (
                                            <div key={`leg-${cd.id}`} className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <ColorDot color={cd.color} className="w-3 h-3 rounded-full shrink-0" />
                                                    <span className="text-[10px] font-bold font-mono">{cd.id}</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 pl-5 text-[8px] font-mono text-neutral-400">
                                                    {cd.averages.map(avg => (
                                                        <span key={avg.key}>{avg.key.toUpperCase()}: {avg.avg.toFixed(1)}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 3. MODO HEATMAP DE CORRELAÇÃO DE PEARSON (6X6 SVG) [NOVO] */}
                            {viewMode === 'heatmap' && (
                                <div className="animate-fade-in w-full h-full flex flex-col items-center justify-center gap-6 py-4">
                                    <div className="w-full max-w-lg bg-white border border-black p-4 shadow-lg">
                                        <div className="text-center mb-4">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Matriz de Correlação HVI (Pearson r)</span>
                                            <p className="text-[8px] text-neutral-500 uppercase tracking-widest">
                                                Fórmula de Pearson calculando tendências mutáveis de fibra
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-7 gap-1 font-mono text-[9px]">
                                            {/* Rótulo superior */}
                                            <div className="h-8 shrink-0 flex items-center justify-center font-bold text-neutral-400">EIXO</div>
                                            {correlationMatrix.fields.map(f => (
                                                <div key={`h-lbl-${f.label}`} className="h-8 flex items-center justify-center font-black text-black text-center">{f.label}</div>
                                            ))}

                                            {/* Células da matriz */}
                                            {correlationMatrix.matrix.map((row, rowIdx) => {
                                                const label = correlationMatrix.fields[rowIdx].label;
                                                return (
                                                    <use key={`row-${rowIdx}`} className="contents">
                                                        {/* Rótulo lateral esquerdo */}
                                                        <div className="h-10 flex items-center justify-end pr-2 font-black text-black">{label}</div>
                                                        {row.map((cell, colIdx) => {
                                                            const isDiagonal = rowIdx === colIdx;
                                                            const r = cell.r;
                                                            
                                                            // Estilo HSL dinâmico: r>0 esmeralda, r<0 carmim
                                                            let bgClass = "bg-neutral-100";
                                                            let style: React.CSSProperties = {};
                                                            
                                                            if (isDiagonal) {
                                                                style = { backgroundColor: '#f5f5f5', color: '#737373' };
                                                            } else if (r > 0) {
                                                                style = { 
                                                                    backgroundColor: `rgba(16, 185, 129, ${Math.min(r * 0.9, 0.9)})`,
                                                                    color: r > 0.4 ? 'white' : 'black',
                                                                    fontWeight: 'bold'
                                                                };
                                                            } else if (r < 0) {
                                                                style = { 
                                                                    backgroundColor: `rgba(239, 68, 68, ${Math.min(Math.abs(r) * 0.9, 0.9)})`,
                                                                    color: Math.abs(r) > 0.4 ? 'white' : 'black',
                                                                    fontWeight: 'bold'
                                                                };
                                                            }

                                                            return (
                                                                <div 
                                                                    key={`cell-${rowIdx}-${colIdx}`}
                                                                    style={style}
                                                                    className="h-10 border border-neutral-200/50 flex flex-col items-center justify-center rounded-sm transition-all hover:scale-105 hover:shadow-md cursor-help relative group"
                                                                >
                                                                    <span className="text-[10px] font-mono leading-none">{r === 1 ? '1.00' : r.toFixed(2)}</span>
                                                                    
                                                                    {/* Tooltip Hover no Heatmap */}
                                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 bg-black text-white text-[8px] font-mono font-bold uppercase py-1 px-2 rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 mb-1 whitespace-nowrap shadow-xl border border-neutral-800">
                                                                        {correlationMatrix.fields[rowIdx].label} × {correlationMatrix.fields[colIdx].label} = {r.toFixed(4)}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </use>
                                                );
                                            })}
                                        </div>

                                        {/* Escala de Cores do Heatmap */}
                                        <div className="flex items-center justify-between mt-5 pt-3 border-t border-neutral-100 text-[8px] font-black uppercase text-neutral-400 tracking-wider">
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 inline-block rounded-sm" /> Inversa (-1)</span>
                                            <span>Sem Correlação (0)</span>
                                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 inline-block rounded-sm" /> Direta (+1)</span>
                                        </div>
                                    </div>
                                </div>
                            )}



                            {/* 5. MODO TABELA KPI (LAUDO) — ORIGINAL PRESERVADA */}
                            {viewMode === 'kpi_table' && (
                                <div className="w-full h-full overflow-auto animate-fade-in">
                                    <div className="flex items-stretch gap-px mb-1">
                                        <div className="w-36 shrink-0" />
                                        {chartData.clusters.map(cluster => {
                                            const count = chartData.points.filter(p => showClusters ? p.clusterIndex === cluster.key : (p.original.cor || 'sem_cor') === cluster.key).length;
                                            return (
                                                <ClusterBorderDiv key={cluster.id} color={cluster.color} className="flex-1 min-w-[180px] flex items-center gap-2 px-3 py-2 border-b-4">
                                                    <ColorDot color={cluster.color} className="w-3 h-3 shrink-0" />
                                                    <div>
                                                        <div className="text-[11px] font-black uppercase tracking-widest">{cluster.id}</div>
                                                        <div className="text-[9px] text-neutral-400 font-bold">{count} fardos</div>
                                                    </div>
                                                </ClusterBorderDiv>
                                            );
                                        })}
                                    </div>

                                    <div className="flex items-stretch gap-px mb-2">
                                        <div className="w-36 shrink-0 bg-neutral-100 border border-neutral-200 flex items-center px-3">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Parâmetro</span>
                                        </div>
                                        {chartData.clusters.map(cluster => (
                                            <div key={`sub-${cluster.id}`} className="flex-1 min-w-[180px] bg-neutral-50 border border-neutral-200">
                                                <div className="grid grid-cols-4 gap-0 text-[8px] font-black text-neutral-400 uppercase tracking-wide">
                                                    <span className="px-2 py-1 border-r border-neutral-200">Média</span>
                                                    <span className="px-2 py-1 border-r border-neutral-200">±SD</span>
                                                    <span className="px-2 py-1 border-r border-neutral-200">CV%</span>
                                                    <span className="px-2 py-1">Min→Máx</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {[
                                        { id: 'mic', label: 'MIC', decimals: 2, desc: 'Micronaire' },
                                        { id: 'len', label: 'LEN', decimals: 2, desc: 'Comprimento' },
                                        { id: 'unf', label: 'UNF', decimals: 1, desc: 'Uniformidade' },
                                        { id: 'str', label: 'STR', decimals: 1, desc: 'Resistência' },
                                        { id: 'rd',  label: 'RD',  decimals: 1, desc: 'Refletância' },
                                        { id: 'b',   label: '+B',  decimals: 1, desc: 'Amarelamento' },
                                    ].map((param, rowIdx) => {
                                        const isActiveParam = String(yAxis) === param.id;

                                        const allCVs: number[] = chartData.clusters.map(cluster => {
                                            const vals = chartData.points
                                                .filter(p => showClusters ? p.clusterIndex === cluster.key : (p.original.cor || 'sem_cor') === cluster.key)
                                                .map(p => {
                                                    const raw = (p.original as any)[param.id];
                                                    const v = typeof raw === 'number' ? raw : parseFloat(String(raw || '0').replace(',', '.'));
                                                    return isNaN(v) ? 0 : v;
                                                }).filter(v => v > 0);
                                            if (vals.length === 0) return 0;
                                            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                                            const sd = Math.sqrt(vals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / vals.length);
                                            return (sd / (avg || 1)) * 100;
                                        });
                                        const maxCV = Math.max(...allCVs, 1);

                                        return (
                                            <div
                                                key={param.id}
                                                className={`flex items-stretch gap-px mb-px ${ isActiveParam ? 'ring-1 ring-amber-400 ring-offset-0' : '' }`}
                                            >
                                                <div className={`w-36 shrink-0 flex flex-col justify-center px-3 py-3 border ${ isActiveParam ? 'bg-amber-50 border-amber-200' : rowIdx % 2 === 0 ? 'bg-white border-neutral-100' : 'bg-neutral-50 border-neutral-100' }`}>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`text-[13px] font-black font-mono ${ isActiveParam ? 'text-amber-700' : 'text-black' }`}>{param.label}</span>
                                                        {isActiveParam && <span className="text-[7px] bg-amber-200 text-amber-800 font-black px-1 py-px uppercase tracking-wider">Y</span>}
                                                    </div>
                                                    <span className="text-[9px] text-neutral-400 uppercase tracking-wide">{param.desc}</span>
                                                </div>

                                                {chartData.clusters.map(cluster => {
                                                    const vals = chartData.points
                                                        .filter(p => showClusters ? p.clusterIndex === cluster.key : (p.original.cor || 'sem_cor') === cluster.key)
                                                        .map(p => {
                                                            const raw = (p.original as any)[param.id];
                                                            const v = typeof raw === 'number' ? raw : parseFloat(String(raw || '0').replace(',', '.'));
                                                            return isNaN(v) ? 0 : v;
                                                        }).filter(v => v > 0);

                                                    if (vals.length === 0) {
                                                        return (
                                                            <div key={`${cluster.id}-${param.id}`} className="flex-1 min-w-[180px] flex items-center px-3 border border-neutral-100 text-neutral-200 text-[10px] font-mono">—</div>
                                                        );
                                                    }

                                                    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                                                    const variance = vals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / vals.length;
                                                    const sd = Math.sqrt(variance);
                                                    const cv = (sd / (avg || 1)) * 100;
                                                    const min = Math.min(...vals);
                                                    const max = Math.max(...vals);
                                                    const cvBarPct = Math.min((cv / maxCV) * 100, 100);
                                                    const cvColor = cv < 3 ? '#10b981' : cv < 6 ? '#f59e0b' : '#ef4444';

                                                    return (
                                                        <div
                                                            key={`${cluster.id}-${param.id}`}
                                                            className={`flex-1 min-w-[180px] border ${ isActiveParam ? 'border-amber-100 bg-amber-50/30' : rowIdx % 2 === 0 ? 'border-neutral-100 bg-white' : 'border-neutral-100 bg-neutral-50/40' } hover:bg-neutral-100/50 transition-colors`}
                                                        >
                                                            <div className="grid grid-cols-4 gap-0 h-full">
                                                                <div className="flex items-center px-2 py-3 border-r border-neutral-100">
                                                                    <span className="text-[12px] font-black font-mono text-neutral-800">{avg.toFixed(param.decimals)}</span>
                                                                </div>
                                                                <div className="flex items-center px-2 py-3 border-r border-neutral-100">
                                                                    <span className="text-[10px] font-mono text-neutral-500">{sd.toFixed(param.decimals + 1)}</span>
                                                                </div>
                                                                <div className="flex flex-col justify-center gap-1 px-2 py-2 border-r border-neutral-100">
                                                                    <CVSpan color={cvColor} className="text-[10px] font-black font-mono">{cv.toFixed(1)}%</CVSpan>
                                                                    <div className="h-1 bg-neutral-100 rounded-full w-full overflow-hidden">
                                                                        <CVBarDiv widthPct={cvBarPct} color={cvColor} className="h-full rounded-full transition-all" />
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center px-2 py-3">
                                                                    <span className="text-[8.5px] font-mono text-neutral-400 whitespace-nowrap leading-tight">
                                                                        {min.toFixed(param.decimals)}<br />→ {max.toFixed(param.decimals)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}

                                    <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center gap-5 text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#10b981]" />CV &lt; 3% — Homogêneo</span>
                                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />CV 3–6% — Moderado</span>
                                        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ef4444]" />CV &gt; 6% — Alta Variação</span>
                                        <span className="ml-auto flex items-center gap-1.5"><span className="inline-block w-6 h-2.5 bg-amber-50 border border-amber-300" />Parâmetro ativo do cenário</span>
                                    </div>
                                </div>
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
                                            <ScenarioColorBtn
                                                key={c}
                                                color={c}
                                                active={selectingColorPoint.original.cor === c}
                                                ariaLabel={`Forçar cor ${c}`}
                                                title={`Forçar cor ${c}`}
                                                className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 shadow-sm"
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

                            {/* Floating Tooltip Customizado (Scatter) */}
                            {hoveredPoint && viewMode === 'scatter' && (
                                <div className="absolute top-2 right-2 bg-white border border-black shadow-2xl p-4 w-60 pointer-events-none z-50 animate-fade-in">
                                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-3">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">AMOSTRA</span>
                                        <ColorDot color={hoveredPoint.color} className="w-3 h-3 rounded-full border border-black" />
                                    </div>
                                    
                                    <div className="space-y-1 mb-4">
                                        <div className="text-xl font-mono font-black text-black leading-none">#{hoveredPoint.original.amostra_id}</div>
                                        <div className="text-[10px] font-bold uppercase text-neutral-500">Mala: {hoveredPoint.original.mala || 'N/A'}</div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-2 border border-neutral-200">
                                        <div>
                                            <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">{String(xAxis).toUpperCase()} (X)</span>
                                            <strong className="text-sm font-mono">{formatDecimalBR(hoveredPoint.x, 2)}</strong>
                                        </div>
                                        <div>
                                            <span className="text-[8px] text-neutral-400 uppercase tracking-widest block">{String(yAxis).toUpperCase()} (Y)</span>
                                            <strong className="text-sm font-mono">{formatDecimalBR(hoveredPoint.y, 2)}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>



            </div>

            {/* Gráfico de Linha Cronológico Inferior (Original Preservado) */}
            {chartData && (
                <div className="mt-8 pt-8 border-t border-neutral-300">
                    <div className="mb-6 flex flex-col items-start">
                        <h4 className="text-lg sm:text-xl font-serif text-black uppercase tracking-widest leading-none mb-2">Impacto do Cenário (Tendência Temporal)</h4>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-medium max-w-2xl leading-relaxed">
                            Visualização da oscilação de qualidade ao longo da linha de processamento do laboratório. 
                            {showClusters && " As amostras foram pintadas para refletir a sua proximidade de padrões geométricos descobertos pela inteligência Euclidiana no cenário acima."}
                        </p>
                    </div>
                    
                    <div className="bg-white p-4 sm:p-8 border border-neutral-200 shadow-sm hover:border-black transition-all">
                        <ClusterTrendChart 
                            points={chartData.points} 
                            yAxis={String(yAxis)} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

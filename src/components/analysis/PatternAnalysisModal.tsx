
import { useState } from "react";
import { createPortal } from "react-dom";
import { type Sample } from "@/entities/Sample";
import { X, Bot, Loader2, BarChart3, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeepSeekService } from "@/services/DeepSeekService";

interface PatternAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    samples: Sample[];
    onApplyColors: (updates: Record<string, string>) => void;
}

interface Group {
    id: string;
    label?: string;
    micAvg: number;
    lenAvg: number;
    unfAvg: number;
    strAvg: number;
    rdAvg: number;
    bAvg: number;
    count: number;
    sampleIds: string[];
    color: string | null;
    patternFeatures?: string[];
}

function ClusterScatterPlot({ samples, groups, xAxis, yAxis }: { samples: Sample[], groups: Group[], xAxis: keyof Sample, yAxis: keyof Sample }) {
    // Valid and map points
    const points = samples.map(s => {
        const xRaw = s[xAxis];
        const yRaw = s[yAxis];
        const x = typeof xRaw === 'number' ? xRaw : parseFloat(String(xRaw || 0).replace(',', '.'));
        const y = typeof yRaw === 'number' ? yRaw : parseFloat(String(yRaw || 0).replace(',', '.'));
        
        // Find group color
        const group = groups.find(g => g.sampleIds.includes(s.id));
        const color = group?.color || '#9ca3af';

        return { id: s.id, x, y, color, groupLabel: group?.label || 'S/ Grupo' };
    }).filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x > 0 && p.y > 0);

    if (points.length === 0) return null;

    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));

    const marginX = (maxX - minX) * 0.1 || 1;
    const marginY = (maxY - minY) * 0.1 || 1;

    const drawMinX = Math.max(0, minX - marginX);
    const drawMaxX = maxX + marginX;
    const drawMinY = Math.max(0, minY - marginY);
    const drawMaxY = maxY + marginY;

    const rangeX = drawMaxX - drawMinX;
    const rangeY = drawMaxY - drawMinY;

    const padding = { left: 50, right: 20, top: 20, bottom: 40 };

    return (
        <svg viewBox={`0 0 800 400`} className="w-full h-full overflow-visible">
            {/* Eixos */}
            <line x1={padding.left} y1={400 - padding.bottom} x2={800 - padding.right} y2={400 - padding.bottom} stroke="#e5e5e5" strokeWidth="2" />
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={400 - padding.bottom} stroke="#e5e5e5" strokeWidth="2" />

            {/* Grid Y */}
            {[0.25, 0.5, 0.75, 1].map(pct => {
                const yVal = drawMinY + rangeY * pct;
                const yPos = 400 - padding.bottom - (pct * (400 - padding.top - padding.bottom));
                return (
                    <g key={`y-${pct}`}>
                        <line x1={padding.left} y1={yPos} x2={800 - padding.right} y2={yPos} stroke="#f0f0f0" strokeWidth="1" strokeDasharray="4 4" />
                        <text x={padding.left - 8} y={yPos + 4} textAnchor="end" className="text-[10px] font-mono fill-neutral-400">{yVal.toFixed(2)}</text>
                    </g>
                );
            })}

            {/* Grid X */}
            {[0.25, 0.5, 0.75, 1].map(pct => {
                const xVal = drawMinX + rangeX * pct;
                const xPos = padding.left + (pct * (800 - padding.left - padding.right));
                return (
                    <g key={`x-${pct}`}>
                        <line x1={xPos} y1={padding.top} x2={xPos} y2={400 - padding.bottom} stroke="#f0f0f0" strokeWidth="1" strokeDasharray="4 4" />
                        <text x={xPos} y={400 - padding.bottom + 16} textAnchor="middle" className="text-[10px] font-mono fill-neutral-400">{xVal.toFixed(2)}</text>
                    </g>
                );
            })}

            <text x={padding.left - 30} y={padding.top + (400 - padding.top - padding.bottom) / 2} transform={`rotate(-90 ${padding.left - 30} ${padding.top + (400 - padding.top - padding.bottom) / 2})`} textAnchor="middle" className="text-[10px] font-bold uppercase fill-black">{String(yAxis)}</text>
            <text x={padding.left + (800 - padding.left - padding.right) / 2} y={400 - 10} textAnchor="middle" className="text-[10px] font-bold uppercase fill-black">{String(xAxis)}</text>

            {/* Pontos */}
            {points.map((p, i) => {
                const px = padding.left + ((p.x - drawMinX) / rangeX) * (800 - padding.left - padding.right);
                const py = 400 - padding.bottom - ((p.y - drawMinY) / rangeY) * (400 - padding.top - padding.bottom);
                return (
                    <circle key={p.id} cx={px} cy={py} r="5" fill={p.color} opacity="0.8" stroke="white" strokeWidth="1" className="hover:r-[8px] transition-all cursor-pointer">
                        <title>{`Amostra ID: ${p.id}\nGrupo: ${p.groupLabel}\n${String(xAxis).toUpperCase()}: ${p.x}\n${String(yAxis).toUpperCase()}: ${p.y}`}</title>
                    </circle>
                );
            })}
        </svg>
    );
}

export default function PatternAnalysisModal({ isOpen, onClose, samples, onApplyColors }: PatternAnalysisModalProps) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [scanned, setScanned] = useState(false);

    // AI Report State
    const [aiAnalysis, setAiAnalysis] = useState("");
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);

    // Análise de Padrões Estatísticos
    const runAnalysis = () => {
        setScanned(false);
        setIsScanning(true);

        setTimeout(() => {
            try {
                const result = DeepSeekService.classifySamplesSmart(samples);
                setGroups(result);
            } catch (error) {
                console.error("Erro na identificação de padrões:", error);
            }
            setScanned(true);
            setIsScanning(false);
        }, 1000);
    };

    const handleGenerateReport = async () => {
        setIsAiLoading(true);
        try {
            const analysis = await DeepSeekService.analyzeSamples(samples);
            setAiAnalysis(analysis);
        } catch (error) {
            setAiAnalysis("Erro ao gerar relatório descritivo.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleApply = () => {
        const updates: Record<string, string> = {};

        // Aplicar cores de todos os grupos
        groups.forEach(group => {
            if (group.color) {
                group.sampleIds.forEach(id => {
                    updates[id] = group.color as string;
                });
            }
        });

        onApplyColors(updates);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-5xl max-h-[90vh] bg-white text-black flex flex-col shadow-2xl animate-fade-in border border-black">
                {/* Header */}
                <div className="flex items-center justify-between p-8 border-b border-black">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-serif leading-none flex items-center gap-3">
                            Analista Inteligente
                            <span className="text-sm bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded font-mono font-bold">PADRÕES</span>
                        </h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                            Identificação Estatística de Padrões Laboratoriais HVI
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full" title="Fechar" aria-label="Fechar">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 bg-neutral-50/50">

                    {!scanned ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-6 py-12">
                            <div className={`w-20 h-20 bg-neutral-100 border border-neutral-200 flex items-center justify-center rounded-full ${isScanning ? 'animate-spin' : 'animate-pulse'}`}>
                                {isScanning ? (
                                    <Loader2 className="h-8 w-8 text-black" />
                                ) : (
                                    <BarChart3 className="h-8 w-8 text-black" />
                                )}
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-bold">Iniciar Identificação de Padrões</h3>
                                <p className="text-sm text-neutral-500 max-w-lg mx-auto">
                                    O Analista Inteligente identificará padrões estatísticos e agrupará
                                    <strong> todas as {samples.length} amostras</strong> por comportamento semelhante.
                                    <br /><br />
                                    <span className="text-xs text-neutral-400">
                                        Análise puramente descritiva — Sem aplicação de normas ou tolerâncias.
                                    </span>
                                </p>
                            </div>
                            <Button
                                onClick={runAnalysis}
                                disabled={isScanning}
                                className="px-8 h-12 bg-black text-white hover:bg-neutral-800 uppercase tracking-widest text-xs font-bold rounded-none shadow-lg"
                            >
                                {isScanning ? "Analisando..." : "Identificar Padrões"}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Header dos Resultados */}
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                    Agrupamentos Identificados
                                    <span className="text-neutral-400 font-normal ml-2">
                                        ({groups.reduce((acc, g) => acc + g.count, 0)} amostras = 100%)
                                    </span>
                                </h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={runAnalysis}
                                    className="h-8 text-[10px] uppercase font-bold border-black hover:bg-neutral-50 rounded-none bg-white"
                                >
                                    Reanalisar
                                </Button>
                            </div>

                            {groups.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-neutral-300 bg-white">
                                    <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">
                                        Nenhum padrão estatístico identificado nos dados disponíveis
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {groups.map((group) => {
                                        const features = group.patternFeatures || [];

                                        return (
                                            <div key={group.id}
                                                className="bg-white border-l-4 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm hover:shadow-md transition-all"
                                                ref={(el) => {
                                                    if (el) {
                                                        const c = group.color || '#000';
                                                        el.style.borderLeftColor = c;
                                                        el.style.setProperty('--group-color', c);
                                                    }
                                                }}
                                            >
                                                {/* Estatísticas do Grupo */}
                                                <div className="flex items-center gap-6 flex-1">
                                                    <div
                                                        className="h-14 w-14 flex-shrink-0 text-white flex flex-col items-center justify-center font-mono font-bold leading-none rounded-lg shadow-sm bg-[var(--group-color)]"
                                                    >
                                                        <span className="text-xl">{group.count}</span>
                                                        <span className="text-[8px] opacity-80 uppercase">Obs.</span>
                                                    </div>
                                                    <div className="space-y-3 flex-1">
                                                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                                                            <span className="text-xs uppercase font-bold tracking-widest text-black flex items-center gap-2 min-w-fit">
                                                                <TrendingUp className="h-3 w-3" />
                                                                {group.label || group.id}
                                                            </span>

                                                            {/* Tags de Características do Padrão */}
                                                            <div className="flex flex-wrap gap-2">
                                                                {features.map((feature, i) => (
                                                                    <span key={i} className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200">
                                                                        {feature}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Grid de Estatísticas */}
                                                        <div className="grid grid-cols-6 gap-4 text-xs font-mono border-t border-neutral-100 pt-2 text-neutral-600">
                                                            <div className="text-center">
                                                                <span className="text-[8px] text-neutral-400 block mb-0.5">MIC</span>
                                                                <b>{(group.micAvg || 0).toFixed(2)}</b>
                                                            </div>
                                                            <div className="text-center">
                                                                <span className="text-[8px] text-neutral-400 block mb-0.5">LEN</span>
                                                                <b>{(group.lenAvg || 0).toFixed(2)}</b>
                                                            </div>
                                                            <div className="text-center">
                                                                <span className="text-[8px] text-neutral-400 block mb-0.5">STR</span>
                                                                <b>{(group.strAvg || 0).toFixed(1)}</b>
                                                            </div>
                                                            <div className="text-center">
                                                                <span className="text-[8px] text-neutral-400 block mb-0.5">RD</span>
                                                                <b>{(group.rdAvg || 0).toFixed(1)}</b>
                                                            </div>
                                                            <div className="text-center">
                                                                <span className="text-[8px] text-neutral-400 block mb-0.5">+B</span>
                                                                <b>{(group.bAvg || 0).toFixed(1)}</b>
                                                            </div>
                                                            <div className="text-center">
                                                                <span className="text-[8px] text-neutral-400 block mb-0.5">UNF</span>
                                                                <b>{(group.unfAvg || 0).toFixed(1)}</b>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Badge de Identificação */}
                                                <div className="hidden md:flex flex-col items-end gap-1">
                                                    <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-widest">Padrão</span>
                                                    <div
                                                        className="px-3 py-1 rounded bg-neutral-100 text-xs font-bold uppercase tracking-wider text-right shadow-sm border border-neutral-200"
                                                        ref={(el) => { if (el) el.style.color = group.color || '#000'; }}
                                                    >
                                                        {group.id}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Seção de Relatório Descritivo */}
                            <div className="pt-8 border-t border-neutral-200 mt-8">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="font-bold text-lg">Relatório Descritivo Completo</h3>
                                        <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                                            Análise estatística detalhada — Sem critérios normativos
                                        </p>
                                    </div>
                                    {!aiAnalysis && (
                                        <Button
                                            onClick={handleGenerateReport}
                                            disabled={isAiLoading}
                                            variant="outline"
                                            className="h-10 px-6 uppercase text-xs font-bold tracking-widest border-black text-black hover:bg-black hover:text-white transition-colors"
                                        >
                                            {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bot className="w-4 h-4 mr-2" />}
                                            <span>{isAiLoading ? "Gerando..." : "Gerar Relatório"}</span>
                                        </Button>
                                    )}
                                </div>
                                {aiAnalysis && (
                                    <div className="bg-white p-8 border border-neutral-200 shadow-sm font-mono text-xs leading-relaxed border-l-4 border-l-black animate-in fade-in slide-in-from-bottom-2 duration-500 max-h-96 overflow-y-auto">
                                        <pre className="whitespace-pre-wrap">{aiAnalysis}</pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {scanned && (
                    <div className="p-8 border-t border-black bg-white flex justify-between items-center">
                        <p className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest">
                            {groups.reduce((acc, g) => acc + g.count, 0)} Observações em {groups.length} Grupos
                        </p>
                        <div className="flex gap-4">
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="h-12 px-6 rounded-none uppercase text-xs font-bold tracking-widest hover:bg-neutral-100"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleApply}
                                disabled={groups.length === 0}
                                className="h-12 px-8 bg-black text-white hover:bg-neutral-800 rounded-none uppercase text-xs font-bold tracking-widest disabled:opacity-50 shadow-xl"
                            >
                                Aprovar e Aplicar Cores
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

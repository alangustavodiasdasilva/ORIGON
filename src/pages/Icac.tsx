import { useState, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

// --- ERROR BOUNDARY ---
class IcacErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("ICAC Critical Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 border border-red-200 rounded-xl text-center">
                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-red-700 mb-2">Algo deu errado neste componente</h2>
                    <p className="text-red-600 mb-4">{this.state.error?.message}</p>
                    <Button
                        onClick={() => this.setState({ hasError: false })}
                        variant="outline"
                        className="bg-white"
                    >
                        Tentar Novamente
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}

// --- TYPES ---
interface PropertyConfig {
    target: string;
    deviation: string;
}

interface HviConfig {
    mic: PropertyConfig;
    str: PropertyConfig;
    uhml: PropertyConfig;
    ui: PropertyConfig;
    rd: PropertyConfig;
    b: PropertyConfig;
}

interface SampleResult {
    id: number;
    mic: number;
    str: number;
    uhml: number;
    ui: number;
    rd: number;
    b: number;
}

const DEFAULT_CONFIG: HviConfig = {
    mic: { target: "4.55", deviation: "0.05" },
    str: { target: "25.6", deviation: "0.7" },
    uhml: { target: "25.6", deviation: "0.3" },
    ui: { target: "79.3", deviation: "0.5" },
    rd: { target: "75.2", deviation: "0.5" },
    b: { target: "15.5", deviation: "0.3" },
};

// --- SAFE UTILS ---
const safeFormatValue = (val: any, decimals: number = 2): string => {
    if (typeof val !== 'number' || isNaN(val)) return "0,00";
    try {
        return val.toFixed(decimals).replace('.', ',');
    } catch {
        return "0,00";
    }
};

const safeFloat = (str: string): number => {
    if (!str) return 0;
    const clean = str.toString().replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

// --- MAIN COMPONENT ---
function IcacContent() {
    const [sampleCount, setSampleCount] = useState("12");
    const [config, setConfig] = useState<HviConfig>(DEFAULT_CONFIG);
    const [results, setResults] = useState<{ days: SampleResult[][] } | null>(null);
    const [copiedDay, setCopiedDay] = useState<number | null>(null);
    const [lockedDays, setLockedDays] = useState<Set<number>>(new Set());
    const [history, setHistory] = useState<Array<{
        timestamp: string;
        config: HviConfig;
    }>>([]);


    const handleConfigChange = (field: keyof HviConfig, type: 'target' | 'deviation', value: string) => {
        setConfig(prev => ({
            ...prev,
            [field]: {
                ...prev[field],
                [type]: value
            }
        }));
    };

    const calculateRange = (targetStr: string, devStr: string) => {
        const target = safeFloat(targetStr);
        const dev = safeFloat(devStr);
        if (target === 0 && dev === 0) return "-- — --";
        return `${(target - dev).toFixed(2)} — ${(target + dev).toFixed(2)}`;
    };

    const generateRandomValue = (targetStr: string, devStr: string, decimals: number) => {
        const target = safeFloat(targetStr);
        const dev = safeFloat(devStr);

        const min = target - dev;
        const max = target + dev;
        const val = min + Math.random() * (max - min);

        let final = parseFloat(val.toFixed(decimals));
        const minAllowed = parseFloat(min.toFixed(decimals));
        const maxAllowed = parseFloat(max.toFixed(decimals));

        if (final < minAllowed) final = minAllowed;
        if (final > maxAllowed) final = maxAllowed;

        return final;
    };

    const handleGenerate = () => {
        const count = parseInt(sampleCount);
        if (isNaN(count) || count <= 0) return;

        const allSamples: SampleResult[] = [];
        for (let i = 1; i <= count; i++) {
            allSamples.push({
                id: i,
                mic: generateRandomValue(config.mic.target, config.mic.deviation, 2),
                str: generateRandomValue(config.str.target, config.str.deviation, 1),
                uhml: generateRandomValue(config.uhml.target, config.uhml.deviation, 2),
                ui: generateRandomValue(config.ui.target, config.ui.deviation, 1),
                rd: generateRandomValue(config.rd.target, config.rd.deviation, 1),
                b: generateRandomValue(config.b.target, config.b.deviation, 1),
            });
        }

        const days: SampleResult[][] = [];
        for (let i = 0; i < allSamples.length; i += 6) {
            days.push(allSamples.slice(i, i + 6));
        }

        setResults({ days });
        setLockedDays(new Set()); // Reset locks on new generation
        setHistory(prev => [{
            timestamp: new Date().toLocaleString('pt-BR'),
            config: { ...config }
        }, ...prev]);
    };

    // --- ROBUST COPY FUNCTION ---
    const handleCopy = async (dayIndex: number, data: SampleResult[]) => {
        if (lockedDays.has(dayIndex)) return;

        try {
            // Gera apenas os valores (MIC, STR, UHML, UI, RD, +b) separados por TAB
            const rows = data.map(row =>
                `${safeFormatValue(row.mic, 2)}\t${safeFormatValue(row.str, 1)}\t${safeFormatValue(row.uhml, 2)}\t${safeFormatValue(row.ui, 1)}\t${safeFormatValue(row.rd, 1)}\t${safeFormatValue(row.b, 1)}`
            );

            const fullText = rows.join('\n');

            let copied = false;

            // 1. Try Modern API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(fullText);
                    copied = true;
                } catch (e) {
                    console.warn("API Copy failed, trying fallback");
                }
            }

            // 2. Fallback using temporary element (no ref conflicts)
            if (!copied) {
                try {
                    const tempTextArea = document.createElement("textarea");
                    tempTextArea.value = fullText;
                    tempTextArea.style.position = "fixed";
                    tempTextArea.style.left = "-9999px";
                    tempTextArea.style.top = "0";
                    document.body.appendChild(tempTextArea);

                    tempTextArea.focus();
                    tempTextArea.select();

                    copied = document.execCommand('copy');
                    document.body.removeChild(tempTextArea);
                } catch (e) {
                    console.error("Fallback failed", e);
                }
            }

            if (copied) {
                setCopiedDay(dayIndex);
                setTimeout(() => {
                    setLockedDays(prev => {
                        const next = new Set(prev);
                        next.add(dayIndex);
                        return next;
                    });
                    setCopiedDay(null);
                }, 1000);
            } else {
                alert("Erro ao copiar. Tente selecionar e copiar manualmente.");
            }

        } catch (error) {
            console.error("Copy Fatal Error:", error);
            alert("Erro crítico na cópia.");
        }
    };

    const renderTable = (dayTitle: string, dayIndex: number, data: SampleResult[]) => {
        if (!data || data.length === 0) return null;

        const calculateAverage = (field: keyof SampleResult) => {
            const sum = data.reduce((acc, curr) => acc + (curr[field] as number), 0);
            return sum / data.length;
        };

        const avgs = {
            mic: calculateAverage('mic'),
            str: calculateAverage('str'),
            uhml: calculateAverage('uhml'),
            ui: calculateAverage('ui'),
            rd: calculateAverage('rd'),
            b: calculateAverage('b'),
        };

        const isCopied = copiedDay === dayIndex;
        const isLocked = lockedDays.has(dayIndex);

        return (
            <div key={dayIndex} className="mb-16 animate-fade-in">
                <div className="flex items-center justify-between mb-6 border-b border-black pb-4">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-sans mb-1">DATA SET {String(dayIndex + 1).padStart(2, '0')}</span>
                        <h3 className="font-serif text-3xl text-black leading-none">{dayTitle}</h3>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(dayIndex, data)}
                        disabled={isLocked || isCopied}
                        className={`h-10 px-6 rounded-none border border-black uppercase text-[10px] tracking-widest font-bold transition-all hover:bg-black hover:text-white ${isLocked
                            ? 'opacity-40 cursor-not-allowed bg-neutral-100 border-neutral-300'
                            : isCopied
                                ? 'bg-black text-white'
                                : 'bg-transparent text-black'
                            }`}
                    >
                        {isLocked ? "LOCKED" : isCopied ? "COPIED" : "COPY DATA"}
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center border-collapse">
                        <thead>
                            <tr className="border-b border-neutral-200">
                                <th className="py-4 px-4 text-left text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">Index</th>
                                <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">MIC</th>
                                <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">STR</th>
                                <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">UHML</th>
                                <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">UI</th>
                                <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">RD</th>
                                <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-normal text-neutral-500 font-sans">+b</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-xs">
                            {data.map((row) => (
                                <tr key={row.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                    <td className="py-3 px-4 text-left text-neutral-400">#{String(row.id).padStart(2, '0')}</td>
                                    <td className="py-3 px-4 text-black">{safeFormatValue(row.mic, 2)}</td>
                                    <td className="py-3 px-4 text-black">{safeFormatValue(row.str, 1)}</td>
                                    <td className="py-3 px-4 text-black">{safeFormatValue(row.uhml, 2)}</td>
                                    <td className="py-3 px-4 text-black">{safeFormatValue(row.ui, 1)}</td>
                                    <td className="py-3 px-4 text-black">{safeFormatValue(row.rd, 1)}</td>
                                    <td className="py-3 px-4 text-black">{safeFormatValue(row.b, 1)}</td>
                                </tr>
                            ))}
                            {/* LINHA DE MÉDIA - MINIMALISTA */}
                            <tr className="bg-neutral-50 border-t-2 border-black">
                                <td className="py-4 px-4 text-left font-sans text-[10px] uppercase tracking-widest text-black font-bold">AVERAGE</td>
                                <td className="py-4 px-4 font-bold">{safeFormatValue(avgs.mic, 2)}</td>
                                <td className="py-4 px-4 font-bold">{safeFormatValue(avgs.str, 1)}</td>
                                <td className="py-4 px-4 font-bold">{safeFormatValue(avgs.uhml, 2)}</td>
                                <td className="py-4 px-4 font-bold">{safeFormatValue(avgs.ui, 1)}</td>
                                <td className="py-4 px-4 font-bold">{safeFormatValue(avgs.rd, 1)}</td>
                                <td className="py-4 px-4 font-bold">{safeFormatValue(avgs.b, 1)}</td>
                            </tr>
                            {/* LINHA DE META - MINIMALISTA */}
                            <tr className="border-t border-neutral-200 text-neutral-400">
                                <td className="py-3 px-4 text-left font-sans text-[10px] uppercase tracking-widest">TARGET</td>
                                <td className="py-3 px-4">{config.mic.target}</td>
                                <td className="py-3 px-4">{config.str.target}</td>
                                <td className="py-3 px-4">{config.uhml.target}</td>
                                <td className="py-3 px-4">{config.ui.target}</td>
                                <td className="py-3 px-4">{config.rd.target}</td>
                                <td className="py-3 px-4">{config.b.target}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderInputGroup = (key: keyof HviConfig, label: string) => {
        const { target, deviation } = config[key];
        return (
            <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1">
                    <label className="text-sm font-bold uppercase tracking-widest text-black font-sans">{label}</label>
                    <span className="font-mono text-xs text-neutral-400">{calculateRange(target, deviation)}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-400 block">Target</span>
                        <Input
                            value={target}
                            onChange={(e) => handleConfigChange(key, 'target', e.target.value)}
                            className="bg-transparent border border-neutral-200 rounded-none h-10 font-mono text-sm text-center focus:border-black focus:ring-0 transition-colors placeholder:text-neutral-200"
                        />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-400 block flex justify-between">
                            <span>Dev</span>
                            <span>±</span>
                        </span>
                        <Input
                            value={deviation}
                            onChange={(e) => handleConfigChange(key, 'deviation', e.target.value)}
                            className="bg-transparent border border-neutral-200 rounded-none h-10 font-mono text-sm text-center focus:border-black focus:ring-0 transition-colors placeholder:text-neutral-200"
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-24">
            {/* HERDER ORIGO */}
            <div className="max-w-7xl mx-auto pt-16 pb-20 px-6 md:px-12 flex flex-col items-center justify-center space-y-8">
                <div className="flex flex-col items-center gap-6">
                    {/* SVG LOGO ORIGO */}
                    <svg width="64" height="64" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="48" stroke="black" strokeWidth="2" />
                        <circle cx="50" cy="50" r="4" fill="black" />
                    </svg>
                    <h1 className="text-4xl font-serif tracking-[0.2em] font-normal text-black pl-2">ORIGO</h1>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 md:px-12 space-y-24 animate-fade-in">

                {/* CONTROLS SECTION */}
                <div className="space-y-12">
                    <div className="flex items-center justify-between border-b border-black pb-4">
                        <h2 className="font-serif text-2xl">Module Configuration</h2>
                        <div className="flex items-center gap-6">
                            <span className="text-xs uppercase tracking-widest text-neutral-500">Sample Count</span>
                            <Input
                                value={sampleCount}
                                onChange={(e) => setSampleCount(e.target.value)}
                                className="w-20 h-10 rounded-none border-b border-neutral-300 focus:border-black text-center font-mono focus:ring-0 px-0 bg-transparent text-base"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-x-12 gap-y-12">
                        {renderInputGroup('mic', 'MIC')}
                        {renderInputGroup('str', 'STR')}
                        {renderInputGroup('uhml', 'UHML')}
                        {renderInputGroup('ui', 'UI')}
                        {renderInputGroup('rd', 'RD')}
                        {renderInputGroup('b', '+b')}
                    </div>

                    <div className="flex justify-center pt-8">
                        <button
                            onClick={handleGenerate}
                            className="group relative px-16 py-5 bg-black text-white text-xs uppercase tracking-[0.25em] font-bold hover:bg-neutral-800 transition-all duration-300 border border-transparent hover:border-black hover:bg-white hover:text-black"
                        >
                            Execute Analysis
                        </button>
                    </div>
                </div>

                {/* RESULTS SECTION */}
                {results && (
                    <div className="space-y-16 animate-fade-in">
                        <div className="flex items-center justify-between border-b border-black pb-4">
                            <div className="flex items-baseline gap-4">
                                <h2 className="font-serif text-2xl">Output Data</h2>
                                <span className="text-xs font-mono text-neutral-400">SESSION ID: {Date.now().toString().slice(-6)}</span>
                            </div>
                            <button onClick={() => setResults(null)} className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-black transition-colors">
                                Clear Workspace
                            </button>
                        </div>

                        <div className="space-y-20">
                            {results.days.map((dayData, index) =>
                                renderTable(`Day ${index + 1}`, index, dayData)
                            )}
                        </div>
                    </div>
                )}

                {/* HISTORY SECTION */}
                {history.length > 0 && (
                    <div className="pt-24 border-t border-neutral-100">
                        <h2 className="font-serif text-2xl mb-12">Session Log</h2>
                        <div className="space-y-0 text-sm">
                            {history.map((entry, entryIndex) => (
                                <div key={entryIndex} className="group flex flex-col md:flex-row md:items-center justify-between py-6 border-b border-neutral-100 hover:bg-neutral-50 transition-colors px-4">
                                    <div className="flex items-center gap-8 mb-4 md:mb-0">
                                        <span className="font-mono text-neutral-400 text-xs">{(entryIndex + 1).toString().padStart(3, '0')}</span>
                                        <span className="text-xs uppercase tracking-widest text-neutral-900">{entry.timestamp}</span>
                                    </div>
                                    <div className="flex gap-8 font-mono text-xs text-neutral-500 overflow-x-auto pb-2 md:pb-0">
                                        {Object.entries(entry.config).map(([k, v]) => (
                                            <span key={k} className="whitespace-nowrap">
                                                <span className="uppercase text-neutral-300 mr-2">{k}:</span>
                                                <span className="text-black">{v.target}</span>
                                            </span>
                                        ))}
                                    </div>
                                    <button
                                        className="hidden group-hover:block ml-4 text-[9px] uppercase tracking-widest font-bold text-black border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
                                        onClick={() => {
                                            setConfig(entry.config);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                    >
                                        Restore
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

}

// Export Wrapped Component
export default function Icac() {
    return (
        <IcacErrorBoundary>
            <IcacContent />
        </IcacErrorBoundary>
    );
}

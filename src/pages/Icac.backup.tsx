import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Copy, EyeOff, Table as TableIcon, Check, Lock } from "lucide-react";

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

export default function Icac() {
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
        const target = parseFloat(targetStr.replace(',', '.'));
        const dev = parseFloat(devStr.replace(',', '.'));

        if (isNaN(target) || isNaN(dev)) return "-- — --";

        const min = (target - dev).toFixed(2);
        const max = (target + dev).toFixed(2);
        return `${min} — ${max}`;
    };

    const formatValue = (val: number, decimals: number = 2) => {
        return val.toFixed(decimals).replace('.', ',');
    };

    const generateRandomValue = (targetStr: string, devStr: string, decimals: number) => {
        const target = parseFloat(targetStr.replace(',', '.'));
        const dev = parseFloat(devStr.replace(',', '.'));

        const min = target - dev;
        const max = target + dev;
        const val = min + Math.random() * (max - min);
        const rounded = parseFloat(val.toFixed(decimals));
        const minRounded = parseFloat(min.toFixed(decimals));
        const maxRounded = parseFloat(max.toFixed(decimals));

        if (rounded < minRounded) return minRounded;
        if (rounded > maxRounded) return maxRounded;

        return rounded;
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

        const newHistoryEntry = {
            timestamp: new Date().toLocaleString('pt-BR'),
            config: { ...config }
        };

        setHistory(prev => [newHistoryEntry, ...prev]);
    };

    const handleCopy = (dayIndex: number, data: SampleResult[]) => {
        // Prevent copying if already locked
        if (lockedDays.has(dayIndex)) return;

        // Build CSV content
        const headers = ['Teste', 'MIC', 'STR', 'UHML', 'UI', 'RD', '+b'];
        const rows = data.map(row =>
            `${row.id}\t${formatValue(row.mic, 2)}\t${formatValue(row.str, 1)}\t${formatValue(row.uhml, 2)}\t${formatValue(row.ui, 1)}\t${formatValue(row.rd, 1)}\t${formatValue(row.b, 1)}`
        );

        const avgs = {
            mic: data.reduce((sum, s) => sum + s.mic, 0) / data.length,
            str: data.reduce((sum, s) => sum + s.str, 0) / data.length,
            uhml: data.reduce((sum, s) => sum + s.uhml, 0) / data.length,
            ui: data.reduce((sum, s) => sum + s.ui, 0) / data.length,
            rd: data.reduce((sum, s) => sum + s.rd, 0) / data.length,
            b: data.reduce((sum, s) => sum + s.b, 0) / data.length,
        };

        const avgRow = `Média\t${formatValue(avgs.mic, 2)}\t${formatValue(avgs.str, 1)}\t${formatValue(avgs.uhml, 2)}\t${formatValue(avgs.ui, 1)}\t${formatValue(avgs.rd, 1)}\t${formatValue(avgs.b, 1)}`;
        const arbitroRow = `Árbitro\t${config.mic.target}\t${config.str.target}\t${config.uhml.target}\t${config.ui.target}\t${config.rd.target}\t${config.b.target}`;

        const csvContent = [
            headers.join('\t'),
            ...rows,
            avgRow,
            arbitroRow
        ].join('\n');

        // Show feedback immediately
        setCopiedDay(dayIndex);

        // Actually copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(csvContent)
                .then(() => {
                    // Lock after successful copy
                    setTimeout(() => {
                        setLockedDays(prev => new Set([...prev, dayIndex]));
                        setCopiedDay(null);
                    }, 1500);
                })
                .catch(() => {
                    // Still lock even if copy fails (UX choice)
                    setTimeout(() => {
                        setLockedDays(prev => new Set([...prev, dayIndex]));
                        setCopiedDay(null);
                    }, 1500);
                });
        }
    };

    const renderCard = (key: keyof HviConfig, label: string) => {
        const { target, deviation } = config[key];

        return (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col gap-3">
                <div className="text-center font-black text-slate-700 uppercase tracking-widest text-sm mb-1">{label}</div>

                <div className="space-y-1">
                    <label className="block text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">Alvo</label>
                    <Input
                        value={target}
                        onChange={(e) => handleConfigChange(key, 'target', e.target.value)}
                        className="text-center font-bold text-slate-700 h-9"
                    />
                </div>

                <div className="space-y-1">
                    <label className="block text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">Desvio ±</label>
                    <Input
                        value={deviation}
                        onChange={(e) => handleConfigChange(key, 'deviation', e.target.value)}
                        className="text-center font-bold text-slate-700 h-9"
                    />
                </div>

                <div className="mt-2 text-center">
                    <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-widest">Distribuição</span>
                    <span className="text-xs font-black text-blue-600 tracking-tight">
                        {calculateRange(target, deviation)}
                    </span>
                </div>
            </div>
        );
    };

    const renderTable = (dayTitle: string, dayIndex: number, data: SampleResult[]) => {
        if (data.length === 0) return null;

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
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mb-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">{dayTitle}</h3>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(dayIndex, data)}
                        disabled={isLocked}
                        className={`h-8 gap-2 transition-all ${isLocked
                                ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                                : isCopied
                                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                    : 'text-blue-600 border-blue-100 bg-blue-50/50 hover:bg-blue-100'
                            }`}
                    >
                        {isLocked ? (
                            <>
                                <Lock className="h-3 w-3" /> Bloqueado
                            </>
                        ) : isCopied ? (
                            <>
                                <Check className="h-3 w-3" /> Copiado!
                            </>
                        ) : (
                            <>
                                <Copy className="h-3 w-3" /> Copiar
                            </>
                        )}
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center">
                        <thead>
                            <tr className="bg-slate-50/50 text-slate-500 font-bold text-xs uppercase tracking-wide border-b border-slate-100">
                                <th className="py-3 px-4 text-left">Teste</th>
                                <th className="py-3 px-4">MIC</th>
                                <th className="py-3 px-4">STR</th>
                                <th className="py-3 px-4">UHML</th>
                                <th className="py-3 px-4">UI</th>
                                <th className="py-3 px-4">RD</th>
                                <th className="py-3 px-4">+b</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50 transition-colors text-slate-700">
                                    <td className="py-2.5 px-4 text-left font-mono text-xs text-slate-400">{row.id}</td>
                                    <td className="py-2.5 px-4">{formatValue(row.mic, 2)}</td>
                                    <td className="py-2.5 px-4">{formatValue(row.str, 1)}</td>
                                    <td className="py-2.5 px-4">{formatValue(row.uhml, 2)}</td>
                                    <td className="py-2.5 px-4">{formatValue(row.ui, 1)}</td>
                                    <td className="py-2.5 px-4">{formatValue(row.rd, 1)}</td>
                                    <td className="py-2.5 px-4">{formatValue(row.b, 1)}</td>
                                </tr>
                            ))}

                            <tr className="bg-blue-50/50 font-black text-blue-700 border-t-2 border-slate-200">
                                <td className="py-3 px-4 text-left">Média</td>
                                <td className="py-3 px-4">{formatValue(avgs.mic, 2)}</td>
                                <td className="py-3 px-4">{formatValue(avgs.str, 1)}</td>
                                <td className="py-3 px-4">{formatValue(avgs.uhml, 2)}</td>
                                <td className="py-3 px-4">{formatValue(avgs.ui, 1)}</td>
                                <td className="py-3 px-4">{formatValue(avgs.rd, 1)}</td>
                                <td className="py-3 px-4">{formatValue(avgs.b, 1)}</td>
                            </tr>

                            <tr className="bg-white text-slate-400 font-medium text-xs">
                                <td className="py-3 px-4 text-left">Árbitro</td>
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

    return (
        <div className="max-w-7xl mx-auto p-8 space-y-8 animate-fade-in pb-20">
            <div>
                <Zap className="h-6 w-6 text-blue-600 fill-current" />
            </div>

            <div className="bg-white rounded-[2rem] p-8 border border-slate-200/60 shadow-sm space-y-8">

                <div className="flex items-center gap-4">
                    <label className="text-sm font-bold text-slate-700">Quantidade de Amostras:</label>
                    <Input
                        value={sampleCount}
                        onChange={(e) => setSampleCount(e.target.value)}
                        className="w-24 text-center font-bold"
                    />
                    <span className="text-xs text-slate-400 font-bold">(múltiplos de 6 recomendados)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {renderCard('mic', 'MIC')}
                    {renderCard('str', 'STR')}
                    {renderCard('uhml', 'UHML')}
                    {renderCard('ui', 'UI')}
                    {renderCard('rd', 'RD')}
                    {renderCard('b', '+b')}
                </div>

            </div>

            <Button
                onClick={handleGenerate}
                className="w-full h-14 text-lg font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-200 rounded-xl gap-2 transition-transform active:scale-[0.99] mb-8"
            >
                <Zap className="h-5 w-5 fill-white" />
                Gerar Análise
            </Button>

            {results && (
                <div className="animate-slide-up space-y-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-black text-emerald-600 flex items-center gap-2">
                            <TableIcon className="h-5 w-5" />
                            Prévia de Todos os Resultados ({parseInt(sampleCount)} amostras - {results.days.length} {results.days.length === 1 ? 'dia' : 'dias'})
                        </h2>
                        <Button variant="outline" size="sm" onClick={() => setResults(null)} className="h-8 gap-2">
                            <EyeOff className="h-3 w-3" /> Ocultar
                        </Button>
                    </div>

                    {results.days.map((dayData, index) =>
                        renderTable(`Dia ${index + 1}`, index, dayData)
                    )}
                </div>
            )}

            {history.length > 0 && (
                <div className="mt-12 animate-slide-up">
                    <h2 className="text-lg font-black text-slate-700 mb-4 flex items-center gap-2">
                        <TableIcon className="h-5 w-5 text-indigo-600" />
                        Histórico de Configurações Criadas
                    </h2>
                    <div className="space-y-4">
                        {history.map((entry, entryIndex) => (
                            <div key={entryIndex} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                <div className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                                    {entry.timestamp}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                    {Object.entries(entry.config).map(([key, value]) => (
                                        <div key={key} className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 border border-indigo-100/50 hover:shadow-md transition-all">
                                            <div className="text-[11px] font-black text-indigo-700 uppercase tracking-widest mb-3 text-center">
                                                {key === 'b' ? '+b' : key.toUpperCase()}
                                            </div>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex justify-between items-center pb-2 border-b border-indigo-100/50">
                                                    <span className="text-slate-500 font-medium">Alvo</span>
                                                    <span className="font-black text-slate-700">{value.target}</span>
                                                </div>
                                                <div className="flex justify-between items-center pb-2 border-b border-indigo-100/50">
                                                    <span className="text-slate-500 font-medium">Desvio</span>
                                                    <span className="font-black text-slate-700">±{value.deviation}</span>
                                                </div>
                                                <div className="text-center pt-1">
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase">Faixa</span>
                                                    <div className="text-[10px] font-black text-blue-600">
                                                        {calculateRange(value.target, value.deviation)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

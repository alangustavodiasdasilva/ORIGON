import { useState, useEffect } from "react";
import { FileDown, History, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { AuditLogService } from "@/entities/AuditLog";
import { HVIFileGeneratorService } from "@/services/HVIFileGeneratorService";


type SystemType = "uster" | "premier";

// Helper para converter string "X.Y" ou "X,Y" para número
const parseNumber = (val: string): number => {
    if (!val) return 0;
    // Substitui vírgula por ponto antes de converter
    const normalized = val.replace(',', '.');
    return parseFloat(normalized) || 0;
};

interface HVIResults {
    grd: string;
    area: string;
    cnt: string;
    uhml: string;
    ml: string; // Added ML
    ui: string;
    sfi: string;
    str: string;
    elg: string;
    mic: string;
    mat: string;
    rd: string;
    plusB: string;
    mst: string;
    cg: string;
    tmp: string;
    rh: string;
    sci: string;
    etiqueta: string;
}

interface HistoryItem {
    id: number;
    date: string;
    system: SystemType;
    quantity: number;
    etiqueta: string;
    filename: string;
    content: string;
    results?: HVIResults;
    labId?: string;
    labName?: string;
}

// Uster-specific configuration (Original Order)
const USTER_FIELDS: { key: keyof HVIResults; label: string; decimals: number; width: number; hasDev: boolean }[] = [
    { key: "grd", label: "GRD", decimals: 0, width: 0, hasDev: false },
    { key: "area", label: "AREA", decimals: 2, width: 0, hasDev: true },
    { key: "cnt", label: "CNT", decimals: 0, width: 3, hasDev: true },
    { key: "uhml", label: "UHML", decimals: 2, width: 5, hasDev: true },
    { key: "ui", label: "UI", decimals: 1, width: 4, hasDev: true },
    { key: "sfi", label: "SFI", decimals: 1, width: 4, hasDev: true },
    { key: "str", label: "STR", decimals: 1, width: 4, hasDev: true },
    { key: "elg", label: "ELG", decimals: 1, width: 4, hasDev: true },
    { key: "mic", label: "MIC", decimals: 2, width: 4, hasDev: true },
    { key: "mat", label: "MAT", decimals: 2, width: 4, hasDev: true },
    { key: "rd", label: "RD", decimals: 1, width: 4, hasDev: true },
    { key: "plusB", label: "+B", decimals: 1, width: 4, hasDev: true },
    { key: "mst", label: "MST", decimals: 1, width: 4, hasDev: true },
    { key: "cg", label: "CG", decimals: 0, width: 0, hasDev: false },
    { key: "tmp", label: "TMP", decimals: 1, width: 4, hasDev: true },
    { key: "rh", label: "RH", decimals: 1, width: 4, hasDev: true },
    { key: "sci", label: "SCI", decimals: 1, width: 5, hasDev: true },
];

// Premier-specific configuration (Requested Order)
const PREMIER_FIELDS: { key: keyof HVIResults; label: string; decimals: number; width: number; hasDev: boolean }[] = [
    { key: "uhml", label: "UHML", decimals: 2, width: 5, hasDev: true },
    { key: "ml", label: "ML", decimals: 2, width: 4, hasDev: true },
    { key: "ui", label: "UI", decimals: 1, width: 4, hasDev: true },
    { key: "elg", label: "Elg", decimals: 1, width: 4, hasDev: true },
    { key: "str", label: "Str", decimals: 1, width: 4, hasDev: true },
    { key: "mic", label: "Mic", decimals: 2, width: 4, hasDev: true },
    { key: "rd", label: "Rd", decimals: 1, width: 4, hasDev: true },
    { key: "plusB", label: "+b", decimals: 1, width: 4, hasDev: true },
    { key: "cg", label: "C.G.", decimals: 0, width: 0, hasDev: false },
    { key: "sfi", label: "SFI", decimals: 1, width: 4, hasDev: true },
    { key: "grd", label: "Lf.Grade", decimals: 0, width: 0, hasDev: false },
    { key: "cnt", label: "Tr.Cnt", decimals: 0, width: 3, hasDev: true },
    { key: "area", label: "Tr.Area", decimals: 2, width: 0, hasDev: true },
    { key: "mat", label: "MR", decimals: 2, width: 4, hasDev: true },
];

// Helper to look up config for formatting from either list
const getFieldConfig = (key: keyof HVIResults) => {
    return PREMIER_FIELDS.find(f => f.key === key) || USTER_FIELDS.find(f => f.key === key);
};

export default function Interlaboratorial() {
    const { user, currentLab } = useAuth();
    const [selectedSystem, setSelectedSystem] = useState<SystemType>("uster");
    const [sampleQuantity, setSampleQuantity] = useState<number>(1);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

    useEffect(() => {
        const savedHistory = localStorage.getItem("interlab_history");
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error("Failed to parse history", e);
            }
        }
    }, []);

    const saveHistory = (newItem: HistoryItem) => {
        const updated = [newItem, ...history].slice(0, 50);
        setHistory(updated);
        localStorage.setItem("interlab_history", JSON.stringify(updated));
        
        // Log to Global Audit
        AuditLogService.logAction('interlaboratorial', newItem.id.toString(), 'CREATE', null, { 
            nome: `Teste ${newItem.system.toUpperCase()}`,
            quantidade: newItem.quantity,
            etiqueta: newItem.etiqueta 
        });
    };

    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem("interlab_history");
        AuditLogService.logAction('interlaboratorial', 'todos', 'DELETE', { nome: 'Limpeza Histórico Interlab' }, null);
    };

    const [deviations, setDeviations] = useState<HVIResults>({
        grd: "0", area: "0", cnt: "0", uhml: "0", ml: "0", ui: "0", sfi: "0",
        str: "0", elg: "0", mic: "0", mat: "0", rd: "0", plusB: "0",
        mst: "0", cg: "0", tmp: "0", rh: "0", sci: "0", etiqueta: "0"
    });

    const [results, setResults] = useState<HVIResults>({
        grd: "3", area: "0.25", cnt: "029", uhml: "", ml: "", ui: "", sfi: "",
        str: "", elg: "", mic: "", mat: "", rd: "", plusB: "",
        mst: "07.4", cg: "\"11-1\"", tmp: "24.3", rh: "49.3", sci: "", etiqueta: ""
    });

    const handleInputChange = (field: keyof HVIResults, value: string) => {
        setResults(prev => ({ ...prev, [field]: value }));
    };

    const handleDeviationChange = (field: keyof HVIResults, value: string) => {
        setDeviations(prev => ({ ...prev, [field]: value }));
    };

    const generateRandomData = () => {
        const random = (min: number, max: number, decimals: number = 2) => {
            const value = Math.random() * (max - min) + min;
            return value.toFixed(decimals);
        };
        const randomEtiqueta = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            return Array(20).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
        };
        setResults({
            ...results,
            etiqueta: randomEtiqueta(),
            grd: "3", area: "0.25", cnt: "029",
            uhml: random(25, 33, 2), ui: random(78, 88, 1), sfi: random(6, 12, 1),
            str: random(26, 35, 1), elg: random(5, 8, 1), mic: random(3.5, 5.5, 2),
            mat: random(0.8, 0.9, 2), rd: random(75, 85, 1), plusB: random(7, 12, 1),
            mst: random(6, 9, 1), cg: "\"11-1\"", tmp: random(20, 30, 1),
            rh: random(40, 60, 1), sci: random(100, 180, 1)
        });
    };

    const generateFile = () => {
        if (selectedSystem === "uster") {
            const { etiqueta } = results;

            const applyDeviation = (base: string, dev: string) => {
                const baseVal = parseNumber(base);
                const devVal = parseNumber(dev);
                if (devVal === 0) return baseVal;
                return baseVal + (Math.random() * 2 - 1) * devVal;
            };

            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '-');
            const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

            const dataLinesArray = Array(sampleQuantity).fill(null).map((_, index) => {
                const getVal = (key: keyof HVIResults) => applyDeviation(results[key], deviations[key]);

                const repIndex = index + 1;
                const sampleObj: any = {
                    id: `INTERLAB_${Date.now()}_${repIndex}`,
                    mala: "INTERLAB",
                    etiqueta: etiqueta.trim(),
                    cor: null,
                    lote_id: 0
                };

                const uhml = getVal('uhml');
                
                return HVIFileGeneratorService.generateH1FileContent(
                    sampleObj,
                    dateStr,
                    timeStr,
                    repIndex,
                    repIndex,
                    "Line5",
                    getVal('mic'),
                    uhml,
                    getVal('ui'),
                    getVal('str'),
                    getVal('elg'),
                    getVal('sfi'),
                    uhml * 0.95, // aprox len
                    Math.round(getVal('cnt')),
                    Math.round(getVal('sci') || 120),
                    getVal('rd'),
                    getVal('plusB'),
                    results.grd || "31-1",
                    getVal('area'),
                    3, // default leaf
                    getVal('mat'),
                    2000 // default csp
                );
            });

            dataLinesArray.forEach((lineContent, index) => {
                const repIndex = index + 1;
                const filename = `interlaboratorial_uster_${etiqueta}_REP${repIndex}_${Date.now()}.H1`;
                downloadFile(lineContent, filename);
            });

            const filename = `interlaboratorial_uster_${etiqueta}_(Multiplos).H1`;
            const fullContent = dataLinesArray.join('\n');

            saveHistory({
                id: Date.now(),
                date: new Date().toLocaleString(),
                system: "uster",
                quantity: sampleQuantity,
                etiqueta,
                filename,
                content: fullContent,
                results: { ...results },
                labId: currentLab?.id || user?.lab_id || undefined,
                labName: currentLab?.nome || "N/A"
            });
        } else {
            const { etiqueta } = results;

            // Helper to format date "02-01-20267:12AM" style or standard "02-01-2026 7:12AM"
            const now = new Date();
            const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
            const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
            const dateTimeStr = `${dateStr} ${timeStr}`; // Standard space
            const dateTimeStrHeader = `${dateStr}${timeStr}`; // Header quirky format

            const header = [
                `"System Test Report"\t"PREMIER ART3 V3.2.13 "`,
                `${dateTimeStrHeader}`,
                `"Test ID"\t":"\t16229\t"Identifier"\t":"\t"158727"`,
                ``,
                ``,
                ``,
                ``,
                ``,
                `"Test Type"\t":"\t"USDA"`,
                `"Test Date & Time"\t":"\t${dateTimeStr}`,
                `"Remarks"\t":"\t"467"`,
                `\t\t"UHML"\t"ML"\t"UI"\t"Elg"\t"Str"\t"Mic"\t"Rd"\t"+b"\t"C.G."\t"SFI"\t"Lf.Grade"\t"Tr.Cnt"\t"Tr.Area"\t"MR"\t""`,
                `"Test No"\t"Sub ID"\t"(mm)"\t"(mm)"\t"(%)"\t"(%)"\t"(g/tex)"\t""\t""\t""\t""\t""\t""\t""\t"(%)"\t""\t""`,
                ``
            ].join('\n');

            const fmt = (value: number, decimals: number) => value.toFixed(decimals);

            // Generate raw data first to calculate stats
            const rawData = Array(sampleQuantity).fill(null).map((_, index) => {
                const getVal = (field: keyof HVIResults) => {
                    const devStr = deviations[field];
                    const baseVal = parseNumber(results[field]);
                    const devVal = parseNumber(devStr);
                    return (devVal === 0) ? baseVal : baseVal + (Math.random() * 2 - 1) * devVal;
                };

                const uhml = getVal('uhml');
                const ui = getVal('ui');
                const ml = getVal('ml');

                return {
                    index: index + 1,
                    etiqueta: `"${etiqueta.trim()} "`,
                    uhml,
                    ml,
                    ui,
                    elg: getVal('elg'),
                    str: getVal('str'),
                    mic: getVal('mic'),
                    rd: getVal('rd'),
                    plusB: getVal('plusB'),
                    cg: results.cg.includes('"') ? results.cg : `"${results.cg}"`,
                    sfi: getVal('sfi'),
                    grd: results.grd.includes('"') ? results.grd : `"${results.grd}"`,
                    cnt: Math.round(getVal('cnt')),
                    area: getVal('area'),
                    mat: getVal('mat')
                };
            });

            const repContents: string[] = [];

            rawData.forEach((d, index) => {
                const repIndex = index + 1;
                const singleDataLine = [
                    1, // test number is always 1 for individual files
                    d.etiqueta,
                    fmt(d.uhml, 2),
                    fmt(d.ml, 2),
                    fmt(d.ui, 1),
                    fmt(d.elg, 1),
                    fmt(d.str, 1),
                    fmt(d.mic, 2),
                    fmt(d.rd, 1),
                    fmt(d.plusB, 1),
                    d.cg,
                    fmt(d.sfi, 1),
                    d.grd,
                    d.cnt,
                    fmt(d.area, 2),
                    fmt(d.mat, 2)
                ].join('\t');

                // --- Statistics Calculation for single value ---
                const stats = {
                    uhml: { avg: d.uhml, median: d.uhml, sd: 0, cv: 0, min: d.uhml, max: d.uhml },
                    ml: { avg: d.ml, median: d.ml, sd: 0, cv: 0, min: d.ml, max: d.ml },
                    ui: { avg: d.ui, median: d.ui, sd: 0, cv: 0, min: d.ui, max: d.ui },
                    elg: { avg: d.elg, median: d.elg, sd: 0, cv: 0, min: d.elg, max: d.elg },
                    str: { avg: d.str, median: d.str, sd: 0, cv: 0, min: d.str, max: d.str },
                    mic: { avg: d.mic, median: d.mic, sd: 0, cv: 0, min: d.mic, max: d.mic },
                    rd: { avg: d.rd, median: d.rd, sd: 0, cv: 0, min: d.rd, max: d.rd },
                    plusB: { avg: d.plusB, median: d.plusB, sd: 0, cv: 0, min: d.plusB, max: d.plusB },
                    sfi: { avg: d.sfi, median: d.sfi, sd: 0, cv: 0, min: d.sfi, max: d.sfi },
                    cnt: { avg: d.cnt, median: d.cnt, sd: 0, cv: 0, min: d.cnt, max: d.cnt },
                    area: { avg: d.area, median: d.area, sd: 0, cv: 0, min: d.area, max: d.area },
                    mat: { avg: d.mat, median: d.mat, sd: 0, cv: 0, min: d.mat, max: d.mat }
                };

                const cgVal = results.cg.includes('"') ? results.cg : `"${results.cg}"`;
                const grdVal = results.grd.includes('"') ? results.grd : `"${results.grd}"`;

                const makeStatRow = (label: string, prop: 'avg' | 'median' | 'sd' | 'cv' | 'min' | 'max') => {
                    const f = (key: keyof typeof stats, decimals: number) => {
                        let p = decimals;
                        if (prop === 'cv') p = 2;
                        if (['cnt', 'area'].includes(key)) {
                            if (prop === 'avg' || prop === 'median') p = decimals === 0 ? 0 : 2;
                            if (prop === 'sd') p = 2;
                            if (prop === 'min' || prop === 'max') p = decimals;
                        }
                        if (prop === 'sd' && key === 'cnt') return Math.round(stats[key].sd).toFixed(0);
                        return prop ? fmt(stats[key][prop], p) : '';
                    }

                    const row = [
                        label,
                        `""`,
                        f('uhml', 2),
                        f('ml', 2),
                        f('ui', 1),
                        f('elg', 1),
                        f('str', 1),
                        f('mic', 2),
                        f('rd', 1),
                        f('plusB', 1),
                    ];
                    if (label === '"Avg"') { row.push(cgVal); } else { row.push(""); }
                    row.push(f('sfi', 1));
                    if (label === '"Avg"') { row.push(grdVal); } else { row.push(""); }
                    row.push(f('cnt', 0));
                    row.push(f('area', 2));
                    row.push(f('mat', 2));

                    return row.join('\t');
                };

                const statsBlock = [
                    ``, ``, `" Statistics"`,
                    makeStatRow('"Avg"', 'avg'),
                    ``, ``, ``, ``, ``, ``, ``, ``, ``,
                    makeStatRow('"Median"', 'median'),
                    makeStatRow('"SD"', 'sd'),
                    makeStatRow('"CV%"', 'cv'),
                    makeStatRow('"Min"', 'min'),
                    makeStatRow('"Max"', 'max'),
                ].join('\n');

                const content = header + '\n' + singleDataLine + '\n' + statsBlock;
                const filename = `interlaboratorial_premier_${etiqueta.trim()}_REP${repIndex}_${Date.now()}.txt`;

                downloadFile(content, filename);
                repContents.push(`=== ARQUIVO: ${filename} ===\n${content}`);
            });

            const content = repContents.join('\n\n');
            const filename = `interlaboratorial_premier_${etiqueta.trim()}_(Multiplos).txt`;

            saveHistory({
                id: Date.now(),
                date: new Date().toLocaleString(),
                system: "premier",
                quantity: sampleQuantity,
                etiqueta,
                filename,
                content,
                results: { ...results },
                labId: currentLab?.id || user?.lab_id || undefined,
                labName: currentLab?.nome || "N/A"
            });
        }
    };

    const downloadFile = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getMinMax = (field: keyof HVIResults) => {
        const config = getFieldConfig(field);
        if (!config) return null;

        const base = parseNumber(results[field]);
        const dev = parseNumber(deviations[field]);
        if (dev === 0) return null;

        const min = base - dev;
        const max = base + dev;

        return `${min.toFixed(config.decimals)} - ${max.toFixed(config.decimals)}`;
    };

    const currentFields = selectedSystem === "uster" ? USTER_FIELDS : PREMIER_FIELDS;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="border-b border-neutral-200 pb-6">
                <h1 className="text-4xl font-serif text-black">Teste Interlaboratorial</h1>
                <p className="text-neutral-600 font-mono text-sm mt-2">
                    Gere arquivos de intercâmbio para sistemas Uster ou Premier
                </p>
            </div>

            {/* Main Form Card */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                {/* Top Section - Sistema e Quantidade */}
                <div className="bg-neutral-50 border-b border-neutral-200 p-3">
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Sistema Selection */}
                        <div className="space-y-1.5">
                            <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">
                                Sistema
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedSystem("uster")}
                                    className={`flex-1 py-1.5 rounded font-mono text-xs uppercase tracking-wider transition-all border ${selectedSystem === "uster"
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                                        }`}
                                >
                                    Uster
                                </button>
                                <button
                                    onClick={() => setSelectedSystem("premier")}
                                    className={`flex-1 py-1.5 rounded font-mono text-xs uppercase tracking-wider transition-all border ${selectedSystem === "premier"
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                                        }`}
                                >
                                    Premier
                                </button>
                            </div>
                        </div>

                        {/* Quantidade */}
                        <div className="space-y-1.5">
                            <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">
                                Quantidade de Amostras
                            </label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={sampleQuantity}
                                    onChange={(e) => setSampleQuantity(parseInt(e.target.value) || 1)}
                                    className="w-20 h-8 font-mono text-sm text-center border-neutral-200"
                                />
                                <span className="text-xs text-neutral-500 font-mono">amostras</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form Content */}
                <div className="p-3 space-y-3">
                    {/* Etiqueta */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">
                                Etiqueta (20 dígitos)
                            </label>
                            <button
                                onClick={generateRandomData}
                                className="text-[9px] uppercase tracking-[0.2em] font-mono text-blue-600 hover:text-blue-800 transition-colors"
                            >
                                ⚡ Gerar Dados Aleatórios
                            </button>
                        </div>
                        <Input
                            type="text"
                            maxLength={20}
                            value={results.etiqueta}
                            onChange={(e) => handleInputChange("etiqueta", e.target.value)}
                            placeholder="Ex: BN879478946688418733"
                            className="font-mono text-sm h-8 border-neutral-200"
                        />
                    </div>

                    {/* Resultados HVI Grid */}
                    <div className="space-y-2">
                        <label className="block text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">
                            Resultados HVI
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-2">
                            {currentFields.map(({ label, key, hasDev }) => (
                                <div key={key} className="bg-neutral-50 p-1.5 rounded border border-neutral-100 flex flex-col justify-between">
                                    <label className="block text-[9px] uppercase tracking-wider text-neutral-500 font-mono text-center mb-1">
                                        {label}
                                    </label>
                                    <div className="flex flex-col gap-1">
                                        <Input
                                            type="text"
                                            value={results[key]}
                                            onChange={(e) => handleInputChange(key, e.target.value)}
                                            className="font-mono text-xs h-8 text-center border-neutral-200 bg-white"
                                            placeholder="Valor"
                                        />
                                        {hasDev ? (
                                            <>
                                                <Input
                                                    type="text"
                                                    value={deviations[key]}
                                                    onChange={(e) => handleDeviationChange(key, e.target.value)}
                                                    className="font-mono text-[10px] h-6 text-center border-dashed bg-transparent border-neutral-300 focus:border-neutral-500 px-1"
                                                    placeholder="+/-"
                                                />
                                                {parseNumber(deviations[key]) > 0 ? (
                                                    <span className="text-[9px] text-neutral-400 font-mono text-center block h-3 leading-3">
                                                        [{getMinMax(key)}]
                                                    </span>
                                                ) : <div className="h-3" />}
                                            </>
                                        ) : (
                                            <div className="flex-1 min-h-[1.5rem]" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer - Generate Button */}
                <div className="bg-neutral-50 border-t-2 border-neutral-200 p-6">
                    <Button
                        onClick={generateFile}
                        disabled={!results.etiqueta}
                        className="w-full bg-black text-white hover:bg-neutral-800 h-14 font-mono uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileDown className="h-5 w-5 mr-2" />
                        Gerar Arquivo {selectedSystem.toUpperCase()}
                    </Button>
                </div>
            </div>

            {/* History Section */}
            {history.length > 0 && (
                <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden mt-8">
                    <div className="bg-neutral-50 border-b-2 border-neutral-200 p-6 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <History className="h-5 w-5 text-neutral-600" />
                            <h2 className="text-lg font-serif text-black">Histórico de Gerados</h2>
                        </div>
                        <Button
                            variant="ghost"
                            onClick={clearHistory}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Limpar Histórico
                        </Button>
                    </div>
                    <div className="divide-y divide-neutral-200">
                        {history.map((item) => (
                            <div key={item.id} className="flex flex-col hover:bg-neutral-50 transition-colors">
                                <div className="p-4 flex items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${item.system === 'uster' ? 'bg-black text-white' : 'bg-blue-600 text-white'
                                                }`}>
                                                {item.system}
                                            </span>
                                            <span className="text-sm font-mono font-medium text-neutral-900">
                                                {item.filename}
                                            </span>
                                        </div>
                                        <div className="text-xs text-neutral-500 font-mono flex gap-4">
                                            <span>Data: {item.date}</span>
                                            <span>Qtd: {item.quantity}</span>
                                            <span>Etiqueta: {item.etiqueta}</span>
                                            {item.labName && <span className="font-bold text-black">Lab: {item.labName}</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {item.results && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                                                className="font-mono text-xs text-neutral-500 hover:text-neutral-900"
                                            >
                                                {expandedHistoryId === item.id ? 'Ocultar Valores' : 'Ver Valores'}
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => downloadFile(item.content, item.filename)}
                                            className="font-mono text-xs"
                                        >
                                            <Download className="h-3 w-3 mr-2" />
                                            Baixar Novamente
                                        </Button>
                                    </div>
                                </div>
                                {expandedHistoryId === item.id && item.results && (
                                    <div className="px-4 pb-4 border-t border-neutral-100 bg-neutral-50/50">
                                        <div className="pt-2 grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                                            {(item.system === 'uster' ? USTER_FIELDS : PREMIER_FIELDS).map(f => (
                                                <div key={f.key} className="text-xs">
                                                    <span className="block text-[9px] uppercase tracking-wider text-neutral-400 font-mono">{f.label}</span>
                                                    <span className="font-mono text-neutral-900">{item.results?.[f.key] || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

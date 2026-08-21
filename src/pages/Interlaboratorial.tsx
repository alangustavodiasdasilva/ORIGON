import { useState, useEffect } from "react";
import { FileDown, History, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { AuditLogService } from "@/entities/AuditLog";
import { HVIFileGeneratorService } from "@/services/HVIFileGeneratorService";
import { MachineService, type Machine } from "@/entities/Machine";

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
    machineLabel: string;
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

// Helper to look up config for formatting
const getFieldConfig = (key: keyof HVIResults) => {
    return USTER_FIELDS.find(f => f.key === key);
};

export default function Interlaboratorial() {
    const { user, currentLab } = useAuth();
    // Em vez de escolher "Uster"/"Premier" abstrato, escolhe uma máquina de
    // verdade vinculada ao laboratório — o arquivo sempre sai no formato Úster
    // (mesma regra do resto do sistema), com o número real da máquina dentro.
    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState<string>("");
    const [sampleQuantity, setSampleQuantity] = useState<number>(1);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

    useEffect(() => {
        const labId = currentLab?.id || user?.lab_id;
        const fetchMachines = async () => {
            try {
                const fetched = labId ? await MachineService.listByLab(labId) : await MachineService.list();
                setMachines(fetched);
                if (fetched.length > 0) setSelectedMachineId(prev => prev || fetched[0].id);
            } catch (err) {
                console.error("Erro ao buscar máquinas:", err);
            }
        };
        fetchMachines();
    }, [user, currentLab]);

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
            nome: `Teste ${newItem.machineLabel}`,
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
        const machine = machines.find(m => m.id === selectedMachineId);
        if (!machine) {
            alert("Selecione uma máquina antes de gerar o arquivo.");
            return;
        }

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

        // Nome real da máquina vinculada ao laboratório, em vez do "Line5" fixo
        // de antes — mesma lógica usada no resto do sistema.
        const machineNum = machine.machineId.replace(/\D/g, '') || '5';
        const lineName = `Line${machineNum}`;

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
                lineName,
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
            const filename = `interlaboratorial_${etiqueta}_REP${repIndex}_${Date.now()}.H1`;
            downloadFile(lineContent, filename);
        });

        const filename = `interlaboratorial_${etiqueta}_(Multiplos).H1`;
        const fullContent = dataLinesArray.join('\n');

        saveHistory({
            id: Date.now(),
            date: new Date().toLocaleString(),
            machineLabel: `${machine.machineId} (${machine.model})`,
            quantity: sampleQuantity,
            etiqueta,
            filename,
            content: fullContent,
            results: { ...results },
            labId: currentLab?.id || user?.lab_id || undefined,
            labName: currentLab?.nome || "N/A"
        });
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

    const currentFields = USTER_FIELDS;
    const selectedMachine = machines.find(m => m.id === selectedMachineId);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="border-b border-neutral-200 pb-6">
                <h1 className="text-4xl font-serif text-black">Teste Interlaboratorial</h1>
                <p className="text-neutral-600 font-mono text-sm mt-2">
                    Gere arquivos de intercâmbio no formato Úster, pela máquina vinculada ao laboratório
                </p>
            </div>

            {/* Main Form Card */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                {/* Top Section - Máquina e Quantidade */}
                <div className="bg-neutral-50 border-b border-neutral-200 p-3">
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Máquina Selection */}
                        <div className="space-y-1.5">
                            <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">
                                Máquina
                            </label>
                            <select
                                title="Máquina HVI"
                                value={selectedMachineId}
                                onChange={(e) => setSelectedMachineId(e.target.value)}
                                className="w-full h-8 px-2 rounded font-mono text-xs uppercase tracking-wider border border-neutral-200 bg-white focus:outline-none focus:border-black"
                            >
                                {machines.length === 0 && <option value="">Nenhuma máquina cadastrada</option>}
                                {machines.map(m => (
                                    <option key={m.id} value={m.id}>{m.machineId} — {m.model} ({m.serialNumber})</option>
                                ))}
                            </select>
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
                        disabled={!results.etiqueta || !selectedMachine}
                        className="w-full bg-black text-white hover:bg-neutral-800 h-14 font-mono uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <FileDown className="h-5 w-5 mr-2" />
                        Gerar Arquivo Úster{selectedMachine ? ` — HVI ${selectedMachine.machineId}` : ''}
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
                                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-black text-white">
                                                {item.machineLabel}
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
                                            {USTER_FIELDS.map(f => (
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

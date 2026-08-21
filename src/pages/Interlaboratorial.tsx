import { useState, useEffect } from "react";
import { FileDown, Trash2, Download, Plus, ChevronDown, ChevronRight, Loader2, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { AuditLogService } from "@/entities/AuditLog";
import { HVIFileGeneratorService } from "@/services/HVIFileGeneratorService";
import { MachineService, type Machine } from "@/entities/Machine";
import {
    interlaboratorialService,
    type InterlabIdentificacao,
    type InterlabGeneration
} from "@/services/interlaboratorial.service";

const parseNumber = (val: string): number => {
    if (!val) return 0;
    return parseFloat(val.replace(',', '.')) || 0;
};

interface HVIResults {
    grd: string; area: string; cnt: string; uhml: string; ui: string; sfi: string;
    str: string; elg: string; mic: string; mat: string; rd: string; plusB: string;
    mst: string; cg: string; tmp: string; rh: string; sci: string;
}

const USTER_FIELDS: { key: keyof HVIResults; label: string; decimals: number; hasDev: boolean }[] = [
    { key: "grd", label: "GRD", decimals: 0, hasDev: false },
    { key: "area", label: "AREA", decimals: 2, hasDev: true },
    { key: "cnt", label: "CNT", decimals: 0, hasDev: true },
    { key: "uhml", label: "UHML", decimals: 2, hasDev: true },
    { key: "ui", label: "UI", decimals: 1, hasDev: true },
    { key: "sfi", label: "SFI", decimals: 1, hasDev: true },
    { key: "str", label: "STR", decimals: 1, hasDev: true },
    { key: "elg", label: "ELG", decimals: 1, hasDev: true },
    { key: "mic", label: "MIC", decimals: 2, hasDev: true },
    { key: "mat", label: "MAT", decimals: 2, hasDev: true },
    { key: "rd", label: "RD", decimals: 1, hasDev: true },
    { key: "plusB", label: "+B", decimals: 1, hasDev: true },
    { key: "mst", label: "MST", decimals: 1, hasDev: true },
    { key: "cg", label: "CG", decimals: 0, hasDev: false },
    { key: "tmp", label: "TMP", decimals: 1, hasDev: true },
    { key: "rh", label: "RH", decimals: 1, hasDev: true },
    { key: "sci", label: "SCI", decimals: 1, hasDev: true },
];

const PREVIEW_COLUMNS: { key: string; label: string; decimals: number }[] = [
    { key: "mic", label: "Mic", decimals: 2 },
    { key: "uhml", label: "Len", decimals: 2 },
    { key: "ui", label: "Unf", decimals: 1 },
    { key: "str", label: "Str", decimals: 1 },
    { key: "elg", label: "Elg", decimals: 1 },
    { key: "rd", label: "Rd", decimals: 1 },
    { key: "plusB", label: "+b", decimals: 1 },
    { key: "sfi", label: "SFI", decimals: 1 },
    { key: "mat", label: "Mat", decimals: 2 },
];

const emptyResults = (): HVIResults => ({
    grd: "3", area: "0.25", cnt: "029", uhml: "", ui: "", sfi: "",
    str: "", elg: "", mic: "", mat: "", rd: "", plusB: "",
    mst: "07.4", cg: "\"11-1\"", tmp: "24.3", rh: "49.3", sci: ""
});
const zeroDeviations = (): HVIResults => ({
    grd: "0", area: "0", cnt: "0", uhml: "0", ui: "0", sfi: "0",
    str: "0", elg: "0", mic: "0", mat: "0", rd: "0", plusB: "0",
    mst: "0", cg: "0", tmp: "0", rh: "0", sci: "0"
});

const randomTime = () => {
    const hour = 7 + Math.floor(Math.random() * 11); // 07:00–17:59
    const minute = Math.floor(Math.random() * 60);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export default function Interlaboratorial() {
    const { user, currentLab } = useAuth();
    const { addToast } = useToast();
    const labId = currentLab?.id || user?.lab_id || undefined;

    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState("");
    const [operatorCode, setOperatorCode] = useState("");
    const [dayIndex, setDayIndex] = useState(1);

    const [identificacoes, setIdentificacoes] = useState<InterlabIdentificacao[]>([]);
    const [generations, setGenerations] = useState<InterlabGeneration[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedDay, setExpandedDay] = useState<number | null>(null);

    // Formulário de nova Identificação
    const [showAddForm, setShowAddForm] = useState(false);
    const [newIdentificacao, setNewIdentificacao] = useState("");
    const [newEtiquetas, setNewEtiquetas] = useState<string[]>(['']);
    const [newResults, setNewResults] = useState<HVIResults>(emptyResults());
    const [newDeviations, setNewDeviations] = useState<HVIResults>(zeroDeviations());

    // Adicionar etiqueta (novo dia) numa identificação já existente
    const [addingDayFor, setAddingDayFor] = useState<string | null>(null);
    const [newDayEtiqueta, setNewDayEtiqueta] = useState("");

    useEffect(() => {
        const fetchMachines = async () => {
            try {
                const fetched = labId ? await MachineService.listByLab(labId) : await MachineService.list();
                setMachines(fetched);
                setSelectedMachineId(prev => prev || (fetched.length > 0 ? fetched[0].id : ""));
            } catch (err) {
                console.error("Erro ao buscar máquinas:", err);
            }
        };
        fetchMachines();
    }, [labId]);

    const loadData = async () => {
        if (!labId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const [ids, gens] = await Promise.all([
                interlaboratorialService.listIdentificacoes(labId),
                interlaboratorialService.listGenerations(labId)
            ]);
            setIdentificacoes(ids);
            setGenerations(gens);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        if (!labId) return;
        const unsubscribe = interlaboratorialService.subscribe(labId, loadData);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [labId]);

    const getMinMax = (results: HVIResults, deviations: HVIResults, field: keyof HVIResults) => {
        const config = USTER_FIELDS.find(f => f.key === field);
        if (!config) return null;
        const dev = parseNumber(deviations[field]);
        if (dev === 0) return null;
        const base = parseNumber(results[field]);
        return `${(base - dev).toFixed(config.decimals)} - ${(base + dev).toFixed(config.decimals)}`;
    };

    // ── Formulário: nova Identificação ──────────────────────────────────────
    const addEtiquetaField = () => setNewEtiquetas(prev => [...prev, '']);
    const removeEtiquetaField = (index: number) => setNewEtiquetas(prev => prev.filter((_, i) => i !== index));
    const updateEtiquetaField = (index: number, value: string) => {
        setNewEtiquetas(prev => { const next = [...prev]; next[index] = value; return next; });
    };

    const saveNewIdentificacao = async () => {
        if (!newIdentificacao.trim()) {
            addToast({ title: "Preencha a Identificação", type: "warning" });
            return;
        }
        const cleanEtiquetas = newEtiquetas.map(e => e.trim()).filter(Boolean);
        if (cleanEtiquetas.length === 0) {
            addToast({ title: "Preencha pelo menos uma Etiqueta (Dia 1)", type: "warning" });
            return;
        }
        try {
            await interlaboratorialService.createIdentificacao(
                labId!, newIdentificacao.trim(), cleanEtiquetas,
                { values: newResults, deviations: newDeviations } as any,
                user?.nome || "Analista"
            );
            addToast({ title: "Identificação Adicionada", type: "success" });
            setNewIdentificacao("");
            setNewEtiquetas(['']);
            setNewResults(emptyResults());
            setNewDeviations(zeroDeviations());
            setShowAddForm(false);
            await loadData();
        } catch (err: any) {
            addToast({ title: "Erro ao Adicionar", description: err.message, type: "error" });
        }
    };

    const deleteIdentificacao = async (id: string) => {
        if (!confirm("Remover esta identificação e todo o histórico de gerações dela?")) return;
        try {
            await interlaboratorialService.deleteIdentificacao(id);
            addToast({ title: "Identificação Removida", type: "info" });
            await loadData();
        } catch (err: any) {
            addToast({ title: "Erro ao Remover", description: err.message, type: "error" });
        }
    };

    const addDayToIdentificacao = async (ident: InterlabIdentificacao) => {
        if (!newDayEtiqueta.trim()) return;
        try {
            await interlaboratorialService.updateIdentificacao(ident.id, [...ident.etiquetas, newDayEtiqueta.trim()], ident.targetValues as any);
            setAddingDayFor(null);
            setNewDayEtiqueta("");
            await loadData();
        } catch (err: any) {
            addToast({ title: "Erro ao Adicionar Dia", description: err.message, type: "error" });
        }
    };

    // ── Geração do dia, máquina por máquina ─────────────────────────────────
    const qualifyingForDay = identificacoes.filter(id => !!id.etiquetas[dayIndex - 1]);

    const alreadyGeneratedIds = new Set(
        generations
            .filter(g => g.dayIndex === dayIndex && g.machineId === selectedMachineId)
            .map(g => g.identificacaoId)
    );

    const buildFileContent = (etiquetaVal: string, grd: string, reading: any, lineName: string, dateStr: string, timeStr: string): string => {
        const sampleObj: any = { id: `INTERLAB_${Date.now()}_${Math.random()}`, mala: "INTERLAB", etiqueta: etiquetaVal, cor: null, lote_id: 0 };
        return HVIFileGeneratorService.generateH1FileContent(
            sampleObj, dateStr, timeStr, 1, 1, lineName,
            reading.mic, reading.uhml, reading.ui, reading.str, reading.elg, reading.sfi,
            reading.uhml * 0.95, reading.cnt, reading.sci, reading.rd, reading.plusB,
            grd || "31-1", reading.area, 3, reading.mat, 2000
        );
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

    const generateForMachine = async () => {
        const machine = machines.find(m => m.id === selectedMachineId);
        if (!machine) {
            addToast({ title: "Selecione uma máquina", type: "warning" });
            return;
        }
        if (!operatorCode.trim()) {
            addToast({ title: "Preencha o Operador dessa máquina", type: "warning" });
            return;
        }
        const pending = qualifyingForDay.filter(id => !alreadyGeneratedIds.has(id.id));
        if (pending.length === 0) {
            addToast({ title: "Nada pra gerar", description: "Todas as identificações desse dia já foram geradas nessa máquina.", type: "info" });
            return;
        }

        setIsGenerating(true);
        try {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '-');
            const machineNum = machine.machineId.replace(/\D/g, '') || '5';
            const lineName = `Line${machineNum}`;

            const rows = [];
            const filesToDownload: { content: string; filename: string }[] = [];

            for (const ident of pending) {
                const etiquetaVal = ident.etiquetas[dayIndex - 1];
                const tv = (ident.targetValues as any)?.values as HVIResults;
                const dv = (ident.targetValues as any)?.deviations as HVIResults;
                const applyDev = (base: string, dev: string) => {
                    const b = parseNumber(base), d = parseNumber(dev);
                    return d === 0 ? b : b + (Math.random() * 2 - 1) * d;
                };
                const reading = {
                    mic: applyDev(tv.mic, dv.mic), uhml: applyDev(tv.uhml, dv.uhml), ui: applyDev(tv.ui, dv.ui),
                    str: applyDev(tv.str, dv.str), elg: applyDev(tv.elg, dv.elg), sfi: applyDev(tv.sfi, dv.sfi),
                    rd: applyDev(tv.rd, dv.rd), plusB: applyDev(tv.plusB, dv.plusB),
                    cnt: Math.round(applyDev(tv.cnt, dv.cnt)), sci: Math.round(applyDev(tv.sci, dv.sci) || 120),
                    area: applyDev(tv.area, dv.area), mat: applyDev(tv.mat, dv.mat)
                };
                const timeStr = randomTime();
                const content = buildFileContent(etiquetaVal, tv.grd, reading, lineName, dateStr, timeStr);
                const filename = `interlab_dia${dayIndex}_${ident.identificacao.replace(/[^a-zA-Z0-9]/g, '')}_${machine.machineId}.H1`;
                filesToDownload.push({ content, filename });
                rows.push({
                    labId: labId!, identificacaoId: ident.id, dayIndex, machineId: selectedMachineId,
                    operatorCode: operatorCode.trim(), etiqueta: etiquetaVal, generatedTime: timeStr,
                    reading, filename, createdBy: user?.nome || "Analista"
                });
            }

            await interlaboratorialService.saveGenerations(rows);
            AuditLogService.logAction('interlaboratorial', `dia${dayIndex}_${selectedMachineId}`, 'CREATE', null, {
                nome: `Dia ${dayIndex} — ${machine.machineId}`, identificacoes: rows.length, operador: operatorCode
            });

            for (const f of filesToDownload) {
                downloadFile(f.content, f.filename);
                await new Promise(resolve => setTimeout(resolve, 120));
            }

            addToast({ title: "Gerado", description: `${rows.length} arquivo(s) — Dia ${dayIndex}, ${machine.machineId}`, type: "success" });
            await loadData();
        } catch (err: any) {
            addToast({ title: "Erro ao Gerar", description: err.message, type: "error" });
        } finally {
            setIsGenerating(false);
        }
    };

    const redownloadGeneration = (gen: InterlabGeneration) => {
        const machine = machines.find(m => m.id === gen.machineId);
        if (!machine) { addToast({ title: "Máquina não encontrada", type: "error" }); return; }
        const ident = identificacoes.find(i => i.id === gen.identificacaoId);
        const tv = (ident?.targetValues as any)?.values as HVIResults | undefined;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }).replace(/\//g, '-');
        const machineNum = machine.machineId.replace(/\D/g, '') || '5';
        const content = buildFileContent(gen.etiqueta, tv?.grd || "31-1", gen.reading, `Line${machineNum}`, dateStr, gen.generatedTime);
        downloadFile(content, gen.filename);
    };

    const deleteGeneration = async (id: string) => {
        try {
            await interlaboratorialService.deleteGeneration(id);
            await loadData();
        } catch (err: any) {
            addToast({ title: "Erro ao Remover", description: err.message, type: "error" });
        }
    };

    const getMachineLabel = (machineId: string) => {
        const m = machines.find(mm => mm.id === machineId);
        return m ? `${m.machineId} (${m.model})` : machineId;
    };

    const maxDay = identificacoes.reduce((max, id) => Math.max(max, id.etiquetas.length), 1);
    const daysWithData = Array.from(new Set(generations.map(g => g.dayIndex))).sort((a, b) => a - b);
    const selectedMachine = machines.find(m => m.id === selectedMachineId);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="border-b border-neutral-200 pb-6">
                <h1 className="text-4xl font-serif text-black">Teste Interlaboratorial</h1>
                <p className="text-neutral-600 font-mono text-sm mt-2">
                    Cada identificação tem uma etiqueta por dia — no mesmo dia, todas as máquinas testam a mesma etiqueta
                </p>
            </div>

            {isLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>
            ) : (
                <>
                    {/* Identificações do Protocolo */}
                    <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                        <div className="bg-neutral-50 border-b-2 border-neutral-200 p-4 flex items-center justify-between">
                            <h2 className="text-lg font-serif text-black">Identificações do Protocolo</h2>
                            <Button onClick={() => setShowAddForm(v => !v)} variant="outline" size="sm" className="font-mono text-xs">
                                <Plus className="h-3.5 w-3.5 mr-1" /> Nova Identificação
                            </Button>
                        </div>

                        {showAddForm && (
                            <div className="p-4 border-b-2 border-neutral-200 bg-neutral-50/50 space-y-3">
                                <div className="grid md:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Identificação</label>
                                        <Input value={newIdentificacao} onChange={e => setNewIdentificacao(e.target.value)} placeholder="Ex: 26.1.0001534" className="font-mono text-sm h-9" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">
                                            Etiquetas (uma por dia — Dia 1, Dia 2...)
                                        </label>
                                        <div className="space-y-1">
                                            {newEtiquetas.map((etq, i) => (
                                                <div key={i} className="flex gap-1">
                                                    <span className="w-12 h-9 flex items-center justify-center text-[9px] font-mono text-neutral-400 uppercase shrink-0">Dia {i + 1}</span>
                                                    <Input
                                                        value={etq}
                                                        onChange={e => updateEtiquetaField(i, e.target.value)}
                                                        maxLength={20}
                                                        placeholder="Etiqueta (20 dígitos)"
                                                        className="font-mono text-xs h-9"
                                                    />
                                                    {newEtiquetas.length > 1 && (
                                                        <button onClick={() => removeEtiquetaField(i)} className="text-neutral-300 hover:text-red-600 shrink-0 px-1">
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <button onClick={addEtiquetaField} className="text-[9px] uppercase tracking-widest font-mono text-blue-600 hover:text-blue-800">
                                                + Adicionar Dia
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Valores-Alvo HVI</label>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-2">
                                        {USTER_FIELDS.map(({ label, key, hasDev }) => (
                                            <div key={key} className="bg-white p-1.5 rounded border border-neutral-200 flex flex-col justify-between">
                                                <label className="block text-[9px] uppercase tracking-wider text-neutral-500 font-mono text-center mb-1">{label}</label>
                                                <div className="flex flex-col gap-1">
                                                    <Input
                                                        type="text"
                                                        value={newResults[key]}
                                                        onChange={e => setNewResults(prev => ({ ...prev, [key]: e.target.value }))}
                                                        className="font-mono text-xs h-8 text-center border-neutral-200 bg-white"
                                                        placeholder="Valor"
                                                    />
                                                    {hasDev ? (
                                                        <>
                                                            <Input
                                                                type="text"
                                                                value={newDeviations[key]}
                                                                onChange={e => setNewDeviations(prev => ({ ...prev, [key]: e.target.value }))}
                                                                className="font-mono text-[10px] h-6 text-center border-dashed bg-transparent border-neutral-300"
                                                                placeholder="+/-"
                                                            />
                                                            {parseNumber(newDeviations[key]) > 0 ? (
                                                                <span className="text-[9px] text-neutral-400 font-mono text-center block h-3 leading-3">
                                                                    [{getMinMax(newResults, newDeviations, key)}]
                                                                </span>
                                                            ) : <div className="h-3" />}
                                                        </>
                                                    ) : <div className="flex-1 min-h-[1.5rem]" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button onClick={saveNewIdentificacao} className="w-full h-10 bg-black text-white hover:bg-neutral-800 font-mono uppercase text-xs tracking-widest">
                                    Salvar Identificação
                                </Button>
                            </div>
                        )}

                        {identificacoes.length === 0 ? (
                            <p className="p-8 text-center text-xs text-neutral-400 font-mono uppercase tracking-widest">Nenhuma identificação cadastrada ainda</p>
                        ) : (
                            <div className="divide-y divide-neutral-200">
                                {identificacoes.map(ident => (
                                    <div key={ident.id} className="p-4 flex items-center justify-between">
                                        <div>
                                            <span className="font-mono font-bold text-sm text-black">{ident.identificacao}</span>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {ident.etiquetas.map((etq, i) => (
                                                    <span key={i} className="text-[9px] font-mono text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                                                        Dia {i + 1}: {etq}
                                                    </span>
                                                ))}
                                                {addingDayFor === ident.id ? (
                                                    <div className="flex gap-1 items-center">
                                                        <Input
                                                            value={newDayEtiqueta}
                                                            onChange={e => setNewDayEtiqueta(e.target.value)}
                                                            maxLength={20}
                                                            placeholder={`Etiqueta Dia ${ident.etiquetas.length + 1}`}
                                                            className="font-mono text-[10px] h-6 w-40"
                                                        />
                                                        <button onClick={() => addDayToIdentificacao(ident)} className="text-emerald-600 hover:text-emerald-800"><CheckCircle2 className="h-4 w-4" /></button>
                                                        <button onClick={() => { setAddingDayFor(null); setNewDayEtiqueta(""); }} className="text-neutral-300 hover:text-red-600"><X className="h-4 w-4" /></button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setAddingDayFor(ident.id)} className="text-[9px] font-mono text-blue-600 hover:text-blue-800 uppercase tracking-widest">
                                                        + Dia {ident.etiquetas.length + 1}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => deleteIdentificacao(ident.id)} className="text-neutral-300 hover:text-red-600 transition-colors shrink-0">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Gerar por Dia + Máquina */}
                    <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                        <div className="bg-neutral-50 border-b-2 border-neutral-200 p-4">
                            <h2 className="text-lg font-serif text-black">Gerar — Máquina por Máquina</h2>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Dia</label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max={maxDay}
                                        value={dayIndex}
                                        onChange={e => setDayIndex(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="font-mono text-sm h-9 text-center"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Máquina</label>
                                    <select
                                        title="Máquina HVI"
                                        value={selectedMachineId}
                                        onChange={e => setSelectedMachineId(e.target.value)}
                                        className="w-full h-9 px-2 rounded font-mono text-xs uppercase tracking-wider border border-neutral-200 bg-white focus:outline-none focus:border-black"
                                    >
                                        {machines.length === 0 && <option value="">Nenhuma máquina cadastrada</option>}
                                        {machines.map(m => <option key={m.id} value={m.id}>{m.machineId} — {m.model} ({m.serialNumber})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Operador dessa Máquina</label>
                                    <Input value={operatorCode} onChange={e => setOperatorCode(e.target.value)} placeholder="Ex: 01" className="font-mono text-sm h-9 text-center" />
                                </div>
                            </div>

                            <div className="border border-neutral-200 rounded divide-y divide-neutral-100">
                                {qualifyingForDay.length === 0 ? (
                                    <p className="p-4 text-center text-xs text-neutral-400 font-mono">Nenhuma identificação tem etiqueta cadastrada pro Dia {dayIndex}</p>
                                ) : qualifyingForDay.map(ident => {
                                    const done = alreadyGeneratedIds.has(ident.id);
                                    return (
                                        <div key={ident.id} className="p-2.5 flex items-center justify-between text-xs font-mono">
                                            <span>
                                                <span className="font-bold text-black">{ident.identificacao}</span>
                                                <span className="text-neutral-400 mx-2">•</span>
                                                <span className="text-neutral-600">{ident.etiquetas[dayIndex - 1]}</span>
                                            </span>
                                            {done ? (
                                                <span className="flex items-center gap-1 text-emerald-600 text-[10px] uppercase tracking-widest">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Gerado
                                                </span>
                                            ) : (
                                                <span className="text-[10px] uppercase tracking-widest text-neutral-300">Pendente</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <Button
                                onClick={generateForMachine}
                                disabled={isGenerating || qualifyingForDay.length === 0}
                                className="w-full h-14 bg-black text-white hover:bg-neutral-800 font-mono uppercase tracking-widest text-sm disabled:opacity-50"
                            >
                                {isGenerating ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <FileDown className="h-5 w-5 mr-2" />}
                                Gerar Dia {dayIndex} — {selectedMachine ? `HVI ${selectedMachine.machineId}` : '(selecione a máquina)'}
                            </Button>
                        </div>
                    </div>

                    {/* Dados Gerados */}
                    <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                        <div className="bg-neutral-50 border-b-2 border-neutral-200 p-4">
                            <h2 className="text-lg font-serif text-black">Dados Gerados</h2>
                        </div>
                        {daysWithData.length === 0 ? (
                            <p className="p-8 text-center text-xs text-neutral-400 font-mono uppercase tracking-widest">Nada gerado ainda</p>
                        ) : (
                            <div className="divide-y divide-neutral-200">
                                {daysWithData.map(day => {
                                    const dayGens = generations.filter(g => g.dayIndex === day);
                                    const machinesInDay = Array.from(new Set(dayGens.map(g => g.machineId)));
                                    const isExpanded = expandedDay === day;
                                    return (
                                        <div key={day}>
                                            <button
                                                onClick={() => setExpandedDay(isExpanded ? null : day)}
                                                className="w-full p-4 flex items-center gap-3 hover:bg-neutral-50 transition-colors text-left"
                                            >
                                                {isExpanded ? <ChevronDown className="h-4 w-4 text-neutral-400" /> : <ChevronRight className="h-4 w-4 text-neutral-400" />}
                                                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-black text-white">Dia {day}</span>
                                                <span className="text-xs text-neutral-500 font-mono">
                                                    {machinesInDay.length} máquina(s) • {dayGens.length} arquivo(s)
                                                </span>
                                            </button>
                                            {isExpanded && (
                                                <div className="px-4 pb-4 bg-neutral-50/50 overflow-x-auto">
                                                    <table className="w-full text-xs font-mono mt-1">
                                                        <thead>
                                                            <tr className="text-neutral-400 uppercase text-[9px] tracking-wider">
                                                                <th className="text-left p-2">Máquina</th>
                                                                <th className="text-left p-2">Operador</th>
                                                                <th className="text-left p-2">Identificação</th>
                                                                <th className="text-left p-2">Etiqueta</th>
                                                                <th className="text-center p-2">Hora</th>
                                                                {PREVIEW_COLUMNS.map(c => <th key={c.key} className="text-center p-2">{c.label}</th>)}
                                                                <th className="p-2"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {dayGens.map(gen => {
                                                                const ident = identificacoes.find(i => i.id === gen.identificacaoId);
                                                                return (
                                                                    <tr key={gen.id} className="border-t border-neutral-200">
                                                                        <td className="p-2 font-bold text-black">{getMachineLabel(gen.machineId)}</td>
                                                                        <td className="p-2 text-neutral-600">{gen.operatorCode}</td>
                                                                        <td className="p-2 text-neutral-900">{ident?.identificacao || '—'}</td>
                                                                        <td className="p-2 text-neutral-600">{gen.etiqueta}</td>
                                                                        <td className="p-2 text-center text-neutral-500">{gen.generatedTime}</td>
                                                                        {PREVIEW_COLUMNS.map(c => (
                                                                            <td key={c.key} className="p-2 text-center text-neutral-900">
                                                                                {typeof gen.reading[c.key] === 'number' ? gen.reading[c.key].toFixed(c.decimals) : '-'}
                                                                            </td>
                                                                        ))}
                                                                        <td className="p-2 flex items-center gap-1">
                                                                            <button onClick={() => redownloadGeneration(gen)} title="Baixar" className="text-neutral-400 hover:text-black">
                                                                                <Download className="h-3.5 w-3.5" />
                                                                            </button>
                                                                            <button onClick={() => deleteGeneration(gen.id)} title="Remover" className="text-neutral-300 hover:text-red-600">
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

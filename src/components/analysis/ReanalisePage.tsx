import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Cpu, Download, CheckCircle2, AlertCircle, Loader2, Eye, Plus, X, PictureInPicture2, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineService, type Machine } from "@/entities/Machine";
import { useAuth } from "@/contexts/AuthContext";
import { HVIFileGeneratorService } from "@/services/HVIFileGeneratorService";
import ReanaliseDataTable from "./ReanaliseDataTable";

interface AvgValues {
    mic: number; len: number; unf: number; str: number;
    elg: number; rd: number; b: number; cg: string;
    leaf: number; area: number; count: number; mat: number; sfi: number;
}

const DISPLAY_FIELDS: { key: keyof AvgValues; label: string; decimals: number }[] = [
    { key: 'mic', label: 'MIC', decimals: 2 },
    { key: 'len', label: 'LEN', decimals: 2 },
    { key: 'unf', label: 'UNF', decimals: 1 },
    { key: 'str', label: 'STR', decimals: 1 },
    { key: 'elg', label: 'ELG', decimals: 1 },
    { key: 'rd', label: 'RD', decimals: 1 },
    { key: 'b', label: '+b', decimals: 1 },
    { key: 'cg', label: 'CG', decimals: 0 },
    { key: 'leaf', label: 'LEAF', decimals: 0 },
    { key: 'area', label: 'AREA', decimals: 2 },
    { key: 'count', label: 'CNT', decimals: 0 },
    { key: 'mat', label: 'MAT', decimals: 2 },
    { key: 'sfi', label: 'SFI', decimals: 1 },
];

const DEFAULT_AVG: AvgValues = { mic: 0, len: 0, unf: 0, str: 0, elg: 0, rd: 0, b: 0, cg: '', leaf: 0, area: 0, count: 0, mat: 0, sfi: 0 };

function parseNum(text: string): number {
    if (!text) return NaN;
    const cleaned = text.replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return parseFloat(parts[0] + '.' + parts.slice(1).join(''));
    return parseFloat(cleaned);
}

function sanitize(val: number, type: string): number {
    if (isNaN(val) || val === 0) return 0;
    switch (type) {
        case 'mic':
            if (val >= 20 && val <= 99) return val / 10;
            if (val >= 200 && val <= 999) return val / 100;
            if (val >= 2 && val <= 9.9) return val;
            break;
        case 'len':
            if (val >= 200 && val <= 450) return val / 10;
            if (val >= 2000 && val <= 4500) return val / 100;
            if (val >= 20 && val <= 45) return val;
            break;
        case 'unf':
            if (val >= 500 && val <= 950) return val / 10;
            if (val >= 5000 && val <= 9500) return val / 100;
            if (val >= 50 && val <= 95) return val;
            break;
        case 'str':
            if (val >= 100 && val <= 500) return val / 10;
            if (val >= 1000 && val <= 5000) return val / 100;
            if (val >= 10 && val <= 50) return val;
            break;
        case 'elg':
            if (val >= 30 && val <= 150) return val / 10;
            if (val >= 300 && val <= 1500) return val / 100;
            if (val >= 3 && val <= 15) return val;
            break;
        case 'rd':
            if (val >= 400 && val <= 900) return val / 10;
            if (val >= 4000 && val <= 9000) return val / 100;
            if (val >= 40 && val <= 90) return val;
            break;
        case 'b':
            if (val >= 40 && val <= 200) return val / 10;
            if (val >= 400 && val <= 2000) return val / 100;
            if (val >= 4 && val <= 20) return val;
            break;
        case 'area':
            if (val >= 20 && val <= 180) return val / 100;
            if (val >= 0.20 && val <= 1.80) return val;
            break;
        case 'mat':
            if (val >= 70 && val <= 100) return val / 100;
            if (val >= 700 && val <= 1000) return val / 1000;
            if (val > 0.60 && val <= 1.0) return val;
            break;
        case 'sfi':
            if (val >= 30 && val <= 200) return val / 10;
            if (val >= 300 && val <= 2000) return val / 100;
            if (val >= 3 && val <= 20) return val;
            break;
        case 'count':
        case 'leaf':
            if (val > 300) return 0;
            return Math.round(val);
    }
    return val;
}

function validateBounds(type: string, val: number): string | null {
    if (val === 0) return null;
    switch (type) {
        case 'len': return (val < 20 || val > 40) ? 'LEN (Comprimento) deve estar entre 20 e 40' : null;
        case 'unf': return (val < 50 || val > 100) ? 'UNF (Uniformidade) deve estar entre 50 e 100' : null;
        case 'str': return (val < 20 || val > 50) ? 'STR (Resistência) deve estar entre 20 e 50' : null;
        case 'elg': return (val < 2 || val > 15) ? 'ELG (Alongamento) deve estar entre 2 e 15' : null;
        case 'mic': return (val < 2 || val > 10) ? 'MIC (Micronaire) deve estar entre 2 e 10' : null;
        case 'rd': return (val < 50 || val > 100) ? 'RD (Refletância) deve estar entre 50 e 100' : null;
        case 'b': return (val < 2.0 || val > 20.0) ? '+B (Amarelamento) deve estar entre 2.0 e 20.0' : null;
        case 'sfi': return (val < 2.0 || val > 20.0) ? 'SFI (Fibras curtas) deve estar entre 2.0 e 20.0' : null;
        case 'leaf': return (val < 1 || val > 9) ? 'LEAF (Folha) deve estar entre 1 e 9' : null;
        case 'area': return (val < 0.20 || val > 1.80) ? 'AREA deve estar entre 0.20 e 1.80' : null;
        case 'count': return (val < 0 || val > 200) ? 'COUNT deve estar entre 0 e 200' : null;
        case 'mat': return (val < 0.1 || val > 1.5) ? 'MAT deve estar entre 0.1 e 1.5' : null;
        default: return null;
    }
}

function formatCG(raw: string): string {
    const t = raw.replace(/[^\d-]/g, '');
    if (/^\d{2}-\d$/.test(t)) return t;
    if (/^\d{3}$/.test(t)) return t.slice(0, 2) + '-' + t[2];
    if (/^\d{2}$/.test(t)) return t + '-1';
    return t;
}

/** Amostra de uma normal(mean, sigma) via transformada de Box-Muller. */
function randomNormal(mean: number, sigma: number): number {
    if (sigma <= 0) return mean;
    const u1 = Math.max(Math.random(), 1e-9);
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * sigma;
}

export default function ReanalisePage() {
    const { user, currentLab } = useAuth();

    const [machines, setMachines] = useState<Machine[]>([]);
    const [selectedMachineId, setSelectedMachineId] = useState<string>('');
    const [loadingMachines, setLoadingMachines] = useState(true);

    const [avgEdits, setAvgEdits] = useState<Record<string, string>>({});
    const [minEdits, setMinEdits] = useState<Record<string, string>>({});
    const [maxEdits, setMaxEdits] = useState<Record<string, string>>({});
    const [stdEdits, setStdEdits] = useState<Record<string, string>>({});
    const [isRangeMode, setIsRangeMode] = useState(false);
    const [repCount, setRepCount] = useState<number | ''>(6);
    const [isExporting, setIsExporting] = useState(false);
    const [exportStatus, setExportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
    const [previewFiles, setPreviewFiles] = useState<{ name: string, content: string }[] | null>(null);
    const [gridData, setGridData] = useState<Record<string, any[]> | null>(null);
    const [isAutoPreviewing, setIsAutoPreviewing] = useState(false);
    const [generationTrigger, setGenerationTrigger] = useState(0);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);

    const [etiquetas, setEtiquetas] = useState<string[]>(Array(1).fill(''));
    const [osInput, setOsInput] = useState('');
    const [customDate, setCustomDate] = useState('');
    const [customTime, setCustomTime] = useState('');

    useEffect(() => {
        const labId = currentLab?.id || user?.lab_id;
        setLoadingMachines(true);
        const p = labId ? MachineService.listByLab(String(labId)) : MachineService.list();
        p.then(m => {
            setMachines(m);
            if (m.length > 0) setSelectedMachineId(m[0].id);
        }).finally(() => setLoadingMachines(false));
    }, [user, currentLab]);

    // Sincroniza repCount a partir de etiquetas.length (etiquetas é a fonte da verdade)
    useEffect(() => {
        setRepCount(etiquetas.length);
    }, [etiquetas]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (selectedMachineId) {
                generateAutoPreview();
            }
        }, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [avgEdits, minEdits, maxEdits, stdEdits, isRangeMode, selectedMachineId, repCount, etiquetas, customDate, customTime, osInput, generationTrigger]);

    const generateAutoPreview = async () => {
        const machine = machines.find(m => m.id === selectedMachineId);
        if (!machine) return;
        setIsAutoPreviewing(true);
        try {
            const effective = getEffectiveAvg();
            const timestamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const label = etiquetas[0] || 'REANALISE';

            const fakeSample: any = {
                id: `reanalise_${timestamp}`,
                amostra_id: `1_${generationTrigger}`,
                lote_id: 'reanalise',
                mala: osInput || 'REANALISE',
                etiqueta: label,
                hvi: machine.machineId,
                cor: '#10b981',
                mic: effective.mic, len: effective.len, unf: effective.unf,
                str: effective.str, rd: effective.rd, b: effective.b,
            };

            const tols = { mic: 0.05, len: 0.15, unf: 0.3, str: 0.3, rd: 0.3, b: 0.2 };
            const fakeConfig = {
                color_templates: { '#10b981': { ...effective, selectedLine: 0 } }
            };

            const reps = typeof repCount === 'number' ? repCount : 1;
            const overrides = isRangeMode ? getRandomRangeOverrides(reps) : undefined;
            const labIdStr = currentLab?.id ? String(currentLab.id) : (user?.lab_id ? String(user.lab_id) : undefined);

            const result = await HVIFileGeneratorService.generatePreviewForSample(
                fakeSample,
                [fakeSample],
                isRangeMode ? { mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 } : tols,
                overrides,
                etiquetas,
                customDate || undefined,
                customTime || undefined,
                machine.machineId,
                fakeConfig,
                reps,
                labIdStr
            );

            if (result.success && result.data && result.data.files) {
                setPreviewFiles(result.data.files.map((f: any) => ({ name: f.filename, content: f.content })));
                setGridData(result.data.balancedReadings || null);
                setExportStatus(null);
            } else {
                setPreviewFiles(null);
                setGridData(null);
                setExportStatus({ ok: false, msg: result.message || 'Falha ao gerar prévia' });
            }
        } catch (err: any) {
            setPreviewFiles(null);
            setExportStatus({ ok: false, msg: err.message || 'Erro inesperado' });
        } finally {
            setIsAutoPreviewing(false);
        }
    };

    const handleGridChange = async (rowIndex: number, key: string, value: any) => {
        if (!gridData || !selectedMachineId) return;
        
        // Atualiza estado local do grid
        const newGridData = { ...gridData };
        if (newGridData[key]) {
            const arr = [...newGridData[key]];
            arr[rowIndex] = value;
            newGridData[key] = arr;
        }
        setGridData(newGridData);

        // Gera novos arquivos TXT sem re-randomizar
        const machine = machines.find(m => m.id === selectedMachineId);
        if (!machine) return;

        const effective = getEffectiveAvg();
        const timestamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const label = etiquetas[0] || 'REANALISE';

        const fakeSample: any = {
            id: `reanalise_${timestamp}`,
            amostra_id: `1_${generationTrigger}`,
            lote_id: 'reanalise',
            mala: osInput || 'REANALISE',
            etiqueta: label,
            hvi: machine.machineId,
            cor: '#10b981',
            mic: effective.mic, len: effective.len, unf: effective.unf,
            str: effective.str, rd: effective.rd, b: effective.b,
        };

        const fakeConfig = {
            color_templates: { '#10b981': { ...effective, selectedLine: 0 } }
        };

        const reps = typeof repCount === 'number' ? repCount : 1;
        const labIdStr = currentLab?.id ? String(currentLab.id) : (user?.lab_id ? String(user.lab_id) : undefined);

        const result = await HVIFileGeneratorService.generatePreviewForSample(
            fakeSample,
            [fakeSample],
            isRangeMode ? { mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 } : { mic: 0.05, len: 0.15, unf: 0.3, str: 0.3, rd: 0.3, b: 0.2 },
            newGridData,
            etiquetas,
            customDate || undefined,
            customTime || undefined,
            machine.machineId,
            fakeConfig,
            reps,
            labIdStr
        );

        if (result.success && result.data && result.data.files) {
            setPreviewFiles(result.data.files.map((f: any) => ({ name: f.filename, content: f.content })));
        }
    };

    const handleAvgEdit = (field: string, value: string) => setAvgEdits(prev => ({ ...prev, [field]: value }));
    const handleMinEdit = (field: string, value: string) => setMinEdits(prev => ({ ...prev, [field]: value }));
    const handleMaxEdit = (field: string, value: string) => setMaxEdits(prev => ({ ...prev, [field]: value }));
    const handleStdEdit = (field: string, value: string) => setStdEdits(prev => ({ ...prev, [field]: value }));

    // Foca (e seleciona) o campo de etiqueta no índice pedido. NUNCA cria campo novo —
    // só navega entre os que já existem (o analista controla a quantidade pelo botão
    // "+ Adicionar"). Pequeno atraso só pra garantir que o campo já esteja renderizado.
    const focusEtiquetaField = (ownerDoc: Document, index: number) => {
        if (index < 0 || index >= etiquetas.length) return;
        setTimeout(() => {
            const target = ownerDoc.getElementById(`etiqueta-field-${index}`) as HTMLInputElement | null;
            target?.focus();
            target?.select();
        }, 30);
    };

    // Colar um valor único preenche o campo atual e pula pro próximo campo que já
    // existe. Colar várias linhas de uma vez (coluna do Excel, várias leituras de
    // código de barras) distribui um valor em cada campo existente a partir do atual —
    // sem criar nenhum campo novo (isso deixaria uma etiqueta em branco sobrando e
    // geraria um arquivo a mais sem querer).
    const handleEtiquetaPaste = (e: React.ClipboardEvent<HTMLInputElement>, idx: number) => {
        const text = e.clipboardData.getData('text');
        if (!text) return;
        const parts = text.split(/\r\n|\n|\r/).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length === 0) return;
        e.preventDefault();

        setEtiquetas(prev => {
            const next = [...prev];
            parts.forEach((part, i) => {
                const targetIdx = idx + i;
                if (targetIdx < next.length) next[targetIdx] = part;
            });
            return next;
        });

        focusEtiquetaField(e.currentTarget.ownerDocument, idx + parts.length);
    };

    // Enter (inclusive o Enter automático que leitores de código de barras mandam
    // depois de cada leitura) pula pro próximo campo já existente. No último campo,
    // não faz nada — não cria um novo sozinho.
    const handleEtiquetaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        focusEtiquetaField(e.currentTarget.ownerDocument, idx + 1);
    };

    const handleBlur = (field: string, value: string, decimals: number, editType: 'avg' | 'min' | 'max' | 'std' = 'avg', ownerDoc: Document = document) => {
        if (!value) return;

        // Desvio Padrão não é um valor físico do campo (não tem faixa/unidade própria como
        // MIC ou RD) — só arredonda, sem sanitize()/validateBounds() que assumiriam escala errada.
        if (editType === 'std') {
            const num = parseNum(value);
            if (isNaN(num) || num < 0) {
                handleStdEdit(field, '');
                return;
            }
            handleStdEdit(field, decimals > 0 ? num.toFixed(decimals) : String(num));
            return;
        }

        const updater = editType === 'avg' ? handleAvgEdit : (editType === 'min' ? handleMinEdit : handleMaxEdit);
        if (field === 'cg') {
            updater(field, formatCG(value));
        } else {
            const num = parseNum(value);
            if (isNaN(num)) return;
            const sanitized = sanitize(num, field);

            const errorMsg = validateBounds(field, sanitized);
            if (errorMsg) {
                alert(`Valor Inválido no campo ${editType.toUpperCase()}!\n\n${errorMsg}\n\nVocê digitou: ${sanitized}`);
                updater(field, ''); // clear the invalid value

                // Keep focus on the field (no documento correto — pode ser o da janela PiP)
                setTimeout(() => {
                    ownerDoc.getElementById(`${editType}-field-${field}`)?.focus();
                }, 10);
                return;
            }

            updater(field, decimals > 0 ? sanitized.toFixed(decimals) : String(sanitized));
        }
    };

    // Navegação por seta/enter usa o ownerDocument do próprio input em foco, já que
    // dentro do PiP os campos vivem no document da janela flutuante, não no principal.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number, editType: 'avg' | 'min' | 'max' | 'std' = 'avg') => {
        const ownerDoc = e.currentTarget.ownerDocument;
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
            e.preventDefault();
            const next = ownerDoc.getElementById(`${editType}-field-${DISPLAY_FIELDS[index + 1]?.key}`);
            if (next) (next as HTMLInputElement).focus();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = ownerDoc.getElementById(`${editType}-field-${DISPLAY_FIELDS[index - 1]?.key}`);
            if (prev) (prev as HTMLInputElement).focus();
        } else if (e.key === 'ArrowDown') {
            if (editType === 'min') {
                e.preventDefault();
                const next = ownerDoc.getElementById(`max-field-${DISPLAY_FIELDS[index]?.key}`);
                if (next) (next as HTMLInputElement).focus();
            } else if (editType === 'max') {
                e.preventDefault();
                const next = ownerDoc.getElementById(`std-field-${DISPLAY_FIELDS[index]?.key}`);
                if (next) (next as HTMLInputElement).focus();
            }
        } else if (e.key === 'ArrowUp') {
            if (editType === 'max') {
                e.preventDefault();
                const prev = ownerDoc.getElementById(`min-field-${DISPLAY_FIELDS[index]?.key}`);
                if (prev) (prev as HTMLInputElement).focus();
            } else if (editType === 'std') {
                e.preventDefault();
                const prev = ownerDoc.getElementById(`max-field-${DISPLAY_FIELDS[index]?.key}`);
                if (prev) (prev as HTMLInputElement).focus();
            }
        }
    };

    const getEffectiveAvg = (): AvgValues => {
        const result: AvgValues = { ...DEFAULT_AVG };
        for (const [key, val] of Object.entries(avgEdits)) {
            if (key === 'cg') { (result as any).cg = val; }
            else {
                const num = parseFloat(val.replace(',', '.'));
                if (!isNaN(num)) {
                    (result as any)[key] = sanitize(num, key);
                }
            }
        }
        return result;
    };

    const getRandomRangeOverrides = (count: number): Record<string, number[]> => {
        const overrides: Record<string, number[]> = {
            mic: [], len: [], unf: [], str: [], elg: [], rd: [], b: [], sfi: [], mat: [], area: [], count: [], sci: [], csp: [], leaf: []
        };
        for (let i = 0; i < count; i++) {
            for (const f of DISPLAY_FIELDS) {
                if (f.key === 'cg') continue; // CG is not randomizable nicely in range yet, keep empty so it falls back
                
                const minRaw = minEdits[f.key]?.trim();
                const maxRaw = maxEdits[f.key]?.trim();
                const avgRaw = avgEdits[f.key]?.trim();
                const stdRaw = stdEdits[f.key]?.trim();

                // Se o usuário não preencheu NENHUM campo (min, max ou média) para esta propriedade,
                // não geramos override para ela, assim ela usará a variação aleatória balanceada normal.
                if (!minRaw && !maxRaw && !avgRaw) {
                    continue;
                }

                const minVal = parseFloat(minRaw?.replace(',', '.') || '0');
                const maxVal = parseFloat(maxRaw?.replace(',', '.') || '0');
                const stdVal = parseFloat(stdRaw?.replace(',', '.') || '');

                let rnd = minVal;
                if (!isNaN(minVal) && !isNaN(maxVal) && maxVal > minVal) {
                    // Distribuição normal centrada no meio do intervalo em vez de uniforme —
                    // sorteio uniforme espalhava demais (qualquer ponto entre min/max com a
                    // mesma chance), dando um desvio padrão bem maior que o de leituras reais.
                    // Sem Desvio Padrão informado, assume (max-min)/6 — regra prática de que
                    // ±3 desvios cobrem ~99.7% da faixa.
                    const center = (minVal + maxVal) / 2;
                    const sigma = (!isNaN(stdVal) && stdVal > 0) ? stdVal : (maxVal - minVal) / 6;
                    rnd = Math.min(maxVal, Math.max(minVal, randomNormal(center, sigma)));
                } else if (!isNaN(minVal) && minVal !== 0) {
                    rnd = minVal;
                } else if (!isNaN(maxVal) && maxVal !== 0) {
                    rnd = maxVal;
                } else {
                    // Fallback se não preencheu min/max, pega da média
                    const avgVal = parseFloat(avgRaw?.replace(',', '.') || '0');
                    rnd = !isNaN(avgVal) && avgVal !== 0 ? avgVal : DEFAULT_AVG[f.key as keyof AvgValues] as number;
                }

                if (overrides[f.key]) {
                    const fixedRnd = parseFloat(rnd.toFixed(f.decimals));
                    overrides[f.key].push(fixedRnd);
                }
            }
        }
        return overrides;
    };

    const selectedMachine = machines.find(m => m.id === selectedMachineId);

    const handleExport = async () => {
        if (!selectedMachine) return;
        setIsExporting(true);
        setExportStatus(null);
        try {
            const effective = getEffectiveAvg();
            const timestamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const label = etiquetas;

            const fakeSample: any = {
                id: `reanalise_${timestamp}`,
                amostra_id: `1_${generationTrigger}`,
                lote_id: 'reanalise',
                mala: osInput || 'REANALISE',
                etiqueta: label,
                hvi: selectedMachine.machineId,
                cor: '#10b981',
                mic: effective.mic, len: effective.len, unf: effective.unf,
                str: effective.str, rd: effective.rd, b: effective.b,
            };

            const tols = { mic: 0.05, len: 0.15, unf: 0.3, str: 0.3, rd: 0.3, b: 0.2 };
            const fakeConfig = {
                color_templates: {
                    '#10b981': { ...effective, selectedLine: 0 }
                }
            };

            const reps = typeof repCount === 'number' ? repCount : 1;
            const overrides = isRangeMode ? getRandomRangeOverrides(reps) : undefined;
            const labIdStr = currentLab?.id ? String(currentLab.id) : (user?.lab_id ? String(user.lab_id) : undefined);

            const result = await HVIFileGeneratorService.generatePreviewForSample(
                fakeSample,
                [fakeSample],
                isRangeMode ? { mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 } : tols,
                overrides,
                label,
                customDate || undefined,
                customTime || undefined,
                selectedMachine.machineId,
                fakeConfig,
                reps,
                labIdStr
            );

            if (!result.success || !result.data) {
                setExportStatus({ ok: false, msg: result.message || 'Falha na geração do arquivo' });
                return;
            }

            await HVIFileGeneratorService.downloadHVIFile(
                result.data.content,
                result.data.filename,
                result.data.files
            );

            setExportStatus({
                ok: true,
                msg: `${result.data.files?.length ?? 1} arquivo(s) gerado(s) — ${result.data.machineModel}`
            });
        } catch (err: any) {
            setExportStatus({ ok: false, msg: 'Erro ao exportar: ' + (err?.message || 'desconhecido') });
        } finally {
            setIsExporting(false);
        }
    };



    const togglePiP = async () => {
        if (pipWindow) {
            pipWindow.close();
            return;
        }

        if (!('documentPictureInPicture' in window)) {
            alert('Picture-in-Picture não é suportado neste navegador. Use o Edge ou Chrome atualizado.');
            return;
        }

        try {
            const pip = await (window as any).documentPictureInPicture.requestWindow({
                width: 1000,
                height: 800,
            });

            // Copia todos os estilos da página principal
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    pip.document.head.appendChild(style);
                } catch (e) {
                    const link = document.createElement('link');
                    if (styleSheet.href) {
                        link.rel = 'stylesheet';
                        link.href = styleSheet.href;
                        pip.document.head.appendChild(link);
                    }
                }
            });

            // Fundo igual ao da página original, com scroll próprio (a janela tem menos altura que a página)
            pip.document.documentElement.style.height = "100%";
            pip.document.body.className = "bg-neutral-50 p-4";
            pip.document.body.style.height = "100%";
            pip.document.body.style.overflowY = "auto";
            pip.document.body.style.margin = "0";

            pip.addEventListener('pagehide', () => {
                setPipWindow(null);
            });

            setPipWindow(pip);
        } catch (error) {
            console.error('Erro ao abrir PiP:', error);
        }
    };

    const section1Content = (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                        1. Valores para Exportação
                    </span>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setGenerationTrigger(prev => prev + 1)}
                            className="h-6 text-[10px] uppercase font-bold tracking-wider text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                            <Cpu className="w-3 h-3 mr-1" />
                            Gerar Nova Variação
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={togglePiP}
                            title={pipWindow ? "Retornar para a página original" : "Destacar em janela flutuante (PiP)"}
                            className={`h-6 px-2 border-blue-200 transition-colors ${pipWindow ? 'bg-blue-600 text-white hover:bg-blue-700 border-transparent' : 'text-blue-600 hover:bg-blue-50'}`}
                        >
                            <PictureInPicture2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${!isRangeMode ? 'text-black' : 'text-neutral-400'}`}>Média Exata</span>
                    <button 
                        onClick={() => setIsRangeMode(!isRangeMode)}
                        title="Alternar Modo de Intervalo"
                        aria-label="Alternar Modo de Intervalo"
                        className={`w-10 h-5 rounded-full p-1 flex items-center transition-colors ${isRangeMode ? 'bg-blue-600' : 'bg-neutral-300'}`}
                    >
                        <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${isRangeMode ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className={`text-[10px] font-bold ${isRangeMode ? 'text-blue-600' : 'text-neutral-400'}`}>Intervalo (Mín/Máx)</span>
                </div>
            </div>
            {/* Tabela de Inputs (Estilo Planilha) */}
            <div className="border border-neutral-200 shadow-sm bg-white overflow-x-auto custom-scrollbar">
                <table className="w-full border-collapse min-w-[900px]">
                    <thead>
                        <tr className="bg-neutral-100">
                            <th className="border-r border-b border-neutral-200 py-2 px-2 text-left w-20">
                                <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest pl-2">Tipo</span>
                            </th>
                            {DISPLAY_FIELDS.map(f => (
                                <th key={f.key} className="border-r border-b border-neutral-200 last:border-r-0 py-2 px-2 text-center select-none">
                                    <span className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">{f.label}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!isRangeMode ? (
                            <tr>
                                <td className="border-r border-neutral-200 bg-neutral-50 text-[10px] font-bold uppercase text-neutral-500 pl-4 py-3">Média</td>
                                {DISPLAY_FIELDS.map((f, index) => (
                                    <td key={f.key} className="border-r border-neutral-200 last:border-r-0 p-0 relative">
                                        <input
                                            id={'avg-field-' + f.key}
                                            type="text"
                                            title={'Média — ' + f.label}
                                            value={avgEdits[f.key] !== undefined ? avgEdits[f.key] : ''}
                                            placeholder="0"
                                            onChange={e => handleAvgEdit(f.key, e.target.value)}
                                            onFocus={e => e.target.select()}
                                            onBlur={e => handleBlur(f.key, e.target.value, f.decimals, 'avg', e.target.ownerDocument)}
                                            onKeyDown={e => handleKeyDown(e, index, 'avg')}
                                            className="w-full h-12 text-center text-[14px] font-mono font-bold text-black border-none focus:bg-blue-50 focus:ring-inset focus:ring-2 focus:ring-blue-500 focus:relative focus:z-10 outline-none transition-colors"
                                        />
                                    </td>
                                ))}
                            </tr>
                        ) : (
                            <>
                                <tr className="border-b border-neutral-200">
                                    <td className="border-r border-neutral-200 bg-blue-50/50 text-[10px] font-bold uppercase text-blue-600 pl-4 py-3">Mínimo</td>
                                    {DISPLAY_FIELDS.map((f, index) => (
                                        <td key={f.key} className="border-r border-neutral-200 last:border-r-0 p-0 relative">
                                            <input
                                                id={'min-field-' + f.key}
                                                type="text"
                                                title={'Mínimo - ' + f.label}
                                                value={minEdits[f.key] !== undefined ? minEdits[f.key] : ''}
                                                placeholder="0"
                                                onChange={e => handleMinEdit(f.key, e.target.value)}
                                                onFocus={e => e.target.select()}
                                                onBlur={e => handleBlur(f.key, e.target.value, f.decimals, 'min', e.target.ownerDocument)}
                                                onKeyDown={e => handleKeyDown(e, index, 'min')}
                                                className="w-full h-12 text-center text-[14px] font-mono font-bold text-blue-700 border-none bg-transparent focus:bg-blue-100 focus:ring-inset focus:ring-2 focus:ring-blue-500 focus:relative focus:z-10 outline-none transition-colors"
                                            />
                                        </td>
                                    ))}
                                </tr>
                                <tr className="border-b border-neutral-200">
                                    <td className="border-r border-neutral-200 bg-emerald-50/50 text-[10px] font-bold uppercase text-emerald-600 pl-4 py-3">Máximo</td>
                                    {DISPLAY_FIELDS.map((f, index) => (
                                        <td key={f.key} className="border-r border-neutral-200 last:border-r-0 p-0 relative">
                                            <input
                                                id={'max-field-' + f.key}
                                                type="text"
                                                title={'Máximo - ' + f.label}
                                                value={maxEdits[f.key] !== undefined ? maxEdits[f.key] : ''}
                                                placeholder="0"
                                                onChange={e => handleMaxEdit(f.key, e.target.value)}
                                                onFocus={e => e.target.select()}
                                                onBlur={e => handleBlur(f.key, e.target.value, f.decimals, 'max', e.target.ownerDocument)}
                                                onKeyDown={e => handleKeyDown(e, index, 'max')}
                                                className="w-full h-12 text-center text-[14px] font-mono font-bold text-emerald-700 border-none bg-transparent focus:bg-emerald-100 focus:ring-inset focus:ring-2 focus:ring-emerald-500 focus:relative focus:z-10 outline-none transition-colors"
                                            />
                                        </td>
                                    ))}
                                </tr>
                                <tr>
                                    <td className="border-r border-neutral-200 bg-purple-50/50 text-[10px] font-bold uppercase text-purple-600 pl-4 py-3">Desvio Padrão</td>
                                    {DISPLAY_FIELDS.map((f, index) => (
                                        <td key={f.key} className="border-r border-neutral-200 last:border-r-0 p-0 relative">
                                            <input
                                                id={'std-field-' + f.key}
                                                type="text"
                                                title={'Desvio Padrão - ' + f.label}
                                                value={stdEdits[f.key] !== undefined ? stdEdits[f.key] : ''}
                                                placeholder="auto"
                                                onChange={e => handleStdEdit(f.key, e.target.value)}
                                                onFocus={e => e.target.select()}
                                                onBlur={e => handleBlur(f.key, e.target.value, f.decimals, 'std', e.target.ownerDocument)}
                                                onKeyDown={e => handleKeyDown(e, index, 'std')}
                                                className="w-full h-12 text-center text-[14px] font-mono font-bold text-purple-700 border-none bg-transparent focus:bg-purple-100 focus:ring-inset focus:ring-2 focus:ring-purple-500 focus:relative focus:z-10 outline-none transition-colors"
                                            />
                                        </td>
                                    ))}
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const section2Content = (
        <div className="space-y-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                2. Configurações e Exportação
            </span>
            <div className="border border-neutral-200 bg-white shadow-sm flex flex-col">
                <div className="p-5 space-y-5">
                    {loadingMachines ? (
                        <div className="flex items-center gap-2 text-neutral-400 text-[11px]">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando máquinas...
                        </div>
                    ) : machines.length === 0 ? (
                        <div className="flex items-center gap-2 text-red-600 text-[11px]">
                            <AlertCircle className="w-4 h-4" /> Nenhuma máquina cadastrada.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label htmlFor="reanalise-machine-select" className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">
                                Máquina HVI
                            </label>
                            <select
                                id="reanalise-machine-select"
                                title="Selecionar máquina HVI"
                                value={selectedMachineId}
                                onChange={e => setSelectedMachineId(e.target.value)}
                                className="w-full h-10 border border-neutral-300 px-3 text-[12px] font-bold text-black bg-white focus:border-black outline-none rounded-none"
                            >
                                {machines.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.machineId} — {m.model} ({m.serialNumber})
                                    </option>
                                ))}
                            </select>
                            {selectedMachine && (
                                <div className="flex items-center gap-2 mt-1">
                                    <Cpu className="w-3.5 h-3.5 text-neutral-500" />
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 ${selectedMachine.model === 'USTER' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
                                        }`}>
                                        {selectedMachine.model}
                                    </span>
                                    <span className="text-[9px] text-neutral-400 font-mono uppercase">
                                        {selectedMachine.model === 'USTER' ? 'Extensão: .H1' : 'Formato PREMIER'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Ordem de Serviço (OS) */}
                        <div>
                            <label htmlFor="reanalise-os" className="text-[9px] font-black uppercase text-neutral-400 tracking-widest block mb-2">
                                Ordem de Serviço (OS)
                            </label>
                            <input
                                id="reanalise-os"
                                type="text"
                                title="Ordem de Serviço"
                                value={osInput}
                                onChange={e => setOsInput(e.target.value)}
                                onFocus={e => e.target.select()}
                                className="w-full h-10 border border-neutral-300 px-3 text-[12px] font-bold text-black focus:border-black outline-none rounded-none bg-white"
                            />
                        </div>

                        {/* Etiquetas */}
                        <div className="col-span-1 sm:col-span-2">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[9px] font-black uppercase text-neutral-400 tracking-widest">
                                    Etiquetas Internas ({etiquetas.length} arquivo{etiquetas.length !== 1 ? 's' : ''})
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEtiquetas([''])}
                                        title="Remover todas as etiquetas e voltar a 1 campo vazio"
                                        className="flex items-center gap-1 h-6 px-2 text-[10px] font-black uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                                    >
                                        <Eraser className="w-3 h-3" />
                                        Limpar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEtiquetas(prev => [...prev, ''])}
                                        title="Adicionar etiqueta"
                                        className="flex items-center gap-1 h-6 px-2 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[200px] overflow-y-auto p-2 border border-neutral-100 bg-neutral-50 custom-scrollbar">
                                {etiquetas.map((val, idx) => (
                                    <div key={idx} className="relative group">
                                        <input
                                            id={`etiqueta-field-${idx}`}
                                            type="text"
                                            placeholder={`Arq ${idx + 1}`}
                                            title={`Etiqueta do arquivo ${idx + 1} — cole ou pressione Enter pra pular pro próximo`}
                                            value={val}
                                            onFocus={e => e.target.select()}
                                            onChange={e => {
                                                const next = [...etiquetas];
                                                next[idx] = e.target.value;
                                                setEtiquetas(next);
                                            }}
                                            onPaste={e => handleEtiquetaPaste(e, idx)}
                                            onKeyDown={e => handleEtiquetaKeyDown(e, idx)}
                                            className="w-full h-8 border border-neutral-300 px-2 pr-6 text-[11px] font-bold text-black focus:border-black outline-none rounded-none text-center bg-white"
                                        />
                                        {etiquetas.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEtiquetas(prev => prev.filter((_, i) => i !== idx));
                                                }}
                                                title={`Remover etiqueta ${idx + 1}`}
                                                className="absolute top-0 right-0 w-5 h-8 flex items-center justify-center text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Dados extras (Data / Hora) */}
                    <div className="pt-4 border-t border-neutral-100 grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="reanalise-date" className="text-[9px] font-black uppercase text-neutral-400 tracking-widest block mb-1">
                                Data de Geração
                            </label>
                            <input
                                id="reanalise-date"
                                type="date"
                                title="Data de geração"
                                value={customDate}
                                onChange={e => setCustomDate(e.target.value)}
                                className="w-full h-9 border border-neutral-200 px-2 text-[11px] font-bold text-black focus:border-black outline-none rounded-none"
                            />
                        </div>
                        <div>
                            <label htmlFor="reanalise-time" className="text-[9px] font-black uppercase text-neutral-400 tracking-widest block mb-1">
                                Hora de Geração
                            </label>
                            <input
                                id="reanalise-time"
                                type="time"
                                title="Hora de geração"
                                value={customTime}
                                onChange={e => setCustomTime(e.target.value)}
                                className="w-full h-9 border border-neutral-200 px-2 text-[11px] font-bold text-black focus:border-black outline-none rounded-none"
                            />
                        </div>
                    </div>

                    {/* Exportar */}
                    {selectedMachine && (
                        <div className="p-5 border-t border-neutral-100 bg-neutral-50 flex flex-col gap-3">
                            <Button
                                size="lg"
                                disabled={isExporting || (typeof repCount === 'number' && repCount < 1)}
                                onClick={handleExport}
                                className="w-full h-14 rounded-none bg-black text-white hover:bg-neutral-800 text-[12px] font-black uppercase tracking-widest transition-colors"
                            >
                                {isExporting
                                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exportando...</>
                                    : <><Download className="w-4 h-4 mr-2" />Gerar {repCount || 0} arquivo(s)</>
                                }
                            </Button>

                            {exportStatus && (
                                <div className={`flex items-start gap-2 p-3 border ${exportStatus.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
                                    }`}>
                                    {exportStatus.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                                    <span className="text-[11px] font-bold">{exportStatus.msg}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const previewPanelContent = (
        <>
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    Exemplo dos Arquivos ({previewFiles?.length || 0})
                </span>
                {isAutoPreviewing && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />}
            </div>
            <div className="border border-neutral-200 bg-white flex flex-col flex-1 min-h-[400px] overflow-hidden">
                <div className="bg-neutral-100 border-b border-neutral-200 px-3 py-2 text-[10px] font-black uppercase text-neutral-500 tracking-widest flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        {selectedMachine ? `Prévia — ${selectedMachine.model}` : 'Prévia'}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto bg-neutral-50 p-2 space-y-4">
                    {previewFiles && previewFiles.length > 0 ? (
                        previewFiles.map((file, idx) => (
                            <div key={idx} className="bg-white border border-neutral-200 shadow-sm">
                                <div className="bg-blue-50 border-b border-blue-100 px-3 py-1.5 text-[9px] font-mono font-bold text-blue-700 flex justify-between items-center">
                                    <span>{file.name}</span>
                                    <span className="opacity-50">#{idx + 1}</span>
                                </div>
                                <pre className="p-3 text-[10px] sm:text-[11px] font-mono whitespace-pre overflow-x-auto text-neutral-800">
                                    {file.content}
                                </pre>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400 gap-2 opacity-50 p-6">
                            <Eye className="w-8 h-8" />
                            <p>Preencha os valores para ver<br />a prévia dos arquivos aqui.</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    const dataTableContent = (gridData && selectedMachineId) ? (
        <div className="animate-fade-in-up">
            <ReanaliseDataTable
                gridData={gridData}
                labels={etiquetas}
                machineName={machines.find(m => m.id === selectedMachineId)?.machineId || ''}
                onChange={handleGridChange}
            />
        </div>
    ) : null;

    // Conteúdo completo (Valores + Configurações + Dados Gerados) que se move
    // inteiro para a janela PiP quando ela está aberta.
    const pipContent = (
        <div className="space-y-6 min-w-[900px] p-1">
            {section1Content}
            {section2Content}
            {dataTableContent}
        </div>
    );

    return (
        <div className="space-y-10 pt-6 pb-24 animate-fade-in w-full max-w-[1200px] mx-auto px-6">
            {/* Título */}
            <div className="space-y-1 border-b border-neutral-200 pb-6">
                <h2 className="text-2xl font-bold uppercase tracking-tight text-neutral-900">
                    Reanálise Manual
                </h2>
                <p className="text-[11px] text-neutral-400 font-mono uppercase tracking-widest">
                    Preenchimento MANUAL → EXPORTAÇÃO USTER / PREMIER
                </p>
            </div>
            <div className="space-y-8">
                {pipWindow && createPortal(pipContent, pipWindow.document.body)}

                {pipWindow ? (
                    <div className="w-full border border-dashed border-blue-300 bg-blue-50/50 flex flex-col items-center justify-center text-blue-500 rounded-lg gap-1 py-10 px-6 text-center">
                        <PictureInPicture2 className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-[11px] font-bold uppercase tracking-widest">
                            Valores, configurações e dados gerados estão abertos em uma janela flutuante
                        </span>
                        <Button variant="outline" size="sm" onClick={togglePiP} className="mt-4 h-7 text-[10px] uppercase font-bold text-blue-700 bg-white hover:bg-blue-50">
                            Retornar à Página
                        </Button>
                    </div>
                ) : (
                    <>
                        {section1Content}
                        <div className="flex flex-col lg:flex-row gap-8 lg:items-stretch">
                            {/* ── Coluna Esquerda: Formulários ── */}
                            <div className="flex-1 space-y-6 w-full min-w-0">
                                {section2Content}
                            </div>

                            {/* ── Coluna Direita: Pré-visualização (acompanha a altura da coluna esquerda) ── */}
                            <div className="w-full lg:w-[450px] shrink-0 flex flex-col">
                                {previewPanelContent}
                            </div>
                        </div>

                        {dataTableContent}
                    </>
                )}

                {/* A prévia dos arquivos continua visível na página mesmo com a janela flutuante aberta */}
                {pipWindow && (
                    <div className="w-full lg:w-[450px] lg:ml-auto flex flex-col">
                        {previewPanelContent}
                    </div>
                )}
            </div>
        </div>
    );
}

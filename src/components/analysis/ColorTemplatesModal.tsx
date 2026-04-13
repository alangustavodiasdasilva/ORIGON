import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Save, Palette, ImagePlus, Loader2, Cpu, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Tesseract from "tesseract.js";

interface ColorTemplate {
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    b: number;
    cg: string;
    elg: number;
    area: number;
    count: number;
    mat: number;
    leaf: number;
    sfi: number;
    csp: number;
    sci: number;
}

// Tipo estendido apenas para persistência — não polui ColorTemplate
interface StoredTemplate extends ColorTemplate {
    selectedLine?: number;
}

const DEFAULT_TEMPLATES: Record<string, ColorTemplate> = {
    "#10b981": { mic: 4.50, len: 29.0, unf: 80.0, str: 29.0, rd: 80.0, b: 11.0, cg: "11-1", elg: 6.5, area: 0.25, count: 30, mat: 0.85, leaf: 3, sfi: 10.3, csp: 1800, sci: 125 },
    "#ef4444": { mic: 4.20, len: 28.0, unf: 78.0, str: 27.0, rd: 70.0, b: 12.0, cg: "31-1", elg: 6.0, area: 0.30, count: 35, mat: 0.83, leaf: 4, sfi: 11.1, csp: 1650, sci: 115 },
    "#3b82f6": { mic: 4.80, len: 30.0, unf: 82.0, str: 32.0, rd: 85.0, b: 10.0, cg: "21-1", elg: 7.0, area: 0.20, count: 25, mat: 0.87, leaf: 2, sfi: 9.8, csp: 1950, sci: 135 },
    "#f59e0b": { mic: 4.40, len: 28.5, unf: 79.5, str: 28.5, rd: 75.0, b: 11.5, cg: "12-1", elg: 6.2, area: 0.28, count: 32, mat: 0.84, leaf: 3, sfi: 10.5, csp: 1750, sci: 122 },
};

const PRINT_ROWS: ColorTemplate[] = [
    { mic: 4.14, len: 29.09, unf: 79.5, str: 24.4, elg: 6.2, rd: 80.4, b: 10.6, cg: "12-1", leaf: 3, area: 0.27, count: 26, csp: 0, sci: 0, mat: 0.85, sfi: 10.3 },
    { mic: 4.19, len: 28.56, unf: 79.3, str: 24.4, elg: 6.7, rd: 81.0, b: 10.6, cg: "11-3", leaf: 3, area: 0.20, count: 32, csp: 0, sci: 0, mat: 0.87, sfi: 10.3 },
    { mic: 4.15, len: 28.77, unf: 79.4, str: 25.6, elg: 6.6, rd: 81.1, b: 10.7, cg: "12-1", leaf: 3, area: 0.24, count: 35, csp: 0, sci: 0, mat: 0.86, sfi: 10.3 },
    { mic: 4.17, len: 29.14, unf: 79.3, str: 24.6, elg: 6.1, rd: 81.2, b: 10.8, cg: "12-1", leaf: 3, area: 0.29, count: 29, csp: 0, sci: 0, mat: 0.86, sfi: 10.4 },
    { mic: 4.15, len: 28.67, unf: 78.8, str: 25.1, elg: 6.7, rd: 80.4, b: 11.2, cg: "12-1", leaf: 3, area: 0.27, count: 29, csp: 0, sci: 0, mat: 0.87, sfi: 10.4 },
    { mic: 4.11, len: 28.90, unf: 78.7, str: 25.4, elg: 6.1, rd: 80.9, b: 11.1, cg: "12-1", leaf: 3, area: 0.28, count: 33, csp: 0, sci: 0, mat: 0.85, sfi: 9.8 },
];

const COLORS = [
    { hex: "#10b981", label: "VERDE (Elite)" },
    { hex: "#ef4444", label: "VERMELHO (Abaixo)" },
    { hex: "#3b82f6", label: "AZUL (Premium)" },
    { hex: "#f59e0b", label: "AMARELO (Alerta)" },
];

const FIELDS: { id: keyof ColorTemplate; label: string; step: string; type?: string }[] = [
    { id: 'mic', label: 'MIC', step: '0.01' },
    { id: 'len', label: 'LEN', step: '0.01' },
    { id: 'unf', label: 'UNF', step: '0.1' },
    { id: 'str', label: 'STR', step: '0.1' },
    { id: 'elg', label: 'ELG', step: '0.1' },
    { id: 'rd', label: 'RD', step: '0.1' },
    { id: 'b', label: '+b', step: '0.1' },
    { id: 'cg', label: 'CG', step: '0', type: 'text' },
    { id: 'leaf', label: 'LEAF', step: '1' },
    { id: 'area', label: 'AREA', step: '0.01' },
    { id: 'count', label: 'CNT', step: '1' },
    { id: 'csp', label: 'CSP', step: '1' },
    { id: 'sci', label: 'SCI', step: '1' },
    { id: 'mat', label: 'MAT', step: '0.01' },
    { id: 'sfi', label: 'SFI', step: '0.1' },
];

// ── Helpers de OCR ─────────────────────────────────────────────────────────────

/** Corrige leituras erradas de CG pelo Tesseract. */
function fixCG(raw: string): string {
    const t = raw.replace(/[|[\]{} ]/g, '').trim();
    if (/^\d{2}-\d$/.test(t)) return t;
    if (/^\d{3}$/.test(t)) return t.slice(0, 2) + '-' + t[2];
    const m = t.match(/^(\d{2})-(\d{2,})$/);
    if (m) return m[1] + '-' + m[2][0];
    if (/^\d{2}$/.test(t)) return t + '-1';
    return t;
}

/** Preenche células 0/nulas com o valor mais frequente da coluna. */
function fillByMode(rows: ColorTemplate[], field: keyof ColorTemplate, fallback: number | string): void {
    const values = rows
        .map(r => r[field])
        .filter(v => v !== null && v !== undefined && v !== 0 && v !== '');
    if (values.length === 0) return;
    const freq = new Map<unknown, number>();
    for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
    const mode = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const row of rows) {
        const v = row[field];
        if (v === null || v === undefined || v === 0 || v === '') {
            (row as any)[field] = mode ?? fallback;
        }
    }
}

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface DraggingRef {
    type: 'col' | 'row';
    idx: number;
    startPos: number;
    startScreen: number;
    size: number;
}

interface ColorTemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    specificColor?: string;
    contextKey?: string;
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function ColorTemplatesModal({ isOpen, onClose, specificColor, contextKey }: ColorTemplatesModalProps) {
    const STORAGE_PREFIX = contextKey ? `lote_${contextKey}_` : '';

    const [templates, setTemplates] = useState<Record<string, ColorTemplate>>(DEFAULT_TEMPLATES);
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});
    const [scannedRows, setScannedRows] = useState<ColorTemplate[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [isMappingMode, setIsMappingMode] = useState(false);

    const NUM_COL_DIVIDERS = 16;
    const NUM_ROW_DIVIDERS = 7;

    const defaultColDividers = Array.from({ length: NUM_COL_DIVIDERS }, (_, i) => i * (100 / (NUM_COL_DIVIDERS - 1)));
    const defaultRowDividers = Array.from({ length: NUM_ROW_DIVIDERS }, (_, i) => 25 + i * (50 / (NUM_ROW_DIVIDERS - 1)));

    const [colDividers, setColDividers] = useState<number[]>(defaultColDividers);
    const [rowDividers, setRowDividers] = useState<number[]>(defaultRowDividers);

    const draggingSplitter = useRef<DraggingRef | null>(null);

    // ── Carrega estado do localStorage quando abre ou muda contextKey ──────────
    useEffect(() => {
        if (!isOpen) return;

        try {
            const c = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}print_cols_v2`) || 'null');
            setColDividers(Array.isArray(c) ? c : defaultColDividers);
        } catch { setColDividers(defaultColDividers); }

        try {
            const r = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}print_rows_v2`) || 'null');
            setRowDividers(Array.isArray(r) ? r : defaultRowDividers);
        } catch { setRowDividers(defaultRowDividers); }

        const storedScanned = localStorage.getItem(`${STORAGE_PREFIX}custom_print_scanned_rows`);
        setScannedRows(storedScanned ? JSON.parse(storedScanned) : PRINT_ROWS.map(r => ({ ...r })));

        const storedPreviews = localStorage.getItem(`${STORAGE_PREFIX}custom_print_previews`);
        setPreviews(storedPreviews ? JSON.parse(storedPreviews) : {});

        const stored = localStorage.getItem(`${STORAGE_PREFIX}custom_color_averages`);
        if (stored) {
            try {
                const parsed: Record<string, StoredTemplate> = JSON.parse(stored);
                const merged: Record<string, ColorTemplate> = { ...DEFAULT_TEMPLATES };
                const restoredSelected: Record<string, number> = {};
                Object.keys(parsed).forEach(color => {
                    merged[color] = { ...DEFAULT_TEMPLATES[color], ...parsed[color] };
                    if (typeof parsed[color]?.selectedLine === 'number') {
                        restoredSelected[color] = parsed[color].selectedLine as number;
                    }
                });
                setTemplates(merged);
                setSelectedLines(restoredSelected);
            } catch {
                setTemplates(DEFAULT_TEMPLATES);
                setSelectedLines({});
            }
        } else {
            setTemplates(DEFAULT_TEMPLATES);
            setSelectedLines({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, contextKey]);

    // Persiste dividers sempre que mudam
    useEffect(() => {
        localStorage.setItem(`${STORAGE_PREFIX}print_cols_v2`, JSON.stringify(colDividers));
        localStorage.setItem(`${STORAGE_PREFIX}print_rows_v2`, JSON.stringify(rowDividers));
    }, [colDividers, rowDividers, STORAGE_PREFIX]);

    // ── Drag de splitters no modo mapeamento ──────────────────────────────────
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!draggingSplitter.current) return;
            const { type, idx, startPos, startScreen, size } = draggingSplitter.current;

            if (type === 'col') {
                const delta = ((e.clientX - startScreen) / size) * 100;
                setColDividers(prev => {
                    const next = [...prev];
                    const min = idx === 0 ? 0 : next[idx - 1] + 1;
                    const max = idx === NUM_COL_DIVIDERS - 1 ? 100 : next[idx + 1] - 1;
                    next[idx] = Math.max(min, Math.min(max, startPos + delta));
                    return next;
                });
            } else {
                const delta = ((e.clientY - startScreen) / size) * 100;
                setRowDividers(prev => {
                    const next = [...prev];
                    const min = idx === 0 ? 0 : next[idx - 1] + 1;
                    const max = idx === NUM_ROW_DIVIDERS - 1 ? 100 : next[idx + 1] - 1;
                    next[idx] = Math.max(min, Math.min(max, startPos + delta));
                    return next;
                });
            }
        };
        const handleUp = () => { draggingSplitter.current = null; };

        if (isMappingMode) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isMappingMode]);

    const startDragSplitter = (
        e: React.MouseEvent,
        type: 'col' | 'row',
        idx: number,
        startPos: number
    ) => {
        e.preventDefault();
        const container = (e.currentTarget as HTMLElement).parentElement;
        if (!container) return;
        localStorage.setItem(`${STORAGE_PREFIX}print_custom_map_active`, 'true');
        const rect = container.getBoundingClientRect();
        draggingSplitter.current = {
            type,
            idx,
            startPos,
            startScreen: type === 'col' ? e.clientX : e.clientY,
            size: type === 'col' ? rect.width : rect.height,
        };
    };

    // ── Funções auxiliares de OCR ──────────────────────────────────────────────
    const extractDecimalHVI = (text: string): number => {

        if (!text) return 0;
        const cleaned = text.replace(/[^0-9,.]/g, '').replace(',', '.');
        const value = parseFloat(cleaned);
        return isNaN(value) ? 0 : value;
    };

    /**
     * Sanitiza valores numéricos que o OCR leu sem vírgula/ponto decimal.
     * Exemplo: "756" quando o correto é "75,6" — aplica /10 correto por campo.
     */
    const sanitizeValueHVI = (val: number, type: string): number => {
        if (val === 0) return 0;
        switch (type) {
            case 'mic':
                if (val >= 20 && val < 70) return val / 10;
                if (val >= 200) return val / 100;
                break;
            case 'len':
                if (val >= 240 && val < 500) return val / 10;
                if (val >= 2000) return val / 100;
                break;
            case 'unf':
                if (val >= 700 && val < 1000) return val / 10;
                break;
            case 'str':
                if (val >= 100 && val <= 600) return val / 10;
                break;
            case 'elg':
                // Ex: "67" quando correto é "6,7" → val>=40 && <100 → /10
                if (val >= 40 && val < 100) return val / 10;
                if (val >= 100) return val / 100;
                break;
            case 'rd':
                if (val >= 600 && val < 1000) return val / 10;
                break;
            case 'b':
                if (val >= 40 && val < 200) return val / 10;
                break;
            case 'area':
                if (val >= 10 && val <= 200) return val / 100;
                break;
            case 'mat':
                // OCR leu "87" em vez de "0,87"
                if (val >= 80 && val <= 95) return val / 100;
                if (val >= 800) return val / 1000;
                break;
            case 'sfi':
                if (val >= 50 && val < 200) return val / 10;
                if (val >= 800) return val / 100;
                break;
            case 'count':
                // Count real está entre 15 e 70 neste tipo de análise
                if (val > 200) return 0; // valor claramente inválido
                break;
        }
        return val;
    };

    // ── OCR principal ──────────────────────────────────────────────────────────
    const processOCR = async (image: string): Promise<void> => {
        setIsScanning(true);
        setScanProgress(0);

        try {
            const result = await Tesseract.recognize(image, 'eng', {
                logger: (m: { status: string; progress: number }) => {
                    if (m.status === 'recognizing text') {
                        setScanProgress(Math.round(m.progress * 100));
                    }
                },
            });

            const rawText = result.data.text;
            console.warn('OCR TEXTO BRUTO:', rawText);

            const lines = rawText
                .split('\n')
                .map((l: string) => l.trim().replace(/\bo\b/gi, '0'))
                .filter((l: string) => l.length > 5);

            const detectedRows: ColorTemplate[] = [];

            for (const line of lines) {
                const allNums = line.match(/\d+[,.]\d+|\d+/g) || [];
                if (allNums.length < 6) continue;

                // ── Âncora no CG (NN-N) ──────────────────────────────────────
                const cgMatch = line.match(/(\d{1,2})\s*[-–—]\s*(\d)/);
                let cgValue = '12-1';
                let numsBefore: string[] = [];
                let numsAfter: string[] = [];

                if (cgMatch) {
                    cgValue = fixCG(cgMatch[1] + '-' + cgMatch[2]);
                    const cgPos = line.indexOf(cgMatch[0]);
                    numsBefore = (line.substring(0, cgPos).match(/\d+[,.]\d+|\d+/g) || []);
                    numsAfter  = (line.substring(cgPos + cgMatch[0].length).match(/\d+[,.]\d+|\d+/g) || []);
                    if (numsBefore.length < 7) continue;
                } else {
                    if (allNums.length < 8) continue;
                    numsBefore = allNums.slice(0, 7);
                    const rest = allNums.slice(7);
                    let cgSkip = 0;
                    if (rest[0] && /^\d{3}$/.test(rest[0])) {
                        cgValue = rest[0].slice(0, 2) + '-' + rest[0].slice(2);
                        cgSkip = 1;
                    } else if (rest[0] && /^\d{2}$/.test(rest[0])) {
                        cgValue = rest[0];
                        cgSkip = 1;
                        if (rest[1] && /^\d$/.test(rest[1])) {
                            cgValue = rest[0] + '-' + rest[1];
                            cgSkip = 2;
                        }
                    }
                    numsAfter = rest.slice(cgSkip);
                }

                const pre = numsBefore.slice(-7);

                // ── Campos pré-CG (Média Primária) ───────────────────────────
                const mic  = sanitizeValueHVI(extractDecimalHVI(pre[0]), 'mic');
                const len  = sanitizeValueHVI(extractDecimalHVI(pre[1]), 'len');
                const unf  = sanitizeValueHVI(extractDecimalHVI(pre[2]), 'unf');
                const str  = sanitizeValueHVI(extractDecimalHVI(pre[3]), 'str');
                const elg  = sanitizeValueHVI(extractDecimalHVI(pre[4]), 'elg');
                const rd   = sanitizeValueHVI(extractDecimalHVI(pre[5]), 'rd');
                const b    = sanitizeValueHVI(extractDecimalHVI(pre[6]), 'b');

                // ── Campos pós-CG (Média Secundária) ─────────────────────────
                // Ordem real: LEAF | AREA | COUNT | MOIST | MAT | SFI
                // MOIST fica em numsAfter[3] e DEVE ser ignorado.

                // LEAF: range real 1–7
                const rawLeafToken = numsAfter[0] ? Math.round(extractDecimalHVI(numsAfter[0])) : 0;
                const leaf = (rawLeafToken >= 1 && rawLeafToken <= 7) ? rawLeafToken : 0;

                // AREA: range real 0.05–0.99
                // OCR às vezes dropa "0," e lê "0,51" como "51" ou "5"
                let rawArea = numsAfter[1] ? extractDecimalHVI(numsAfter[1]) : 0;
                if (rawArea >= 1 && rawArea <= 99) rawArea = rawArea / 100;
                else if (rawArea > 0 && rawArea < 10 && !numsAfter[1].includes(',') && !numsAfter[1].includes('.')) rawArea = rawArea / 10;
                const area = parseFloat(rawArea.toFixed(2));

                // COUNT: máximo realista 200
                const rawCntVal = numsAfter[2] ? extractDecimalHVI(numsAfter[2]) : 0;
                const count = sanitizeValueHVI(Math.round(rawCntVal), 'count');

                // MAT e SFI: busca por RANGE a partir de numsAfter[4], pulando explicitamente o MOIST (index 3)
                // Filtramos '1.2' ou '12' que podem vir da coluna MOIST (umidade).
                const numsAfterVals = numsAfter.slice(4)
                    .map(extractDecimalHVI)
                    .filter(v => v !== 1.2 && v !== 12); 

                const matCandidates = numsAfterVals
                    .map(v => (v >= 80 && v <= 95) ? v / 100 : v) 
                    .filter(v => v >= 0.78 && v <= 0.97);

                const sfiCandidates5  = numsAfterVals.filter(v => v >= 5.0 && v <= 15.0);
                const sfiCandidates50 = numsAfterVals.filter(v => v >= 50  && v < 200);

                const mat = matCandidates.length > 0 ? matCandidates[0] : 0;
                const sfi = sfiCandidates5.length  > 0 ? sfiCandidates5[sfiCandidates5.length - 1]
                           : sfiCandidates50.length > 0 ? sfiCandidates50[sfiCandidates50.length - 1] / 10
                           : 0;

                const row: ColorTemplate = {
                    mic, len, unf, str, elg, rd, b, cg: cgValue,
                    leaf, area, count, mat, sfi,
                    csp: 0, sci: 0,
                };

                console.log(`OCR Linha ${detectedRows.length + 1}:`, row);
                detectedRows.push(row);

            }

            // ── Pós-processamento: preenche campos zerados com a moda da coluna ──
            fillByMode(detectedRows, 'leaf', 3);
            fillByMode(detectedRows, 'mat',  0.85);
            fillByMode(detectedRows, 'sfi',  10.0);
            fillByMode(detectedRows, 'area', 0.30);

            // Garante exatamente 6 linhas
            const finalResults = detectedRows.slice(0, 6);
            while (finalResults.length < 6) {
                finalResults.push({
                    mic: 0, len: 0, unf: 0, str: 0, elg: 0, rd: 0, b: 0,
                    cg: '12-1', leaf: 0, area: 0, count: 0, csp: 0, sci: 0, mat: 0, sfi: 0,
                });
            }

            setScannedRows(finalResults);
            setScanProgress(100);
            localStorage.setItem(`${STORAGE_PREFIX}custom_print_scanned_rows`, JSON.stringify(finalResults));

            // Auto-seleciona linha 0 para a cor ativa
            if (specificColor) {
                setSelectedLines(prev => ({ ...prev, [specificColor]: prev[specificColor] ?? 0 }));
                setTemplates(prev => ({ ...prev, [specificColor]: { ...prev[specificColor], ...finalResults[0] } }));
            }
        } catch (error) {
            console.error('OCR Fatal Error:', error);
        } finally {
            setIsScanning(false);
        }
    };



    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSave = () => {
        const finalTemplates: Record<string, StoredTemplate> = {};

        COLORS.forEach(({ hex }) => {
            const base: StoredTemplate = { ...templates[hex] };

            if (selectedLines[hex] !== undefined) {
                const idx = selectedLines[hex];
                if (scannedRows[idx]) {
                    Object.assign(base, scannedRows[idx]);
                    base.selectedLine = idx;
                }
            } else if (previews[hex] && scannedRows.length > 0) {
                Object.assign(base, scannedRows[0]);
                base.selectedLine = 0;
            }

            finalTemplates[hex] = base;
        });

        localStorage.setItem(`${STORAGE_PREFIX}custom_color_averages`, JSON.stringify(finalTemplates));
        localStorage.setItem(`${STORAGE_PREFIX}custom_print_scanned_rows`, JSON.stringify(scannedRows));
        localStorage.setItem(`${STORAGE_PREFIX}custom_print_previews`, JSON.stringify(previews));
        onClose();
    };

    const updateScannedRow = (rowIndex: number, field: keyof ColorTemplate, value: string) => {
        setScannedRows(prev => {
            const next = [...prev];
            const row = { ...next[rowIndex] };
            if (field === 'cg') {
                row.cg = value;
            } else {
                const parsed = parseFloat(value.replace(',', '.'));
                (row as any)[field] = isNaN(parsed) ? 0 : parsed;
            }
            next[rowIndex] = row;
            localStorage.setItem(`${STORAGE_PREFIX}custom_print_scanned_rows`, JSON.stringify(next));
            return next;
        });
    };

    const applyPrintRow = (color: string, rowIndex: number) => {
        setSelectedLines(prev => ({ ...prev, [color]: rowIndex }));
        setTemplates(prev => ({ ...prev, [color]: { ...prev[color], ...scannedRows[rowIndex] } }));
    };

    const removePreview = (hex: string) => {
        setPreviews(prev => {
            const next = { ...prev };
            delete next[hex];
            localStorage.setItem(`${STORAGE_PREFIX}custom_print_previews`, JSON.stringify(next));
            return next;
        });
    };

    if (!isOpen) return null;

    const visibleColors = specificColor
        ? COLORS.filter(c => c.hex === specificColor)
        : COLORS;

    // ── Render ─────────────────────────────────────────────────────────────────
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/80 backdrop-blur-md">
            <div className="bg-[#0c0c0c] w-full max-w-7xl max-h-[96vh] overflow-hidden flex flex-col shadow-[0_32px_80px_rgba(0,0,0,0.8)] rounded-xl border border-white/[0.06]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/[0.06] bg-[#111] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/90 rounded-lg">
                            <ImagePlus className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold tracking-tight text-white">
                                {specificColor
                                    ? `Parâmetros do Print — ${COLORS.find(c => c.hex === specificColor)?.label}`
                                    : 'Parâmetros do Print (Referência)'}
                            </h2>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-white/25 mt-0.5">
                                Insira os dados do print para AREA, CNT, CG e MAT usados na geração HVI
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Fechar"
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 [scrollbar-width:thin] [scrollbar-color:#222_transparent]">
                    <div className="space-y-5">
                        {visibleColors.map((colorObj) => (
                            <div key={colorObj.hex} className="rounded-xl border border-white/[0.07] bg-[#111] overflow-hidden">

                                {/* Cabeçalho da cor */}
                                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.06] bg-[#161616]">
                                    <svg width="10" height="10" viewBox="0 0 10 10">
                                        <circle cx="5" cy="5" r="5" fill={colorObj.hex} />
                                    </svg>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">{colorObj.label}</h3>
                                    {selectedLines[colorObj.hex] !== undefined && (
                                        <span className="ml-auto text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            Linha {selectedLines[colorObj.hex]! + 1} vinculada
                                        </span>
                                    )}
                                </div>

                                <div className="p-3">
                                {previews[colorObj.hex] ? (
                                    <div className="flex flex-col gap-2 w-full">

                                        {/* Toolbar */}
                                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                                            <h4 className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.18em] flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />
                                                Conferência do Print
                                            </h4>
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (isMappingMode) {
                                                            setIsMappingMode(false);
                                                            processOCR(previews[colorObj.hex]);
                                                        } else {
                                                            setIsMappingMode(true);
                                                        }
                                                    }}
                                                    className={`h-auto py-1 px-2 uppercase text-[8px] font-bold transition-colors rounded-md ${
                                                        isMappingMode
                                                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                                                            : 'bg-white/5 text-white/40 border border-white/[0.07] hover:text-white/70 hover:bg-white/8'
                                                    }`}
                                                >
                                                    {isMappingMode ? '✔ Finalizar Mapa' : '⚙ Mapear Colunas'}
                                                </Button>
                                                {!isMappingMode && !isScanning && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => processOCR(previews[colorObj.hex])}
                                                        className="h-auto py-1 px-2 uppercase text-[8px] font-bold text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 rounded-md hover:bg-emerald-500/15 flex items-center gap-1"
                                                    >
                                                        <RotateCcw className="w-2.5 h-2.5" /> Reanalisar
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    title="Trocar imagem do print"
                                                    onClick={() => removePreview(colorObj.hex)}
                                                    className="h-auto py-1 px-2 uppercase text-[8px] font-bold text-white/30 bg-white/[0.03] border border-white/[0.06] rounded-md hover:text-white/60 hover:bg-white/[0.07]"
                                                >
                                                    Trocar Print
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Preview da imagem */}
                                        <div className="relative w-full overflow-hidden rounded-lg bg-black border border-white/[0.06]" style={{ aspectRatio: '5 / 1' }}>
                                            <img
                                                src={previews[colorObj.hex]}
                                                alt="Print Original"
                                                className={`w-full h-full object-contain transition-opacity duration-300 ${isScanning ? 'opacity-30' : 'opacity-60 hover:opacity-100'}`}
                                                draggable={false}
                                            />
                                            <div className="absolute top-1.5 right-1.5 bg-black/60 text-white/40 px-1.5 py-0.5 text-[7px] font-black uppercase border border-white/[0.08] pointer-events-none rounded">
                                                Referência Original
                                            </div>

                                            {/* Modo mapeamento manual */}
                                            {isMappingMode && (
                                                <div className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden">
                                                    <div className="absolute top-0 left-0 bg-amber-400 text-black text-[8px] font-black uppercase px-2 py-1 pointer-events-auto z-50 rounded-br">
                                                        Mapeamento — Arraste para ajustar linhas e colunas
                                                    </div>

                                                    {rowDividers.map((pos, i) => (
                                                        <div
                                                            key={`r${i}`}
                                                            className="absolute left-0 right-0 h-4 -translate-y-1/2 cursor-row-resize pointer-events-auto z-40 group flex flex-col justify-center"
                                                            style={{ top: `${pos}%` }}
                                                            onMouseDown={e => startDragSplitter(e, 'row', i, pos)}
                                                        >
                                                            <div className="w-full bg-amber-400/50 group-hover:bg-amber-400 group-hover:h-[3px] h-px transition-all" />
                                                        </div>
                                                    ))}

                                                    {colDividers.map((pos, i) => (
                                                        <div
                                                            key={`c${i}`}
                                                            className="absolute top-0 bottom-0 w-5 -translate-x-1/2 cursor-col-resize pointer-events-auto z-40 group flex items-center justify-center"
                                                            style={{ left: `${pos}%` }}
                                                            onMouseDown={e => startDragSplitter(e, 'col', i, pos)}
                                                        >
                                                            <div className="h-full bg-amber-400/50 group-hover:bg-amber-400 group-hover:w-[2px] w-px transition-all" />
                                                            <div className="absolute bottom-1 bg-amber-400 text-black text-[7px] font-black uppercase px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                {i === 0 ? 'Esq' : i === colDividers.length - 1 ? 'Dir' : `${FIELDS[i - 1]?.label}|${FIELDS[i]?.label}`}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Scanner animado */}
                                            {isScanning && (
                                                <div className="absolute inset-0 z-10 pointer-events-none">
                                                    <div
                                                        className="absolute left-0 w-full h-0.5 bg-emerald-400 opacity-80 z-20"
                                                        style={{ boxShadow: '0 0 12px #10b981', animation: 'scanLine 1.4s linear infinite' }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Tabela de dados escaneados */}
                                        <div className="relative overflow-x-auto rounded-lg border border-white/[0.06] bg-[#0d0d0d] min-h-[140px]">
                                            {isScanning && (
                                                <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-[2px] flex flex-col items-center justify-center">
                                                    <Loader2 className="h-7 w-7 text-emerald-400 animate-spin mb-2" />
                                                    <p className="text-[11px] font-mono font-black uppercase tracking-[0.18em] text-emerald-400 mb-2">
                                                        Decodificando OCR...
                                                    </p>
                                                    <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                                                            style={{ width: `${scanProgress}%` }}
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-[8px] text-white/20 font-mono text-center">
                                                        {scannedRows.length} linha(s) processada(s)
                                                    </p>
                                                </div>
                                            )}

                                            <table className="w-full text-[9px] text-white/40 border-collapse">
                                                <thead>
                                                    <tr className="border-b border-white/[0.07] bg-black/30">
                                                        <th className="p-1.5 w-8" />
                                                        {FIELDS.map(f => (
                                                            <th key={f.id} className="p-1.5 font-black text-white/30 uppercase text-center tracking-wider">
                                                                {f.label}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {scannedRows.map((row, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className={`border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors ${
                                                                selectedLines[colorObj.hex] === idx
                                                                    ? 'bg-emerald-500/8 border-l-2 border-l-emerald-500'
                                                                    : idx % 2 === 0 ? 'bg-white/[0.01]' : ''
                                                            }`}
                                                        >
                                                            <td className="p-1 text-center">
                                                                <button
                                                                    title={`Selecionar linha ${idx + 1}`}
                                                                    onClick={() => applyPrintRow(colorObj.hex, idx)}
                                                                    className={`w-6 h-6 flex items-center justify-center rounded font-black text-[9px] transition-colors ${
                                                                        selectedLines[colorObj.hex] === idx
                                                                            ? 'bg-emerald-500 text-white'
                                                                            : 'bg-white/5 text-white/30 hover:bg-emerald-500/20 hover:text-emerald-400'
                                                                    }`}
                                                                >
                                                                    {idx + 1}
                                                                </button>
                                                            </td>
                                                            {FIELDS.map(f => (
                                                                <td key={f.id} className="p-0.5">
                                                                    <input
                                                                        type={f.type || 'number'}
                                                                        title={`Editar ${f.label}`}
                                                                        aria-label={`Editar ${f.label}`}
                                                                        step={f.step !== '0' ? f.step : undefined}
                                                                        value={row[f.id] ?? ''}
                                                                        onChange={e => updateScannedRow(idx, f.id, e.target.value)}
                                                                        className={`w-full bg-transparent border-none text-center font-mono focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-emerald-500/30 py-1 rounded transition-all text-[9px] ${
                                                                            selectedLines[colorObj.hex] === idx
                                                                                ? 'text-white font-bold'
                                                                                : 'text-white/50'
                                                                        }`}
                                                                    />
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    /* Zona de upload */
                                    <div className="flex flex-col items-center justify-center py-10 rounded-lg border-2 border-dashed border-white/[0.08] bg-white/[0.01] hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] transition-colors cursor-pointer relative overflow-hidden">
                                        <input
                                            type="file"
                                            title="Carregar Print"
                                            aria-label="Carregar Print"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onloadend = async () => {
                                                    const rawBase64 = reader.result as string;
                                                    const compressedBase64 = await new Promise<string>((resolve) => {
                                                        const img = new Image();
                                                        img.onload = () => {
                                                            const canvas = document.createElement('canvas');
                                                            const MAX_WIDTH = 1500;
                                                            let width = img.width;
                                                            let height = img.height;
                                                            if (width > MAX_WIDTH) {
                                                                height = (MAX_WIDTH / width) * height;
                                                                width = MAX_WIDTH;
                                                            }
                                                            canvas.width = width;
                                                            canvas.height = height;
                                                            const ctx = canvas.getContext('2d');
                                                            ctx?.drawImage(img, 0, 0, width, height);
                                                            resolve(canvas.toDataURL('image/jpeg', 0.82));
                                                        };
                                                        img.src = rawBase64;
                                                    });
                                                    setPreviews(prev => {
                                                        const next = { ...prev, [colorObj.hex]: compressedBase64 };
                                                        localStorage.setItem(`${STORAGE_PREFIX}custom_print_previews`, JSON.stringify(next));
                                                        return next;
                                                    });
                                                    setTimeout(() => processOCR(compressedBase64), 100);
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        {isScanning ? (
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="relative">
                                                    <Loader2 className="h-9 w-9 text-emerald-400 animate-spin" />
                                                    <Cpu className="h-4 w-4 text-emerald-400 absolute inset-0 m-auto" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
                                                        Digitalizando Tabela...
                                                    </p>
                                                    <div className="w-36 h-1 bg-white/10 mt-2 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                                                            style={{ width: `${scanProgress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="p-4 rounded-full bg-white/5 border border-white/[0.08] hover:scale-105 transition-transform">
                                                    <Palette className="h-7 w-7 text-white/40" />
                                                </div>
                                                <div className="text-center mt-4">
                                                    <p className="text-sm font-black uppercase tracking-widest text-white mb-1">MEDIA SECUNDARIA</p>
                                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-tight">
                                                        Clique ou arraste o print do laboratório para esta cor
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/[0.06] bg-[#111] flex justify-between items-center shrink-0">
                    <p className="text-[8px] font-mono font-bold text-white/15 uppercase leading-tight">
                        * Os valores acima serão usados como média base para a geração dos arquivos HVI.
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="h-9 px-5 uppercase text-[9px] font-bold tracking-widest rounded-lg border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/70"
                        >
                            Descartar
                        </Button>
                        <Button
                            onClick={handleSave}
                            className="h-9 px-6 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg uppercase text-[9px] font-bold tracking-widest flex items-center gap-1.5 transition-colors"
                        >
                            <Save className="h-3 w-3" /> Salvar Templates
                        </Button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes scanLine {
                    0%   { top: 0%; }
                    100% { top: 100%; }
                }
            `}</style>
        </div>,
        document.body
    );
}
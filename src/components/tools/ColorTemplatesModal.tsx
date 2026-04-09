import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Save, Palette, Info, ImagePlus, Loader2, Cpu, RotateCcw } from "lucide-react";
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

// Divisores de coluna em % da largura — derivados das posições reais dos headers
// detectados com Tesseract na imagem de referência (escala 2.5x, 1952px de largura)
const COL_DIVIDERS_PCT = [8.0, 15.0, 22.2, 29.4, 36.5, 43.7, 50.1, 56.0, 62.6, 69.3, 76.4, 82.9, 88.7, 94.8];

// Linha de header ocupa os primeiros ~17% da altura
const ROW_START_PCT = 17.0;

/** Corrige leituras erradas de CG pelo Tesseract.
 *  Tesseract frequentemente omite o hífen: lê '12-1' como '121', '11-3' como '113'.
 *  Também pode duplicar dígitos: '11-53' → '11-3'.
 */
function fixCG(raw: string): string {
    const t = raw.replace(/[|[\]{} ]/g, '').trim();
    if (/^\d{2}-\d$/.test(t)) return t;
    if (/^\d{3}$/.test(t)) return t.slice(0, 2) + '-' + t[2];
    const m = t.match(/^(\d{2})-(\d{2,})$/);
    if (m) return m[1] + '-' + m[2][0];
    if (/^\d{2}$/.test(t)) return t + '-1';
    return t;
}

/** Preenche células null/0 com o valor mais frequente da coluna (mode). */
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

interface ColorTemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    specificColor?: string;
    contextKey?: string;
}

export default function ColorTemplatesModal({ isOpen, onClose, specificColor, contextKey }: ColorTemplatesModalProps) {
    const STORAGE_PREFIX = contextKey ? `lote_${contextKey}_` : '';

    const [templates, setTemplates] = useState<Record<string, ColorTemplate>>(DEFAULT_TEMPLATES);
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});
    const [scannedRows, setScannedRows] = useState<ColorTemplate[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [isMappingMode, setIsMappingMode] = useState(false);
    const [scanningCell, setScanningCell] = useState<{ row: number; col: number } | null>(null);

    const defaultColDividers = Array.from({ length: 16 }, (_, i) => i * (100 / 15));
    const defaultRowDividers = Array.from({ length: 7 }, (_, i) => 25 + i * (50 / 6));

    const [colDividers, setColDividers] = useState<number[]>(defaultColDividers);
    const [rowDividers, setRowDividers] = useState<number[]>(defaultRowDividers);

    const draggingSplitter = useRef<{
        type: 'col' | 'row'; idx: number; startPos: number; startScreen: number; size: number;
    } | null>(null);

    // ── Carrega estado do localStorage quando abre ou muda contextKey ──────────
    useEffect(() => {
        if (!isOpen) return;

        try {
            const c = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}print_cols_v2`) || 'null');
            setColDividers(c || defaultColDividers);
        } catch { setColDividers(defaultColDividers); }
        try {
            const r = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}print_rows_v2`) || 'null');
            setRowDividers(r || defaultRowDividers);
        } catch { setRowDividers(defaultRowDividers); }

        const storedScanned = localStorage.getItem(`${STORAGE_PREFIX}custom_print_scanned_rows`);
        setScannedRows(storedScanned
            ? JSON.parse(storedScanned)
            : PRINT_ROWS.map(r => ({ ...r }))
        );

        const storedPreviews = localStorage.getItem(`${STORAGE_PREFIX}custom_print_previews`);
        setPreviews(storedPreviews ? JSON.parse(storedPreviews) : {});

        const stored = localStorage.getItem(`${STORAGE_PREFIX}custom_color_averages`);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const merged = { ...DEFAULT_TEMPLATES };
                const restoredSelected: Record<string, number> = {};
                Object.keys(parsed).forEach(color => {
                    merged[color] = { ...DEFAULT_TEMPLATES[color], ...parsed[color] };
                    if (typeof parsed[color]?.selectedLine === 'number') {
                        restoredSelected[color] = parsed[color].selectedLine;
                    }
                });
                setTemplates(merged);
                setSelectedLines(restoredSelected);
            } catch { setTemplates(DEFAULT_TEMPLATES); setSelectedLines({}); }
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
                    const max = idx === 15 ? 100 : next[idx + 1] - 1;
                    next[idx] = Math.max(min, Math.min(max, startPos + delta));
                    return next;
                });
            } else {
                const delta = ((e.clientY - startScreen) / size) * 100;
                setRowDividers(prev => {
                    const next = [...prev];
                    const min = idx === 0 ? 0 : next[idx - 1] + 1;
                    const max = idx === 6 ? 100 : next[idx + 1] - 1;
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

    const startDragSplitter = (e: React.MouseEvent, type: 'col' | 'row', idx: number, startPos: number) => {
        e.preventDefault();
        const container = e.currentTarget.parentElement;
        if (!container) return;
        localStorage.setItem(`${STORAGE_PREFIX}print_custom_map_active`, 'true');
        const rect = container.getBoundingClientRect();
        draggingSplitter.current = {
            type, idx, startPos,
            startScreen: type === 'col' ? e.clientX : e.clientY,
            size: type === 'col' ? rect.width : rect.height,
        };
    };

    // ── OCR ───────────────────────────────────────────────────────────────────
    const processOCR = async (image: string): Promise<void> => {
        setIsScanning(true);
        setScanProgress(0);
        setScanningCell(null);

        const SCALE = 2.5;

        try {
            // 1. Upscale com suavização — captura dimensões reais do canvas
            const { processedImage, canvasW, canvasH } = await new Promise<{
                processedImage: string;
                canvasW: number;
                canvasH: number;
            }>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width * SCALE;
                    canvas.height = img.height * SCALE;
                    const ctx = canvas.getContext('2d')!;
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.scale(SCALE, SCALE);
                    ctx.drawImage(img, 0, 0);
                    resolve({
                        processedImage: canvas.toDataURL('image/png'),
                        canvasW: canvas.width,
                        canvasH: canvas.height,
                    });
                };
                img.src = image;
            });

            // 2. OCR com word-level bounding boxes
            // Usa 'eng' — mais preciso para números e tabelas do que 'por'
            const result = await Tesseract.recognize(processedImage, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') setScanProgress(Math.round(m.progress * 85));
                },
            });

            // Dimensões reais do canvas upscalado (corrige bug de mapeamento X/Y)
            const W = canvasW;
            const H = canvasH;

            // Decide se usa dividers manuais (modo mapeamento) ou os automáticos calibrados
            const activeMap = localStorage.getItem(`${STORAGE_PREFIX}print_custom_map_active`) === 'true';
            const useManualDividers = isMappingMode || activeMap;

            const activeCols = useManualDividers ? colDividers.slice(1, 15) : COL_DIVIDERS_PCT;
            const activeRows: number[] = useManualDividers
                ? rowDividers
                : (() => {
                    const size = (100 - ROW_START_PCT) / 6;
                    return Array.from({ length: 7 }, (_, i) => ROW_START_PCT + i * size);
                })();

            // 3. Grid vazio
            const rows: ColorTemplate[] = Array.from({ length: 6 }, () => ({
                mic: 0, len: 0, unf: 0, str: 0, elg: 0, rd: 0, b: 0,
                cg: '12-1', leaf: 0, area: 0, count: 0, csp: 0, sci: 0, mat: 0, sfi: 0,
            }));

            // 4. Mapeia cada word por posição X/Y em %
            const words: Array<{
                text: string;
                bbox: { x0: number; y0: number; x1: number; y1: number };
                confidence: number;
            }> = (result.data as any).words ?? [];

            for (const word of words) {
                const t = word.text?.trim() ?? '';
                if (!t || !/\d/.test(t)) continue;
                if (word.confidence < 10) continue;

                const xC = (word.bbox.x0 + word.bbox.x1) / 2;
                const yC = (word.bbox.y0 + word.bbox.y1) / 2;
                const xPct = (xC / W) * 100;
                const yPct = (yC / H) * 100;

                // Pula header
                if (yPct < activeRows[0]) continue;

                // Row
                let rowIdx = -1;
                for (let ri = 0; ri < 6; ri++) {
                    if (yPct >= activeRows[ri] && yPct < activeRows[ri + 1]) { rowIdx = ri; break; }
                }
                if (rowIdx === -1) continue;

                // Col
                let colIdx = 0;
                for (let ci = 0; ci < activeCols.length; ci++) {
                    if (xPct > activeCols[ci]) colIdx = ci + 1;
                }
                if (colIdx >= FIELDS.length) continue;

                const field = FIELDS[colIdx];

                if (field.id === 'cg') {
                    rows[rowIdx].cg = fixCG(t);
                } else {
                    const val = parseFloat(t.replace(',', '.').replace(/[|[\]{}]/g, ''));
                    if (!isNaN(val)) (rows[rowIdx] as any)[field.id] = val;
                }
            }

            // 5. Leaf frequentemente falha — preenche pelo valor mais comum
            fillByMode(rows, 'leaf', 3);

            // 6. Animação de scan célula a célula (feedback visual)
            if (useManualDividers) {
                for (let r = 0; r < 6; r++) {
                    for (let c = 0; c < 15; c++) {
                        setScanningCell({ row: r, col: c });
                        await new Promise(res => setTimeout(res, 30));
                    }
                }
                setScanningCell(null);
            }

            setScanProgress(100);

            // 7. Matrix effect: preenche célula a célula
            const blankRows = rows.map(r => ({ ...r }));
            FIELDS.forEach(f => { blankRows.forEach(br => (br as any)[f.id] = f.id === 'cg' ? '...' : 0); });
            setScannedRows(blankRows);

            let cellIdx = 0;
            const totalCells = 6 * FIELDS.length;
            const animInterval = setInterval(() => {
                setScannedRows(prev => {
                    const next = [...prev];
                    const rIdx = Math.floor(cellIdx / FIELDS.length);
                    const cIdx = cellIdx % FIELDS.length;
                    if (rIdx < 6 && FIELDS[cIdx]) {
                        (next[rIdx] as any)[FIELDS[cIdx].id] = (rows[rIdx] as any)[FIELDS[cIdx].id];
                    }
                    return next;
                });
                cellIdx++;
                if (cellIdx >= totalCells) {
                    clearInterval(animInterval);
                    setIsScanning(false);
                    localStorage.setItem(`${STORAGE_PREFIX}custom_print_scanned_rows`, JSON.stringify(rows));
                }
            }, 20);

        } catch (error) {
            console.error('OCR Error:', error);
            setIsScanning(false);
        }
    };

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSave = () => {
        const finalTemplates: Record<string, ColorTemplate> = { ...templates };
        COLORS.forEach(({ hex }) => {
            if (selectedLines[hex] !== undefined) {
                const idx = selectedLines[hex];
                if (scannedRows[idx]) {
                    finalTemplates[hex] = { ...scannedRows[idx], selectedLine: idx } as any;
                }
            }
        });
        localStorage.setItem(`${STORAGE_PREFIX}custom_color_averages`, JSON.stringify(finalTemplates));
        localStorage.setItem(`${STORAGE_PREFIX}custom_print_scanned_rows`, JSON.stringify(scannedRows));
        localStorage.setItem(`${STORAGE_PREFIX}custom_print_previews`, JSON.stringify(previews));
        onClose();
    };

    const updateScannedRow = (rowIndex: number, field: keyof ColorTemplate, value: string) => {
        const newRows = [...scannedRows];
        const row = { ...newRows[rowIndex] };
        if (field === 'cg') {
            row.cg = value;
        } else {
            const parsed = parseFloat(value.replace(',', '.'));
            (row as any)[field] = isNaN(parsed) ? 0 : parsed;
        }
        newRows[rowIndex] = row;
        setScannedRows(newRows);
        localStorage.setItem(`${STORAGE_PREFIX}custom_print_scanned_rows`, JSON.stringify(newRows));
    };

    const applyPrintRow = (color: string, rowIndex: number) => {
        setSelectedLines(prev => ({ ...prev, [color]: rowIndex }));
        setTemplates(prev => ({ ...prev, [color]: { ...prev[color], ...scannedRows[rowIndex] } }));
    };

    const removePreview = (hex: string) => {
        setPreviews(prev => {
            const n = { ...prev };
            delete n[hex];
            localStorage.setItem(`${STORAGE_PREFIX}custom_print_previews`, JSON.stringify(n));
            return n;
        });
    };

    if (!isOpen) return null;

    // ── Render ────────────────────────────────────────────────────────────────
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <style>{`
                @keyframes scan {
                    0%   { top: 0%;   }
                    50%  { top: 100%; }
                    100% { top: 0%;   }
                }
            `}</style>

            <div className="bg-white w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-none border border-black animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="p-6 border-b border-black flex items-center justify-between bg-white">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-black text-white">
                            <ImagePlus className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-serif font-bold tracking-tight">
                                {specificColor
                                    ? `Parâmetros do Print — ${COLORS.find(c => c.hex === specificColor)?.label}`
                                    : "Parâmetros do Print (Referência)"}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <Info className="h-3 w-3 text-blue-600" />
                                <p className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
                                    Insira os dados do print para AREA, CNT, CG e MAT usados na geração HVI
                                </p>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-100 transition-all rounded-full" title="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="space-y-8">
                        {(specificColor ? COLORS.filter(c => c.hex === specificColor) : COLORS).map((colorObj) => (
                            <div key={colorObj.hex} className="space-y-4 border border-neutral-200 p-4 bg-neutral-50/20">

                                {/* Cabeçalho da cor */}
                                <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                                    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="8" cy="8" r="8" fill={colorObj.hex} />
                                    </svg>
                                    <h3 className="text-xs font-black uppercase tracking-widest">{colorObj.label}</h3>
                                </div>

                                {previews[colorObj.hex] ? (
                                    <div className="flex flex-col gap-3 w-full p-4 bg-neutral-900 rounded border border-black shadow-2xl relative">

                                        {/* Toolbar */}
                                        <div className="flex items-center justify-between border-b border-neutral-700 pb-2">
                                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />
                                                Conferência do Print
                                            </h4>
                                            <div className="flex items-center gap-4">
                                                <Button
                                                    variant="ghost" size="sm"
                                                    onClick={() => {
                                                        if (isMappingMode) {
                                                            setIsMappingMode(false);
                                                            processOCR(previews[colorObj.hex]);
                                                        } else {
                                                            setIsMappingMode(true);
                                                        }
                                                    }}
                                                    className={`h-auto p-0 uppercase text-[8px] font-bold transition-colors ${isMappingMode ? 'text-yellow-400 hover:text-yellow-300' : 'text-neutral-400 hover:text-white'}`}
                                                >
                                                    {isMappingMode ? "✔ Finalizar Mapa" : "⚙️ Mapear Colunas"}
                                                </Button>
                                                {!isMappingMode && !isScanning && (
                                                    <Button
                                                        variant="ghost" size="sm"
                                                        onClick={() => processOCR(previews[colorObj.hex])}
                                                        className="h-auto p-0 uppercase text-[8px] font-bold text-[#10b981] hover:text-[#34d399] flex items-center gap-1"
                                                    >
                                                        <RotateCcw className="w-2 h-2" /> Reanalisar
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost" size="sm"
                                                    onClick={() => removePreview(colorObj.hex)}
                                                    className="h-auto p-0 uppercase text-[8px] font-bold text-neutral-400 hover:text-white"
                                                >
                                                    Trocar Print
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Preview da imagem */}
                                        <div className="relative w-full aspect-[4/1] overflow-hidden border border-neutral-800 bg-black">
                                            <img
                                                src={previews[colorObj.hex]}
                                                alt="Print Original"
                                                className={`w-full h-full object-contain transition-opacity duration-300 ${isScanning ? 'opacity-40' : 'opacity-70 hover:opacity-100'}`}
                                                draggable="false"
                                            />
                                            <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-0.5 text-[7px] font-black uppercase border border-white/10 pointer-events-none z-20">
                                                Referência Original
                                            </div>

                                            {/* Modo mapeamento manual */}
                                            {isMappingMode && (
                                                <div className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden">
                                                    <div className="absolute top-0 left-0 bg-yellow-400 text-black text-[8px] font-black uppercase px-2 py-1 pointer-events-auto z-50">
                                                        Mapeamento Livre — Ajuste linha e coluna arrastando
                                                    </div>
                                                    {rowDividers.map((pos, i) => (
                                                        <div
                                                            key={`r${i}`}
                                                            className="absolute left-0 right-0 h-4 -mt-2 cursor-row-resize pointer-events-auto z-40 group flex flex-col justify-center"
                                                            style={{ top: pos + '%' }}
                                                            onMouseDown={e => startDragSplitter(e, 'row', i, pos)}
                                                        >
                                                            <div className="w-full bg-yellow-400/50 group-hover:bg-yellow-400 group-hover:h-[3px] h-[1px] transition-all shadow-[0_0_5px_#eab308]" />
                                                        </div>
                                                    ))}
                                                    {colDividers.map((pos, i) => (
                                                        <div
                                                            key={`c${i}`}
                                                            className="absolute top-0 bottom-0 w-6 -ml-3 cursor-col-resize pointer-events-auto z-40 group flex items-center justify-center"
                                                            style={{ left: pos + '%' }}
                                                            onMouseDown={e => startDragSplitter(e, 'col', i, pos)}
                                                        >
                                                            <div className="h-full bg-yellow-400/50 group-hover:bg-yellow-400 group-hover:w-[3px] w-[1px] transition-all shadow-[0_0_5px_#eab308]" />
                                                            <div className="absolute bottom-2 bg-yellow-400 text-black text-[8px] font-black uppercase px-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {i === 0 ? "Margem Esq" : i === 15 ? "Margem Dir" : `${FIELDS[i - 1]?.label} | ${FIELDS[i]?.label}`}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Scanner animado */}
                                            {isScanning && (
                                                <div className="absolute inset-0 z-10 pointer-events-none">
                                                    <div className="absolute left-0 w-full h-[2px] bg-[#10b981] shadow-[0_0_15px_#10b981] opacity-70 z-20" style={{ animation: 'scan 2s linear infinite' }} />
                                                    {scanningCell && (
                                                        <div
                                                            className="absolute border-2 border-[#10b981] bg-[#10b981]/20 shadow-[0_0_10px_#10b981] transition-all duration-75"
                                                            style={{
                                                                top: rowDividers[scanningCell.row] + '%',
                                                                height: (rowDividers[scanningCell.row + 1] - rowDividers[scanningCell.row]) + '%',
                                                                left: colDividers[scanningCell.col] + '%',
                                                                width: (colDividers[scanningCell.col + 1] - colDividers[scanningCell.col]) + '%',
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Tabela de dados escaneados */}
                                        <div className="relative overflow-x-auto min-h-[150px]">
                                            {isScanning && (
                                                <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-[2px] flex flex-col items-center justify-center border border-[#10b981]/30">
                                                    <Loader2 className="h-8 w-8 text-[#10b981] animate-spin mb-3" />
                                                    <p className="text-[12px] font-mono font-black uppercase tracking-[0.2em] text-[#10b981] mb-2">
                                                        Decodificando OCR...
                                                    </p>
                                                    <div className="w-56 h-1 bg-neutral-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-[#10b981] transition-all duration-300 ease-out" style={{ width: `${scanProgress}%` }} />
                                                    </div>
                                                    <p className="mt-3 text-[9px] text-neutral-500 font-mono text-center max-w-[250px]">
                                                        Mapeamento por posição X/Y — {15 * 6} células analisadas.
                                                    </p>
                                                </div>
                                            )}

                                            <table className="w-full text-[9px] text-neutral-400 border-collapse">
                                                <thead>
                                                    <tr className="border-b border-neutral-800 bg-black/20">
                                                        <th className="p-1 w-8" />
                                                        {FIELDS.map(f => (
                                                            <th key={f.id} className="p-1 font-black text-neutral-500 uppercase text-center">{f.label}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {scannedRows.map((row, idx) => (
                                                        <tr
                                                            key={idx}
                                                            className={`border-b border-neutral-800/50 hover:bg-white/5 transition-colors ${selectedLines[colorObj.hex] === idx ? 'bg-emerald-500/10' : ''}`}
                                                        >
                                                            <td className="p-1 text-center">
                                                                <button
                                                                    onClick={() => applyPrintRow(colorObj.hex, idx)}
                                                                    className={`w-6 h-6 flex items-center justify-center border transition-colors font-black text-[9px] ${selectedLines[colorObj.hex] === idx ? 'bg-[#10b981] border-[#10b981] text-white' : 'border-neutral-700 text-neutral-500 hover:border-[#10b981] hover:text-[#10b981]'}`}
                                                                >
                                                                    {idx + 1}
                                                                </button>
                                                            </td>
                                                            {FIELDS.map(f => (
                                                                <td key={f.id} className="p-0.5">
                                                                    <input
                                                                        type={f.type || "number"}
                                                                        title={`Editar ${f.label}`}
                                                                        aria-label={`Editar ${f.label}`}
                                                                        step={f.step === '0' ? undefined : f.step}
                                                                        value={row[f.id] ?? ""}
                                                                        onChange={e => updateScannedRow(idx, f.id, e.target.value)}
                                                                        className={`w-full bg-transparent border-none text-center font-mono focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-[#10b981]/50 py-1 transition-all ${selectedLines[colorObj.hex] === idx ? 'text-white font-bold' : 'text-neutral-400'}`}
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
                                    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-neutral-200 bg-white/50 hover:border-black transition-colors cursor-pointer relative overflow-hidden">
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
                                                reader.onloadend = () => {
                                                    const base64 = reader.result as string;
                                                    const newPreviews = { ...previews, [colorObj.hex]: base64 };
                                                    setPreviews(newPreviews);
                                                    localStorage.setItem(`${STORAGE_PREFIX}custom_print_previews`, JSON.stringify(newPreviews));
                                                    processOCR(base64);
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        {isScanning ? (
                                            <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                                                <div className="relative">
                                                    <Loader2 className="h-10 w-10 text-black animate-spin" />
                                                    <Cpu className="h-4 w-4 text-black absolute inset-0 m-auto" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black">Digitalizando Tabela...</p>
                                                    <div className="w-32 h-1 bg-neutral-200 mt-2 rounded-full overflow-hidden">
                                                        <div className="h-full bg-black transition-all duration-300 ease-out" style={{ width: `${scanProgress}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="p-4 bg-neutral-100 rounded-full hover:bg-black hover:text-white transition-all">
                                                    <Palette className="h-8 w-8" />
                                                </div>
                                                <div className="text-center mt-4">
                                                    <p className="text-sm font-black uppercase tracking-widest mb-1">Vincular Print de Referência</p>
                                                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-tight">
                                                        Extraia as 6 linhas do laboratório para configurar esta cor
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-neutral-200 bg-neutral-50 flex justify-between items-center">
                    <p className="text-[9px] font-mono font-bold text-neutral-400 uppercase leading-tight">
                        * Os valores acima serão usados como média base para a geração dos arquivos HVI.
                    </p>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onClose} className="rounded-none h-11 px-8 uppercase text-[10px] font-bold tracking-widest border-black">
                            Descartar
                        </Button>
                        <Button onClick={handleSave} className="rounded-none h-11 px-10 bg-black text-white hover:bg-neutral-800 uppercase text-[10px] font-bold tracking-widest flex items-center gap-2">
                            <Save className="h-3 w-3" /> Salvar Templates
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

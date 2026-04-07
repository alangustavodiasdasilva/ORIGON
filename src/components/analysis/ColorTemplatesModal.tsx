
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Save, Palette, Info, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ColorAverage {
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    b: number;
    samples: number;
}

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
    "#10b981": { mic: 4.50, len: 29.0, unf: 80.0, str: 29.0, rd: 80.0, b: 11.0, cg: "11-1", elg: 6.5, area: 0.25, count: 30, mat: 0.85, leaf: 3, sfi: 10.3, csp: 1800, sci: 125 }, // Verde
    "#ef4444": { mic: 4.20, len: 28.0, unf: 78.0, str: 27.0, rd: 70.0, b: 12.0, cg: "31-1", elg: 6.0, area: 0.30, count: 35, mat: 0.83, leaf: 4, sfi: 11.1, csp: 1650, sci: 115 }, // Vermelho
    "#3b82f6": { mic: 4.80, len: 30.0, unf: 82.0, str: 32.0, rd: 85.0, b: 10.0, cg: "21-1", elg: 7.0, area: 0.20, count: 25, mat: 0.87, leaf: 2, sfi: 9.8, csp: 1950, sci: 135 }, // Azul
    "#f59e0b": { mic: 4.40, len: 28.5, unf: 79.5, str: 28.5, rd: 75.0, b: 11.5, cg: "12-1", elg: 6.2, area: 0.28, count: 32, mat: 0.84, leaf: 3, sfi: 10.5, csp: 1750, sci: 122 }, // Amarelo
};

const PRINT_ROWS = [
    { mic: 4.14, len: 29.09, unf: 79.5, str: 24.4, elg: 6.2, rd: 80.4, b: 10.6, cg: "12-1", leaf: 3, area: 0.27, count: 26, csp: 0, sci: 0, mat: 0.85, sfi: 10.3 },
    { mic: 4.19, len: 28.56, unf: 79.3, str: 24.4, elg: 6.7, rd: 81.0, b: 10.6, cg: "11-3", leaf: 3, area: 0.20, count: 32, csp: 0, sci: 0, mat: 0.87, sfi: 10.3 },
    { mic: 4.15, len: 28.77, unf: 79.4, str: 25.6, elg: 6.6, rd: 81.1, b: 10.7, cg: "12-1", leaf: 3, area: 0.24, count: 35, csp: 0, sci: 0, mat: 0.86, sfi: 10.3 },
    { mic: 4.17, len: 29.14, unf: 79.3, str: 24.6, elg: 6.1, rd: 81.2, b: 10.8, cg: "12-1", leaf: 3, area: 0.29, count: 29, csp: 0, sci: 0, mat: 0.86, sfi: 10.4 },
    { mic: 4.15, len: 28.67, unf: 78.8, str: 25.1, elg: 6.7, rd: 80.4, b: 11.2, cg: "12-1", leaf: 3, area: 0.27, count: 29, csp: 0, sci: 0, mat: 0.87, sfi: 10.4 },
    { mic: 4.11, len: 28.90, unf: 78.7, str: 25.4, elg: 6.1, rd: 80.9, b: 11.1, cg: "12-1", leaf: 3, area: 0.28, count: 33, csp: 0, sci: 0, mat: 0.85, sfi: 9.8 },
];

interface ColorTemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    specificColor?: string;
    currentMetrics?: Record<string, ColorAverage>;
}

export default function ColorTemplatesModal({ isOpen, onClose, specificColor, currentMetrics }: ColorTemplatesModalProps) {
    const [templates, setTemplates] = useState<Record<string, ColorTemplate>>(DEFAULT_TEMPLATES);
    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [selectedLines, setSelectedLines] = useState<Record<string, number>>({});
    const [scannedRows, setScannedRows] = useState<ColorTemplate[]>([]);

    useEffect(() => {
        // Initialize scannedRows with defaults if empty
        if (scannedRows.length === 0) {
            setScannedRows(PRINT_ROWS.map(r => ({ ...r, elg: r.elg || 0, area: r.area || 0, count: r.count || 0, mat: r.mat || 0, leaf: r.leaf || 0, sfi: r.sfi || 0, csp: r.csp || 0, sci: r.sci || 0 })));
        }
        const stored = localStorage.getItem('custom_color_averages');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Merge with defaults to ensure all fields exist
                const merged = { ...DEFAULT_TEMPLATES };
                Object.keys(parsed).forEach(color => {
                    merged[color] = { ...DEFAULT_TEMPLATES[color], ...parsed[color] };
                });
                setTemplates(merged);
            } catch (e) {
                console.error("Error loading templates:", e);
            }
        }
    }, [isOpen]);

    const handleSave = () => {
        const finalTemplates: Record<string, ColorTemplate> = { ...templates };
        
        // For each color, apply the currently selected (or edited) scanned row
        COLORS.forEach(colorObj => {
            const color = colorObj.hex;
            // Only update the final template for this color if the user actually selected a print row for it
            if (selectedLines[color] !== undefined) {
                const selectedIdx = selectedLines[color];
                if (scannedRows.length > 0) {
                    finalTemplates[color] = { 
                        ...scannedRows[selectedIdx], 
                        selectedLine: selectedIdx // THIS IS THE STRICT LOCK KEY
                    } as any;
                }
            }
        });

        localStorage.setItem('custom_color_averages', JSON.stringify(finalTemplates));
        onClose();
    };

    const updateField = (color: string, field: keyof ColorTemplate, value: string) => {
        let numVal: number | string = value.replace(',', '.');
        if (field === 'cg') {
            setTemplates(prev => ({
                ...prev,
                [color]: { ...prev[color], [field]: value }
            }));
        } else {
            const parsed = parseFloat(numVal as string);
            setTemplates(prev => ({
                ...prev,
                [color]: { ...prev[color], [field]: isNaN(parsed) ? 0 : parsed }
            }));
        }
    };

    if (!isOpen) return null;

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

    const updateScannedRow = (rowIndex: number, field: keyof ColorTemplate, value: string) => {
        const newRows = [...scannedRows];
        const row = { ...newRows[rowIndex] };
        
        if (field === 'cg') {
            row[field] = value;
        } else {
            const parsed = parseFloat(value.replace(',', '.'));
            (row as any)[field] = isNaN(parsed) ? 0 : parsed;
        }
        
        newRows[rowIndex] = row;
        setScannedRows(newRows);
    };

    const applyPrintRow = (color: string, rowIndex: number) => {
        const rowData = scannedRows[rowIndex];
        setSelectedLines(prev => ({ ...prev, [color]: rowIndex }));
        setTemplates(prev => ({
            ...prev,
            [color]: { ...prev[color], ...rowData }
        }));
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-6xl max-h-[90vh] bg-white shadow-2xl overflow-hidden flex flex-col border border-black">
                {/* Header */}
                <div className="p-6 border-b border-black flex items-center justify-between bg-white">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-black text-white">
                            <ImagePlus className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-serif font-bold tracking-tight">
                                {specificColor 
                                    ? `Parâmetros do Print - ${COLORS.find(c => c.hex === specificColor)?.label}` 
                                    : "Parâmetros do Print (Referência)"}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <Info className="h-3 w-3 text-blue-600" />
                                <p className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
                                    INSERA AQUI OS DADOS DO PRINT PARA AREA, CNT, CG E MAT QUE SERÃO USADOS NA GERAÇÃO HVI
                                </p>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-100 transition-all rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="space-y-8">
                        {(specificColor ? COLORS.filter(c => c.hex === specificColor) : COLORS).map((colorObj) => (
                            <div key={colorObj.hex} className="space-y-4 border border-neutral-200 p-4 bg-neutral-50/20">
                                <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: colorObj.hex }} />
                                    <h3 className="text-xs font-black uppercase tracking-widest">{colorObj.label}</h3>
                                </div>

                                {previews[colorObj.hex] ? (
                                        <div className="flex flex-col gap-3 w-full p-4 bg-neutral-900 rounded border border-black shadow-2xl">
                                            <div className="flex items-center justify-between border-b border-neutral-700 pb-2">
                                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />
                                                    Conferência do Print (Digitalização Ativa)
                                                </h4>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => {
                                                        setPreviews(prev => {
                                                            const n = { ...prev };
                                                            delete n[colorObj.hex];
                                                            return n;
                                                        });
                                                    }}
                                                    className="h-auto p-0 uppercase text-[8px] font-bold text-neutral-400 hover:text-white"
                                                >
                                                    Trocar Print
                                                </Button>
                                            </div>

                                            {/* Original Image Preview - RESTORED */}
                                            <div className="relative w-full aspect-[4/1] overflow-hidden border border-neutral-800 bg-black/50">
                                                <img src={previews[colorObj.hex]} alt="Print Original" className="w-full h-full object-contain opacity-70 hover:opacity-100 transition-opacity duration-300" />
                                                <div className="absolute top-2 right-2 bg-black/60 text-white px-2 py-0.5 text-[7px] font-black uppercase border border-white/10 pointer-events-none">Referência Original</div>
                                            </div>

                                            {/* Digitalized Data Table */}
                                            <div className="overflow-x-auto">
                                            <table className="w-full text-[9px] text-neutral-400 border-collapse">
                                                <thead>
                                                    <tr className="border-b border-neutral-800 bg-black/20">
                                                        <th className="p-1 w-8"></th>
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
                                                                    className={`w-6 h-6 flex items-center justify-center border transition-colors ${selectedLines[colorObj.hex] === idx ? 'bg-[#10b981] border-[#10b981] text-white' : 'border-neutral-700 text-neutral-500 hover:border-[#10b981] hover:text-[#10b981]'} font-black text-[9px]`}
                                                                >
                                                                    {idx + 1}
                                                                </button>
                                                            </td>
                                                            {FIELDS.map(f => (
                                                                <td key={f.id} className="p-0.5">
                                                                    <input 
                                                                        type={f.type || "number"}
                                                                        step={f.step === '0' ? undefined : f.step}
                                                                        value={row[f.id] ?? ""}
                                                                        onChange={(e) => updateScannedRow(idx, f.id, e.target.value)}
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
                                    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-neutral-200 bg-white/50 group-hover:border-black transition-colors cursor-pointer relative overflow-hidden">
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const url = URL.createObjectURL(file);
                                                    const color = colorObj.hex;
                                                    setPreviews(prev => ({ ...prev, [color]: url }));
                                                    applyPrintRow(color, 0); 
                                                }
                                            }}
                                        />
                                        <div className="p-4 bg-neutral-100 rounded-full group-hover:bg-black group-hover:text-white transition-all">
                                            <Palette className="h-8 w-8" />
                                        </div>
                                        <div className="text-center mt-4">
                                            <p className="text-sm font-black uppercase tracking-widest mb-1">Vincular Print de Referência</p>
                                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-tight">Extraia as 6 linhas do laboratório para configurar esta cor</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-neutral-200 bg-neutral-50 flex justify-between items-center">
                    <p className="text-[9px] font-mono font-bold text-neutral-400 uppercase leading-tight">* OS VALORES ACIMA SERÃO USADOS COMO MÉDIA BASE PARA A GERAÇÃO DOS ARQUIVOS HVI.</p>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onClose} className="rounded-none h-11 px-8 uppercase text-[10px] font-bold tracking-widest border-black">DESCARTAR</Button>
                        <Button onClick={handleSave} className="rounded-none h-11 px-10 bg-black text-white hover:bg-neutral-800 uppercase text-[10px] font-bold tracking-widest flex items-center gap-2">
                            <Save className="h-3 w-3" /> SALVAR TEMPLATES
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

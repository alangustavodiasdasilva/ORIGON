import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExcelExtractionService } from "@/services/ExcelExtractionService";
import type { HVIDataRow } from "@/services/ocrExtraction";

interface ExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (rows: HVIDataRow[], malaId: string) => Promise<void>;
}

export function ExcelImportModal({ isOpen, onClose, onSave }: ExcelImportModalProps) {
    const [rows, setRows] = useState<HVIDataRow[]>([]);
    const [malaRef, setMalaRef] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const data = await ExcelExtractionService.extractFromExcel(file);
            setRows(data.rows);
            setMalaRef(data.mala || "");
            
            if (data.rows.length > 0) {
                // Se a planilha não trouxe data, pode vir vazio, o usuário preenche na mão
            }
        } catch (error: any) {
            alert(error.message || "Erro ao processar planilha.");
        } finally {
            setIsProcessing(false);
        }
    };

    const updateRow = (index: number, field: keyof HVIDataRow, value: string) => {
        setRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };


    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number, field: string) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextInput = document.getElementById(`input-${field}-${index + 1}`);
            if (nextInput) nextInput.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevInput = document.getElementById(`input-${field}-${index - 1}`);
            if (prevInput) prevInput.focus();
        }
    };

    const handleSave = async () => {
        if (rows.length === 0) return;
        setIsSaving(true);
        try {
            await onSave(rows, malaRef);
            setRows([]);
            setMalaRef("");
            onClose();
        } catch (error) {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white w-[95vw] max-w-6xl h-[90vh] flex flex-col shadow-2xl border border-black overflow-hidden relative">
                
                {/* Header */}
                <div className="h-16 bg-white border-b border-black flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded">
                            <FileSpreadsheet className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-black">Importar Planilha (Excel)</h3>
                            <p className="text-[10px] font-mono text-neutral-400 uppercase">Mala de Checagem</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-neutral-100 rounded-none h-10 w-10 border border-neutral-200">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50">
                    {rows.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
                            <div className="w-20 h-20 bg-white border border-neutral-200 shadow-sm flex items-center justify-center rounded-full">
                                {isProcessing ? (
                                    <div className="h-8 w-8 border-4 border-neutral-200 border-t-emerald-500 rounded-full animate-spin" />
                                ) : (
                                    <Upload className="h-8 w-8 text-neutral-400" />
                                )}
                            </div>
                            <div className="text-center space-y-2 max-w-md">
                                <h4 className="text-lg font-serif font-bold text-black">Selecione o arquivo Excel</h4>
                                <p className="text-xs text-neutral-500">Selecione a planilha da Mala de Checagem. O sistema irá extrair todas as etiquetas e organizar os horários automaticamente.</p>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                title="Selecione o arquivo Excel"
                                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <Button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                                className="h-12 px-8 bg-black text-white hover:bg-neutral-800 rounded-none text-xs uppercase tracking-widest font-bold shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100"
                            >
                                {isProcessing ? "Lendo arquivo..." : "Buscar Planilha"}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Toolbar */}
                            <div className="bg-white border-b border-neutral-200 p-4 shrink-0 flex items-center justify-between">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest block">Bag ID (Mala)</label>
                                    <Input 
                                        value={malaRef}
                                        onChange={e => setMalaRef(e.target.value)}
                                        className="h-10 w-64 text-sm font-mono font-bold rounded-none border-neutral-300 focus:border-black focus:ring-0" 
                                        placeholder="Ex: 20254260"
                                    />
                                </div>
                                <span className="text-[10px] font-mono text-neutral-500 font-bold bg-neutral-100 px-3 py-1.5 rounded">{rows.length} amostras carregadas</span>
                            </div>

                            {/* Data Table */}
                            <div className="flex-1 overflow-auto bg-white px-4 sm:px-8 pb-8 pt-0">
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead className="bg-white sticky top-0 z-10">
                                        <tr className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest border-b-2 border-black">
                                            <th className="px-4 py-4 w-12 text-left font-mono">#</th>
                                            <th className="px-4 py-4 text-left">Etiqueta</th>
                                            <th className="px-4 py-4 w-[12%] text-right">MIC</th>
                                            <th className="px-4 py-4 w-[12%] text-right">LEN</th>
                                            <th className="px-4 py-4 w-[12%] text-right">UNF</th>
                                            <th className="px-4 py-4 w-[12%] text-right">STR</th>
                                            <th className="px-4 py-4 w-[12%] text-right">RD</th>
                                            <th className="px-4 py-4 w-[12%] text-right">+B</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {rows.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-neutral-50/50 transition-colors group">
                                                <td className="px-4 py-2 font-mono text-[11px] text-neutral-400 text-left">{idx + 1}</td>
                                                <td className="px-4 py-2">
                                                    <Input 
                                                        id={`input-etiqueta-${idx}`}
                                                        value={row.etiqueta}
                                                        onChange={e => updateRow(idx, 'etiqueta', e.target.value)}
                                                        onKeyDown={e => handleKeyDown(e, idx, 'etiqueta')}
                                                        onFocus={e => e.target.select()}
                                                        autoComplete="off"
                                                        spellCheck={false}
                                                        className="h-8 w-full text-sm font-mono font-bold border-0 border-b-2 border-transparent hover:border-neutral-200 focus:border-black focus-visible:ring-0 rounded-none shadow-none bg-transparent px-1 text-left transition-colors" 
                                                        placeholder="Etiqueta"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-black">{row.mic.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-black">{row.len.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-black">{row.unf.toFixed(1)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-black">{row.str.toFixed(1)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-black">{row.rd.toFixed(1)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-black">{row.b.toFixed(1)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer Actions */}
                            <div className="bg-white border-t border-black p-4 shrink-0 flex justify-end gap-4">
                                <Button 
                                    onClick={handleSave} 
                                    disabled={isSaving}
                                    className="h-12 rounded-none bg-black text-white hover:bg-neutral-800 text-xs uppercase tracking-widest px-10 font-bold shadow-lg transition-all disabled:opacity-50"
                                >
                                    {isSaving ? "Salvando..." : `Salvar ${rows.length} amostras`}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

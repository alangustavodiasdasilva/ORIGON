import { X, Download, Eye, ArrowRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { Sample } from '@/entities/Sample';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, useRef } from 'react';

interface HVIPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    content: string;
    filename: string;
    machineModel: 'USTER' | 'PREMIER';
    originalSample: Sample;
    generatedValues: {
        mic: number;
        len: number;
        unf: number;
        str: number;
        rd: number;
        b: number;
    };
    balancedReadings?: Record<string, number[]>;
    onRegenerate?: (readings: Record<string, number[]>) => void;
}

export default function HVIPreviewModal({
    isOpen,
    onClose,
    onConfirm,
    content,
    filename,
    machineModel,
    originalSample,
    generatedValues,
    balancedReadings,
    onRegenerate
}: HVIPreviewModalProps) {
    const { t } = useLanguage();
    const [editableReadings, setEditableReadings] = useState<Record<string, string[]>>({});
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync state only initially when component mounts
    useEffect(() => {
        if (balancedReadings && Object.keys(editableReadings).length === 0) {
            const initial: Record<string, string[]> = {};
            for (const [k, arr] of Object.entries(balancedReadings)) {
                // Formatting initial values correctly
                initial[k] = arr.map(v => {
                    if (k === 'mic' || k === 'len') return v.toFixed(2);
                    return v.toFixed(1);
                });
            }
            setEditableReadings(initial);
        }
    }, [balancedReadings, editableReadings]);

    const handleReadingChange = (rowIdx: number, field: string, value: string) => {
        const cleanValue = value.replace(',', '.').replace(/[^\d.]/g, '');

        setEditableReadings(prev => {
            const newReadings = { ...prev };
            if (!newReadings[field]) newReadings[field] = [];
            else newReadings[field] = [...newReadings[field]];
            
            newReadings[field][rowIdx] = cleanValue;
            return newReadings;
        });

        // Debounce regeneration
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setEditableReadings(currentReadings => {
                if (onRegenerate) {
                    const safeReadings: Record<string, number[]> = {};
                    for (const k of Object.keys(currentReadings)) {
                        let fallback = 0;
                        if (originalSample) {
                            const originalVal = (originalSample as any)[k];
                            fallback = typeof originalVal === 'number' ? originalVal : parseFloat(originalVal) || 0;
                        }
                        safeReadings[k] = currentReadings[k].map(v => {
                            const num = parseFloat(v);
                            return isNaN(num) ? fallback : num;
                        });
                    }
                    onRegenerate(safeReadings);
                }
                return currentReadings;
            });
        }, 500);
    };

    const handleBlur = (rowIdx: number, field: string, value: string) => {
        let numStr = value.replace(',', '.');
        if (!numStr || numStr.includes('.')) return;
        
        if (field === 'mic') {
            if (numStr.length > 1) numStr = numStr.slice(0, 1) + '.' + numStr.slice(1);
        } else if (field === 'len') {
            if (numStr.length > 2) numStr = numStr.slice(0, 2) + '.' + numStr.slice(2);
        } else if (['unf', 'str', 'rd'].includes(field)) {
            if (numStr.length > 2) numStr = numStr.slice(0, 2) + '.' + numStr.slice(2);
        } else if (field === 'b') {
            if (numStr.length >= 2) numStr = numStr.slice(0, -1) + '.' + numStr.slice(-1);
        }

        if (numStr !== value) {
            handleReadingChange(rowIdx, field, numStr);
        }
    };

    const getInputClassName = (val: string | undefined, field: string) => {
        const baseClass = "w-full text-center font-mono font-bold outline-none rounded px-1 py-1 transition-all";
        
        if (!val || val.trim() === '') {
            return `${baseClass} bg-orange-100 text-orange-700 ring-1 ring-orange-500 focus:ring-orange-600 focus:bg-orange-100`;
        }

        const strVal = String(val).replace(',', '.');
        const parts = strVal.split('.');
        
        let isError = false;
        if (parts.length > 2) isError = true;
        else if (parts.length === 2) {
            const decimals = parts[1].length;
            const maxDecimals = (field === 'mic' || field === 'len') ? 2 : 1;
            if (decimals > maxDecimals) isError = true;
        }

        if (!isError && strVal !== '') {
            const num = parseFloat(strVal);
            if (!isNaN(num)) {
                switch (field) {
                    case 'mic': if (num < 2 || num > 10) isError = true; break;
                    case 'len': if (num < 15 || num > 45) isError = true; break;
                    case 'unf': if (num < 50 || num > 100) isError = true; break;
                    case 'str': if (num < 15 || num > 50) isError = true; break;
                    case 'rd': if (num < 40 || num > 100) isError = true; break;
                    case 'b': if (num < 2 || num > 25) isError = true; break;
                }

                if (!isError) {
                    const MAX_DEVIATION: Record<string, number> = {
                        mic: 0.05, len: 0.25, unf: 0.5, str: 0.75, rd: 0.5, b: 0.2
                    };
                    const generatedAvg = generatedValues[field as keyof typeof generatedValues];
                    if (typeof generatedAvg === 'number') {
                        const deviation = Math.abs(num - generatedAvg);
                        // Using a small epsilon to handle JS floating point inaccuracies
                        if (deviation > MAX_DEVIATION[field] + 0.00001) {
                            return `${baseClass} bg-red-100 text-red-700 ring-1 ring-red-500 focus:ring-red-600 focus:bg-red-100`;
                        }
                    }
                }
            }
        }

        if (isError) {
            return `${baseClass} bg-orange-100 text-orange-700 ring-1 ring-orange-500 focus:ring-orange-600 focus:bg-orange-100`;
        }
        return `${baseClass} text-black bg-transparent hover:bg-neutral-100 focus:bg-blue-50 focus:ring-1 ring-blue-500`;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
        const key = e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            e.preventDefault();
            let nextRow = rowIdx;
            let nextCol = colIdx;
            
            if (key === 'ArrowUp') nextRow = Math.max(0, rowIdx - 1);
            if (key === 'ArrowDown') nextRow = Math.min(5, rowIdx + 1);
            if (key === 'ArrowLeft') nextCol = Math.max(0, colIdx - 1);
            if (key === 'ArrowRight') nextCol = Math.min(5, colIdx + 1);

            if (nextRow !== rowIdx || nextCol !== colIdx) {
                const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`) as HTMLInputElement;
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
            }
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            {/* ... Modal Content ... */}
            <div className="w-full max-w-[95vw] max-h-[95vh] bg-white flex flex-col shadow-2xl border border-black">
                {/* Header */}
                <div className="h-16 bg-white border-b border-black flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-4">
                        <Eye className="h-5 w-5 text-black" />
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-black">
                                Comparativo: Valores Atuais vs Arquivo HVI
                            </h3>
                            <p className="text-[10px] font-mono text-neutral-400 uppercase">
                                {machineModel} • {filename}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-100 rounded transition-colors"
                        title="Fechar visualização"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-neutral-50 flex flex-col lg:flex-row">
                    {/* LEFT COLUMN: Tables */}
                    <div className="w-full lg:w-7/12 p-6 sm:p-8 overflow-y-auto border-b lg:border-b-0 lg:border-r border-neutral-200">
                        {/* TOP COMPARATIVE TABLE */}
                    <div className="bg-white border border-neutral-200 shadow-sm mb-6">
                        <div className="p-4 bg-neutral-50/50 border-b border-neutral-200 flex justify-between items-center">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Comparativo: Original vs Arquivo HVI</h3>
                            <div className="flex items-center gap-4 text-xs font-medium">
                                <div className="flex items-center gap-1.5 text-blue-600">
                                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] text-white font-bold">A</div>
                                    Valores Digitados
                                </div>
                                <ArrowRight className="h-4 w-4 text-neutral-300" />
                                <div className="flex items-center gap-1.5 text-green-600">
                                    <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] text-white font-bold">B</div>
                                    Média HVI (Arquivo)
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-white border-b border-neutral-200">
                                        <th className="px-4 py-3 text-left font-bold text-xs uppercase tracking-wider text-neutral-400 w-32 border-r border-neutral-200">Fonte</th>
                                        <th className="px-3 py-3 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 w-1/6">MIC</th>
                                        <th className="px-3 py-3 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 w-1/6">LEN</th>
                                        <th className="px-3 py-3 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 w-1/6">UNF</th>
                                        <th className="px-3 py-3 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 w-1/6">STR</th>
                                        <th className="px-3 py-3 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 w-1/6">RD</th>
                                        <th className="px-3 py-3 text-center font-bold text-xs uppercase tracking-wider text-neutral-500 w-1/6">+B</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* ROW A - Original */}
                                    <tr className="border-b border-neutral-100 hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-3 border-r border-neutral-200 bg-blue-50/20">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                                                    <span className="text-white font-bold text-[10px]">A</span>
                                                </div>
                                                <span className="font-bold text-blue-600 text-xs">Original</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-blue-600">{typeof originalSample.mic === 'number' ? originalSample.mic.toFixed(2) : (originalSample.mic || '-')}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-blue-600">{typeof originalSample.len === 'number' ? originalSample.len.toFixed(2) : (originalSample.len || '-')}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-blue-600">{typeof originalSample.unf === 'number' ? originalSample.unf.toFixed(1) : (originalSample.unf || '-')}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-blue-600">{typeof originalSample.str === 'number' ? originalSample.str.toFixed(1) : (originalSample.str || '-')}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-blue-600">{typeof originalSample.rd === 'number' ? originalSample.rd.toFixed(1) : (originalSample.rd || '-')}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-blue-600">{typeof originalSample.b === 'number' ? originalSample.b.toFixed(1) : (originalSample.b || '-')}</td>
                                    </tr>
                                    {/* ROW B - Generated */}
                                    <tr className="hover:bg-green-50/30 transition-colors">
                                        <td className="px-4 py-3 border-r border-neutral-200 bg-green-50/20">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                                                    <span className="text-white font-bold text-[10px]">B</span>
                                                </div>
                                                <span className="font-bold text-green-600 text-xs">Arquivo</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-green-600">{generatedValues.mic.toFixed(2)}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-green-600">{generatedValues.len.toFixed(2)}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-green-600">{generatedValues.unf.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-green-600">{generatedValues.str.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-green-600">{generatedValues.rd.toFixed(1)}</td>
                                        <td className="px-3 py-3 text-center font-bold text-[15px] text-green-600">{generatedValues.b.toFixed(1)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Footer (Color and extra info) */}
                        <div className="flex justify-between items-center border-t border-neutral-200 bg-neutral-50 px-6 py-3">
                            <div className="flex items-center gap-2">
                                {originalSample.cor && (
                                    <svg width="20" height="20" viewBox="0 0 24 24" className="rounded shadow-sm border border-neutral-300">
                                        <rect width="24" height="24" fill={originalSample.cor} />
                                    </svg>
                                )}
                                <span className="text-xs text-neutral-500 font-medium">
                                    Cor Identificada: <span className="font-bold text-neutral-700">{originalSample.cor || 'N/A'}</span>
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full bg-green-500 shadow-sm shadow-green-200"></span>
                                <span className="text-xs text-neutral-500 font-medium">Média calculada sobre as 6 leituras abaixo</span>
                            </div>
                        </div>
                    </div>

                    {/* Editable Readings Table */}
                    {balancedReadings && balancedReadings.mic && (
                        <div className="bg-white border border-neutral-200 p-6 mb-4">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                                    Ajustar Leituras (6 repetições)
                                </h4>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-widest text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 shadow-sm" title="O valor digitado ultrapassou a tolerância máxima permitida para esta métrica em relação à média do lote.">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                        Desvio Acima do Permitido
                                    </div>
                                    <div className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-widest text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-100 shadow-sm" title="O valor digitado está fora dos limites físicos possíveis ou tem formatação incorreta.">
                                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                                        Valor Inválido
                                    </div>
                                    <span className="text-[10px] font-normal lowercase text-neutral-400 ml-2">
                                        edições atualizam a prévia
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-x-auto border border-neutral-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-50 text-xs uppercase font-bold text-neutral-500 border-b border-neutral-200">
                                        <tr>
                                            <th className="px-4 py-2 text-center border-r border-neutral-200">#</th>
                                            <th className="px-4 py-2 text-center border-r border-neutral-200">MIC</th>
                                            <th className="px-4 py-2 text-center border-r border-neutral-200">LEN</th>
                                            <th className="px-4 py-2 text-center border-r border-neutral-200">UNF</th>
                                            <th className="px-4 py-2 text-center border-r border-neutral-200">STR</th>
                                            <th className="px-4 py-2 text-center border-r border-neutral-200">RD</th>
                                            <th className="px-4 py-2 text-center">+B</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {editableReadings.mic?.map((_, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                                <td className="px-4 py-1.5 text-center font-bold text-neutral-400 border-r border-neutral-200 bg-neutral-50">
                                                    {idx + 1}
                                                </td>
                                                <td className="px-2 py-1 border-r border-neutral-200">
                                                    <input 
                                                        type="text" 
                                                        inputMode="decimal"
                                                        value={editableReadings.mic?.[idx] ?? ''} 
                                                        onChange={(e) => handleReadingChange(idx, 'mic', e.target.value)}
                                                        onBlur={(e) => handleBlur(idx, 'mic', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 0)}
                                                        data-row={idx}
                                                        data-col={0}
                                                        title="MIC"
                                                        placeholder="MIC"
                                                        className={getInputClassName(editableReadings.mic?.[idx], 'mic')}
                                                    />
                                                </td>
                                                <td className="px-2 py-1 border-r border-neutral-200">
                                                    <input 
                                                        type="text" 
                                                        inputMode="decimal"
                                                        value={editableReadings.len?.[idx] ?? ''} 
                                                        onChange={(e) => handleReadingChange(idx, 'len', e.target.value)}
                                                        onBlur={(e) => handleBlur(idx, 'len', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 1)}
                                                        data-row={idx}
                                                        data-col={1}
                                                        title="LEN"
                                                        placeholder="LEN"
                                                        className={getInputClassName(editableReadings.len?.[idx], 'len')}
                                                    />
                                                </td>
                                                <td className="px-2 py-1 border-r border-neutral-200">
                                                    <input 
                                                        type="text" 
                                                        inputMode="decimal"
                                                        value={editableReadings.unf?.[idx] ?? ''} 
                                                        onChange={(e) => handleReadingChange(idx, 'unf', e.target.value)}
                                                        onBlur={(e) => handleBlur(idx, 'unf', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 2)}
                                                        data-row={idx}
                                                        data-col={2}
                                                        title="UNF"
                                                        placeholder="UNF"
                                                        className={getInputClassName(editableReadings.unf?.[idx], 'unf')}
                                                    />
                                                </td>
                                                <td className="px-2 py-1 border-r border-neutral-200">
                                                    <input 
                                                        type="text" 
                                                        inputMode="decimal"
                                                        value={editableReadings.str?.[idx] ?? ''} 
                                                        onChange={(e) => handleReadingChange(idx, 'str', e.target.value)}
                                                        onBlur={(e) => handleBlur(idx, 'str', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 3)}
                                                        data-row={idx}
                                                        data-col={3}
                                                        title="STR"
                                                        placeholder="STR"
                                                        className={getInputClassName(editableReadings.str?.[idx], 'str')}
                                                    />
                                                </td>
                                                <td className="px-2 py-1 border-r border-neutral-200">
                                                    <input 
                                                        type="text" 
                                                        inputMode="decimal"
                                                        value={editableReadings.rd?.[idx] ?? ''} 
                                                        onChange={(e) => handleReadingChange(idx, 'rd', e.target.value)}
                                                        onBlur={(e) => handleBlur(idx, 'rd', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 4)}
                                                        data-row={idx}
                                                        data-col={4}
                                                        title="RD"
                                                        placeholder="RD"
                                                        className={getInputClassName(editableReadings.rd?.[idx], 'rd')}
                                                    />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <input 
                                                        type="text" 
                                                        inputMode="decimal"
                                                        value={editableReadings.b?.[idx] ?? ''} 
                                                        onChange={(e) => handleReadingChange(idx, 'b', e.target.value)}
                                                        onBlur={(e) => handleBlur(idx, 'b', e.target.value)}
                                                        onKeyDown={(e) => handleKeyDown(e, idx, 5)}
                                                        data-row={idx}
                                                        data-col={5}
                                                        title="+B"
                                                        placeholder="+B"
                                                        className={getInputClassName(editableReadings.b?.[idx], 'b')}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                        {/* Averages Row */}
                                        {editableReadings.mic && editableReadings.mic.length > 0 && (
                                            <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-300">
                                                <td className="px-4 py-2.5 text-center text-[10px] uppercase tracking-widest text-neutral-600 border-r border-neutral-300">
                                                    MÉDIA
                                                </td>
                                                {['mic', 'len', 'unf', 'str', 'rd', 'b'].map(field => {
                                                    const values = editableReadings[field] || [];
                                                    const sum = values.reduce((acc, val) => acc + (parseFloat(String(val).replace(',', '.')) || 0), 0);
                                                    const avg = values.length > 0 ? sum / values.length : 0;
                                                    const maxDecimals = (field === 'mic' || field === 'len') ? 2 : 1;
                                                    return (
                                                        <td key={field} className="px-4 py-2.5 text-center text-blue-700 border-r border-neutral-300 last:border-0">
                                                            {avg.toFixed(maxDecimals)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    </div>

                    {/* RIGHT COLUMN: Full File Preview */}
                    <div className="w-full lg:w-5/12 p-8 overflow-y-auto bg-neutral-100 flex flex-col shadow-inner">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3 shrink-0">
                            Prévia Completa do Arquivo
                        </h4>
                        <div className="bg-white p-4 border border-neutral-200 font-mono text-[10px] overflow-auto flex-1 shadow-sm">
                            <pre className="whitespace-pre-wrap break-words">{content}</pre>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="h-20 bg-white border-t border-black flex items-center justify-between px-8 shrink-0">
                    <div className="text-xs text-neutral-500">
                        <p className="font-bold uppercase tracking-widest mb-1">⚠️ Importante:</p>
                        <p>O arquivo HVI utiliza a média dos dados para a cor <span className="font-bold text-black">{originalSample?.cor}</span>.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            className="h-12 px-6 rounded-none border border-neutral-200 text-black hover:bg-neutral-100 font-bold text-[10px] uppercase tracking-widest transition-colors"
                        >
                            {t('hvi.cancel')}
                        </Button>
                        <Button
                            onClick={onConfirm}
                            className="h-12 px-8 rounded-none bg-black text-white hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {t('hvi.confirm_download')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

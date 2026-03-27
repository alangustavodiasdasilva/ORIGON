import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sample } from "@/entities/Sample";
import { useLanguage } from "@/contexts/LanguageContext";

interface AnalysisTableProps {
    samples: Sample[];
    onUpdateSample: (id: string, field: string, value: any) => void;
    onColorChange: (id: string, color: string) => void;
    onDeleteSample: (id: string) => void;
    isProcessing: boolean;
    highlightedSampleId: string | null;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

const COLUMNS = [
    { key: 'amostra_id', label: 'Amostra', editable: false },
    { key: 'mala', label: 'Mala', editable: true },
    { key: 'etiqueta', label: 'Etiqueta', editable: true },
    { key: 'hvi', label: 'HVI', editable: true },
    { key: 'mic', label: 'MIC', editable: true },
    { key: 'len', label: 'LEN', editable: true },
    { key: 'unf', label: 'UNF', editable: true },
    { key: 'str', label: 'STR', editable: true },
    { key: 'rd', label: 'RD', editable: true },
    { key: 'b', label: '+b', editable: true },
];

export default function AnalysisTable({
    samples,
    onUpdateSample,
    onColorChange,
    onDeleteSample,
    isProcessing,
    highlightedSampleId
}: AnalysisTableProps) {
    const { t } = useLanguage();
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    const handleCellClick = (sample: Sample, field: string) => {
        if (field === 'amostra_id') return;
        setEditingCell({ id: sample.id, field });
        setEditValue(String((sample as any)[field] ?? ""));
    };

    const handleCellBlur = (id: string, field: string) => {
        if (editingCell?.id === id && editingCell?.field === field) {
            const numFields = ['mic', 'len', 'unf', 'str', 'rd', 'b'];
            const value = numFields.includes(field) ? (parseFloat(editValue) || null) : editValue;
            onUpdateSample(id, field, value);
            setEditingCell(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            handleCellBlur(id, field);
        }
        if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    if (samples.length === 0) {
        return (
            <div className="text-center py-20 text-neutral-400 font-mono text-xs uppercase tracking-widest">
                {t('analysis.no_records')}
            </div>
        );
    }

    return (
        <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
                <tr className="border-b-2 border-black bg-neutral-50">
                    <th className="py-3 px-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500 w-8">Cor</th>
                    {COLUMNS.map(col => (
                        <th key={col.key} className="py-3 px-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500 whitespace-nowrap">
                            {col.label}
                        </th>
                    ))}
                    <th className="py-3 px-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">Ações</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
                {samples.map(sample => {
                    const isHighlighted = sample.id === highlightedSampleId;
                    return (
                        <tr
                            key={sample.id}
                            className={`group transition-colors hover:bg-neutral-50 ${isHighlighted ? 'bg-yellow-50 ring-1 ring-yellow-300' : ''} ${isProcessing ? 'opacity-60' : ''}`}
                        >
                            {/* Color picker */}
                            <td className="py-2 px-3">
                                <div className="flex items-center gap-1">
                                    {COLORS.map(color => (
                                        <button
                                            key={color}
                                            title={`Classificar como ${color}`}
                                            onClick={() => onColorChange(sample.id, color)}
                                            className={`w-3.5 h-3.5 rounded-full border transition-all hover:scale-125 ${sample.cor === color ? 'ring-2 ring-offset-1 ring-black scale-110' : 'border-neutral-300 opacity-60 hover:opacity-100'}`}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </td>

                            {COLUMNS.map(col => {
                                const isEditing = editingCell?.id === sample.id && editingCell?.field === col.key;
                                const cellValue = (sample as any)[col.key];

                                return (
                                    <td
                                        key={col.key}
                                        className={`py-2 px-3 ${col.editable ? 'cursor-pointer hover:bg-blue-50' : ''} ${sample.cor ? 'border-l-2' : ''}`}
                                        style={col.key === 'amostra_id' && sample.cor ? { borderLeftColor: sample.cor } : {}}
                                        onClick={() => col.editable && handleCellClick(sample, col.key)}
                                    >
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onBlur={() => handleCellBlur(sample.id, col.key)}
                                                onKeyDown={e => handleKeyDown(e, sample.id, col.key)}
                                                className="w-full min-w-[60px] bg-white border border-blue-400 px-1 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                            />
                                        ) : (
                                            <span className={`${!cellValue && col.editable ? 'text-neutral-300 italic' : 'text-black'}`}>
                                                {cellValue !== null && cellValue !== undefined && cellValue !== '' ? String(cellValue) : (col.editable ? '—' : '')}
                                            </span>
                                        )}
                                    </td>
                                );
                            })}

                            {/* Actions */}
                            <td className="py-2 px-3 text-right">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onDeleteSample(sample.id)}
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                                    title={t('analysis.delete_sample')}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

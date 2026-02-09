import { Card, CardContent } from "@/components/ui/card";
import type { Sample } from "@/entities/Sample";
import { calculateStatistics } from "@/lib/stats";
import { AlertTriangle, Zap, Info, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDecimalBR } from "@/services/ocrExtraction";
import { useState } from "react";

interface StatisticsPanelProps {
    samples: Sample[];
    selectedColor?: string | null;
}

const COLORS: Record<string, string> = {
    "#ef4444": "VERMELHO",
    "#3b82f6": "AZUL",
    "#10b981": "VERDE",
    "#f59e0b": "AMARELO",
};

const CUSTOM_AVERAGES_KEY = 'custom_color_averages';

export default function StatisticsPanel({ samples, selectedColor }: StatisticsPanelProps) {
    const [editingField, setEditingField] = useState<{ color: string; field: string } | null>(null);
    const [editValue, setEditValue] = useState<string>('');

    const [customAverages, setCustomAverages] = useState<Record<string, Record<string, number>>>(() => {
        try {
            const stored = localStorage.getItem(CUSTOM_AVERAGES_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });

    const fields = [
        { key: 'mic', label: 'MIC', decimals: 2 },
        { key: 'len', label: 'LEN', decimals: 2 },
        { key: 'str', label: 'STR', decimals: 1 },
        { key: 'rd', label: 'RD', decimals: 1 },
        { key: 'b', label: '+b', decimals: 1 },
    ] as const;

    const groups = samples.reduce((acc, s) => {
        if (s.cor) {
            if (!acc[s.cor]) acc[s.cor] = [];
            acc[s.cor].push(s);
        }
        return acc;
    }, {} as Record<string, Sample[]>);

    const colorsToShow = selectedColor ? [selectedColor] : Object.keys(groups);

    const generateAutomatedInsight = (groupSamples: Sample[]) => {
        const micStats = calculateStatistics(groupSamples.map(s => ({ id: s.id, val: s.mic || 0 })));
        if (micStats.stdDev > 0.4) return { message: "Alta Variabilidade", type: "warning" };
        if (micStats.mean < 3.5 || micStats.mean > 5.0) return { message: "Atenção: Média Atípica", type: "warning" };
        return { message: "Métricas Estáveis", type: "success" };
    };

    const getValue = (color: string, field: string, calculatedValue: number) => {
        return customAverages[color]?.[field] ?? calculatedValue;
    };

    const isCustomValue = (color: string, field: string) => {
        return customAverages[color]?.[field] !== undefined;
    };

    const startEditing = (color: string, field: string, currentValue: number, decimals: number) => {
        setEditingField({ color, field });
        // Format value to remove floating point artifacts
        setEditValue(currentValue.toFixed(decimals));
    };

    const saveEdit = () => {
        if (!editingField) return;
        const numValue = parseFloat(editValue);
        if (isNaN(numValue)) {
            cancelEdit();
            return;
        }

        const newCustomAverages = {
            ...customAverages,
            [editingField.color]: {
                ...customAverages[editingField.color],
                [editingField.field]: numValue
            }
        };

        setCustomAverages(newCustomAverages);
        localStorage.setItem(CUSTOM_AVERAGES_KEY, JSON.stringify(newCustomAverages));
        setEditingField(null);
        setEditValue('');
    };

    const cancelEdit = () => {
        setEditingField(null);
        setEditValue('');
    };

    const resetToCalculated = (color: string, field: string) => {
        const newCustomAverages = { ...customAverages };
        if (newCustomAverages[color]) {
            delete newCustomAverages[color][field];
            if (Object.keys(newCustomAverages[color]).length === 0) {
                delete newCustomAverages[color];
            }
        }
        setCustomAverages(newCustomAverages);
        localStorage.setItem(CUSTOM_AVERAGES_KEY, JSON.stringify(newCustomAverages));
    };

    if (colorsToShow.length === 0) {
        return (
            <div className="bg-neutral-50 rounded-xl p-12 text-center border border-neutral-200 border-dashed">
                <div className="bg-white h-12 w-12 rounded-full border border-neutral-100 flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <Info className="h-5 w-5 text-neutral-400" />
                </div>
                <p className="text-neutral-900 font-bold uppercase tracking-widest text-xs">Sem Dados Classificados</p>
                <p className="text-[10px] text-neutral-500 mt-1 max-w-xs mx-auto">Classifique as amostras para visualizar as estatísticas por grupo.</p>
            </div>
        );
    }

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {colorsToShow.map(color => {
                const groupSamples = groups[color] || [];
                if (groupSamples.length === 0) return null;

                const colorName = COLORS[color] || "GRUPO";
                const insight = generateAutomatedInsight(groupSamples);

                return (
                    <Card key={color} className="overflow-hidden border border-neutral-200 bg-white shadow-sm hover:shadow-lg transition-all duration-200">
                        {/* Thin color indicator */}
                        <div className="h-0.5 w-full" style={{ backgroundColor: color }} />

                        <CardContent className="p-6">
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
                                    {colorName}
                                </h4>
                                <span className="text-[10px] font-semibold text-neutral-400 bg-neutral-50 px-2 py-1 rounded">
                                    {groupSamples.length} amostras
                                </span>
                            </div>

                            {/* Metrics */}
                            <div className="space-y-4">
                                {fields.map(field => {
                                    const values = groupSamples.map(s => ({ id: s.id, val: (s as any)[field.key] })).filter(v => typeof v.val === 'number');
                                    const stats = calculateStatistics(values);
                                    const displayValue = getValue(color, field.key, stats.mean);
                                    const isCustom = isCustomValue(color, field.key);
                                    const isEditing = editingField?.color === color && editingField?.field === field.key;

                                    return (
                                        <div key={field.key}>
                                            {isEditing ? (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-neutral-400 uppercase w-12 shrink-0">
                                                        {field.label}
                                                    </span>
                                                    <input
                                                        type="number"
                                                        step={field.decimals === 2 ? "0.01" : "0.1"}
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveEdit();
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                        onBlur={saveEdit}
                                                        className="flex-1 min-w-0 px-3 py-2 text-xl font-mono font-bold border-2 border-blue-500 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-300 bg-blue-50"
                                                        autoFocus
                                                    />
                                                </div>
                                            ) : (
                                                <div
                                                    className="flex items-center justify-between group/metric cursor-pointer py-2 px-3 -mx-3 rounded-lg hover:bg-neutral-50 transition-colors"
                                                    onClick={() => startEditing(color, field.key, displayValue, field.decimals)}
                                                >
                                                    <span className="text-xs font-semibold text-neutral-400 uppercase">
                                                        {field.label}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={cn(
                                                                "text-2xl font-mono font-bold tabular-nums transition-colors",
                                                                isCustom ? "text-blue-600" : "text-neutral-900"
                                                            )}
                                                        >
                                                            {formatDecimalBR(displayValue, field.decimals)}
                                                        </span>
                                                        {isCustom ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    resetToCalculated(color, field.key);
                                                                }}
                                                                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-orange-100 text-orange-600 transition-colors shrink-0"
                                                                title="Restaurar valor calculado"
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </button>
                                                        ) : (
                                                            <Pencil className="h-4 w-4 text-neutral-300 opacity-0 group-hover/metric:opacity-100 transition-opacity" />
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Footer insight */}
                            <div className={cn(
                                "mt-6 pt-4 border-t flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider",
                                insight.type === 'success' ? "border-emerald-100 text-emerald-600" : "border-amber-100 text-amber-600"
                            )}>
                                {insight.type === 'success' ? <Zap className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                {insight.message}
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    );
}

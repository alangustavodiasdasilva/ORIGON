import { useState, useMemo } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

import { CalendarDays, RotateCcw } from "lucide-react";

interface GlobalProductionChartProps {
    data: any[]; // Array of { date: string, [labId]: number }
    labs: any[]; // Array of { id: string, nome: string, ... }
}

const COLORS = [
    "#000000", // Lab 1 - Preto
    "#ef4444", // Lab 2 - Vermelho
    "#22c55e", // Lab 3 - Verde
    "#3b82f6", // Lab 4 - Azul
    "#f59e0b", // Lab 5 - Amarelo
    "#8b5cf6", // Lab 6 - Roxo
    "#ec4899", // Lab 7 - Rosa
    "#64748b", // Lab 8 - Cinza
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-4 border border-neutral-200 shadow-xl rounded-lg">
                <p className="font-bold text-sm mb-2 font-mono flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-neutral-500" />
                    {new Date(label).toLocaleDateString('pt-BR')}
                </p>
                <div className="space-y-1">
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 justify-between min-w-[150px]">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: entry.color } as React.CSSProperties}
                                />
                                <span className="text-xs text-neutral-500 uppercase tracking-widest truncate max-w-[100px]">
                                    {entry.name}
                                </span>
                            </div>
                            <span
                                className="font-mono font-bold"
                                style={{ color: entry.color } as React.CSSProperties}
                            >
                                {entry.value.toLocaleString('pt-BR')}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export default function GlobalProductionChart({ data, labs }: GlobalProductionChartProps) {
    if (!data || data.length === 0) return null;

    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
    const [selectedLabs, setSelectedLabs] = useState<string[]>([]);

    // Initialize selected labs
    useMemo(() => {
        if (labs && labs.length > 0 && selectedLabs.length === 0) {
            setSelectedLabs(labs.map(l => l.id));
        }
    }, [labs]);

    const toggleLab = (labId: string, e: React.MouseEvent) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Multi-select mode (Toggle specific lab)
            setSelectedLabs(prev =>
                prev.includes(labId)
                    ? prev.filter(id => id !== labId)
                    : [...prev, labId]
            );
        } else {
            // Single-select mode (Isolate or Reset)
            if (selectedLabs.length === 1 && selectedLabs[0] === labId) {
                // Already isolated, so reset to show all
                if (labs) setSelectedLabs(labs.map(l => l.id));
            } else {
                // Isolate this lab
                setSelectedLabs([labId]);
            }
        }
    };

    const resetFilters = () => {
        setStartDate('');
        setEndDate('');
        setGranularity('day');
        if (labs) setSelectedLabs(labs.map(l => l.id));
    };

    // Filter Data by Date Range
    const filteredData = useMemo(() => {
        if (!startDate && !endDate) {
            // Default: Last 30 days
            const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            return sortedData.slice(-30);
        }

        let filtered = data;
        if (startDate) {
            filtered = filtered.filter(d => d.date >= startDate);
        }
        if (endDate) {
            filtered = filtered.filter(d => d.date <= endDate);
        }
        return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [data, startDate, endDate]);

    return (
        <div className="w-full bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm mb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h3 className="text-lg font-bold uppercase tracking-tight">Visão Global de Produção</h3>
                    <p className="text-xs text-neutral-500 font-mono mt-1">TOTAL DE AMOSTRAS POR LABORATÓRIO (DIÁRIO)</p>
                </div>

                <div className="flex items-center gap-4 bg-neutral-50 p-2 rounded-lg border border-neutral-100">
                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-neutral-400">DE:</span>
                        <input
                            type="date"
                            className="bg-transparent border-none p-1 font-bold text-black focus:ring-0 cursor-pointer"
                            onChange={(e) => setStartDate(e.target.value)}
                            value={startDate}
                            aria-label="Data Inicial"
                        />
                    </div>
                    <div className="w-px h-4 bg-neutral-300" />
                    <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-neutral-400">ATÉ:</span>
                        <input
                            type="date"
                            className="bg-transparent border-none p-1 font-bold text-black focus:ring-0 cursor-pointer"
                            onChange={(e) => setEndDate(e.target.value)}
                            value={endDate}
                            aria-label="Data Final"
                        />
                    </div>
                </div>

                <div className="flex bg-neutral-100 p-1 rounded-lg">
                    {['day', 'week', 'month'].map((g) => (
                        <button
                            key={g}
                            onClick={() => setGranularity(g as any)}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                                granularity === g ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-neutral-600"
                            )}
                        >
                            {g === 'day' ? 'Dia' : g === 'week' ? 'Sem' : 'Mês'}
                        </button>
                    ))}
                </div>

                <button
                    onClick={resetFilters}
                    className="flex items-center gap-2 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-lg transition-colors text-xs font-bold uppercase tracking-wider"
                    title="Limpar Filtros"
                >
                    <RotateCcw className="h-3 w-3" />
                    Limpar
                </button>
            </div>

            {/* Custom Legend / Filter */}
            <div className="flex flex-wrap gap-3 mb-8 justify-center">
                {labs.map((lab, index) => {
                    const color = COLORS[index % COLORS.length];
                    const isSelected = selectedLabs.includes(lab.id);

                    return (
                        <button
                            key={lab.id}
                            onClick={(e) => toggleLab(lab.id, e)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 transform hover:scale-105",
                                isSelected
                                    ? "bg-white border-neutral-200 shadow-md ring-1 ring-black/5"
                                    : "bg-neutral-50 border-transparent opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                            )}
                            title="Clique para isolar, Ctrl+Clique para selecionar múltiplos"
                        >
                            <div
                                className={cn(
                                    "w-3 h-3 rounded-full shadow-sm transition-all duration-300",
                                    isSelected ? "scale-110" : "scale-90"
                                )}
                                style={{ backgroundColor: color } as React.CSSProperties}
                            />
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest transition-colors",
                                isSelected ? "text-black" : "text-neutral-500"
                            )}>
                                {lab.nome}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={filteredData}
                        margin={{
                            top: 5,
                            right: 30,
                            left: 20,
                            bottom: 5,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#737373' }}
                            tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            minTickGap={30}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#737373' }}
                            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e5e5e5', strokeWidth: 1 }} />

                        {labs.map((lab, idx) => {
                            if (!selectedLabs.includes(lab.id)) return null;
                            return (
                                <Line
                                    key={lab.id}
                                    type="monotone"
                                    dataKey={lab.id}
                                    name={lab.nome}
                                    stroke={COLORS[idx % COLORS.length]}
                                    strokeWidth={2}
                                    dot={{ r: 3, strokeWidth: 0, fill: COLORS[idx % COLORS.length] }}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                    connectNulls
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

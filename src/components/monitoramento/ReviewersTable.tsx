import React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewersTableProps {
    revisorStats: { name: string; total: number }[];
    selectedReviewers: string[];
    toggleReviewerSelection: (key: string) => void;
}

export const ReviewersTable: React.FC<ReviewersTableProps> = ({
    revisorStats,
    selectedReviewers,
    toggleReviewerSelection
}) => {
    return (
        <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-black mt-8">
            <div className="flex items-center justify-between mb-8 border-b border-neutral-100 pb-4">
                <h3 className="text-xl font-serif text-black leading-tight flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                    Tabela Geral Analistas
                </h3>
                <span className="text-[10px] uppercase font-bold text-neutral-400">Total Histórico</span>
            </div>
            <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-sm text-left">
                    <thead className="bg-neutral-50 text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        <tr>
                            <th className="p-4 rounded-l-xl">Revisor</th>
                            <th className="p-4 text-right">Total Amostras</th>
                            <th className="p-4 rounded-r-xl w-full">Impacto (%)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {revisorStats.filter(stat => {
                            const norm = stat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
                            return norm.length > 0 && !norm.includes('media') && !norm.includes('nao informado');
                        }).map((stat, i) => (
                            <tr key={stat.name} className="hover:bg-neutral-50/50 transition-colors group cursor-pointer" onClick={() => toggleReviewerSelection(stat.name)}>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-neutral-300 w-4">#{i + 1}</span>
                                        <div className={cn("h-4 w-4 rounded border flex items-center justify-center transition-all", selectedReviewers.includes(stat.name) ? "bg-black border-black text-white" : "border-neutral-300 bg-white group-hover:border-neutral-500")}>
                                            <div key={selectedReviewers.includes(stat.name) ? "selected" : "unselected"} className="flex items-center justify-center">
                                                {selectedReviewers.includes(stat.name) && <Star className="h-2 w-2 fill-white" />}
                                            </div>
                                        </div>
                                        <span className="font-bold text-neutral-800 tracking-wider text-[11px]">{stat.name}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-right font-mono font-bold">{stat.total.toLocaleString('pt-BR')}</td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-1.5 bg-neutral-100 rounded-full flex-1 overflow-hidden">
                                            <div
                                                className="h-full bg-black rounded-full transition-all w-dynamic"
                                                style={{ '--dynamic-width': `${(stat.total / (revisorStats[0]?.total || 1)) * 100}%` } as React.CSSProperties}
                                            />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

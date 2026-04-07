import React from "react";
import { cn } from "@/lib/utils";

export const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const sortedPayload = [...payload].sort((a: any, b: any) => {
            if (a.name === 'Total Recebido') return -1;
            if (b.name === 'Total Recebido') return 1;
            return b.value - a.value;
        });
        return (
            <div className="bg-white/95 backdrop-blur-sm border border-neutral-200 p-4 shadow-2xl rounded-xl animate-in fade-in zoom-in duration-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 border-b border-neutral-100 pb-1">{label}</p>
                <div className="space-y-1.5">
                    {sortedPayload.map((entry: any) => (
                        <div key={entry.name} className="flex items-center justify-between gap-8">
                            <div className="flex items-center gap-2">
                                <svg width="8" height="8" viewBox="0 0 8 8" className="shadow-sm">
                                    <circle cx="4" cy="4" r="4" fill={entry.color} />
                                </svg>
                                <span className={cn("text-[11px] font-medium", entry.name === 'Total Recebido' ? "text-black font-black" : "text-neutral-600")}>{entry.name}</span>
                            </div>
                            <span className={cn("text-[11px] font-mono", entry.name === 'Total Recebido' ? "text-black font-black" : "font-bold text-black")}>{entry.value.toLocaleString('pt-BR')}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

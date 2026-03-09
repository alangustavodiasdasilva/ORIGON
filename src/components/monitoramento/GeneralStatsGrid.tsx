import React from "react";
import { Activity, ClipboardList, Database, RefreshCw } from "lucide-react";

interface GeneralStatsGridProps {
    stats: {
        total: number;
        faturados: number;
        emAberto: number;
        totalAmostras: number;
        saldoAmostras: number;
    };
}

export const GeneralStatsGrid: React.FC<GeneralStatsGridProps> = ({ stats }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 animate-in fade-in duration-1000">
            <div className="group bg-white border border-neutral-200 p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500">
                <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Registros Ativos</span>
                    <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center"><Activity className="h-4 w-4 text-blue-500" /></div>
                </div>
                <div className="text-3xl font-serif text-black mb-1">{stats.total.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Obras de Serviço Catalogadas</div>
            </div>

            <div className="group bg-black p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all duration-500 hover:-translate-y-1">
                <div className="absolute -right-8 -bottom-8 opacity-10">
                    <Activity className="h-40 w-40 text-white" />
                </div>
                <div className="flex items-center justify-between mb-6 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Saldo de Análise</span>
                    <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><ClipboardList className="h-4 w-4 text-white" /></div>
                </div>
                <div className="text-3xl font-serif text-white mb-1 relative z-10">{stats.saldoAmostras.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight relative z-10">Amostras Pendentes de Finalização</div>
            </div>

            <div className="group bg-white border border-neutral-200 p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-500">
                <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Total Amostras</span>
                    <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center"><Database className="h-4 w-4 text-amber-500" /></div>
                </div>
                <div className="text-3xl font-serif text-black mb-1">{stats.totalAmostras.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Carga total histórica no sistema</div>
            </div>

            <div className="group bg-white border border-neutral-200 p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-500">
                <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Ciclo Médio</span>
                    <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center"><RefreshCw className="h-4 w-4 text-emerald-500" /></div>
                </div>
                <div className="text-3xl font-serif text-black mb-1">{(stats.total > 0 ? (stats.totalAmostras / stats.total).toFixed(1) : "0")}</div>
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Amostras por Ordem de Serviço</div>
            </div>
        </div>
    );
};

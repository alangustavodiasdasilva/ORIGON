import React from "react";
import { Activity, Database, AlertTriangle, Zap, CheckCircle2, TrendingUp } from "lucide-react";

interface GeneralStatsGridProps {
    stats: {
        total: number;
        faturados: number;
        emAberto: number;
        totalAmostras: number;
        saldoAmostras: number;
    };
    osList?: any[]; // Adicionado para calcular KPIs estratégicos no dashboard
}

function parseSafeDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr || dateStr.trim() === '' || dateStr.trim() === 'null' || dateStr.trim() === '0') return null;
    const str = dateStr.trim();
    if (!isNaN(Number(str)) && Number(str) > 20000 && Number(str) < 70000) return new Date((Number(str) - 25569) * 86400 * 1000);
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    const matchBR = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (matchBR) {
        d = new Date(parseInt(matchBR[3]), parseInt(matchBR[2]) - 1, parseInt(matchBR[1]), matchBR[4] ? parseInt(matchBR[4]) : 0, matchBR[5] ? parseInt(matchBR[5]) : 0, matchBR[6] ? parseInt(matchBR[6]) : 0);
        if (!isNaN(d.getTime())) return d;
    }
    const matchSQL = str.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/);
    if (matchSQL) {
        d = new Date(parseInt(matchSQL[1]), parseInt(matchSQL[2]) - 1, parseInt(matchSQL[3]), matchSQL[4] ? parseInt(matchSQL[4]) : 0, matchSQL[5] ? parseInt(matchSQL[5]) : 0, matchSQL[6] ? parseInt(matchSQL[6]) : 0);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

export const GeneralStatsGrid: React.FC<GeneralStatsGridProps> = ({ stats, osList = [] }) => {
    // Cálculo dos KPIs Executivos
    const execStats = React.useMemo(() => {
        let maxTime = 0;
        let maxFinTime = 0;
        
        osList.forEach(os => {
            const r = parseSafeDate(os.data_recepcao)?.getTime() || 0;
            const a = parseSafeDate(os.data_acondicionamento)?.getTime() || 0;
            const f = parseSafeDate(os.data_finalizacao)?.getTime() || 0;
            const t = Math.max(r, a, f);
            if (t > maxTime) maxTime = t;
            if (f > maxFinTime) maxFinTime = f;
        });

        const nowSla = maxTime > 0 ? new Date(maxTime) : new Date();
        const nowProd = maxFinTime > 0 ? new Date(maxFinTime) : new Date();
        
        let atrasadas = 0;
        let naFila = 0;
        let processadasHoje = 0;

        osList.forEach(os => {
            const am = os.total_amostras || 0;
            const recD = parseSafeDate(os.data_recepcao);
            const acondD = parseSafeDate(os.data_acondicionamento);
            const finD = parseSafeDate(os.data_finalizacao);

            const hasFin = finD !== null;
            const hasAcond = acondD !== null;
            const hasRec = recD !== null;

            // Fila e Atrasos
            if (!hasFin) {
                if (hasRec || hasAcond) {
                    naFila += am;
                }
                
                if (hasAcond && acondD) {
                    const diff = (nowSla.getTime() - acondD.getTime()) / (1000 * 60 * 60);
                    if (diff > 24) atrasadas += am;
                } else if (hasRec && recD) {
                    const diff = (nowSla.getTime() - recD.getTime()) / (1000 * 60 * 60);
                    if (diff > 48) atrasadas += am;
                }
            }

            // Produtividade "Hoje" (da base)
            if (hasFin && finD) {
                const diffDays = (nowProd.getTime() - finD.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays <= 1) { // 24h ou mesmo dia
                    processadasHoje += am;
                }
            }
        });

        return { atrasadas, naFila, processadasHoje };
    }, [osList]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-in fade-in duration-1000">
            {/* 1. Produção Hoje */}
            <div className="group bg-gradient-to-br from-indigo-900 to-black p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all duration-500 hover:-translate-y-1">
                <div className="absolute -right-8 -bottom-8 opacity-20">
                    <Zap className="h-40 w-40 text-indigo-400" />
                </div>
                <div className="flex items-center justify-between mb-6 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Produtividade de Hoje</span>
                    <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-white" /></div>
                </div>
                <div className="text-4xl font-serif text-white mb-1 relative z-10">{execStats.processadasHoje.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-tight relative z-10 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Amostras finalizadas hoje
                </div>
            </div>

            {/* 2. Saldo de Análises (Fila) */}
            <div className="group bg-black p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all duration-500 hover:-translate-y-1">
                <div className="absolute -right-8 -bottom-8 opacity-10">
                    <Activity className="h-40 w-40 text-white" />
                </div>
                <div className="flex items-center justify-between mb-6 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Na Fila de Processamento</span>
                    <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Activity className="h-4 w-4 text-white" /></div>
                </div>
                <div className="text-4xl font-serif text-white mb-1 relative z-10">{execStats.naFila.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight relative z-10">Amostras aguardando análise</div>
            </div>

            {/* 3. Atraso Operacional */}
            <div className="group bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Alerta de Gargalo</span>
                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-amber-600" /></div>
                </div>
                <div className="text-4xl font-serif text-amber-500 mb-1 font-black">{execStats.atrasadas.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Amostras paradas (Tempo Limite)</div>
            </div>

            {/* 4. Registros Gerais (Total Histórico) */}
            <div className="group bg-white border border-neutral-200 p-6 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between mb-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Carga Histórica</span>
                    <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center"><Database className="h-4 w-4 text-emerald-500" /></div>
                </div>
                <div className="text-4xl font-serif text-black mb-1">{stats.totalAmostras.toLocaleString('pt-BR')}</div>
                <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">{stats.total.toLocaleString('pt-BR')} Obras de Serviço Catalogadas</div>
            </div>
        </div>
    );
};

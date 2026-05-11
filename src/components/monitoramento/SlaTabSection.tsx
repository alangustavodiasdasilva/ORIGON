import React from "react";
import { Activity, Clock, AlertTriangle, CheckCircle2, TrendingDown, Target, Layers, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OSItem } from "@/components/monitoramento/types";
import { differenceInMinutes, format } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, CartesianGrid } from "recharts";

interface SlaTabSectionProps {
    osList: OSItem[];
}

function parseSafeDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr || dateStr.trim() === '' || dateStr.trim() === 'null' || dateStr.trim() === '0') return null;
    
    const str = dateStr.trim();

    // 1. Número Serial do Excel (ex: "45050.45" ou 45050)
    if (!isNaN(Number(str)) && Number(str) > 20000 && Number(str) < 70000) {
        return new Date((Number(str) - 25569) * 86400 * 1000);
    }

    // 2. Tenta parse nativo do JS
    let d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    // 3. Formato Brasileiro: DD/MM/YYYY HH:mm:ss
    const regexBR = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/;
    const matchBR = str.match(regexBR);
    if (matchBR) {
        const [ , dia, mes, ano, hora, minuto, segundo ] = matchBR;
        d = new Date(
            parseInt(ano), 
            parseInt(mes) - 1, 
            parseInt(dia), 
            hora ? parseInt(hora) : 0, 
            minuto ? parseInt(minuto) : 0, 
            segundo ? parseInt(segundo) : 0
        );
        if (!isNaN(d.getTime())) return d;
    }

    // 4. Formato SQL (PG): YYYY-MM-DD HH:mm:ss
    const regexSQL = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/;
    const matchSQL = str.match(regexSQL);
    if (matchSQL) {
        const [ , ano, mes, dia, hora, minuto, segundo ] = matchSQL;
        d = new Date(
            parseInt(ano), 
            parseInt(mes) - 1, 
            parseInt(dia), 
            hora ? parseInt(hora) : 0, 
            minuto ? parseInt(minuto) : 0, 
            segundo ? parseInt(segundo) : 0
        );
        if (!isNaN(d.getTime())) return d;
    }

    return null;
}

export const SlaTabSection: React.FC<SlaTabSectionProps> = ({ osList }) => {
    const META_SLA_HORAS = 72; // Meta de 72 horas para finalizar
    
    const stats = React.useMemo(() => {
        let maxTime = 0;
        osList.forEach(os => {
            const r = parseSafeDate(os.data_recepcao)?.getTime() || 0;
            const a = parseSafeDate(os.data_acondicionamento)?.getTime() || 0;
            const f = parseSafeDate(os.data_finalizacao)?.getTime() || 0;
            const t = Math.max(r, a, f);
            if (t > maxTime) maxTime = t;
        });

        const now = maxTime > 0 ? new Date(maxTime) : new Date();
        
        let registradas = 0;
        let emRecepcao = 0; 
        let acondicionadas = 0;
        let emRevisao = 0;
        let finalizadas = 0;

        let totalMinutosGeral = 0;
        let totalFinalizadasComTempo = 0;

        let totalMinutosRecAcond = 0;
        let totalAcondicionadasComTempo = 0;

        let totalMinutosAcondFin = 0;
        let totalFinalizadasPosAcond = 0;

        let dentroDaMeta = 0;
        let atrasadas = 0;

        const heatmapHoras = Array.from({ length: 24 }, (_, i) => ({ hora: i, label: `${String(i).padStart(2, '0')}h`, fila: 0 }));

        const osParadas: Array<{
            os: string;
            cliente: string;
            tomador: string;
            amostras: number;
            horasParada: number;
            etapa: string;
            dataRef: Date;
        }> = [];

        osList.forEach(os => {
            const recD = parseSafeDate(os.data_recepcao);
            const acondD = parseSafeDate(os.data_acondicionamento);
            const finD = parseSafeDate(os.data_finalizacao);
            
            const hasRec = recD !== null;
            const hasAcond = acondD !== null;
            const hasFin = finD !== null;
            const hasRev = Boolean(os.revisor && String(os.revisor).trim() !== '');

            const am = os.total_amostras || 0;

            // Tempos
            if (recD) {
                const h = recD.getHours();
                if (!hasFin && !hasAcond) {
                    heatmapHoras[h].fila += am;
                }

                if (acondD) {
                    const diffRecAcond = differenceInMinutes(acondD, recD);
                    if (diffRecAcond >= 0) {
                        totalMinutosRecAcond += diffRecAcond * am;
                        totalAcondicionadasComTempo += am;
                    }

                    if (finD) {
                        const diffAcondFin = differenceInMinutes(finD, acondD);
                        if (diffAcondFin >= 0) {
                            totalMinutosAcondFin += diffAcondFin * am;
                            totalFinalizadasPosAcond += am;
                        }
                    }
                }

                if (finD) {
                    const diffGeral = differenceInMinutes(finD, recD);
                    if (diffGeral >= 0) {
                        totalMinutosGeral += diffGeral * am;
                        totalFinalizadasComTempo += am;
                        
                        if ((diffGeral / 60) <= META_SLA_HORAS) {
                            dentroDaMeta += am;
                        }
                    }
                }
            }

            // Fila atual
            if (hasFin) {
                finalizadas += am;
            } else if (hasAcond) {
                if (hasRev) {
                    emRevisao += am;
                } else {
                    acondicionadas += am;
                }
                
                if (acondD) {
                    const horas = differenceInMinutes(now, acondD) / 60;
                    if (horas > 24) {
                        atrasadas += am;
                        osParadas.push({
                            os: os.os_numero || os.id,
                            cliente: os.cliente || 'NÃO INFORMADO',
                            tomador: os.tomador || os.cliente || 'NÃO INFORMADO',
                            amostras: am,
                            horasParada: Math.round(horas),
                            etapa: hasRev ? 'Revisão' : 'HVI (Acondicionada)',
                            dataRef: acondD
                        });
                    }
                }
            } else if (hasRec) {
                emRecepcao += am;
                if (recD) {
                    const horas = differenceInMinutes(now, recD) / 60;
                    if (horas > 48) {
                        atrasadas += am;
                        osParadas.push({
                            os: os.os_numero || os.id,
                            cliente: os.cliente || 'NÃO INFORMADO',
                            tomador: os.tomador || os.cliente || 'NÃO INFORMADO',
                            amostras: am,
                            horasParada: Math.round(horas),
                            etapa: 'Recepção',
                            dataRef: recD
                        });
                    }
                }
            } else {
                registradas += am;
            }
        });

        osParadas.sort((a, b) => b.horasParada - a.horasParada);

        const tempoMedioH = totalFinalizadasComTempo > 0 ? (totalMinutosGeral / totalFinalizadasComTempo) / 60 : 0;
        const tempoMedioRecAcondH = totalAcondicionadasComTempo > 0 ? (totalMinutosRecAcond / totalAcondicionadasComTempo) / 60 : 0;
        const tempoMedioAcondFinH = totalFinalizadasPosAcond > 0 ? (totalMinutosAcondFin / totalFinalizadasPosAcond) / 60 : 0;

        const taxaMeta = totalFinalizadasComTempo > 0 ? (dentroDaMeta / totalFinalizadasComTempo) * 100 : 0;

        const heatmapValores = heatmapHoras.map(h => h.fila);
        const maxFila = Math.max(...heatmapValores, 1);

        return {
            registradas,
            emRecepcao,
            acondicionadas,
            emRevisao,
            finalizadas,
            atrasadas,
            tempoMedioH,
            tempoMedioRecAcondH,
            tempoMedioAcondFinH,
            taxaMeta,
            osParadas,
            heatmapHoras,
            maxFila
        };
    }, [osList]);

    return (
        <div className="w-full animate-in fade-in duration-300 space-y-6 pb-20">
            {/* Painel Executivo SLA */}
            <div className="bg-black text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Target className="h-48 w-48" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Painel Executivo SLA</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/10 relative overflow-hidden">
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">SLA Médio Global</p>
                            <div className="text-4xl font-serif font-black text-white flex items-end gap-1">
                                {stats.tempoMedioH.toFixed(1)} <span className="text-base text-neutral-400 mb-1">h</span>
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" /> Finalização vs Entrada
                            </div>
                        </div>

                        <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/10">
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Taxa Dentro da Meta ({META_SLA_HORAS}h)</p>
                            <div className="text-4xl font-serif font-black flex items-end gap-1"
                                 style={{ color: stats.taxaMeta >= 90 ? '#34d399' : stats.taxaMeta >= 70 ? '#fbbf24' : '#f87171' }}>
                                {stats.taxaMeta.toFixed(1)}%
                            </div>
                            <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-1000" 
                                     style={{ width: `${stats.taxaMeta}%`, background: stats.taxaMeta >= 90 ? '#34d399' : stats.taxaMeta >= 70 ? '#fbbf24' : '#f87171' }} />
                            </div>
                        </div>

                        <div className="bg-amber-500/10 rounded-2xl p-6 backdrop-blur-sm border border-amber-500/20">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">Atraso Operacional</p>
                            <div className="text-4xl font-serif font-black text-amber-500 flex items-end gap-1">
                                {stats.atrasadas.toLocaleString('pt-BR')} <span className="text-base text-amber-700 mb-1">amostras</span>
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-amber-600">
                                <AlertTriangle className="h-4 w-4" /> Acima do tolerável
                            </div>
                        </div>

                        <div className="bg-blue-500/10 rounded-2xl p-6 backdrop-blur-sm border border-blue-500/20">
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Fila de Processamento</p>
                            <div className="text-4xl font-serif font-black text-blue-400 flex items-end gap-1">
                                {(stats.emRecepcao + stats.acondicionadas + stats.emRevisao).toLocaleString('pt-BR')} <span className="text-base text-blue-700 mb-1">amostras</span>
                            </div>
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-blue-500">
                                <Activity className="h-4 w-4" /> No laboratório
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ranking de Gargalos (Tempo Médio por Etapa) */}
                <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm lg:col-span-1">
                    <h3 className="text-lg font-black uppercase tracking-widest text-neutral-800 mb-6 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-indigo-500" /> Gargalo por Etapa
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-8">
                        Tempo médio que a OS passa em cada fase do laboratório
                    </p>

                    <div className="space-y-6 relative">
                        {/* Linha conectora */}
                        <div className="absolute left-[19px] top-[24px] bottom-[24px] w-0.5 bg-neutral-100 z-0"></div>

                        <div className="relative z-10 flex items-start gap-4">
                            <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0 border-4 border-white">
                                <Layers className="h-4 w-4" />
                            </div>
                            <div className="flex-1 bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                                <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Recepção → Acondicionamento</div>
                                <div className="text-2xl font-serif font-black text-black">
                                    {stats.tempoMedioRecAcondH.toFixed(1)} <span className="text-sm text-neutral-400 font-mono">horas</span>
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10 flex items-start gap-4">
                            <div className="h-10 w-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shrink-0 border-4 border-white">
                                <Users className="h-4 w-4" />
                            </div>
                            <div className="flex-1 bg-neutral-50 rounded-2xl p-4 border border-neutral-100 relative overflow-hidden">
                                {stats.tempoMedioAcondFinH > stats.tempoMedioRecAcondH && (
                                    <div className="absolute top-0 right-0 bg-red-100 text-red-600 text-[8px] font-black uppercase px-2 py-1 rounded-bl-xl">
                                        Principal Gargalo
                                    </div>
                                )}
                                <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">HVI → Revisão → Fin.</div>
                                <div className="text-2xl font-serif font-black text-black">
                                    {stats.tempoMedioAcondFinH.toFixed(1)} <span className="text-sm text-neutral-400 font-mono">horas</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Heatmap de Horários */}
                <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm lg:col-span-2">
                    <h3 className="text-lg font-black uppercase tracking-widest text-neutral-800 mb-6 flex items-center gap-2">
                        <Activity className="h-5 w-5 text-rose-500" /> Heatmap (Mapa de Calor de Fila)
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-8">
                        Concentração de amostras aguardando análise por faixa de horário (Entrada)
                    </p>

                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.heatmapHoras} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                                <RechartsTooltip 
                                    cursor={{ fill: '#f3f4f6' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-black text-white p-3 rounded-xl shadow-xl text-xs font-mono font-bold">
                                                    {payload[0].payload.label}: {payload[0].value?.toLocaleString('pt-BR')} na fila
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="fila" radius={[4, 4, 0, 0]}>
                                    {stats.heatmapHoras.map((entry, index) => {
                                        const intensity = entry.fila / stats.maxFila;
                                        const fill = intensity > 0.8 ? '#e11d48' : intensity > 0.5 ? '#f43f5e' : intensity > 0.2 ? '#fb7185' : '#ffe4e6';
                                        return <Cell key={`cell-${index}`} fill={fill} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Funil de Produção */}
            <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm">
                <h3 className="text-lg font-black uppercase tracking-widest text-neutral-800 mb-6 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-neutral-400" /> Fluxo Atual (Status)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-neutral-50 rounded-2xl p-6 border-l-4 border-l-neutral-400">
                        <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">1. Registradas</div>
                        <div className="text-3xl font-serif text-black font-bold">{stats.registradas.toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="bg-blue-50/50 rounded-2xl p-6 border-l-4 border-l-blue-500">
                        <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">2. Em Recepção</div>
                        <div className="text-3xl font-serif text-blue-900 font-bold">{stats.emRecepcao.toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="bg-purple-50/50 rounded-2xl p-6 border-l-4 border-l-purple-500">
                        <div className="text-[10px] font-black uppercase tracking-widest text-purple-600 mb-2">3. Acondicionadas</div>
                        <div className="text-3xl font-serif text-purple-900 font-bold">{stats.acondicionadas.toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="bg-amber-50/50 rounded-2xl p-6 border-l-4 border-l-amber-500">
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">4. Revisão HVI</div>
                        <div className="text-3xl font-serif text-amber-900 font-bold">{stats.emRevisao.toLocaleString('pt-BR')}</div>
                    </div>
                    <div className="bg-emerald-50/50 rounded-2xl p-6 border-l-4 border-l-emerald-500">
                        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">5. Finalizadas</div>
                        <div className="text-3xl font-serif text-emerald-900 font-bold">{stats.finalizadas.toLocaleString('pt-BR')}</div>
                    </div>
                </div>
            </div>

            {/* Gargalos e OS Paradas */}
            <div className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-red-50/30">
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-widest text-red-600 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" /> OS Paradas / Gargalos Críticos
                        </h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 mt-1">
                            Ordens de serviço com atraso fora da curva
                        </p>
                    </div>
                    <div className="bg-white px-4 py-2 rounded-xl border border-red-100 flex items-center gap-3 shadow-sm">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-black text-red-600">{stats.osParadas.length} OS Comprometidas</span>
                    </div>
                </div>

                {stats.osParadas.length === 0 ? (
                    <div className="p-16 flex flex-col items-center justify-center text-center">
                        <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        </div>
                        <p className="text-lg font-black text-neutral-800">Operação Fluindo</p>
                        <p className="text-sm text-neutral-500">Nenhuma O.S. parada criando gargalo crítico.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-50">
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">O.S.</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">Tomador / Cliente</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100 text-center">Amostras</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">Onde Travou (Gargalo)</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100">Data Base</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-100 text-right">Tempo Parada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 font-mono">
                                {stats.osParadas.slice(0, 50).map((parada, idx) => (
                                    <tr key={idx} className="hover:bg-red-50/30 transition-colors group">
                                        <td className="p-4 text-sm font-bold text-neutral-900 border-l-4 border-l-transparent group-hover:border-l-red-500 transition-all">
                                            {parada.os}
                                        </td>
                                        <td className="p-4">
                                            <div className="text-xs font-black text-neutral-800">{parada.tomador}</div>
                                            <div className="text-[10px] text-neutral-500 mt-0.5">{parada.cliente}</div>
                                        </td>
                                        <td className="p-4 text-center font-bold text-neutral-600">
                                            {parada.amostras}
                                        </td>
                                        <td className="p-4">
                                            <span className={cn("px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest",
                                                parada.etapa.includes('HVI') || parada.etapa === 'Revisão' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                            )}>
                                                {parada.etapa}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs text-neutral-600">
                                            {format(parada.dataRef, 'dd/MM/yyyy HH:mm')}
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-black">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                {parada.horasParada}h
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

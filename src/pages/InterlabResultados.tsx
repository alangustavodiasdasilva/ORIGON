import { useState, useEffect, useMemo } from "react";
import { Loader2, Award, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
    interlaboratorialService,
    type InterlabIdentificacao,
    type InterlabGeneration,
    type InterlabSigmaMeta
} from "@/services/interlaboratorial.service";
import { LabService, type Lab } from "@/entities/Lab";
import { computeConsensus, type ZStatus } from "@/lib/interlabStats";

type ParamKey = 'uhml' | 'ui' | 'str' | 'mic' | 'rd' | 'plusB';

const PARAMS: { key: ParamKey; label: string; decimals: number }[] = [
    { key: 'uhml', label: 'Comprimento', decimals: 2 },
    { key: 'ui', label: 'Uniformidade', decimals: 1 },
    { key: 'str', label: 'Resistência', decimals: 1 },
    { key: 'mic', label: 'Micronaire', decimals: 2 },
    { key: 'rd', label: 'Rd', decimals: 1 },
    { key: 'plusB', label: '+b', decimals: 1 },
];

const STATUS_STYLE: Record<ZStatus, string> = {
    ok: 'text-emerald-600 bg-emerald-50',
    alerta: 'text-amber-600 bg-amber-50',
    fora: 'text-red-600 bg-red-50'
};

const normalize = (s: string) => s.trim().toUpperCase();

export default function InterlabResultados() {
    const { user } = useAuth();
    const { addToast } = useToast();

    const [identificacoes, setIdentificacoes] = useState<InterlabIdentificacao[]>([]);
    const [generations, setGenerations] = useState<InterlabGeneration[]>([]);
    const [labs, setLabs] = useState<Lab[]>([]);
    const [sigmaMetaList, setSigmaMetaList] = useState<InterlabSigmaMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingCell, setEditingCell] = useState<{ amostra: string; param: ParamKey } | null>(null);
    const [editValue, setEditValue] = useState("");

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [ids, gens, labList, sigmas] = await Promise.all([
                interlaboratorialService.listAllIdentificacoesAllLabs(),
                interlaboratorialService.listAllGenerationsAllLabs(),
                LabService.list(),
                interlaboratorialService.listSigmaMeta()
            ]);
            setIdentificacoes(ids);
            setGenerations(gens);
            setLabs(labList);
            setSigmaMetaList(sigmas);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const unsubscribe = interlaboratorialService.subscribeConsenso(loadData);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const labNameById = useMemo(() => {
        const map: Record<string, string> = {};
        labs.forEach(l => { map[l.id] = l.nome; });
        return map;
    }, [labs]);

    // Agrupa identificações de TODOS os labs pelo texto normalizado — é assim
    // que a planilha original compara (mesmo "ID da amostra" digitado em cada
    // aba de laboratório). Cada grupo é uma "amostra compartilhada".
    const amostraGroups = useMemo(() => {
        const groups: Record<string, InterlabIdentificacao[]> = {};
        identificacoes.forEach(ident => {
            const key = normalize(ident.identificacao);
            if (!key) return;
            if (!groups[key]) groups[key] = [];
            groups[key].push(ident);
        });
        return groups;
    }, [identificacoes]);

    const sigmaMetaMap = useMemo(() => {
        const map: Record<string, number> = {};
        sigmaMetaList.forEach(s => { map[`${normalize(s.identificacao)}::${s.parametro}`] = s.sigmaMeta; });
        return map;
    }, [sigmaMetaList]);

    // Pra cada amostra + parâmetro: a média de CADA lab (entre TODAS as
    // repetições que aquele lab já gerou pra essa identificação, em
    // qualquer dia/máquina) + o consenso (mediana, σ robusto/usado, z).
    const amostraStats = useMemo(() => {
        return Object.entries(amostraGroups).map(([amostraKey, idents]) => {
            const displayName = idents[0]?.identificacao || amostraKey;
            const perParam = PARAMS.map(param => {
                const labAverages = idents.map(ident => {
                    const gens = generations.filter(g => g.identificacaoId === ident.id);
                    if (gens.length === 0) return null;
                    const sum = gens.reduce((acc, g) => acc + (Number(g.reading[param.key]) || 0), 0);
                    return {
                        labId: ident.labId,
                        labName: labNameById[ident.labId] || 'Laboratório',
                        avg: sum / gens.length,
                        n: gens.length
                    };
                }).filter((v): v is NonNullable<typeof v> => v !== null);

                const sigmaMeta = sigmaMetaMap[`${amostraKey}::${param.key}`] ?? null;
                const consensus = computeConsensus(labAverages, sigmaMeta);
                return { param, consensus };
            });
            return { amostraKey, displayName, perParam };
        }).sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [amostraGroups, generations, labNameById, sigmaMetaMap]);

    const startEdit = (amostra: string, param: ParamKey, current: number | null) => {
        setEditingCell({ amostra, param });
        setEditValue(current !== null ? String(current).replace('.', ',') : '');
    };

    const saveSigmaMeta = async () => {
        if (!editingCell) return;
        const { amostra, param } = editingCell;
        const parsed = parseFloat(editValue.replace(',', '.'));
        try {
            if (editValue.trim() === '' || isNaN(parsed)) {
                await interlaboratorialService.clearSigmaMeta(amostra, param);
            } else {
                await interlaboratorialService.setSigmaMeta(amostra, param, parsed, user?.nome || 'Analista');
            }
            setEditingCell(null);
            await loadData();
        } catch (err: any) {
            addToast({ title: "Erro ao Salvar σ Meta", description: err.message, type: "error" });
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="border-b border-neutral-200 pb-6">
                <h1 className="text-4xl font-serif text-black flex items-center gap-3">
                    <Award className="h-8 w-8 text-amber-600" />
                    Resultados — Consenso Interlaboratorial
                </h1>
                <p className="text-neutral-600 font-mono text-sm mt-2">
                    Cada laboratório reporta a média das suas repetições. Valor designado = mediana entre labs;
                    dispersão σ = 1,4826×MAD (ou meta, se preenchida). z = (média do lab − designado) / σ.
                    Visível pra todos os laboratórios — um lab vê a média geral do outro.
                </p>
            </div>

            {isLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>
            ) : amostraStats.length === 0 ? (
                <div className="bg-white border-2 border-neutral-200 rounded-xl p-12 text-center">
                    <p className="text-xs text-neutral-400 font-mono uppercase tracking-widest">
                        Nenhuma identificação cadastrada ainda em nenhum laboratório
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {amostraStats.map(({ amostraKey, displayName, perParam }) => (
                        <div key={amostraKey} className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                            <div className="bg-neutral-50 border-b-2 border-neutral-200 p-4">
                                <h2 className="text-lg font-serif text-black">AMOSTRA {displayName}</h2>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs font-mono">
                                    <thead>
                                        <tr className="text-neutral-400 uppercase text-[9px] tracking-wider">
                                            <th className="text-left p-2 sticky left-0 bg-white">Laboratório</th>
                                            {PARAMS.map(p => <th key={p.key} className="text-center p-2">{p.label}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Uma linha por lab que reportou essa amostra */}
                                        {Array.from(new Set(perParam.flatMap(pp => pp.consensus.labs.map(l => l.labId)))).map(labId => (
                                            <tr key={labId} className="border-t border-neutral-200">
                                                <td className="p-2 font-bold text-black sticky left-0 bg-white whitespace-nowrap">
                                                    {labNameById[labId] || 'Laboratório'}
                                                </td>
                                                {perParam.map(({ param, consensus }) => {
                                                    const labResult = consensus.labs.find(l => l.labId === labId);
                                                    return (
                                                        <td key={param.key} className="text-center p-2">
                                                            {labResult ? labResult.avg.toFixed(param.decimals) : '—'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}

                                        <tr className="border-t-2 border-black bg-amber-50/50">
                                            <td className="p-2 font-bold text-black sticky left-0 bg-amber-50/50 whitespace-nowrap">
                                                ★ Valor Designado (mediana)
                                            </td>
                                            {perParam.map(({ param, consensus }) => (
                                                <td key={param.key} className="text-center p-2 font-bold">
                                                    {consensus.valorDesignado !== null ? consensus.valorDesignado.toFixed(param.decimals) : '—'}
                                                </td>
                                            ))}
                                        </tr>

                                        <tr className="border-t border-neutral-100 text-neutral-500">
                                            <td className="p-2 sticky left-0 bg-white whitespace-nowrap">σ robusto (1,4826×MAD)</td>
                                            {perParam.map(({ param, consensus }) => (
                                                <td key={param.key} className="text-center p-2">{consensus.sigmaRobusto.toFixed(param.decimals + 1)}</td>
                                            ))}
                                        </tr>

                                        <tr className="border-t border-neutral-100 text-neutral-500">
                                            <td className="p-2 sticky left-0 bg-white whitespace-nowrap">σ meta (opcional)</td>
                                            {perParam.map(({ param, consensus }) => {
                                                const isEditing = editingCell?.amostra === amostraKey && editingCell.param === param.key;
                                                return (
                                                    <td key={param.key} className="text-center p-2">
                                                        {isEditing ? (
                                                            <span className="inline-flex items-center gap-1">
                                                                <input
                                                                    autoFocus
                                                                    value={editValue}
                                                                    onChange={e => setEditValue(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') saveSigmaMeta(); if (e.key === 'Escape') setEditingCell(null); }}
                                                                    className="w-14 h-6 border border-neutral-300 text-center font-mono text-[11px] outline-none focus:border-black"
                                                                />
                                                                <button onClick={saveSigmaMeta} className="text-emerald-600 hover:text-emerald-800"><Check className="h-3 w-3" /></button>
                                                                <button onClick={() => setEditingCell(null)} className="text-neutral-300 hover:text-red-600"><X className="h-3 w-3" /></button>
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => startEdit(amostraKey, param.key, consensus.sigmaMeta)}
                                                                className="inline-flex items-center gap-1 hover:text-black"
                                                                title="Definir σ meta pra essa amostra/parâmetro"
                                                            >
                                                                {consensus.sigmaMeta !== null ? consensus.sigmaMeta.toFixed(param.decimals + 1) : '—'}
                                                                <Pencil className="h-2.5 w-2.5 opacity-40" />
                                                            </button>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>

                                        <tr className="border-t border-neutral-100 text-neutral-500">
                                            <td className="p-2 sticky left-0 bg-white whitespace-nowrap">Nº labs reportando</td>
                                            {perParam.map(({ param, consensus }) => (
                                                <td key={param.key} className="text-center p-2">{consensus.nLabsReportando}</td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* z-score por laboratório */}
                            <div className="border-t-2 border-neutral-200 p-4">
                                <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-mono mb-2">
                                    z-score por laboratório — |z|≤2 ok · 2–3 alerta · ≥3 fora
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs font-mono">
                                        <thead>
                                            <tr className="text-neutral-400 uppercase text-[9px] tracking-wider">
                                                <th className="text-left p-2 sticky left-0 bg-white">Laboratório</th>
                                                {PARAMS.map(p => <th key={p.key} className="text-center p-2">{p.label}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from(new Set(perParam.flatMap(pp => pp.consensus.labs.map(l => l.labId)))).map(labId => (
                                                <tr key={labId} className="border-t border-neutral-200">
                                                    <td className="p-2 font-bold text-black sticky left-0 bg-white whitespace-nowrap">
                                                        {labNameById[labId] || 'Laboratório'}
                                                    </td>
                                                    {perParam.map(({ param, consensus }) => {
                                                        const labResult = consensus.labs.find(l => l.labId === labId);
                                                        return (
                                                            <td key={param.key} className="text-center p-2">
                                                                {labResult && labResult.z !== null && labResult.status ? (
                                                                    <span className={`px-2 py-0.5 rounded font-bold ${STATUS_STYLE[labResult.status]}`}>
                                                                        {labResult.z.toFixed(2)}
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

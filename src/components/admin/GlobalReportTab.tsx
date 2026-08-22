import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { Download, Loader2, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LabService, type Lab } from "@/entities/Lab";
import { LoteService, type Lote } from "@/entities/Lote";
import { SampleService, type Sample } from "@/entities/Sample";

interface ReportRow {
    sampleId: string;
    labId: string;
    labNome: string;
    loteNome: string;
    analista: string;
    amostraId: string;
    etiqueta: string;
    mala: string;
    hvi: string;
    mic?: number;
    len?: number;
    unf?: number;
    str?: number;
    rd?: number;
    b?: number;
    cor: string;
    dataAnalise: string;
    horaAnalise: string;
    finalizada: boolean;
}

const COLOR_LABELS: Record<string, string> = {
    "#10b981": "Verde",
    "#f59e0b": "Amarelo",
    "#ef4444": "Vermelho",
    "#3b82f6": "Azul"
};

// Relatório geral (só admin_global): junta amostras + lotes + laboratórios de
// TODO o sistema numa tabela só, pra dar visão cruzada de tudo que já foi
// gerado — por laboratório, analista responsável, máquina, etiqueta e
// resultado — sem precisar entrar lote por lote. Dados continuam vindo das
// mesmas tabelas de sempre, isso é só uma junção read-only + export.
export default function GlobalReportTab() {
    const [labs, setLabs] = useState<Lab[]>([]);
    const [lotes, setLotes] = useState<Lote[]>([]);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [filterLabId, setFilterLabId] = useState("");
    const [filterAnalista, setFilterAnalista] = useState("");
    const [filterMachine, setFilterMachine] = useState("");
    const [search, setSearch] = useState("");

    useEffect(() => {
        setIsLoading(true);
        Promise.all([LabService.list(), LoteService.list(), SampleService.list()])
            .then(([labsData, lotesData, samplesData]) => {
                setLabs(labsData);
                setLotes(lotesData);
                setSamples(samplesData);
            })
            .finally(() => setIsLoading(false));
    }, []);

    const rows: ReportRow[] = useMemo(() => {
        const loteById = new Map(lotes.map(l => [l.id, l]));
        const labById = new Map(labs.map(l => [l.id, l]));

        return samples.map(s => {
            const lote = loteById.get(s.lote_id);
            const lab = lote?.lab_id ? labById.get(lote.lab_id) : undefined;
            return {
                sampleId: s.id,
                labId: lote?.lab_id || "",
                labNome: lab?.nome?.trim() || "Sem Laboratório",
                loteNome: lote?.nome || "—",
                analista: lote?.analista_responsavel || "—",
                amostraId: s.amostra_id,
                etiqueta: s.etiqueta || "",
                mala: s.mala || "",
                hvi: s.hvi || "",
                mic: s.mic, len: s.len, unf: s.unf, str: s.str, rd: s.rd, b: s.b,
                cor: s.cor || "",
                dataAnalise: s.data_analise || "",
                horaAnalise: s.hora_analise || "",
                finalizada: !!s.locked
            };
        });
    }, [samples, lotes, labs]);

    const analistaOptions = useMemo(() => {
        const set = new Set(rows.map(r => r.analista).filter(a => a && a !== "—"));
        return Array.from(set).sort();
    }, [rows]);

    const machineOptions = useMemo(() => {
        const set = new Set(rows.map(r => r.hvi).filter(Boolean));
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [rows]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (filterLabId && r.labId !== filterLabId) return false;
            if (filterAnalista && r.analista !== filterAnalista) return false;
            if (filterMachine && r.hvi !== filterMachine) return false;
            if (q && !r.etiqueta.toLowerCase().includes(q) && !r.mala.toLowerCase().includes(q) && !r.loteNome.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [rows, filterLabId, filterAnalista, filterMachine, search]);

    const summaryByLab = useMemo(() => {
        const map = new Map<string, number>();
        filteredRows.forEach(r => map.set(r.labNome, (map.get(r.labNome) || 0) + 1));
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [filteredRows]);

    const handleExportExcel = () => {
        const headers = [
            "Laboratório", "Lote", "Analista Responsável", "Amostra", "Etiqueta", "Mala",
            "Máquina HVI", "MIC", "LEN", "UNF", "STR", "RD", "+B", "Classificação", "Data", "Hora", "Status"
        ];
        const wsData = [headers, ...filteredRows.map(r => [
            r.labNome, r.loteNome, r.analista, r.amostraId, r.etiqueta, r.mala, r.hvi,
            r.mic ?? "", r.len ?? "", r.unf ?? "", r.str ?? "", r.rd ?? "", r.b ?? "",
            COLOR_LABELS[r.cor] || r.cor || "", r.dataAnalise, r.horaAnalise,
            r.finalizada ? "Finalizada" : "Pendente"
        ])];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Relatorio Geral");
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
        XLSX.writeFile(wb, `Relatorio_Geral_ORIGO_${stamp}.xlsx`);
    };

    if (isLoading) {
        return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-neutral-400" /></div>;
    }

    return (
        <div className="space-y-8">
            <p className="text-xs text-neutral-500 max-w-2xl">
                Visão geral de tudo que foi gerado em todos os laboratórios — cada linha é uma
                amostra, com laboratório, analista responsável pelo lote, máquina, etiqueta e
                resultado. Filtre e exporte pra Excel.
            </p>

            {/* Resumo por laboratório */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="p-5 border border-black bg-black text-white">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">Total de Amostras</p>
                    <p className="text-3xl font-serif mt-1">{filteredRows.length}</p>
                </div>
                {summaryByLab.slice(0, 3).map(([labNome, count]) => (
                    <div key={labNome} className="p-5 border border-neutral-200 bg-white">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 truncate">{labNome}</p>
                        <p className="text-3xl font-serif mt-1 text-black">{count}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-4 p-5 border border-neutral-200 bg-neutral-50">
                <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Laboratório</label>
                    <select
                        value={filterLabId}
                        onChange={e => setFilterLabId(e.target.value)}
                        className="h-10 px-3 border border-neutral-300 text-xs font-mono uppercase bg-white focus:outline-none focus:border-black min-w-[180px]"
                        title="Filtrar por laboratório"
                    >
                        <option value="">Todos os Laboratórios</option>
                        {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Analista</label>
                    <select
                        value={filterAnalista}
                        onChange={e => setFilterAnalista(e.target.value)}
                        className="h-10 px-3 border border-neutral-300 text-xs font-mono uppercase bg-white focus:outline-none focus:border-black min-w-[180px]"
                        title="Filtrar por analista responsável"
                    >
                        <option value="">Todos os Analistas</option>
                        {analistaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Máquina</label>
                    <select
                        value={filterMachine}
                        onChange={e => setFilterMachine(e.target.value)}
                        className="h-10 px-3 border border-neutral-300 text-xs font-mono uppercase bg-white focus:outline-none focus:border-black min-w-[140px]"
                        title="Filtrar por máquina HVI"
                    >
                        <option value="">Todas as Máquinas</option>
                        {machineOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="space-y-1 flex-1 min-w-[200px]">
                    <label className="text-[9px] font-bold uppercase text-neutral-400 tracking-widest">Buscar (etiqueta, mala, lote)</label>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Digite pra buscar..."
                        className="h-10 w-full px-3 border border-neutral-300 text-xs font-mono bg-white focus:outline-none focus:border-black"
                    />
                </div>
                <Button
                    onClick={handleExportExcel}
                    disabled={filteredRows.length === 0}
                    className="h-10 px-6 rounded-none bg-black text-white hover:bg-neutral-800 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2"
                >
                    <Download className="h-3.5 w-3.5" /> Exportar Excel
                </Button>
            </div>

            {/* Tabela */}
            <div className="border border-black overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-white z-10">
                        <tr className="border-b-2 border-black">
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Laboratório</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Lote</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Analista</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Etiqueta</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Mala</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Máquina</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest text-right">MIC</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest text-right">LEN</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest text-right">UNF</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest text-right">STR</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest text-right">RD</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest text-right">+B</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Data</th>
                            <th className="py-3 px-3 font-bold uppercase tracking-widest">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {filteredRows.map(r => (
                            <tr key={r.sampleId} className="hover:bg-neutral-50">
                                <td className="py-2 px-3 font-bold">{r.labNome}</td>
                                <td className="py-2 px-3 font-mono text-neutral-600">{r.loteNome}</td>
                                <td className="py-2 px-3">{r.analista}</td>
                                <td className="py-2 px-3 font-mono text-neutral-600 truncate max-w-[160px]">{r.etiqueta || "—"}</td>
                                <td className="py-2 px-3 font-mono text-neutral-600">{r.mala || "—"}</td>
                                <td className="py-2 px-3 font-mono">{r.hvi || "—"}</td>
                                <td className="py-2 px-3 text-right font-mono">{r.mic?.toFixed(2) ?? "—"}</td>
                                <td className="py-2 px-3 text-right font-mono">{r.len?.toFixed(2) ?? "—"}</td>
                                <td className="py-2 px-3 text-right font-mono">{r.unf?.toFixed(1) ?? "—"}</td>
                                <td className="py-2 px-3 text-right font-mono">{r.str?.toFixed(1) ?? "—"}</td>
                                <td className="py-2 px-3 text-right font-mono">{r.rd?.toFixed(1) ?? "—"}</td>
                                <td className="py-2 px-3 text-right font-mono">{r.b?.toFixed(1) ?? "—"}</td>
                                <td className="py-2 px-3 font-mono text-neutral-500 whitespace-nowrap">{r.dataAnalise || "—"}</td>
                                <td className="py-2 px-3">
                                    <span className={cn(
                                        "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                                        r.finalizada ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                                    )}>
                                        {r.finalizada ? "Finalizada" : "Pendente"}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredRows.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 p-16 text-neutral-400">
                        <FileSearch className="h-8 w-8" />
                        <p className="text-xs font-mono uppercase tracking-widest">Nenhuma amostra encontrada com esses filtros.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

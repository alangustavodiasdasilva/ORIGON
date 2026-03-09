import { useState, useRef, useEffect, useCallback } from "react";
import {
    Upload, Users, Sun, Moon, Trophy, TrendingUp, Calendar,
    ChevronUp, ChevronDown, Loader2, FileSpreadsheet, Star,
    BarChart3, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/AuthContext";
import { LabService, type Lab } from "@/entities/Lab";

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Operador {
    matricula: string;
    nome: string;
    amostras: number;
}

interface TurnoData {
    operadores: Operador[];
    total: number;
}

interface DiaData {
    data: string;          // "DD/MM"
    dataFull: string;      // "YYYY-MM-DD"
    diaSemana: string;
    turnos: Record<string, TurnoData>;
    totalDia: number;
}

interface ReportState {
    laboratorio: string;
    periodo: string;
    dias: DiaData[];
    ranking: { nome: string; matricula: string; total: number; dias: number }[];
    totalGeral: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function serialToDate(serial: number) {
    const epoch = new Date(1900, 0, 0);
    const d = new Date(epoch.getTime() + (serial - 1) * 86400000);
    return d;
}

function parsePlanilha(wb: XLSX.WorkBook): ReportState | null {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: (any[])[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let laboratorio = "";
    let periodo = "";

    // Extrai metadados do cabeçalho
    for (let i = 0; i < Math.min(10, raw.length); i++) {
        const row = raw[i];
        if (!row) continue;
        const joined = row.filter(Boolean).join(" ");
        if (joined.toLowerCase().includes("laboratório") || joined.toLowerCase().includes("laboratorio")) {
            laboratorio = String(row[5] || row[4] || row[3] || "").trim();
        }
        if (joined.toLowerCase().includes("período") || joined.toLowerCase().includes("periodo") || joined.toLowerCase().includes("a ")) {
            const possible = String(row[5] || row[4] || row[3] || "").trim();
            if (possible.match(/\d{2}\/\d{2}/)) periodo = possible;
        }
    }

    const dias: DiaData[] = [];
    const operadorMap: Record<string, { nome: string; matricula: string; total: number; dias: number }> = {};

    let currentDate: Date | null = null;
    let currentTurno = "";
    let diaAtual: DiaData | null = null;

    for (let i = 0; i < raw.length; i++) {
        const row = raw[i];
        if (!row || !row.some((v: any) => v !== null)) continue;

        const col1 = row[1];
        const col2 = row[2];
        const col3 = row[3];
        const col4 = row[4];
        const col5 = row[5];

        // Nova data (serial Excel > 40000)
        if (col1 && typeof col1 === "number" && col1 > 40000 && col1 < 60000) {
            if (diaAtual && diaAtual.totalDia > 0) dias.push(diaAtual);
            currentDate = serialToDate(col1);
            const dd = String(currentDate.getDate()).padStart(2, "0");
            const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
            const yyyy = currentDate.getFullYear();
            diaAtual = {
                data: `${dd}/${mm}`,
                dataFull: `${yyyy}-${mm}-${dd}`,
                diaSemana: DIAS_SEMANA[currentDate.getDay()],
                turnos: {},
                totalDia: 0,
            };
            currentTurno = "";
        }

        // Novo turno
        if (col2 && String(col2).toUpperCase().includes("TURNO")) {
            currentTurno = String(col2).trim();
            if (diaAtual && !diaAtual.turnos[currentTurno]) {
                diaAtual.turnos[currentTurno] = { operadores: [], total: 0 };
            }
        }

        // Linha de operador (tem código + amostras numéricas)
        if (
            col3 && col4 && typeof col4 === "number" &&
            !String(col3).toLowerCase().includes("total")
        ) {
            const strCol3 = String(col3).trim();
            // Extrai matrícula e nome
            const sepMatch = strCol3.match(/^(\d+)[\s\-]+(.+)$/);
            const matricula = sepMatch ? sepMatch[1].trim() : strCol3.split(" ")[0];
            const nome = sepMatch ? sepMatch[2].trim() : strCol3.replace(/^\d+[\s\-]*/, "").trim() || strCol3;

            if (diaAtual && currentTurno && diaAtual.turnos[currentTurno]) {
                diaAtual.turnos[currentTurno].operadores.push({ matricula, nome, amostras: col4 });
            }

            // Ranking acumulado
            const key = nome;
            if (!operadorMap[key]) operadorMap[key] = { nome, matricula, total: 0, dias: 0 };
            operadorMap[key].total += col4;
            operadorMap[key].dias += 1;
        }

        // Total do turno
        if (String(col3 || "").toLowerCase().includes("total do turno") && col5) {
            if (diaAtual && currentTurno && diaAtual.turnos[currentTurno]) {
                diaAtual.turnos[currentTurno].total = typeof col5 === "number" ? col5 : parseInt(String(col5));
            }
        }

        // Total do dia
        if (String(col3 || "").toLowerCase().includes("total do dia") && col5) {
            if (diaAtual) diaAtual.totalDia = typeof col5 === "number" ? col5 : parseInt(String(col5));
        }
    }
    if (diaAtual && diaAtual.totalDia > 0) dias.push(diaAtual);

    const ranking = Object.values(operadorMap)
        .sort((a, b) => b.total - a.total);
    const totalGeral = dias.reduce((acc, d) => acc + (d.totalDia || 0), 0);

    return { laboratorio, periodo, dias, ranking, totalGeral };
}

// ── Guard: admin_global sem lab selecionado ──────────────────────────────
// (inline na renderização, igual à Verificação)

const STORAGE_KEY_PREFIX = "origon_producao_relatorio";
function getStorageKey(labId: string | undefined) {
    return labId ? `${STORAGE_KEY_PREFIX}_${labId}` : STORAGE_KEY_PREFIX;
}

// ── Componente Principal ───────────────────────────────────────────────────
export default function ProducaoOperadores() {
    const { user, currentLab, selectLab } = useAuth();
    const [labs, setLabs] = useState<Lab[]>([]);
    const [report, setReport] = useState<ReportState | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [activeTab, setActiveTab] = useState<"ranking" | "turnos" | "diario">("ranking");
    const [isDragging, setIsDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const isAdmin = user?.acesso === 'admin_global';
    const storageKey = getStorageKey(currentLab?.id);

    // Carrega lista de labs (apenas para admin)
    useEffect(() => {
        if (isAdmin) {
            LabService.list().then(setLabs).catch(console.error);
        }
    }, [isAdmin]);

    // ── Restaurar dados do localStorage ao montar / ao trocar de lab ─────────
    useEffect(() => {
        setReport(null); // limpa ao trocar de lab
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) setReport(JSON.parse(saved));
        } catch { /* ignora JSON inválido */ }
    }, [storageKey]);

    const handleFile = async (file: File) => {
        setIsLoading(true);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: "array" });
            const data = parsePlanilha(wb);
            if (data) {
                setReport(data);
                // Salva no localStorage isolado por lab
                try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* quota */ }
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ── Drag & drop handlers ───────────────────────────────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
            handleFile(file);
        }
    }, []);

    const TURNO_COLORS: Record<string, string> = {
        "TURNO 1": "text-amber-600",
        "TURNO 2": "text-orange-500",
        "TURNO 3": "text-indigo-600",
    };
    const TURNO_BG: Record<string, string> = {
        "TURNO 1": "bg-amber-50 border-amber-100",
        "TURNO 2": "bg-orange-50 border-orange-100",
        "TURNO 3": "bg-indigo-50 border-indigo-100",
    };

    const sortedRanking = report
        ? [...report.ranking].sort((a, b) => sortDir === "desc" ? b.total - a.total : a.total - b.total)
        : [];

    // ── Ranking por Turno (acumulado no período) ───────────────────────────
    const rankingPorTurno = report
        ? (() => {
            const map: Record<string, Record<string, { nome: string; matricula: string; total: number }>> = {};
            for (const dia of report.dias) {
                for (const [turnoNome, turnoData] of Object.entries(dia.turnos)) {
                    if (!map[turnoNome]) map[turnoNome] = {};
                    for (const op of turnoData.operadores) {
                        const key = op.nome;
                        if (!map[turnoNome][key]) map[turnoNome][key] = { nome: op.nome, matricula: op.matricula, total: 0 };
                        map[turnoNome][key].total += op.amostras;
                    }
                }
            }
            return Object.fromEntries(
                Object.entries(map).map(([t, ops]) => [
                    t,
                    Object.values(ops).sort((a, b) => b.total - a.total)
                ])
            );
        })()
        : {};

    const turnoNames = report ? Object.keys(rankingPorTurno).sort() : [];

    const medalhas = ["🥇", "🥈", "🥉"];
    const maxTotal = sortedRanking[0]?.total || 1;

    // ── Guard: admin sem lab selecionado vê tela de seleção (padrão ORIGON) ────
    if (isAdmin && !currentLab) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-12 animate-fade-in text-black">
                <div className="inline-flex p-4 bg-black rounded-2xl shadow-2xl"><FileSpreadsheet className="h-12 w-12 text-white" /></div>
                <h1 className="text-5xl font-serif">Selecione o Laboratório</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-7xl">
                    {labs.map((lab) => (
                        <button key={lab.id} onClick={() => selectLab(lab.id)} className="group relative flex flex-col p-8 bg-white border-2 border-neutral-200 hover:border-black rounded-2xl transition-all duration-300 text-left hover:shadow-xl hover:-translate-y-1">
                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="h-6 w-6 text-black" /></div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Laboratório</span>
                            <h3 className="text-xl font-bold text-black group-hover:underline">{lab.nome}</h3>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // ── ESTADO: SEM ARQUIVO ──────────────────────────────────────────────────
    if (!report) {
        return (
            <div className="w-full py-8 text-black pb-24">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 mb-8 pb-8 border-b border-black">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-black text-white flex items-center justify-center rounded-lg">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Produção</span>
                            <h1 className="text-3xl font-serif">Operadores por Turno</h1>
                            {currentLab && <p className="text-sm text-neutral-400 mt-0.5">{currentLab.nome}</p>}
                        </div>
                    </div>
                    {/* Seletor de lab (admin) */}
                    {isAdmin && (
                        <div className="relative">
                            <select
                                title="Trocar Laboratório"
                                className="h-10 border border-neutral-200 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#1c3664] bg-white pl-4 pr-8 appearance-none cursor-pointer shadow-sm hover:border-[#1c3664] transition-colors outline-none"
                                value={currentLab?.id || ""}
                                onChange={(e) => { if (e.target.value) selectLab(e.target.value); }}
                            >
                                <option value="" disabled>Selecione o Lab</option>
                                {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-neutral-400 pointer-events-none" />
                        </div>
                    )}
                </div>

                {/* Drop Zone */}
                <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                        "group border-2 border-dashed rounded-[2rem] p-20",
                        "flex flex-col items-center justify-center gap-6 cursor-pointer",
                        "transition-all duration-300",
                        isDragging
                            ? "border-black bg-neutral-100 scale-[1.01]"
                            : "border-neutral-200 hover:border-black hover:bg-neutral-50"
                    )}
                >
                    {isLoading ? (
                        <Loader2 className="h-14 w-14 text-black animate-spin" />
                    ) : isDragging ? (
                        <div className="h-20 w-20 bg-black rounded-2xl flex items-center justify-center">
                            <FileSpreadsheet className="h-10 w-10 text-white" />
                        </div>
                    ) : (
                        <div className="h-20 w-20 bg-neutral-100 group-hover:bg-black rounded-2xl flex items-center justify-center transition-all duration-300">
                            <FileSpreadsheet className="h-10 w-10 text-neutral-500 group-hover:text-white transition-colors" />
                        </div>
                    )}
                    <div className="text-center">
                        <p className="font-serif text-2xl text-black mb-2">
                            {isLoading ? "Processando arquivo..." : isDragging ? "Solte o arquivo aqui!" : "Importar Relatório de Produção"}
                        </p>
                        <p className="text-sm text-neutral-400">
                            Clique para selecionar ou arraste a planilha Excel (.xlsx)
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-300 mt-3">
                            Formato: Produção_Operador_Turno.xlsx
                        </p>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        title="Selecionar relatório de produção"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                </div>
            </div>
        );
    }

    // ── RELATÓRIO ──────────────────────────────────────────────────────────
    return (
        <div className="w-full py-8 text-black pb-24">

            {/* ── HEADER ──────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-8 border-b border-black">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-black text-white flex items-center justify-center rounded-lg">
                        <Users className="h-6 w-6" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Produção</span>
                        <h1 className="text-3xl font-serif">Operadores por Turno</h1>
                        <p className="text-sm text-neutral-400 mt-0.5">
                            {currentLab && <span className="font-medium text-black">{currentLab.nome}</span>}
                            {report.periodo && <span className="ml-2 text-neutral-400">· {report.periodo}</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Seletor de lab (admin) */}
                    {isAdmin && (
                        <div className="relative">
                            <select
                                title="Trocar Laboratório"
                                className="h-10 border border-neutral-200 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#1c3664] bg-white pl-4 pr-8 appearance-none cursor-pointer shadow-sm hover:border-[#1c3664] transition-colors outline-none"
                                value={currentLab?.id || ""}
                                onChange={(e) => { if (e.target.value) selectLab(e.target.value); }}
                            >
                                <option value="" disabled>Selecione o Lab</option>
                                {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-3 h-4 w-4 text-neutral-400 pointer-events-none" />
                        </div>
                    )}
                    <Button
                        variant="outline"
                        className="text-black border-neutral-200 hover:bg-neutral-50"
                        onClick={() => {
                            setReport(null);
                            try { localStorage.removeItem(storageKey); } catch { /* noop */ }
                        }}
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Trocar Arquivo
                    </Button>
                </div>
            </div>

            {/* ── KPI CARDS ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* Total Amostras */}
                <div className="group bg-black p-7 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all duration-500 hover:-translate-y-1 col-span-2 lg:col-span-1">
                    <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-opacity rotate-12 group-hover:rotate-0 duration-700">
                        <BarChart3 className="h-32 w-32 text-white" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 relative z-10">Total Amostras</span>
                    <div className="text-4xl font-serif text-white mt-2 mb-1 tabular-nums relative z-10">
                        {report.totalGeral.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight relative z-10">Período completo</div>
                </div>

                {/* Dias Trabalhados */}
                <div className="group bg-white border border-neutral-200 p-7 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Dias</span>
                        <div className="h-8 w-8 rounded-full bg-neutral-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Calendar className="h-4 w-4 text-neutral-500" />
                        </div>
                    </div>
                    <div className="text-4xl font-serif text-black mb-1 tabular-nums">{report.dias.length}</div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Trabalhados</div>
                </div>

                {/* Média/Dia */}
                <div className="group bg-white border border-neutral-200 p-7 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Média/Dia</span>
                        <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <TrendingUp className="h-4 w-4 text-amber-500" />
                        </div>
                    </div>
                    <div className="text-4xl font-serif text-black mb-1 tabular-nums">
                        {report.dias.length > 0 ? Math.round(report.totalGeral / report.dias.length).toLocaleString("pt-BR") : "-"}
                    </div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Amostras/dia</div>
                </div>

                {/* Operadores */}
                <div className="group bg-white border border-neutral-200 p-7 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Operadores</span>
                        <div className="h-8 w-8 rounded-full bg-neutral-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Users className="h-4 w-4 text-neutral-500" />
                        </div>
                    </div>
                    <div className="text-4xl font-serif text-black mb-1 tabular-nums">{report.ranking.length}</div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">No período</div>
                </div>
            </div>

            {/* ── TABS ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 bg-neutral-100 p-1.5 rounded-xl border border-neutral-200/50 w-fit mb-8">
                {[
                    { id: "ranking", label: "Ranking Geral", icon: Trophy },
                    { id: "turnos", label: "Por Turno", icon: Sun },
                    { id: "diario", label: "Resumo Diário", icon: Calendar },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id as any)}
                        className={cn(
                            "h-9 px-5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-2",
                            activeTab === id
                                ? "bg-white shadow-sm text-black"
                                : "text-neutral-400 hover:text-black"
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* ── RANKING ─────────────────────────────────────────────────── */}
            {activeTab === "ranking" && (
                <div className="bg-white border border-neutral-200 rounded-[1.5rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in duration-300">
                    <div className="flex items-center justify-between px-8 py-6 border-b border-neutral-100">
                        <div className="flex items-center gap-3">
                            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                            <h3 className="text-xl font-serif">Ranking Geral de Operadores</h3>
                        </div>
                        <button
                            onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-black transition-colors"
                        >
                            {sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                            {sortDir === "desc" ? "Maior Primeiro" : "Menor Primeiro"}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-neutral-50 text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                                <tr>
                                    <th className="p-4 rounded-l-xl pl-8">#</th>
                                    <th className="p-4">Operador</th>
                                    <th className="p-4 hidden md:table-cell w-64">Desempenho</th>
                                    <th className="p-4 text-right">Total</th>
                                    <th className="p-4 text-right">Dias</th>
                                    <th className="p-4 text-right pr-8 rounded-r-xl">Média/Dia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {sortedRanking.map((op, i) => {
                                    const pct = (op.total / maxTotal) * 100;
                                    const avgDia = op.dias > 0 ? Math.round(op.total / op.dias) : 0;
                                    const isTop = sortDir === "desc" ? i < 3 : false;
                                    return (
                                        <tr key={op.nome} className="hover:bg-neutral-50/50 transition-colors group">
                                            <td className="p-4 pl-8">
                                                <span className={cn(
                                                    "text-[11px] font-bold",
                                                    i === 0 && sortDir === "desc" ? "text-amber-500" :
                                                        i === 1 && sortDir === "desc" ? "text-neutral-400" :
                                                            i === 2 && sortDir === "desc" ? "text-orange-400" : "text-neutral-300"
                                                )}>
                                                    {isTop ? medalhas[i] : `#${i + 1}`}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-neutral-800 tracking-wider text-[11px]">{op.nome}</div>
                                                <div className="text-[10px] text-neutral-400 font-mono mt-0.5">{op.matricula}</div>
                                            </td>
                                            <td className="p-4 hidden md:table-cell">
                                                <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-black rounded-full transition-all duration-700"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold">
                                                {op.total.toLocaleString("pt-BR")}
                                            </td>
                                            <td className="p-4 text-right text-neutral-400 text-[12px]">
                                                {op.dias}d
                                            </td>
                                            <td className="p-4 text-right pr-8">
                                                <span className="inline-flex items-center justify-center bg-neutral-100 text-neutral-700 font-mono font-bold text-[11px] rounded-full px-3 py-1">
                                                    {avgDia.toLocaleString("pt-BR")}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── RANKING POR TURNO ────────────────────────────────────────── */}
            {activeTab === "turnos" && (
                <div className="animate-in fade-in duration-300 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-6">
                        Produção acumulada por operador em cada turno · {report.dias.length} dias
                    </p>
                    <div className={cn(
                        "grid gap-4",
                        turnoNames.length === 3 ? "grid-cols-1 lg:grid-cols-3" :
                            turnoNames.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                    )}>
                        {turnoNames.map((turnoNome) => {
                            const ops = rankingPorTurno[turnoNome] || [];
                            const maxT = ops[0]?.total || 1;
                            const colorClass = TURNO_COLORS[turnoNome] || "text-neutral-600";
                            const bgClass = TURNO_BG[turnoNome] || "bg-neutral-50 border-neutral-100";
                            const Icon = turnoNome.includes("1") ? Sun : turnoNome.includes("2") ? Sun : Moon;
                            const totalTurno = ops.reduce((s, o) => s + o.total, 0);
                            return (
                                <div key={turnoNome} className="bg-white border border-neutral-200 rounded-[1.5rem] overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
                                    {/* Cabeçalho do turno */}
                                    <div className={cn("flex items-center justify-between px-6 py-4 border-b", bgClass)}>
                                        <div className="flex items-center gap-2">
                                            <Icon className={cn("h-4 w-4", colorClass)} />
                                            <span className={cn("text-[10px] font-black uppercase tracking-widest", colorClass)}>{turnoNome}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-sm">{totalTurno.toLocaleString("pt-BR")}</div>
                                            <div className="text-[9px] text-neutral-400 uppercase tracking-widest">{ops.length} operadores</div>
                                        </div>
                                    </div>

                                    {/* Lista de operadores */}
                                    <div className="divide-y divide-neutral-50">
                                        {ops.map((op, i) => {
                                            const pct = (op.total / maxT) * 100;
                                            return (
                                                <div key={op.nome} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50/60 transition-colors">
                                                    <span className={cn(
                                                        "text-[11px] font-bold w-5 text-center flex-shrink-0",
                                                        i === 0 ? "text-amber-500" : i === 1 ? "text-neutral-400" : i === 2 ? "text-orange-400" : "text-neutral-300"
                                                    )}>
                                                        {i < 3 ? medalhas[i] : `${i + 1}`}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <span className="text-[10px] font-bold text-neutral-700 truncate" title={op.nome}>
                                                                {op.nome.split(" ").slice(0, 2).join(" ")}
                                                            </span>
                                                            <span className="text-[10px] font-mono font-bold ml-2 flex-shrink-0">
                                                                {op.total.toLocaleString("pt-BR")}
                                                            </span>
                                                        </div>
                                                        <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-black rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── RESUMO DIÁRIO ────────────────────────────────────────────── */}
            {activeTab === "diario" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {report.dias.map((dia) => {
                        const turnoNames = Object.keys(dia.turnos);
                        const maxTurnoTotal = Math.max(...turnoNames.map(t => dia.turnos[t].total || 0), 1);

                        return (
                            <div
                                key={dia.dataFull}
                                className="bg-white border border-neutral-200 rounded-[1.5rem] overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all"
                            >
                                {/* Header do dia */}
                                <div className="flex items-center justify-between px-7 py-5 border-b border-neutral-100 bg-neutral-50/50">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 bg-black text-white rounded-xl flex flex-col items-center justify-center leading-none">
                                            <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">{dia.diaSemana}</span>
                                            <span className="text-sm font-serif">{dia.data.split("/")[0]}</span>
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">{dia.diaSemana}</div>
                                            <div className="font-serif text-xl">{dia.data}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total do Dia</div>
                                        <div className="text-2xl font-serif tabular-nums">{(dia.totalDia || 0).toLocaleString("pt-BR")}</div>
                                        <div className="text-[10px] text-neutral-400">amostras</div>
                                    </div>
                                </div>

                                {/* Turnos */}
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {turnoNames.map((turnoNome) => {
                                        const turno = dia.turnos[turnoNome];
                                        const pctTurno = maxTurnoTotal > 0 ? (turno.total / maxTurnoTotal) * 100 : 0;
                                        const Icon = turnoNome.includes("1") ? Sun : turnoNome.includes("2") ? Sun : Moon;
                                        const colorClass = TURNO_COLORS[turnoNome] || "text-neutral-600";
                                        const bgClass = TURNO_BG[turnoNome] || "bg-neutral-50 border-neutral-100";

                                        return (
                                            <div key={turnoNome} className={cn("rounded-2xl border p-5", bgClass)}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <Icon className={cn("h-4 w-4", colorClass)} />
                                                        <span className={cn("text-[10px] font-black uppercase tracking-widest", colorClass)}>
                                                            {turnoNome}
                                                        </span>
                                                    </div>
                                                    <span className="font-mono font-bold text-sm">
                                                        {(turno.total || 0).toLocaleString("pt-BR")}
                                                    </span>
                                                </div>

                                                {/* Barra do turno */}
                                                <div className="h-1 bg-white/80 rounded-full mb-4 overflow-hidden">
                                                    <div
                                                        className="h-full bg-black rounded-full"
                                                        style={{ width: `${pctTurno}%` }}
                                                    />
                                                </div>

                                                {/* Operadores do turno */}
                                                <div className="space-y-1.5">
                                                    {turno.operadores.slice(0, 10).map((op, oi) => {
                                                        const maxOp = Math.max(...turno.operadores.map(o => o.amostras), 1);
                                                        const pctOp = (op.amostras / maxOp) * 100;
                                                        return (
                                                            <div key={oi} className="flex items-center gap-2">
                                                                <span className="text-[9px] text-neutral-400 w-3 font-mono">{oi + 1}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center justify-between mb-0.5">
                                                                        <span className="text-[10px] font-bold text-neutral-700 truncate max-w-[120px]" title={op.nome}>
                                                                            {op.nome.split(" ").slice(0, 2).join(" ")}
                                                                        </span>
                                                                        <span className="text-[10px] font-mono font-bold text-neutral-600 ml-1 flex-shrink-0">
                                                                            {op.amostras.toLocaleString("pt-BR")}
                                                                        </span>
                                                                    </div>
                                                                    <div className="h-0.5 bg-white/60 rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-neutral-400 rounded-full"
                                                                            style={{ width: `${pctOp}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

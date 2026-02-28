import { useState, useRef, useEffect } from "react";
import {
    Search,
    Upload,
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Table2,
    BarChart3,
    FileSpreadsheet,
    ArrowRight,
    RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as xlsx from "xlsx";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { LabService } from "@/entities/Lab";
import { verificacaoService } from "@/services/verificacao.service";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer
} from "recharts";

// Tipagem baseada na imagem fornecida e no cabeçalho comum do HVI
interface Amostra {
    id: string; // Para controle interno (ex: Referência ou Etiqueta)
    referencia: string;
    etiqueta: string;
    pesoKg: number;
    data: string;
    entrada: string;
    acondicionado: string;
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    maisB: number;
    area: number;
    count: number;
    elg: number;
    sfi: number;
    mat: number;
    tolerancias?: {
        mic: number;
        len: number;
        unf: number;
        str: number;
        rd: number;
        maisB: number;
    };
}

interface Analise {
    id: string; // id único
    amostraId: string; // Relacionamento com a amostra
    hvi: string;
    data: string;
    turno: string;
    operador: string;
    tipo: 'Análise' | 'Média';
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    maisB: number;
    area: number;
    count: number;
    elg: number;
    sfi: number;
    mat: number;

    // Flags de anomalia (só para exibição)
    isAnomalous?: boolean;
    anomalousFields?: string[];
}

export default function Verificacao() {
    const { addToast } = useToast();
    const { user, currentLab, selectLab } = useAuth();
    const labId = currentLab?.id || user?.lab_id || (user?.acesso === 'admin_global' ? 'all' : undefined);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [labs, setLabs] = useState<any[]>([]);
    useEffect(() => { if (user?.acesso === 'admin_global') { const fn = async () => { const l = await LabService.list(); setLabs(l); }; fn(); } }, [user]);

    const [amostras, setAmostras] = useState<Amostra[]>([]);
    const [analises, setAnalises] = useState<Analise[]>([]);
    const [amostraSelecionada, setAmostraSelecionada] = useState<string | null>(null); // ID da amostra
    const [abaPrincipal, setAbaPrincipal] = useState<'tabela' | 'graficos'>('tabela');
    const [metricaGraficoSelecionada, setMetricaGraficoSelecionada] = useState<keyof Analise>("mic");

    const [filtroReferencia, setFiltroReferencia] = useState("");
    const [filtroEtiqueta, setFiltroEtiqueta] = useState("");
    const [filtroHVI, setFiltroHVI] = useState("");
    const [filtroTurno, setFiltroTurno] = useState("");
    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");

    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const clearFilters = () => {
        setFiltroReferencia("");
        setFiltroEtiqueta("");
        setFiltroHVI("");
        setFiltroTurno("");
        setDataInicio("");
        setDataFim("");
    };

    // Load do Supabase com Fallback Local (Padrão Operação)
    const loadData = async () => {
        if (!labId || labId === 'all') return;

        setIsLoading(true);
        const today = new Date().toDateString();

        try {
            const cloudState = await verificacaoService.get(labId, today);
            if (cloudState) {
                setAmostras(cloudState.amostras);
                setAnalises(cloudState.analises);
                if (cloudState.amostras.length > 0) {
                    setAmostraSelecionada(cloudState.amostras[0].id);
                }
                setIsLoading(false);
                return;
            }
        } catch (e) {
            console.error("Erro ao carregar dados da nuvem:", e);
        }

        // Caso não tenha na nuvem ou falhe, as amostras ficam vazias (padrão dia novo)
        setAmostras([]);
        setAnalises([]);
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [labId]);

    const handleSync = async () => {
        addToast({ title: "Sincronizando...", description: "Buscando dados na nuvem para " + (currentLab?.nome || "laboratório"), type: "info" });
        await loadData();
        addToast({ title: "Sincronizado", description: "Dados atualizados com sucesso.", type: "success" });
    };

    // Função Real para Ler o Excel importado pelo usuário
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!labId || labId === 'all') {
            addToast({
                title: "Laboratório Requerido",
                description: "Por favor, selecione um laboratório específico antes de importar dados.",
                type: "warning"
            });
            return;
        }

        setIsLoading(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = xlsx.read(data, { type: 'array', cellDates: true });

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                const jsonData = xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

                const formatDate = (val: unknown) => {
                    if (!val) return "";
                    // Se o Excel converter nativamente ou for um objeto Date
                    if (val instanceof Date) {
                        const d = val.getUTCDate().toString().padStart(2, '0');
                        const m = (val.getUTCMonth() + 1).toString().padStart(2, '0');
                        const y = val.getUTCFullYear();
                        const h = val.getUTCHours().toString().padStart(2, '0');
                        const min = val.getUTCMinutes().toString().padStart(2, '0');
                        return `${d}/${m}/${y} ${h}:${min}`;
                    }
                    // Se for serial de excel mantido como string/numero e falhar no check isDate
                    if (typeof val === 'number') {
                        const date = new Date((val - 25569) * 86400 * 1000);
                        const d = date.getUTCDate().toString().padStart(2, '0');
                        const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
                        const y = date.getUTCFullYear();
                        const h = date.getUTCHours().toString().padStart(2, '0');
                        const min = date.getUTCMinutes().toString().padStart(2, '0');
                        return `${d}/${m}/${y} ${h}:${min}`;
                    }
                    return String(val);
                };

                const parseBrNumber = (val: unknown) => {
                    if (typeof val === 'number') return val;
                    if (!val && val !== 0) return 0;
                    const strVal = String(val).replace(',', '.').trim();
                    const num = Number(strVal);
                    return isNaN(num) ? 0 : num;
                };

                const determinarTurno = (dataString: string) => {
                    const partes = dataString.split(' ');
                    if (partes.length < 2) return "";
                    const time = partes[1]; // HH:mm
                    const [h, m] = time.split(':').map(Number);
                    if (isNaN(h) || isNaN(m)) return "";

                    const totalMinutes = h * 60 + m;
                    const minT1 = 7 * 60; // 07:00 = 420
                    const maxT1 = 15 * 60 + 20; // 15:20 = 920
                    const maxT2 = 23 * 60 + 20; // 23:20 = 1400

                    if (totalMinutes >= minT1 && totalMinutes < maxT1) return "Turno 1";
                    if (totalMinutes >= maxT1 && totalMinutes < maxT2) return "Turno 2";
                    return "Turno 3"; // From 23:20 forward, and back to 07:00
                };

                const parsedAmostras: Amostra[] = [];
                const parsedAnalises: Analise[] = [];

                if (jsonData && jsonData.length > 0) {
                    jsonData.forEach((row, index) => {
                        // Função helper para buscar valor das colunas com case e espaço flexível
                        const getVal = (possibleKeys: string[]) => {
                            const rowKeys = Object.keys(row);
                            for (const pk of possibleKeys) {
                                const match = rowKeys.find(k => k.trim().toLowerCase() === pk.trim().toLowerCase());
                                if (match && row[match] !== undefined && row[match] !== "") return row[match];
                            }
                            return undefined;
                        };

                        const keysFallback = Object.keys(row);
                        const firstKey = keysFallback.length > 0 ? keysFallback[0] : '';

                        const refVal = getVal(["ref", "referência", "referencia", "amostra", "lote", "id", "identificador", "barcode"]) || row[firstKey];
                        const ref = refVal ? String(refVal).trim() : 'N/A';

                        const etiqVal = getVal(["etiqueta", "barcode", "código", "codigo"]);
                        const etiq = etiqVal ? String(etiqVal).trim() : 'N/A';

                        if (ref !== 'N/A' && !parsedAmostras.find(a => a.id === ref)) {
                            parsedAmostras.push({
                                id: ref,
                                referencia: ref,
                                etiqueta: etiq,
                                pesoKg: parseBrNumber(getVal(["peso", "peso kg", "peso(kg)", "pesokg"])),
                                data: formatDate(getVal(["data", "date", "data de analise"])),
                                entrada: formatDate(getVal(["entrada", "data de entrada"])),
                                acondicionado: String(getVal(["acondicionado", "acondicionamento"]) || ""),
                                mic: parseBrNumber(getVal(["mic_ref", "mic"])),
                                len: parseBrNumber(getVal(["len_ref", "len", "uhm"])),
                                unf: parseBrNumber(getVal(["unf_ref", "unf", "ui"])),
                                str: parseBrNumber(getVal(["str_ref", "str"])),
                                rd: parseBrNumber(getVal(["rd_ref", "rd"])),
                                maisB: parseBrNumber(getVal(["b_ref", "+b", "+b", "maisb", "b"])),
                                area: parseBrNumber(getVal(["area_ref", "area", "área", "trarea"])),
                                count: parseBrNumber(getVal(["count_ref", "count", "trcnt", "cnt"])),
                                elg: parseBrNumber(getVal(["elg_ref", "elg"])),
                                sfi: parseBrNumber(getVal(["sfi_ref", "sfi"])),
                                mat: parseBrNumber(getVal(["mat_ref", "mat"])),
                                tolerancias: {
                                    mic: parseBrNumber(getVal(["mic_tol"])),
                                    len: parseBrNumber(getVal(["len_tol"])),
                                    unf: parseBrNumber(getVal(["unf_tol"])),
                                    str: parseBrNumber(getVal(["str_tol"])),
                                    rd: parseBrNumber(getVal(["rd_tol"])),
                                    maisB: parseBrNumber(getVal(["b_tol", "+b_tol", "maisb_tol"]))
                                }
                            });
                        }

                        if (ref !== 'N/A') {
                            const isAnomalous = Object.keys(row).some(key => key.toUpperCase().endsWith('_OK') && String(row[key]).toUpperCase() === 'N');
                            const anomalousFields: string[] = [];

                            Object.keys(row).forEach(key => {
                                if (key.toUpperCase().endsWith('_OK') && String(row[key]).toUpperCase() === 'N') {
                                    const baseField = key.replace(/_OK$/i, '').toLowerCase();
                                    if (baseField === 'b') anomalousFields.push('maisB');
                                    else anomalousFields.push(baseField);
                                }
                            });

                            const tipoRaw = String(getVal(["tipo", "type"]) || 'Análise');
                            const tipoParsed = tipoRaw.toLowerCase().includes("méd") || tipoRaw.toLowerCase().includes("med") ? "Média" : "Análise";

                            const dataAnalise = formatDate(getVal(["analise", "análise", "data", "date"]));

                            parsedAnalises.push({
                                id: `analise-${index}`,
                                amostraId: ref,
                                hvi: String(getVal(["hvi", "inst", "máquina", "maquina"]) || "N/A"),
                                data: dataAnalise,
                                turno: determinarTurno(dataAnalise) || String(getVal(["turno"]) || ""),
                                operador: String(getVal(["analise_user", "operador", "ope", "user", "usuário", "usuario"]) || ""),
                                tipo: tipoParsed,
                                mic: parseBrNumber(getVal(["mic_hvi", "mic", "mic hvi"])),
                                len: parseBrNumber(getVal(["len_hvi", "len", "uhm", "len hvi"])),
                                unf: parseBrNumber(getVal(["unf_hvi", "unf", "ui", "unf hvi"])),
                                str: parseBrNumber(getVal(["str_hvi", "str", "str hvi"])),
                                rd: parseBrNumber(getVal(["rd_hvi", "rd", "rd hvi"])),
                                maisB: parseBrNumber(getVal(["b_hvi", "+b", "maisb", "b"])),
                                area: parseBrNumber(getVal(["area_hvi", "area", "área", "trarea"])),
                                count: parseBrNumber(getVal(["count_hvi", "count", "trcnt", "cnt"])),
                                elg: parseBrNumber(getVal(["elg_hvi", "elg"])),
                                sfi: parseBrNumber(getVal(["sfi_hvi", "sfi"])),
                                mat: parseBrNumber(getVal(["mat_hvi", "mat"])),
                                isAnomalous,
                                anomalousFields
                            });
                        }
                    });
                }

                if (parsedAmostras.length > 0) {
                    setAmostras(parsedAmostras);
                    setAnalises(parsedAnalises);
                    setAmostraSelecionada(parsedAmostras[0].id);

                    if (labId && labId !== 'all') {
                        const today = new Date().toDateString();
                        const storeKey = `fibertech_verificacao_${labId}`;
                        const state = {
                            date: today,
                            amostras: parsedAmostras,
                            analises: parsedAnalises
                        };

                        localStorage.setItem(storeKey, JSON.stringify(state));

                        // Envia para o Supabase (Nuvem)
                        verificacaoService.save(labId, state).catch(err => {
                            console.error("Erro ao salvar no Supabase:", err);
                            addToast({
                                title: "Alerta de Sincronização",
                                description: "Dados salvos localmente, mas não puderam ser enviados para a nuvem. Verifique o banco de dados.",
                                type: "warning"
                            });
                        });
                    }

                    addToast({ title: "Arquivo Carregado", description: `Encontradas ${parsedAmostras.length} amostras e ${parsedAnalises.length} análises no arquivo.`, type: "success" });
                } else {
                    const columnsFound = jsonData.length > 0 ? Object.keys(jsonData[0]).join(', ') : 'Nenhuma coluna legível';
                    addToast({ title: "Formato Inválido", description: `Não identificamos a coluna de Referência da Amostra.\nColunas encontradas:\n${columnsFound}`, type: "error" });
                }
            } catch (error) {
                console.error("Erro ao ler excel:", error);
                addToast({ title: "Erro", description: "Falha ao ler o aquivo Excel fornecido.", type: "error" });
            } finally {
                setIsLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Filtros
    const amostrasFiltradas = amostras.filter((a: Amostra) => {
        if (filtroReferencia && !a.referencia.includes(filtroReferencia)) return false;
        if (filtroEtiqueta && !a.etiqueta.includes(filtroEtiqueta)) return false;
        return true;
    });

    const analisesAtuaisRaw = analises.filter((a: Analise) => {
        if (amostraSelecionada) {
            if (a.amostraId !== amostraSelecionada) return false;
        } else {
            if (!amostrasFiltradas.some(am => am.id === a.amostraId)) return false;
        }

        if (filtroHVI && !a.hvi.toLowerCase().includes(filtroHVI.toLowerCase())) return false;
        if (filtroTurno && a.turno !== filtroTurno) return false;

        if (dataInicio || dataFim) {
            try {
                // A data no Excel geralmente vem como DD/MM/YYYY HH:mm ou DD/MM/YYYY
                const [datePart] = a.data.split(' ');
                const [dd, mm, yyyy] = datePart.split('/');
                const dataPlanilha = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);

                if (dataInicio) {
                    const dtI = new Date(`${dataInicio}T00:00:00`);
                    if (dataPlanilha < dtI) return false;
                }
                if (dataFim) {
                    const dtF = new Date(`${dataFim}T00:00:00`);
                    if (dataPlanilha > dtF) return false;
                }
            } catch {
                // Se o formato de data fugir do padrão brasileiro, ignora o filtro e nao crasha
            }
        }

        return true;
    });

    const analisesAtuais: Analise[] = [];
    let mediaAtual: Analise | null = null;
    let blocoAnalises: Analise[] = [];

    analisesAtuaisRaw.forEach((an) => {
        if (an.tipo?.toLowerCase() === 'média') {
            // Se encontrar uma média nova, descarrega a anterior com as análises referentes a ela
            if (mediaAtual) {
                analisesAtuais.push(...blocoAnalises, mediaAtual);
            } else if (blocoAnalises.length > 0) {
                analisesAtuais.push(...blocoAnalises);
            }
            mediaAtual = an;
            blocoAnalises = [];
        } else {
            blocoAnalises.push(an);
        }
    });

    if (mediaAtual) {
        analisesAtuais.push(...blocoAnalises, mediaAtual);
    } else if (blocoAnalises.length > 0) {
        analisesAtuais.push(...blocoAnalises);
    }

    // Helpers de CSS para consistência com o ORIGO
    const headerClasses = "border border-neutral-200/50 py-3 px-3 text-[10px] font-bold text-center bg-[#1c3664] text-white uppercase tracking-wider";
    const rowClasses = "hover:bg-blue-50/40 cursor-pointer border-b border-neutral-200 transition-colors";

    // Função para renderizar as celulas da Análise, aplicando vermelho/verde conforme "anomalia"
    const renderCell = (field: keyof Analise, analise: Analise) => {
        const value = analise[field];

        let colorClass = "text-neutral-700"; // Default

        if (analise.tipo === 'Análise') {
            if (analise.anomalousFields?.includes(field)) {
                colorClass = "text-red-600 font-extrabold bg-red-50";
            } else if (typeof value === 'number') {
                colorClass = "text-emerald-700 font-semibold";
            }
        } else if (analise.tipo?.toLowerCase() === 'média') {
            if (analise.anomalousFields?.includes(field)) {
                colorClass = "text-red-400 font-extrabold bg-slate-800";
            } else if (typeof value === 'number') {
                colorClass = "text-emerald-400 font-bold";
            } else {
                colorClass = "text-white";
            }
        }

        return (
            <td className={`border border-neutral-100/20 py-2.5 px-3 text-[11px] text-center whitespace-nowrap ${colorClass}`}>
                {typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
            </td>
        );
    };

    // Dados para os graficos (Agrupando e plotando somente as médias)
    const chartData = analisesAtuais.filter((a: Analise) => a.tipo === 'Média').map((an: Analise, idx: number) => ({
        name: `T${idx + 1}`,
        time: an.data.split(' ')[0] || an.data,
        hvi: an.hvi,
        mic: an.mic,
        len: an.len,
        unf: an.unf,
        str: an.str,
        rd: an.rd,
        maisB: an.maisB,
        area: an.area,
        count: an.count,
        elg: an.elg,
        sfi: an.sfi,
        mat: an.mat,
        isAnomalous: an.isAnomalous,
        anomalousFields: an.anomalousFields
    }));
    const amostraRefData = amostras.find((a: Amostra) => a.id === amostraSelecionada);
    const maquinasHVI = Array.from(new Set(analises.map(a => a.hvi))).filter(Boolean).sort();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white border border-neutral-200 p-3 rounded-md shadow-lg text-[11px]">
                    <p className="font-bold text-[#1c3664] mb-2 border-b border-neutral-100 pb-1">{label}</p>
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold text-neutral-600">
                            Máquina (HVI): <span className="text-black font-bold uppercase">{payload[0].payload.hvi || 'N/A'}</span>
                        </p>
                        {payload.map((entry: { name: string; value: string | number }, index: number) => (
                            <p key={index} className="font-semibold text-neutral-600">
                                {entry.name}: <span className="text-black font-bold">{entry.value}</span>
                            </p>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    if (user?.acesso === 'admin_global' && !currentLab) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-12 animate-fade-in text-black">
                <div className="inline-flex p-4 bg-black rounded-2xl shadow-2xl"><FileSpreadsheet className="h-12 w-12 text-white" /></div>
                <h1 className="text-5xl font-serif">Selecione o Laboratório</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-7xl">
                    {labs.map((lab) => (
                        <button key={lab.id} onClick={() => selectLab(lab.id)} className="group relative flex flex-col p-8 bg-white border-2 border-neutral-200 hover:border-black rounded-2xl transition-all duration-300 text-left hover:shadow-xl hover:-translate-y-1">
                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity"><ArrowRight className="h-6 w-6 text-black" /></div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Laboratório</span>
                            <h3 className="text-xl font-bold text-black group-hover:underline">{lab.nome}</h3>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in text-neutral-800 pb-24 h-full flex flex-col bg-neutral-50 p-2 md:p-6 rounded-xl">

            {/* TOOLBAR SUPERIOR (Design ORIGO) */}
            <div className="bg-white border rounded-xl shadow-md border-neutral-200/60 p-5 flex-shrink-0 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#1c3664]"></div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-5 w-full">

                    {/* Lupa Minimalista */}
                    <div className="flex items-center justify-center pt-2">
                        <Search className="h-7 w-7 text-[#1c3664] hover:scale-110 transition-transform cursor-pointer" strokeWidth={1.5} />
                    </div>

                    <div className="space-y-2 flex-1 min-w-[120px] max-w-[160px]">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Referência</label>
                        <Input
                            value={filtroReferencia}
                            onChange={(e) => setFiltroReferencia(e.target.value)}
                            className="h-10 w-full border-neutral-200 rounded-lg text-sm focus:border-[#1c3664] focus:ring-[#1c3664] bg-neutral-50/50 shadow-sm"
                        />
                    </div>

                    <div className="space-y-2 flex-1 min-w-[140px] max-w-[220px]">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Etiqueta</label>
                        <Input
                            value={filtroEtiqueta}
                            onChange={(e) => setFiltroEtiqueta(e.target.value)}
                            className="h-10 w-full border-neutral-200 rounded-lg text-sm focus:border-[#1c3664] focus:ring-[#1c3664] bg-neutral-50/50 shadow-sm"
                        />
                    </div>

                    <div className="space-y-2 min-w-[140px]">
                        <label htmlFor="hvi-select" className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Máquina (HVI)</label>
                        <div className="relative">
                            <select
                                id="hvi-select"
                                title="Selecione o HVI"
                                value={filtroHVI}
                                onChange={(e) => setFiltroHVI(e.target.value)}
                                className="h-10 w-full border border-neutral-200 rounded-lg text-sm focus:border-[#1c3664] focus:ring-[#1c3664] bg-neutral-50/50 text-neutral-700 appearance-none pl-3 pr-8 shadow-sm"
                            >
                                <option value="">Todas as Máquinas</option>
                                {maquinasHVI.map(hvi => (
                                    <option key={hvi} value={hvi}>{hvi}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-neutral-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Data Picker Funcional */}
                    <div className="space-y-2 hidden md:block">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block w-full">Período de Análises</label>
                        <div className="flex items-center justify-between h-10 border border-neutral-200 px-3 rounded-lg bg-neutral-50/50 shadow-sm">
                            <input
                                type="date"
                                title="Data Inicial"
                                aria-label="Data Inicial do Período"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                                className="text-sm bg-transparent border-0 outline-none text-neutral-700 focus:ring-0 p-0"
                            />
                            <span className="text-[10px] text-neutral-400 font-bold px-3 uppercase">até</span>
                            <input
                                type="date"
                                title="Data Final"
                                aria-label="Data Final do Período"
                                value={dataFim}
                                onChange={(e) => setDataFim(e.target.value)}
                                className="text-sm bg-transparent border-0 outline-none text-neutral-700 focus:ring-0 p-0"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 flex-1 min-w-[120px] max-w-[160px]">
                        <label htmlFor="turno-select" className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Turno</label>
                        <div className="relative">
                            <select
                                id="turno-select"
                                title="Selecione o Turno"
                                value={filtroTurno}
                                onChange={(e) => setFiltroTurno(e.target.value)}
                                className="h-10 w-full border border-neutral-200 rounded-lg text-sm focus:border-[#1c3664] focus:ring-[#1c3664] bg-neutral-50/50 text-neutral-700 appearance-none pl-3 pr-8 shadow-sm"
                            >
                                <option value="">Todos os Turnos</option>
                                <option value="Turno 1">Turno 1</option>
                                <option value="Turno 2">Turno 2</option>
                                <option value="Turno 3">Turno 3</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-neutral-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="ml-auto flex gap-3 w-full lg:w-auto mt-2 lg:mt-0">
                        {user?.acesso === 'admin_global' && (
                            <select
                                title="Selecione o Laboratório"
                                aria-label="Selecione o Laboratório"
                                className="bg-white border text-[#1c3664] text-[10px] font-bold uppercase tracking-widest rounded-lg px-4 hover:border-[#1c3664] transition-all cursor-pointer outline-none shadow-sm h-10"
                                value={labId || ""}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        selectLab(e.target.value);
                                    }
                                }}
                            >
                                <option value="" disabled>SELECIONE O LABORATÓRIO</option>
                                {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                            </select>
                        )}
                        {/* Botão de Limpar Filtros */}
                        <Button
                            onClick={clearFilters}
                            variant="outline"
                            className="h-10 border-neutral-300 text-neutral-600 hover:bg-neutral-100 hover:text-black rounded-lg text-[10px] font-bold uppercase tracking-widest px-5 transition-all shadow-sm"
                        >
                            Limpar Filtros
                        </Button>
                        <Button
                            onClick={handleSync}
                            variant="outline"
                            className="h-10 border-neutral-300 text-neutral-600 hover:bg-neutral-100 hover:text-black rounded-lg text-[10px] font-bold uppercase tracking-widest px-5 transition-all shadow-sm"
                            disabled={isLoading}
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sincronizar
                        </Button>
                        <Button
                            onClick={() => {
                                fileInputRef.current?.click();
                                addToast({ title: "Importação", description: "Certifique-se de que o relatório abranja obrigatoriamente um período de 1 semana (7 dias) retroativos.", type: "info" });
                            }}
                            className="h-10 bg-gradient-to-r from-[#1c3664] to-[#2a5196] text-white hover:opacity-90 rounded-lg text-[10px] font-bold uppercase tracking-widest px-6 transition-all shadow-md shadow-[#1c3664]/30"
                            title="Carregar planilha .xlsx"
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Importar Dados
                        </Button>
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            title="Input de arquivo excel"
                        />
                    </div>
                </div>
            </div>

            {
                isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                        <div className="w-10 h-10 border-4 border-neutral-200 border-t-[#1c3664] rounded-full animate-spin"></div>
                        <span className="text-xs font-mono text-neutral-500 uppercase">Processando Arquivo...</span>
                    </div>
                ) : (
                    <div className="space-y-6 flex-1 flex flex-col">

                        {/* SELETOR DE AMOSTRA CONSOLIDADA */}
                        {amostras.length > 0 && (
                            <div className="w-full flex items-center bg-white rounded-xl border border-neutral-200/60 p-4 shadow-sm gap-4">
                                <label className="text-[11px] font-extrabold text-[#1c3664] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap">
                                    <Table2 className="h-4 w-4" /> Amostra Consolidada
                                </label>

                                <div className="relative flex-1 max-w-sm">
                                    <select
                                        title="Selecione a Referência da Amostra"
                                        value={amostraSelecionada || ""}
                                        onChange={(e) => setAmostraSelecionada(e.target.value || null)}
                                        className="h-10 w-full border border-neutral-300 rounded-lg text-sm font-bold text-[#1c3664] focus:border-[#1c3664] focus:ring-[#1c3664] bg-white appearance-none pl-4 pr-10 shadow-sm transition-all"
                                    >
                                        <option value="">Selecione pela Referência...</option>
                                        {amostras.map(am => (
                                            <option value={am.id} key={am.id}>{am.referencia}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-[#1c3664] pointer-events-none" />
                                </div>
                            </div>
                        )}

                        {/* NAVEGAÇÃO DE ABAS EXCLUSIVA PARA MEDIÇÕES */}
                        {amostras.length > 0 && (
                            <div className="w-full flex bg-white/60 rounded-xl border border-neutral-200/60 p-1.5 shadow-sm">
                                <button
                                    onClick={() => setAbaPrincipal('tabela')}
                                    className={`flex-1 py-2.5 text-[11px] font-extrabold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all ${abaPrincipal === 'tabela' ? 'bg-[#1c3664] text-white shadow-md' : 'text-neutral-500 hover:text-[#1c3664] hover:bg-neutral-50'}`}
                                >
                                    <Table2 className="h-4 w-4" /> Medições Detalhadas
                                </button>
                                <button
                                    onClick={() => setAbaPrincipal('graficos')}
                                    className={`flex-1 py-2.5 text-[11px] font-extrabold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all ${abaPrincipal === 'graficos' ? 'bg-[#1c3664] text-white shadow-md' : 'text-neutral-500 hover:text-[#1c3664] hover:bg-neutral-50'}`}
                                >
                                    <BarChart3 className="h-4 w-4" /> Dashboard Gráfico
                                </button>
                            </div>
                        )}

                        {/* SEÇÃO: ANÁLISES (TABELA INFERIOR) */}
                        <div className="flex-1 w-full relative min-h-[500px]">

                            {/* TELA DA TABELA */}
                            {abaPrincipal === 'tabela' && (
                                <div className="flex flex-col border border-neutral-200/60 bg-white rounded-xl shadow-md overflow-hidden h-full">
                                    <div className="bg-white border-b border-neutral-200 px-5 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <h2 className="text-[11px] font-extrabold text-[#1c3664] uppercase tracking-widest flex items-center gap-2">
                                            <Table2 className="h-4 w-4" />
                                            Medições Detalhadas
                                            {amostraSelecionada ? <span className="text-neutral-400 font-medium ml-1">| Ref: {amostraSelecionada}</span> : <span className="text-neutral-400 font-medium ml-1">| Todas as Amostras</span>}
                                        </h2>

                                        <div className="flex flex-wrap items-center w-full md:w-auto gap-4">
                                            {/* Alert Indicator */}
                                            {analisesAtuais.length > 0 && (
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50/80 border border-red-200/60 rounded-full text-[10px] text-red-700 font-bold shadow-sm">
                                                    <AlertCircle className="h-3.5 w-3.5" />
                                                    <span>Variações (Vermelho) = Alerta Relevante</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="overflow-auto flex-1 bg-white relative">
                                        {analisesAtuais.length > 0 ? (
                                            <table className="w-full text-left border-collapse min-w-max">
                                                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                                                    <tr>
                                                        <th className={`${headerClasses} w-6`}></th>
                                                        <th className={headerClasses}>HVI</th>
                                                        <th className={headerClasses}>Data</th>
                                                        <th className={headerClasses}>Turno</th>
                                                        <th className={headerClasses}>Operador</th>
                                                        <th className={headerClasses}>Tipo</th>

                                                        <th className={headerClasses}>Mic</th>
                                                        <th className={headerClasses}>Len</th>
                                                        <th className={headerClasses}>Unf</th>
                                                        <th className={headerClasses}>Str</th>
                                                        <th className={headerClasses}>Rd</th>
                                                        <th className={headerClasses}>+b</th>
                                                        <th className={headerClasses}>Area</th>
                                                        <th className={headerClasses}>Count</th>
                                                        <th className={headerClasses}>Elg</th>
                                                        <th className={headerClasses}>SFI</th>
                                                        <th className={headerClasses}>Mat</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white">
                                                    {analisesAtuais.map((an: Analise, idx: number) => {
                                                        const isMedia = an.tipo?.toLowerCase() === 'média';
                                                        return (
                                                            <tr key={an.id} className={`${rowClasses} ${isMedia ? 'bg-slate-900 font-black text-white border-t-4 border-slate-950 shadow-md' : 'bg-white hover:bg-neutral-50 even:bg-neutral-50/50'}`}>
                                                                <td className={`border border-neutral-100/20 px-1 text-center ${isMedia ? 'bg-transparent' : 'bg-white'}`}>
                                                                    {!isMedia && idx === analisesAtuais.length - 1 && (
                                                                        <ChevronRight className="h-4 w-4 text-[#1c3664] inline-block" />
                                                                    )}
                                                                </td>
                                                                <td className={`border border-neutral-100 py-2.5 px-3 text-[11px] text-center font-medium ${isMedia ? 'text-white' : ''}`}>{an.hvi}</td>
                                                                <td className={`border border-neutral-100 py-2.5 px-3 text-[11px] text-center whitespace-nowrap ${isMedia ? 'text-neutral-300' : 'text-neutral-500'}`}>{an.data}</td>
                                                                <td className={`border border-neutral-100 py-2.5 px-3 text-[11px] text-left ${isMedia ? 'text-neutral-300' : 'text-neutral-600'}`}>{an.turno}</td>
                                                                <td className={`border border-neutral-100 py-2.5 px-3 text-[11px] text-center font-medium ${isMedia ? 'text-white' : ''}`}>{an.operador}</td>
                                                                <td className={`border border-neutral-100 py-2.5 px-3 text-[11px] text-left font-bold uppercase tracking-wider text-[9px] ${isMedia ? 'text-blue-300' : ''}`}>{an.tipo}</td>

                                                                {renderCell('mic', an)}
                                                                {renderCell('len', an)}
                                                                {renderCell('unf', an)}
                                                                {renderCell('str', an)}
                                                                {renderCell('rd', an)}
                                                                {renderCell('maisB', an)}
                                                                {renderCell('area', an)}
                                                                {renderCell('count', an)}
                                                                {renderCell('elg', an)}
                                                                {renderCell('sfi', an)}
                                                                {renderCell('mat', an)}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-xs text-neutral-400 p-8 font-mono">
                                                {amostras.length > 0 ? "Selecione uma amostra acima para ver suas análises." : "Nenhuma análise disponível."}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TELA DOS GRÁFICOS */}
                            {abaPrincipal === 'graficos' && (
                                <div className="flex flex-col border border-neutral-200/60 bg-white rounded-xl shadow-md overflow-hidden h-full">
                                    <div className="bg-white border-b border-neutral-200 px-5 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <h2 className="text-[11px] font-extrabold text-[#1c3664] uppercase tracking-widest flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4" />
                                            Dashboard Gráfico
                                        </h2>
                                    </div>

                                    <div className="p-6 flex flex-col h-full animate-fade-in bg-slate-50/30 overflow-auto">

                                        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6 w-full">
                                            <label className="text-[10px] font-extrabold text-[#1c3664] whitespace-nowrap uppercase tracking-widest bg-white px-3 py-1.5 rounded-md border border-[#1c3664]/20 shadow-sm flex items-center">
                                                Métrica Atual
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { id: 'mic', label: 'MIC' },
                                                    { id: 'len', label: 'LEN' },
                                                    { id: 'unf', label: 'UNF' },
                                                    { id: 'str', label: 'STR' },
                                                    { id: 'rd', label: 'RD' },
                                                    { id: 'maisB', label: '+B' }
                                                ].map((metric) => (
                                                    <button
                                                        key={metric.id}
                                                        onClick={() => setMetricaGraficoSelecionada(metric.id as keyof Analise)}
                                                        className={`px-5 py-2 rounded-lg text-[11px] font-black uppercase transition-all shadow-sm ${metricaGraficoSelecionada === metric.id
                                                            ? 'bg-[#1c3664] text-white border-transparent'
                                                            : 'bg-white text-neutral-500 border border-neutral-200 hover:border-[#1c3664]/50 hover:bg-blue-50/50'
                                                            }`}
                                                    >
                                                        {metric.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex-1 w-full min-h-[300px] bg-white border border-neutral-200/60 rounded-xl shadow-sm p-6 relative flex flex-col">
                                            <h3 className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#1c3664]"></span>
                                                Evolução das Médias ({String(metricaGraficoSelecionada).toUpperCase()})
                                            </h3>


                                            {chartData.length === 0 ? (
                                                <div className="flex-1 flex items-center justify-center text-xs text-neutral-400 font-mono">
                                                    Nenhum dado de medição disponível para esta amostra.
                                                </div>
                                            ) : (
                                                <div className="w-full mt-4 flex-1 min-h-[350px]">
                                                    <ResponsiveContainer width="100%" height={350}>
                                                        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                                            <XAxis
                                                                dataKey="time"
                                                                tickLine={false}
                                                                axisLine={false}
                                                                tick={{ fontSize: 10, fill: '#737373' }}
                                                                dy={10}
                                                            />
                                                            <YAxis
                                                                domain={['auto', 'auto']}
                                                                padding={{ top: 20, bottom: 20 }}
                                                                tickLine={false}
                                                                axisLine={false}
                                                                tick={{ fontSize: 10, fill: '#737373', fontWeight: 'bold' }}
                                                                tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString('pt-BR') : String(val)}
                                                            />
                                                            <Tooltip
                                                                cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '3 3' }}
                                                                content={<CustomTooltip />}
                                                            />
                                                            <Legend
                                                                wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }}
                                                            />

                                                            {amostraRefData && typeof amostraRefData[metricaGraficoSelecionada as keyof Amostra] === 'number' && (
                                                                <>
                                                                    <ReferenceLine
                                                                        y={amostraRefData[metricaGraficoSelecionada as keyof Amostra] as number}
                                                                        stroke="#dc2626"
                                                                        strokeOpacity={1}
                                                                        strokeWidth={2}
                                                                        strokeDasharray="5 5"
                                                                        ifOverflow="extendDomain"
                                                                        label={{ position: 'top', value: `Referência (${Number(amostraRefData[metricaGraficoSelecionada as keyof Amostra]).toLocaleString('pt-BR')})`, fill: '#dc2626', fontSize: 11, fontWeight: '900' }}
                                                                    />
                                                                    {amostraRefData.tolerancias && typeof amostraRefData.tolerancias[metricaGraficoSelecionada as keyof typeof amostraRefData.tolerancias] === 'number' && amostraRefData.tolerancias[metricaGraficoSelecionada as keyof typeof amostraRefData.tolerancias] > 0 && (
                                                                        <>
                                                                            <ReferenceLine
                                                                                y={(amostraRefData[metricaGraficoSelecionada as keyof Amostra] as number) + amostraRefData.tolerancias[metricaGraficoSelecionada as keyof typeof amostraRefData.tolerancias]}
                                                                                stroke="#d97706"
                                                                                strokeOpacity={1}
                                                                                strokeWidth={2}
                                                                                strokeDasharray="4 4"
                                                                                ifOverflow="extendDomain"
                                                                                label={{ position: 'top', value: `Máximo Permitido`, fill: '#b45309', fontSize: 10, fontWeight: 'bold' }}
                                                                            />
                                                                            <ReferenceLine
                                                                                y={(amostraRefData[metricaGraficoSelecionada as keyof Amostra] as number) - amostraRefData.tolerancias[metricaGraficoSelecionada as keyof typeof amostraRefData.tolerancias]}
                                                                                stroke="#d97706"
                                                                                strokeOpacity={1}
                                                                                strokeWidth={2}
                                                                                strokeDasharray="4 4"
                                                                                ifOverflow="extendDomain"
                                                                                label={{ position: 'bottom', value: `Mínimo Permitido`, fill: '#b45309', fontSize: 10, fontWeight: 'bold' }}
                                                                            />
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}

                                                            <Line
                                                                type="monotone"
                                                                dataKey={metricaGraficoSelecionada as string}
                                                                name={`HVI - ${String(metricaGraficoSelecionada).toUpperCase()}`}
                                                                stroke="#1c3664"
                                                                strokeWidth={3}
                                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                                dot={(props: any) => {
                                                                    const payload = props.payload as { anomalousFields?: string[] };
                                                                    const isOut = payload.anomalousFields?.includes(metricaGraficoSelecionada === 'maisB' ? 'b' : metricaGraficoSelecionada);
                                                                    return (
                                                                        <circle
                                                                            cx={props.cx}
                                                                            cy={props.cy}
                                                                            r={isOut ? 6 : 4}
                                                                            fill={isOut ? '#dc2626' : '#fff'}
                                                                            stroke={isOut ? '#dc2626' : '#1c3664'}
                                                                            strokeWidth={2}
                                                                            key={`dot-${props.key}`}
                                                                        />
                                                                    );
                                                                }}
                                                                activeDot={{ r: 6, fill: '#1c3664', strokeWidth: 0 }}
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
        </div>
    );
}

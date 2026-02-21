import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { parseStatusOSFileInChunks, type StatusOSParsed } from "@/lib/statusOSParser";
import { statusOSService } from "@/services/statusOS.service";
import { producaoService } from "@/services/producao.service";
import type { ProducaoData } from "@/services/producao.service";
import { LabService, type Lab } from "@/entities/Lab";
import { Button } from "@/components/ui/button";
import { Upload, RefreshCw, Trash2, Loader2, Printer, Users, LayoutGrid, ClipboardList, Database, Activity, Clock, Search, Star, PlusSquare, MinusSquare, Inbox } from "lucide-react";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useToast } from "@/contexts/ToastContext";
import { supabase } from "@/lib/supabase"; // Ensure supabase is imported

const CustomTooltip = ({ active, payload, label }: any) => {
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
                    {sortedPayload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-8">
                            <div className="flex items-center gap-2">
                                <style>{`.tooltip-color-bg-${index}-${entry.name.replace(/[^a-zA-Z]/g, '')} { background-color: ${entry.color}; }`}</style>
                                <div className={`h-2 w-2 rounded-full tooltip-color-bg-${index}-${entry.name.replace(/[^a-zA-Z]/g, '')}`} />
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

interface IProducaoVinculo {
    data_producao: string;
    peso: number;
}

interface OSItem {
    id: string;
    os_numero: string;
    tomador?: string;
    cliente: string;
    fazenda: string;
    revisor: string;
    status: string;
    data_recepcao: string;
    data_finalizacao?: string;
    data_acondicionamento?: string;
    total_amostras: number;
    horas?: number;
    nota_fiscal: string;
}

export default function MonitoramentoOS() {
    const { currentLab, user, selectLab } = useAuth();
    const labId = currentLab?.id || user?.lab_id;
    const { addToast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [labs, setLabs] = useState<Lab[]>([]);
    const [osList, setOsList] = useState<OSItem[]>([]);
    const [productionData, setProductionData] = useState<IProducaoVinculo[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [stats, setStats] = useState({ total: 0, faturados: 0, emAberto: 0, totalAmostras: 0, saldoAmostras: 0 });
    const [activeTab, setActiveTab] = useState<'geral' | 'revisores' | 'clientes' | 'saldo_diario'>('geral');
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const matrixTableRef = useRef<HTMLDivElement>(null);
    const [collapsedClients, setCollapsedClients] = useState<string[]>([]);

    const [selectedChartClients, setSelectedChartClients] = useState<string[]>([]);
    const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);

    const [pinnedCells, setPinnedCells] = useState<Record<string, number>>(() => {
        const saved = localStorage.getItem('pinned_matrix_cells_v2_' + (labId || 'default'));
        return saved ? JSON.parse(saved) : {};
    });

    const togglePinCell = (client: string, date: string) => {
        setPinnedCells((prev: Record<string, number>) => {
            const key = `${client}|${date}`;
            const currentLevel = prev[key] || 0;
            const nextLevel = (currentLevel + 1) % 4;
            const next = { ...prev };
            if (nextLevel === 0) delete next[key];
            else next[key] = nextLevel;
            localStorage.setItem('pinned_matrix_cells_v2_' + (labId || 'default'), JSON.stringify(next));
            return next;
        });
    };

    const toggleReviewerSelection = (reviewer: string) => {
        setSelectedReviewers((prev: string[]) =>
            prev.includes(reviewer)
                ? prev.filter((r: string) => r !== reviewer)
                : [...prev, reviewer]
        );
    };

    const toggleClientSelection = (client: string) => {
        setSelectedChartClients((prev: string[]) =>
            prev.includes(client)
                ? prev.filter((c: string) => c !== client)
                : [...prev, client]
        );
    };

    const toggleClientCollapse = (clientName: string) => {
        setCollapsedClients(prev => prev.includes(clientName) ? prev.filter(c => c !== clientName) : [...prev, clientName]);
    };

    const filteredOS = React.useMemo(() => {
        return osList.filter((item: OSItem) =>
            item.os_numero.toString().includes(searchTerm) ||
            item.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.fazenda.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.revisor?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [osList, searchTerm]);

    useEffect(() => {
        if (user?.acesso === 'admin_global') {
            LabService.list().then(setLabs).catch(console.error);
        }
    }, [user]);

    // Supabase Realtime Subscription setup
    useEffect(() => {
        if (!labId) return;

        let debounceTimer: NodeJS.Timeout;

        const handleRealtimeChange = (payload: any) => {
            console.log("REALTIME ACTIVITY DETECTED:", payload);
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadData();
            }, 2000);
        };

        const subscription = supabase
            .channel('status_os_realtime_' + labId)
            .on(
                'postgres_changes',
                // Removendo o filtro de lab_id temporariamente para garantir que o websocket capte tudo na tabela
                { event: '*', schema: 'public', table: 'status_os_hvi' },
                handleRealtimeChange
            )
            .subscribe((status) => {
                console.log("Supabase Realtime Status:", status);
            });

        return () => {
            clearTimeout(debounceTimer);
            supabase.removeChannel(subscription);
        };
    }, [labId]);

    const revisorStats = React.useMemo(() => {
        const s: Record<string, number> = {};
        filteredOS.forEach((os: OSItem) => {
            const rev = os.revisor || 'Não Informado';
            s[rev] = (s[rev] || 0) + (os.total_amostras || 0);
        });
        return Object.entries(s)
            .sort(([, a], [, b]) => b - a)
            .map(([name, total]) => ({ name, total }));
    }, [filteredOS]);

    const clienteStats = React.useMemo(() => {
        const s: Record<string, { totalAmostras: number; totalHoras: number; count: number }> = {};
        osList.forEach((os: OSItem) => {
            const cli = os.cliente || 'Não Informado';
            if (!s[cli]) s[cli] = { totalAmostras: 0, totalHoras: 0, count: 0 };
            s[cli].totalAmostras += (os.total_amostras || 0);
            if (os.horas) { s[cli].totalHoras += os.horas; s[cli].count += 1; }
        });
        return Object.entries(s)
            .sort(([, a], [, b]) => b.totalAmostras - a.totalAmostras)
            .map(([name, data]) => ({
                name,
                total: data.totalAmostras,
                avgTime: data.count > 0 ? (data.totalHoras / data.count).toFixed(1) : '-'
            }));
    }, [osList]);

    const revisorDailyStats = React.useMemo(() => {
        if (osList.length === 0) return { data: [], keys: [], keyColors: {} };
        const grouped: Record<string, any> = {};
        const revisoresSet = new Set<string>();

        osList.forEach((os: OSItem) => {
            if (os.data_recepcao) {
                try {
                    const recDateObj = new Date(os.data_recepcao);
                    if (!isNaN(recDateObj.getTime())) {
                        const dateKey = format(recDateObj, 'yyyy-MM-dd');
                        const displayDate = format(recDateObj, 'dd/MM');
                        if (!grouped[dateKey]) grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                        grouped[dateKey]['Volume Recebido'] = (grouped[dateKey]['Volume Recebido'] || 0) + (os.total_amostras || 0);
                    }
                } catch (e) { }
            }

            if (os.data_finalizacao) {
                try {
                    const finDateObj = new Date(os.data_finalizacao);
                    if (!isNaN(finDateObj.getTime())) {
                        const dateKey = format(finDateObj, 'yyyy-MM-dd');
                        const displayDate = format(finDateObj, 'dd/MM');
                        if (!grouped[dateKey]) grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                        grouped[dateKey]['Total Revisado (Analistas)'] = (grouped[dateKey]['Total Revisado (Analistas)'] || 0) + (os.total_amostras || 0);
                        if (os.revisor) {
                            revisoresSet.add(os.revisor);
                            grouped[dateKey][os.revisor] = (grouped[dateKey][os.revisor] || 0) + (os.total_amostras || 0);
                        }
                    }
                } catch (e) { }
            }
        });

        productionData.forEach((prod: IProducaoVinculo) => {
            if (prod.data_producao) {
                try {
                    const dateParts = prod.data_producao.split('-');
                    const prodDateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 12, 0, 0);
                    if (!isNaN(prodDateObj.getTime())) {
                        const dateKey = format(prodDateObj, 'yyyy-MM-dd');
                        const displayDate = format(prodDateObj, 'dd/MM');
                        if (!grouped[dateKey]) grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                        grouped[dateKey]['Volume Produzido (Análise)'] = (grouped[dateKey]['Volume Produzido (Análise)'] || 0) + (prod.peso || 0);
                    }
                } catch (e) { }
            }
        });

        const dataArr = Object.values(grouped).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate));
        const keysList = Array.from(revisoresSet);
        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
        const keyColors = keysList.reduce((acc: Record<string, string>, key: string, index: number) => {
            acc[key] = colors[index % colors.length];
            return acc;
        }, {} as Record<string, string>);

        return { data: dataArr, keys: keysList, keyColors };
    }, [osList, productionData]);

    const clienteDailyStats = React.useMemo(() => {
        const grouped: Record<string, any> = {};
        const stableClients = clienteStats.slice(0, 30).map((c: any) => c.name);

        osList.forEach((os: OSItem) => {
            if (!os.cliente) return;
            let dateStr = os.data_recepcao;

            try {
                const dateObj = new Date(dateStr);
                if (isNaN(dateObj.getTime())) return;
                const dateKey = format(dateObj, 'yyyy-MM-dd');
                const displayDate = format(dateObj, 'dd/MM');
                if (!grouped[dateKey]) grouped[dateKey] = { name: displayDate, rawDate: dateKey };

                if (stableClients.includes(os.cliente)) {
                    grouped[dateKey][os.cliente] = (grouped[dateKey][os.cliente] || 0) + os.total_amostras;
                }
                grouped[dateKey]['Total Recebido'] = (grouped[dateKey]['Total Recebido'] || 0) + os.total_amostras;
            } catch (e) { }
        });

        const dataArr = Object.values(grouped).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate));

        const keysList = [...stableClients];
        if (dataArr.length > 0) keysList.push('Total Recebido');

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4'];
        const keyColors = keysList.reduce((acc: Record<string, string>, key: string, index: number) => {
            if (key === 'Total Recebido') {
                acc[key] = '#000000'; // Black for Total Recebido
            } else {
                acc[key] = colors[index % colors.length];
            }
            return acc;
        }, {} as Record<string, string>);

        return { data: dataArr, keys: keysList, keyColors };
    }, [osList, clienteStats]);

    const saldoChartData = React.useMemo(() => {
        let buckets = { 'No Prazo (<24h)': 0, 'Atenção (24-48h)': 0, 'Crítico (>48h)': 0 };
        const now = new Date();

        filteredOS.forEach((os: OSItem) => {
            const finalizacaoStr = String(os.data_finalizacao || '').trim();
            const recepcaoStr = String(os.data_recepcao || '').trim();
            const hasFinalizacao = finalizacaoStr !== '' && finalizacaoStr !== 'null' && finalizacaoStr !== 'undefined' && finalizacaoStr !== '0';
            const hasRecepcao = recepcaoStr !== '' && recepcaoStr !== 'null' && recepcaoStr !== 'undefined' && recepcaoStr !== '0';

            // REGRA: Pendente apenas se coluna 'Finalizado' estiver vazia 
            if (hasFinalizacao || !hasRecepcao) return;
            try {
                const dateObj = new Date(os.data_recepcao);
                if (isNaN(dateObj.getTime())) return;
                const hours = differenceInHours(now, dateObj);
                if (hours < 24) buckets['No Prazo (<24h)'] += os.total_amostras;
                else if (hours < 48) buckets['Atenção (24-48h)'] += os.total_amostras;
                else buckets['Crítico (>48h)'] += os.total_amostras;
            } catch (e) { }
        });

        return [
            { name: 'No Prazo', value: buckets['No Prazo (<24h)'], fill: '#10b981', fullLabel: 'No Prazo (<24h)' },
            { name: 'Atenção', value: buckets['Atenção (24-48h)'], fill: '#f59e0b', fullLabel: 'Atenção (24-48h)' },
            { name: 'Crítico', value: buckets['Crítico (>48h)'], fill: '#ef4444', fullLabel: 'Crítico (>48h)' }
        ];
    }, [filteredOS]);

    const saldoDiarioPivotStats = React.useMemo(() => {
        const matrix: Record<string, {
            clientName: string; // This is actually Tomador
            total: number;
            maxDelay: number;
            dates: Record<string, { total: number; maxDelay: number }>;
            clientes: Record<string, {
                total: number;
                maxDelay: number;
                dates: Record<string, { total: number; maxDelay: number }>;
            }>;
        }> = {};
        const datesSet = new Set<string>();
        const now = new Date();
        let totalPendingAmostras = 0;
        let totalGeral = 0;
        let criticalCount = 0;

        filteredOS.forEach((os: OSItem) => {
            const finalizacaoStr = String(os.data_finalizacao || '').trim();
            const recepcaoStr = String(os.data_recepcao || '').trim();
            const hasFinalizacao = finalizacaoStr !== '' && finalizacaoStr !== 'null' && finalizacaoStr !== 'undefined' && finalizacaoStr !== '0';
            const hasRecepcao = recepcaoStr !== '' && recepcaoStr !== 'null' && recepcaoStr !== 'undefined' && recepcaoStr !== '0';

            // Pendente apenas se coluna 'Finalizado' estiver vazia 
            if (hasFinalizacao || !hasRecepcao || !os.cliente) return;
            try {
                const dateObj = new Date(os.data_recepcao);
                if (isNaN(dateObj.getTime())) return;
                const dateKey = format(dateObj, 'yyyy-MM-dd');
                datesSet.add(dateKey);

                const tomadorName = os.tomador || os.cliente;
                const clienteName = os.cliente || 'NÃO INFORMADO';

                const delayHours = differenceInHours(now, dateObj);
                const amostras = os.total_amostras || 0;
                totalPendingAmostras += amostras;
                totalGeral += amostras;

                if (delayHours >= 48) criticalCount++;

                if (!matrix[tomadorName]) {
                    matrix[tomadorName] = { clientName: tomadorName, total: 0, maxDelay: 0, dates: {}, clientes: {} };
                }
                const tomadorGroup = matrix[tomadorName];
                tomadorGroup.total += amostras;
                if (delayHours > tomadorGroup.maxDelay) tomadorGroup.maxDelay = delayHours;

                if (!tomadorGroup.dates[dateKey]) tomadorGroup.dates[dateKey] = { total: 0, maxDelay: 0 };
                tomadorGroup.dates[dateKey].total += amostras;
                if (delayHours > tomadorGroup.dates[dateKey].maxDelay) tomadorGroup.dates[dateKey].maxDelay = delayHours;

                if (!tomadorGroup.clientes[clienteName]) {
                    tomadorGroup.clientes[clienteName] = { total: 0, maxDelay: 0, dates: {} };
                }
                const clienteGroup = tomadorGroup.clientes[clienteName];
                clienteGroup.total += amostras;
                if (delayHours > clienteGroup.maxDelay) clienteGroup.maxDelay = delayHours;

                if (!clienteGroup.dates[dateKey]) clienteGroup.dates[dateKey] = { total: 0, maxDelay: 0 };
                clienteGroup.dates[dateKey].total += amostras;
                if (delayHours > clienteGroup.dates[dateKey].maxDelay) clienteGroup.dates[dateKey].maxDelay = delayHours;
            } catch (e) { }
        });

        const sortedDates = Array.from(datesSet).sort();
        const sortedClients = Object.values(matrix).sort((a, b) => {
            const getPriorityRank = (client: string) => {
                const levels = Object.entries(pinnedCells).filter(([key]) => key.startsWith(client + '|')).map(([, level]) => level as number);
                return levels.length === 0 ? 99 : Math.min(...levels);
            };
            const rankA = getPriorityRank(a.clientName), rankB = getPriorityRank(b.clientName);
            if (rankA !== rankB) return rankA - rankB;

            if (b.maxDelay !== a.maxDelay) return b.maxDelay - a.maxDelay;
            return b.total - a.total;
        }).map(g => {
            const sortedClientesKeys = Object.keys(g.clientes).sort((c1, c2) => {
                if (g.clientes[c2].maxDelay !== g.clientes[c1].maxDelay) return g.clientes[c2].maxDelay - g.clientes[c1].maxDelay;
                return g.clientes[c2].total - g.clientes[c1].total;
            });
            return {
                ...g,
                sortedClientes: sortedClientesKeys.map(k => ({ name: k, ...g.clientes[k] }))
            };
        });

        return { sortedClients, sortedDates, totalPendingAmostras, totalGeral, criticalCount, matrix: {} };
    }, [filteredOS, pinnedCells]);

    const carteiraClientesPivotStats = React.useMemo(() => {
        const matrix: Record<string, {
            clientName: string; // This is actually Tomador
            total: number;
            dates: Record<string, { total: number }>;
            clientes: Record<string, {
                total: number;
                dates: Record<string, { total: number }>;
            }>;
        }> = {};
        const datesSet = new Set<string>();
        let totalGeral = 0;

        filteredOS.forEach((os: OSItem) => {
            const recepcaoStr = String(os.data_recepcao || '').trim();
            const hasRecepcao = recepcaoStr !== '' && recepcaoStr !== 'null' && recepcaoStr !== 'undefined' && recepcaoStr !== '0';

            if (!hasRecepcao || !os.cliente) return;
            try {
                const dateObj = new Date(os.data_recepcao);
                if (isNaN(dateObj.getTime())) return;
                const dateKey = format(dateObj, 'yyyy-MM-dd');
                datesSet.add(dateKey);

                const tomadorName = os.tomador || os.cliente;
                const clienteName = os.cliente || 'NÃO INFORMADO';
                const amostras = os.total_amostras || 0;

                totalGeral += amostras;

                if (!matrix[tomadorName]) {
                    matrix[tomadorName] = { clientName: tomadorName, total: 0, dates: {}, clientes: {} };
                }
                const tomadorGroup = matrix[tomadorName];
                tomadorGroup.total += amostras;

                if (!tomadorGroup.dates[dateKey]) tomadorGroup.dates[dateKey] = { total: 0 };
                tomadorGroup.dates[dateKey].total += amostras;

                if (!tomadorGroup.clientes[clienteName]) {
                    tomadorGroup.clientes[clienteName] = { total: 0, dates: {} };
                }
                const clienteGroup = tomadorGroup.clientes[clienteName];
                clienteGroup.total += amostras;

                if (!clienteGroup.dates[dateKey]) clienteGroup.dates[dateKey] = { total: 0 };
                clienteGroup.dates[dateKey].total += amostras;
            } catch (e) { }
        });

        const sortedDates = Array.from(datesSet).sort();
        const sortedClients = Object.values(matrix).sort((a, b) => b.total - a.total).map(g => {
            const sortedClientesKeys = Object.keys(g.clientes).sort((c1, c2) => g.clientes[c2].total - g.clientes[c1].total);
            return {
                ...g,
                sortedClientes: sortedClientesKeys.map(k => ({ name: k, ...g.clientes[k] }))
            };
        });

        return { sortedClients, sortedDates, totalGeral };
    }, [filteredOS]);

    useEffect(() => {
        if (labId) loadData();
    }, [labId]);

    const loadData = async () => {
        if (!labId) return;
        setIsLoading(true);
        try {
            const rawData = (await statusOSService.getAll(labId)) as OSItem[];
            const mappedData = rawData.map(os => {
                let t = os.cliente;
                let c = os.cliente;
                if (os.cliente && os.cliente.includes('|||')) {
                    const parts = os.cliente.split('|||');
                    t = parts[0]?.trim() || t;
                    c = parts[1]?.trim() || t;
                }
                return { ...os, tomador: t, cliente: c };
            });
            setOsList(mappedData);
            const data = mappedData;

            const total = data.length;
            const faturados = data.filter((d: OSItem) => d.status?.toLowerCase().includes('faturado')).length;
            const emAbertoValue = total - faturados;
            const totalAmostrasValue = data.reduce((acc: number, curr: OSItem) => acc + (curr.total_amostras || 0), 0);
            const saldoAmostrasValue = data.filter((d: OSItem) => !d.data_finalizacao && d.data_recepcao).reduce((acc: number, curr: OSItem) => acc + (curr.total_amostras || 0), 0);
            setStats({ total, faturados, emAberto: emAbertoValue, totalAmostras: totalAmostrasValue, saldoAmostras: saldoAmostrasValue });

            try {
                const prodData = await producaoService.list(labId);
                if (prodData) setProductionData(prodData.map((p: ProducaoData) => ({ data_producao: p.data_producao || "", peso: (p.peso as number) || 0 })));
            } catch (err) { console.warn("Producao chart data fail:", err); }

            const topC = data.reduce((acc: Record<string, number>, curr: OSItem) => {
                const cli = curr.cliente || 'Não Informado';
                acc[cli] = (acc[cli] || 0) + (curr.total_amostras || 0);
                return acc;
            }, {} as Record<string, number>);
            const sortedAll = Object.entries(topC).sort(([, a], [, b]) => b - a).map(([n]) => n);
            setSelectedChartClients([...sortedAll, 'Total Recebido']);

            const revs = Array.from(new Set(data.filter((d: OSItem) => d.revisor).map((d: OSItem) => d.revisor))) as string[];
            setSelectedReviewers([...revs, 'Volume Produzido (Análise)', 'Total Revisado (Analistas)', 'Volume Recebido']);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            addToast({ title: "Erro de Conexão", description: "Não foi possível carregar os dados de monitoramento.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!labId) {
            addToast({ title: "Laboratório Inválido", description: "Selecione um laboratório antes de importar a planilha.", type: "error" });
            event.target.value = "";
            return;
        }
        setIsUploading(true);
        try {
            let totalRecords = 0;
            await parseStatusOSFileInChunks(file, async (batch: StatusOSParsed[]) => {
                if (batch.length > 0) {
                    await statusOSService.uploadData(batch, labId);
                    totalRecords += batch.length;
                }
            }, 2000);
            if (totalRecords === 0) { addToast({ title: "Arquivo Vazio", description: "Nenhum dado válido encontrado.", type: "warning" }); return; }
            await loadData();
            addToast({ title: "Sucesso!", description: `${totalRecords} registros processados.`, type: "success" });
        } catch (error: any) {
            console.error("Erro no upload:", error);
            addToast({ title: "Erro de Processamento", description: error.message || "Erro desconhecido", type: "error" });
        } finally {
            setIsUploading(false);
            event.target.value = "";
        }
    };

    const handleClearData = async () => {
        if (!labId || !window.confirm("ATENÇÃO: Tem certeza?")) return;
        setIsLoading(true);
        try {
            await statusOSService.clearData(labId);
            await loadData();
            addToast({ title: "Dados Limpos", type: "success" });
        } catch (error) { addToast({ title: "Erro ao limpar", type: "error" }); } finally { setIsLoading(false); }
    };

    const handleExportPDF = async () => {
        if (!matrixTableRef.current) return;
        setIsGeneratingPDF(true);
        try {
            const element = matrixTableRef.current;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(imgData);
            const icw = pdfWidth - 20;
            const ich = (imgProps.height * icw) / imgProps.width;
            pdf.setFillColor(26, 32, 44); pdf.rect(0, 0, pdfWidth, 20, 'F');
            pdf.setTextColor(255, 255, 255); pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
            pdf.text("ORIGO INTELLIGENCE - RELATÓRIO DE SALDO DIÁRIO", 10, 12);
            pdf.addImage(imgData, "PNG", 10, 25, icw, ich);
            pdf.save(`Relatorio_Saldo_Diario_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
        } catch (error) { console.error("Erro ao gerar PDF:", error); } finally { setIsGeneratingPDF(false); }
    };

    return (
        <div className="max-w-[1400px] mx-auto py-12 px-6 text-black pb-32 min-h-screen font-sans">
            {/* Executive Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 mb-12 animate-in fade-in slide-in-from-top duration-700">
                <div className="flex items-center gap-6">
                    <div className="h-16 w-16 bg-neutral-900 text-white flex items-center justify-center rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Database className="h-8 w-8" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400">Inteligência Operacional</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <h1 className="text-4xl font-serif text-black leading-tight tracking-tight">Monitoramento de O.S.</h1>
                            {user?.acesso === 'admin_global' && (
                                <select
                                    title="Selecione o Laboratório"
                                    aria-label="Selecione o Laboratório"
                                    className="ml-4 bg-white border-2 border-neutral-200 text-black text-[10px] font-bold uppercase tracking-widest rounded-xl px-4 py-2 hover:border-black transition-all cursor-pointer outline-none"
                                    value={labId || ""}
                                    onChange={(e) => {
                                        if (e.target.value) selectLab(e.target.value);
                                    }}
                                >
                                    <option value="" disabled>SELECIONE O LABORATÓRIO</option>
                                    {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                    <div className="relative group flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Buscar O.S, Cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-12 pl-10 pr-4 bg-white border border-neutral-200 text-sm focus:border-black focus:ring-1 focus:ring-black outline-none transition-all rounded-xl"
                        />
                    </div>

                    <div className="flex items-center gap-1 bg-neutral-100 p-1.5 rounded-xl border border-neutral-200/50">
                        <Button variant="ghost" size="sm" onClick={loadData} disabled={isLoading} className="h-9 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:shadow-sm">
                            <RefreshCw className={cn("h-3.5 w-3.5 mr-2", isLoading && "animate-spin")} /> {isLoading ? "Sincronizando..." : "Sincronizar"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleClearData} disabled={isLoading || osList.length === 0} className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Limpar
                        </Button>
                    </div>

                    <div className="relative group">
                        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" title="Importar Excel" aria-label="Importar Excel" />
                        <Button className="h-12 px-8 bg-black hover:bg-neutral-800 text-white rounded-xl shadow-[0_10px_20px_rgba(0,0,0,0.1)] flex items-center gap-3 active:scale-95 transition-all">
                            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                            <span className="text-[11px] font-black uppercase tracking-widest">Importar Planilha</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Contemporary Tab Navigation */}
            <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2 no-scrollbar">
                {[
                    { id: 'geral', label: 'Dashboard', icon: Activity },
                    { id: 'revisores', label: 'Produtividade', icon: Users },
                    { id: 'clientes', label: 'Carteira de Clientes', icon: LayoutGrid },
                    { id: 'saldo_diario', label: 'Saldo Diário', icon: ClipboardList }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex items-center gap-3 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all rounded-2xl border-2 whitespace-nowrap",
                            activeTab === tab.id
                                ? "bg-black text-white border-black shadow-[0_10px_20px_rgba(0,0,0,0.1)]"
                                : "bg-white text-neutral-400 border-neutral-100 hover:border-neutral-200 hover:text-neutral-600"
                        )}
                    >
                        <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-white" : "text-neutral-300")} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'geral' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12 animate-in fade-in duration-1000">
                    <div className="group bg-white border border-neutral-200 p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Registros Ativos</span>
                            <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center"><Activity className="h-4 w-4 text-blue-500" /></div>
                        </div>
                        <div className="text-4xl font-serif text-black mb-1">{stats.total.toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Obras de Serviço Catalogadas</div>
                    </div>

                    <div className="group bg-black p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all duration-500 hover:-translate-y-1">
                        <div className="absolute -right-8 -bottom-8 opacity-10">
                            <Activity className="h-40 w-40 text-white" />
                        </div>
                        <div className="flex items-center justify-between mb-6 relative z-10">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Saldo de Análise</span>
                            <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><ClipboardList className="h-4 w-4 text-white" /></div>
                        </div>
                        <div className="text-4xl font-serif text-white mb-1 relative z-10">{stats.saldoAmostras.toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight relative z-10">Amostras Pendentes de Finalização</div>
                    </div>

                    <div className="group bg-white border border-neutral-200 p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Total Amostras</span>
                            <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center"><Database className="h-4 w-4 text-amber-500" /></div>
                        </div>
                        <div className="text-4xl font-serif text-black mb-1">{stats.totalAmostras.toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Carga total histórica no sistema</div>
                    </div>

                    <div className="group bg-white border border-neutral-200 p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] transition-all duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Ciclo Médio</span>
                            <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center"><RefreshCw className="h-4 w-4 text-emerald-500" /></div>
                        </div>
                        <div className="text-4xl font-serif text-black mb-1">{(stats.total > 0 ? (stats.totalAmostras / stats.total).toFixed(1) : "0")}</div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Amostras por Ordem de Serviço</div>
                    </div>
                </div>
            )}

            {(activeTab === 'geral' || activeTab === 'revisores') && (
                <div className="space-y-8 animate-fade-in">
                    <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                        <div className="flex flex-col gap-6 mb-8">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-100">
                                <div>
                                    <h3 className="text-2xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                                        {activeTab === 'geral' ? <Activity className="h-6 w-6 text-neutral-400" /> : <Users className="h-6 w-6 text-neutral-400" />}
                                        {activeTab === 'geral' ? 'Produção Geral' : 'Performance por Revisor'}
                                    </h3>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">
                                        {activeTab === 'geral' ? 'Visão global de entrada e saída' : 'Produtividade diária dos analistas e volume total'}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            toggleReviewerSelection('Volume Produzido (Análise)');
                                        }}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all cursor-pointer hover:shadow-sm",
                                            selectedReviewers.includes('Volume Produzido (Análise)')
                                                ? "bg-black text-white border-black"
                                                : "bg-white text-neutral-400 border-neutral-100 hover:border-black hover:text-black"
                                        )}
                                    >
                                        <Activity className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Volume Produzido</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            toggleReviewerSelection('Total Revisado (Analistas)');
                                        }}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all cursor-pointer hover:shadow-sm",
                                            selectedReviewers.includes('Total Revisado (Analistas)')
                                                ? "bg-red-600 text-white border-red-600"
                                                : "bg-white text-neutral-400 border-neutral-100 hover:border-red-600 hover:text-red-600"
                                        )}
                                    >
                                        <Users className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Total Revisado</span>
                                    </button>
                                    {activeTab === 'geral' && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                toggleReviewerSelection('Volume Recebido');
                                            }}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-2 rounded-xl border-2 transition-all cursor-pointer hover:shadow-sm",
                                                selectedReviewers.includes('Volume Recebido')
                                                    ? "bg-blue-600 text-white border-blue-600"
                                                    : "bg-white text-neutral-400 border-neutral-100 hover:border-blue-600 hover:text-blue-600"
                                            )}
                                        >
                                            <Inbox className="h-3.5 w-3.5" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Volume Recebido</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {activeTab === 'revisores' && (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Analistas:</span>
                                        <span className="text-[8px] font-bold text-neutral-300 uppercase italic">Arraste para ver a lista completa →</span>
                                    </div>
                                    <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2">
                                        {revisorDailyStats.keys.map((rev: string) => {
                                            const totalRev = osList.filter(o => o.revisor === rev).reduce((sum, o) => sum + (o.total_amostras || 0), 0);
                                            const hashRev = rev.replace(/[^a-zA-Z0-9]/g, '') + Math.random().toString(36).substr(2, 4);
                                            return (
                                                <button
                                                    key={rev}
                                                    onClick={() => toggleReviewerSelection(rev)}
                                                    className={cn(
                                                        "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit",
                                                        selectedReviewers.includes(rev)
                                                            ? `text-white border-transparent rev-btn-${hashRev}`
                                                            : "bg-neutral-50/50 text-neutral-400 border-transparent hover:bg-white hover:border-neutral-200"
                                                    )}
                                                >
                                                    {selectedReviewers.includes(rev) && (
                                                        <style>{`
                                                        .rev-btn-${hashRev} { background-color: ${revisorDailyStats.keyColors[rev]}; box-shadow: 0 4px 12px ${revisorDailyStats.keyColors[rev]}33; }
                                                    `}</style>
                                                    )}
                                                    <style>{`.rev-ind-${hashRev} { background-color: ${selectedReviewers.includes(rev) ? 'white' : (revisorDailyStats.keyColors[rev] || '#e5e5e5')}; }`}</style>

                                                    <div className={`h-1.5 w-1.5 rounded-full rev-ind-${hashRev}`} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">{rev}</span>
                                                    <span className="text-[10px] font-mono font-bold opacity-80 pl-2 border-l border-white/20">{totalRev.toLocaleString('pt-BR')}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="h-[450px] w-full bg-neutral-50/30 rounded-2xl p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={revisorDailyStats.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false} tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false} tickLine={false}
                                        tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }}
                                    />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    {selectedReviewers.includes('Volume Produzido (Análise)') && (
                                        <Line type="monotone" name="Volume Produzido" dataKey="Volume Produzido (Análise)" stroke="#000" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    )}
                                    {selectedReviewers.includes('Total Revisado (Analistas)') && (
                                        <Line type="monotone" name="Total Revisado" dataKey="Total Revisado (Analistas)" stroke="#dc2626" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    )}
                                    {(activeTab === 'geral' && selectedReviewers.includes('Volume Recebido')) && (
                                        <Line type="monotone" name="Volume Recebido" dataKey="Volume Recebido" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    )}
                                    {activeTab === 'revisores' && revisorDailyStats.keys.filter((k: string) => selectedReviewers.includes(k)).map((rev: string) => (
                                        <Line key={rev} type="monotone" dataKey={rev} stroke={revisorDailyStats.keyColors[rev]} strokeWidth={2} dot={false} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {activeTab === 'revisores' && (
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
                                        {revisorStats.map((stat, i) => (
                                            <tr key={stat.name} className="hover:bg-neutral-50/50 transition-colors group cursor-pointer" onClick={() => toggleReviewerSelection(stat.name)}>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-bold text-neutral-300 w-4">#{i + 1}</span>
                                                        <div className={cn("h-4 w-4 rounded border flex items-center justify-center transition-all", selectedReviewers.includes(stat.name) ? "bg-black border-black text-white" : "border-neutral-300 bg-white group-hover:border-neutral-500")}>
                                                            {selectedReviewers.includes(stat.name) && <Star className="h-2 w-2 fill-white" />}
                                                        </div>
                                                        <span className="font-bold text-neutral-800 tracking-wider text-[11px]">{stat.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right font-mono font-bold">{stat.total.toLocaleString('pt-BR')}</td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-1.5 bg-neutral-100 rounded-full flex-1 overflow-hidden">
                                                            <div className="h-full bg-black rounded-full transition-all" style={{ width: `${(stat.total / (revisorStats[0]?.total || 1)) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'clientes' && (
                <div className="space-y-8 animate-fade-in">
                    <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                        <div className="flex flex-col gap-6 mb-8">
                            <div>
                                <h3 className="text-2xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                                    <LayoutGrid className="h-6 w-6 text-neutral-400" />
                                    Distribuição por Cliente
                                </h3>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">Volume de amostras recebidas por cliente no tempo</p>
                            </div>

                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Clientes Ativos:</span>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setSelectedChartClients([])}
                                            className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:text-red-500 transition-colors flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-red-50 rounded-lg cursor-pointer"
                                        >
                                            <Trash2 className="h-3 w-3" /> Limpar Filtros
                                        </button>
                                        <span className="text-[8px] font-bold text-neutral-300 uppercase italic">Arraste para ver mais clientes →</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto pb-4 -mx-2 px-2">
                                    {clienteDailyStats.keys.includes('Total Recebido') && (
                                        <button
                                            onClick={() => toggleClientSelection('Total Recebido')}
                                            className={cn(
                                                "flex items-center gap-3 px-5 py-3 rounded-xl border-2 transition-all shrink-0 min-w-fit shadow-sm",
                                                selectedChartClients.includes('Total Recebido')
                                                    ? "bg-black text-white border-black"
                                                    : "bg-neutral-100 text-neutral-500 border-transparent hover:bg-neutral-200 hover:text-black"
                                            )}
                                        >
                                            <div className={cn("h-2 w-2 rounded-full", selectedChartClients.includes('Total Recebido') ? "bg-white" : "bg-black")} />
                                            <div className="flex flex-col items-start">
                                                <span className="text-[11px] font-black uppercase tracking-widest">Total Recebido</span>
                                            </div>
                                        </button>
                                    )}
                                    <div className="w-px h-8 bg-neutral-200 mx-2 flex-shrink-0" />
                                    {clienteDailyStats.keys.filter(k => k !== 'Total Recebido').slice(0, 30).map((cName: string) => {
                                        const cInfo = clienteStats.find((item: any) => item.name === cName) || { avgTime: '-', total: 0 };
                                        const hashClient = cName.replace(/[^a-zA-Z0-9]/g, '') + Math.random().toString(36).substr(2, 4);
                                        return (
                                            <button
                                                key={cName}
                                                onClick={() => toggleClientSelection(cName)}
                                                className={cn(
                                                    "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all shrink-0 min-w-fit",
                                                    selectedChartClients.includes(cName)
                                                        ? `text-white border-transparent client-btn-${hashClient}`
                                                        : "bg-neutral-50/50 text-neutral-400 border-transparent hover:bg-white hover:border-neutral-200"
                                                )}
                                            >
                                                {selectedChartClients.includes(cName) && (
                                                    <style>{`
                                                    .client-btn-${hashClient} { background-color: ${clienteDailyStats.keyColors[cName]}; box-shadow: 0 4px 12px ${clienteDailyStats.keyColors[cName]}33; }
                                                `}</style>
                                                )}
                                                <style>{`.client-ind-${hashClient} { background-color: ${selectedChartClients.includes(cName) ? 'white' : (clienteDailyStats.keyColors[cName] || '#e5e5e5')}; }`}</style>
                                                <div className={`h-1.5 w-1.5 rounded-full client-ind-${hashClient}`} />
                                                <div className="flex flex-col items-start">
                                                    <span className="text-[9px] font-black uppercase tracking-wider">{cName}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[7px] font-mono opacity-60">Avg: {cInfo.avgTime}h</span>
                                                        <span className="text-[8px] font-mono font-bold opacity-80 pl-2 border-l border-current/20">{cInfo.total.toLocaleString('pt-BR')}</span>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="h-[450px] w-full bg-neutral-50/30 rounded-2xl p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={clienteDailyStats.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 700 }} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    {clienteDailyStats.keys.filter(key => selectedChartClients.includes(key)).map((key: string) => (
                                        <Line
                                            key={key}
                                            type="monotone"
                                            connectNulls={true}
                                            dataKey={key}
                                            stroke={clienteDailyStats.keyColors[key]}
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 0, fill: clienteDailyStats.keyColors[key] }}
                                            activeDot={{ r: 7, strokeWidth: 0, fill: clienteDailyStats.keyColors[key] }}
                                            strokeDasharray={key === 'Outros' ? "5 5" : "0"}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* New Pivot Table */}
                    <div className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-12 w-full">
                        <div className="p-8 pb-4 border-b border-neutral-100 flex items-center gap-4">
                            <div className="h-10 w-10 bg-neutral-100 text-neutral-500 rounded-xl flex items-center justify-center">
                                <Database className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-xl font-serif text-black leading-tight tracking-tight">Recebimento Diário (Detalhado)</h3>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-0.5">Amostras recebidas por cliente agrupadas por data</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto no-scrollbar max-h-[600px] overflow-y-auto w-full relative">
                            <table className="w-full text-[11px] text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-30 border-b-2 border-neutral-200">
                                    <tr className="bg-neutral-50/50">
                                        <th className="p-3 text-left border-b border-r border-neutral-200 bg-neutral-50 sticky left-0 z-40 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Rótulos de Linha</span>
                                        </th>
                                        {carteiraClientesPivotStats.sortedDates.map((d: string) => (
                                            <th key={d} className="p-3 text-center border-b border-r border-neutral-100 min-w-[85px] whitespace-nowrap bg-neutral-50/50">
                                                <div className="text-[11px] font-serif text-black">{format(new Date(d + 'T12:00:00'), 'dd/MMM', { locale: ptBR })}</div>
                                            </th>
                                        ))}
                                        <th className="p-3 text-right border-b border-neutral-200 bg-neutral-100/50 sticky right-0 z-30 w-28 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Total Geral</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 font-mono">
                                    {carteiraClientesPivotStats.sortedClients.map((client: any) => (
                                        <React.Fragment key={client.clientName}>
                                            <tr className="bg-white hover:bg-neutral-50 transition-colors group cursor-pointer" onClick={() => toggleClientCollapse(client.clientName)}>
                                                <td className="p-3 flex items-center gap-2 font-bold text-black border-l-4 border-l-black border-r border-neutral-200 sticky left-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                    {collapsedClients.includes(client.clientName) ? <PlusSquare className="h-3.5 w-3.5 text-black" /> : <MinusSquare className="h-3.5 w-3.5 text-black" />}
                                                    <span className="truncate" title={client.clientName}>{client.clientName}</span>
                                                </td>
                                                {carteiraClientesPivotStats.sortedDates.map((date: string) => {
                                                    const total = client.dates[date]?.total || 0;
                                                    return (
                                                        <td key={date} className="p-1.5 text-center border-r border-neutral-100 transition-colors relative overflow-hidden text-black font-bold group-hover:bg-neutral-50">
                                                            {total > 0 ? total : ""}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-3 text-right font-black text-base text-black border-neutral-200 sticky right-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                                    {client.total.toLocaleString('pt-BR')}
                                                </td>
                                            </tr>
                                            {!collapsedClients.includes(client.clientName) && client.sortedClientes.map((clienteNode: any, idx: number) => (
                                                <tr key={`${client.clientName}-${clienteNode.name}`} className={cn("bg-neutral-50/30 hover:bg-neutral-50/80 transition-colors", idx === client.sortedClientes.length - 1 ? "border-b-2 border-b-neutral-200" : "")}>
                                                    <td className="p-3 pl-10 text-[10px] font-bold text-neutral-600 truncate border-r border-neutral-200 sticky left-0 z-10 bg-neutral-50/90 shadow-[2px_0_5px_rgba(0,0,0,0.02)]" title={clienteNode.name}>
                                                        {clienteNode.name}
                                                    </td>
                                                    {carteiraClientesPivotStats.sortedDates.map((date: string) => {
                                                        const total = clienteNode.dates[date]?.total || 0;
                                                        return (
                                                            <td key={date} className="p-1.5 text-center border-r border-neutral-100/50 text-neutral-500 font-bold">
                                                                {total > 0 ? total : ""}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="p-3 text-right font-black text-sm text-neutral-600 border-neutral-200 sticky right-0 z-10 bg-neutral-50/90 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                                        {clienteNode.total.toLocaleString('pt-BR')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-black text-white font-bold border-t-2 border-black z-20">
                                    <tr>
                                        <td className="p-3 uppercase tracking-widest text-left font-serif sticky left-0 bg-black z-30 shadow-[2px_0_5px_rgb(0,0,0)]">Total Geral</td>
                                        {carteiraClientesPivotStats.sortedDates.map((date: string) => {
                                            const totalCol = carteiraClientesPivotStats.sortedClients.reduce((acc, client) => acc + (client.dates[date]?.total || 0), 0);
                                            return <td key={date} className="p-3 text-center font-mono text-sm">{totalCol > 0 ? totalCol.toLocaleString('pt-BR') : ''}</td>
                                        })}
                                        <td className="p-3 text-right font-mono text-sm sticky right-0 bg-black z-30 shadow-[-2px_0_5px_rgb(0,0,0)]">{carteiraClientesPivotStats.totalGeral.toLocaleString('pt-BR')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'saldo_diario' && (
                <div className="space-y-8 animate-fade-in pb-20">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm">
                        <div>
                            <h3 className="text-2xl font-serif text-black leading-tight tracking-tight flex items-center gap-2">
                                <Clock className="h-6 w-6 text-neutral-400" />
                                Matriz de Envelhecimento
                            </h3>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mt-1">Status de pendências por cliente e tempo de recepção</p>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="flex gap-4 border-r border-neutral-100 pr-6 mr-6">
                                <div className="text-center">
                                    <div className="text-xl font-serif text-amber-500">{saldoDiarioPivotStats.totalPendingAmostras.toLocaleString('pt-BR')}</div>
                                    <div className="text-[9px] font-bold uppercase text-neutral-400">Total Pendente</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xl font-serif text-red-500">{saldoDiarioPivotStats.criticalCount}</div>
                                    <div className="text-[9px] font-bold uppercase text-neutral-400">Críticos (+48h)</div>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isGeneratingPDF} className="h-10 px-6 rounded-xl border-neutral-200 font-bold text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all">
                                {isGeneratingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />} Exportar PDF
                            </Button>
                        </div>
                    </div>

                    <div ref={matrixTableRef} className="bg-white border border-neutral-200 rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-8">
                        <div className="overflow-x-auto no-scrollbar max-h-[600px] overflow-y-auto w-full relative">
                            <table className="w-full text-[11px] text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-30 border-b-2 border-neutral-200">
                                    <tr className="bg-neutral-50/50">
                                        <th className="p-3 text-left border-b border-r border-neutral-200 bg-neutral-50 sticky left-0 z-40 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Tomador e Cliente</span>
                                        </th>
                                        {saldoDiarioPivotStats.sortedDates.map((d: string) => (
                                            <th key={d} className="p-3 text-center border-b border-r border-neutral-100 min-w-[85px] whitespace-nowrap bg-neutral-50/50">
                                                <div className="text-[11px] font-serif text-black">{format(new Date(d + 'T12:00:00'), 'dd/MM')}</div>
                                                <div className="text-[8px] font-black uppercase text-neutral-400 tracking-tighter">{format(new Date(d + 'T12:00:00'), 'iii', { locale: ptBR })}</div>
                                            </th>
                                        ))}
                                        <th className="p-3 text-right border-b border-neutral-200 bg-neutral-100/50 sticky right-0 z-30 w-28 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Global</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 font-mono">
                                    {saldoDiarioPivotStats.sortedClients.map((client: any) => (
                                        <React.Fragment key={client.clientName}>
                                            <tr className="bg-white hover:bg-neutral-50 transition-colors group cursor-pointer" onClick={() => toggleClientCollapse(client.clientName)}>
                                                <td className="p-3 flex items-center gap-2 font-bold text-black border-l-4 border-l-black border-r border-neutral-200 sticky left-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                    {collapsedClients.includes(client.clientName) ? <PlusSquare className="h-3.5 w-3.5 text-black" /> : <MinusSquare className="h-3.5 w-3.5 text-black" />}
                                                    <span className="truncate">{client.clientName}</span>
                                                </td>
                                                {saldoDiarioPivotStats.sortedDates.map((date: string) => {
                                                    const cell = client.dates[date];
                                                    const total = cell?.total || 0;
                                                    const pin = pinnedCells[`${client.clientName}|${date}`];

                                                    let cellStyle = "text-neutral-200";
                                                    if (pin === 1) cellStyle = "bg-red-500/90 text-white border-red-600 shadow-inner";
                                                    else if (pin === 2) cellStyle = "bg-amber-400/90 text-white border-amber-500 shadow-inner";
                                                    else if (pin === 3) cellStyle = "bg-emerald-500/90 text-white border-emerald-600 shadow-inner";
                                                    else if (total > 0 && cell?.maxDelay >= 48) cellStyle = "bg-white text-black"; // Auto-Red removed, leaving dot? Clean as requested
                                                    else if (total > 0 && cell?.maxDelay >= 24) cellStyle = "bg-white text-black"; // Auto-Yellow removed, using plain text
                                                    else if (total > 0) cellStyle = "bg-white text-black";

                                                    return (
                                                        <td key={date}
                                                            onClick={(e) => { e.stopPropagation(); togglePinCell(client.clientName, date); }}
                                                            className={cn("p-1.5 text-center border-r border-neutral-100 transition-colors relative overflow-hidden", cellStyle)}
                                                        >
                                                            {total > 0 ? (
                                                                <div className="flex flex-col items-center justify-center h-full py-1">
                                                                    <span className="font-mono font-black text-sm relative z-10 leading-none">{total}</span>
                                                                    {cell.maxDelay > 0 && (
                                                                        <span className={cn("text-[8px] font-black opacity-60 mt-0.5 leading-none", pin ? "text-white" : "text-black/40")}>{cell.maxDelay}h</span>
                                                                    )}
                                                                    {cell.maxDelay >= 48 && !pin && (
                                                                        <div className="absolute top-1 right-1">
                                                                            <div className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : ""}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-3 text-right font-black text-base text-black border-neutral-200 sticky right-0 z-10 bg-white group-hover:bg-neutral-50 transition-colors shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                                    {client.total.toLocaleString('pt-BR')}
                                                </td>
                                            </tr>
                                            {!collapsedClients.includes(client.clientName) && client.sortedClientes.map((clienteNode: any, idx: number) => (
                                                <tr key={`${client.clientName}-${clienteNode.name}`} className={cn("bg-neutral-50/30 hover:bg-neutral-50/80 transition-colors", idx === client.sortedClientes.length - 1 ? "border-b-2 border-b-neutral-200" : "")}>
                                                    <td className="p-3 pl-10 text-[10px] font-bold text-neutral-600 truncate border-r border-neutral-200 sticky left-0 z-10 bg-neutral-50/90 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                        {clienteNode.name}
                                                    </td>
                                                    {saldoDiarioPivotStats.sortedDates.map((date: string) => {
                                                        const cell = clienteNode.dates[date];
                                                        const total = cell?.total || 0;
                                                        return (
                                                            <td key={date} className="p-1.5 text-center border-r border-neutral-100/50">
                                                                {total > 0 ? (
                                                                    <div className="flex flex-col items-center text-neutral-500 py-1 relative">
                                                                        <span className="font-mono font-bold text-[11px] leading-none">{total}</span>
                                                                        {cell.maxDelay > 0 && <span className="text-[7px] font-black opacity-50 mt-0.5 leading-none">{cell.maxDelay}h</span>}
                                                                        {cell.maxDelay >= 48 && (
                                                                            <div className="absolute top-0 right-0">
                                                                                <div className="h-1 w-1 rounded-full bg-red-400/50" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : ""}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="p-3 text-right font-black text-sm text-neutral-600 border-neutral-200 sticky right-0 z-10 bg-neutral-50/90 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">
                                                        {clienteNode.total.toLocaleString('pt-BR')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-black text-white font-bold border-t-2 border-black z-20">
                                    <tr>
                                        <td className="p-3 uppercase tracking-widest text-left font-serif sticky left-0 bg-black z-30 shadow-[2px_0_5px_rgb(0,0,0)]">Total Geral</td>
                                        {saldoDiarioPivotStats.sortedDates.map((date: string) => {
                                            const totalCol = saldoDiarioPivotStats.sortedClients.reduce((acc, client) => acc + (client.dates[date]?.total || 0), 0);
                                            return <td key={date} className="p-3 text-center font-mono text-sm">{totalCol > 0 ? totalCol.toLocaleString('pt-BR') : ''}</td>
                                        })}
                                        <td className="p-3 text-right font-mono text-sm sticky right-0 bg-black z-30 shadow-[-2px_0_5px_rgb(0,0,0)]">{saldoDiarioPivotStats.totalGeral.toLocaleString('pt-BR')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
}

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { parseStatusOSFileInChunks, type StatusOSParsed } from "@/lib/statusOSParser";
import { statusOSService } from "@/services/statusOS.service";
import { producaoService } from "@/services/producao.service";
import type { ProducaoData } from "@/services/producao.service";
import { LabService, type Lab } from "@/entities/Lab";
import { Button } from "@/components/ui/button";
import { Upload, RefreshCw, Trash2, Loader2, Users, LayoutGrid, ClipboardList, Database, Activity } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useToast } from "@/contexts/ToastContext";
import { supabase } from "@/lib/supabase"; // Ensure supabase is imported

import { GeneralStatsGrid } from "@/components/monitoramento/GeneralStatsGrid";
import { ConsolidatedCharts } from "@/components/monitoramento/ConsolidatedCharts";
import { ReviewerPerformanceSection } from "@/components/monitoramento/ReviewerPerformanceSection";
import { ReviewersTable } from "@/components/monitoramento/ReviewersTable";
import { IntelligenceAnalytics } from "@/components/monitoramento/IntelligenceAnalytics";
import { ClientsTabSection } from "@/components/monitoramento/ClientsTabSection";
import { DailyBalanceTabSection } from "@/components/monitoramento/DailyBalanceTabSection";
import { type IProducaoVinculo, type OSItem } from "@/components/monitoramento/types";

export default function MonitoramentoOS() {
    const { currentLab, user, selectLab } = useAuth();
    const labId = currentLab?.id || user?.lab_id || (user?.acesso === 'admin_global' ? 'all' : undefined);
    const { addToast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [labs, setLabs] = useState<Lab[]>([]);
    const [osList, setOsList] = useState<OSItem[]>([]);
    const [productionData, setProductionData] = useState<IProducaoVinculo[]>([]);
    const [stats, setStats] = useState({ total: 0, faturados: 0, emAberto: 0, totalAmostras: 0, saldoAmostras: 0 });
    const [activeTab, setActiveTab] = useState<'geral' | 'revisores' | 'clientes' | 'saldo_diario'>('geral');
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const matrixTableRef = useRef<HTMLDivElement>(null);
    const analiticoSectionRef = useRef<HTMLDivElement>(null);
    const [collapsedClients, setCollapsedClients] = React.useState<string[]>([]);
    const [analysisPeriod, setAnalysisPeriod] = React.useState<7 | 14 | 21 | 30>(14);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [analyticsLabId, setAnalyticsLabId] = useState<string>('all');

    const [selectedChartClients, setSelectedChartClients] = useState<string[]>([]);
    const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
    const [selectedConsolidatedKeys, setSelectedConsolidatedKeys] = React.useState<string[]>([]);

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
        return osList;
    }, [osList]);

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
            }, 5000); // 5s debounce — evita queries em rajada durante atualizações em massa
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

        // Filtro dinâmico por laboratório quando em modo 'all'
        const activeLabIds = labId === 'all'
            ? labs.filter(l => selectedConsolidatedKeys.includes(l.nome + ' (Recebido)')).map(l => l.id)
            : [];
        const isFilteringLabs = labId === 'all' && activeLabIds.length > 0;

        osList.forEach((os: OSItem) => {
            // Se estiver filtrando labs, ignorar registros que não pertençam aos labs selecionados
            if (isFilteringLabs && (!os.lab_id || !activeLabIds.includes(os.lab_id))) return;

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
            // Se estiver filtrando labs, ignorar registros que não pertençam aos labs selecionados
            if (isFilteringLabs && (!prod.lab_id || !activeLabIds.includes(prod.lab_id))) return;

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
    }, [osList, productionData, selectedConsolidatedKeys, labs, labId]);

    const clienteDailyStats = React.useMemo(() => {
        const grouped: Record<string, any> = {};
        const stableClients = clienteStats.slice(0, 30).map((c: any) => c.name);

        osList.forEach((os: OSItem) => {
            if (!os.cliente) return;
            const dateStr = os.data_recepcao;

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

    // const saldoChartData = React.useMemo(() => {
    //     let buckets = { 'No Prazo (<24h)': 0, 'Atenção (24-48h)': 0, 'Crítico (>48h)': 0 };
    //     const now = new Date();

    //     filteredOS.forEach((os: OSItem) => {
    //         const finalizacaoStr = String(os.data_finalizacao || '').trim();
    //         const recepcaoStr = String(os.data_recepcao || '').trim();
    //         const hasFinalizacao = finalizacaoStr !== '' && finalizacaoStr !== 'null' && finalizacaoStr !== 'undefined' && finalizacaoStr !== '0';
    //         const hasRecepcao = recepcaoStr !== '' && recepcaoStr !== 'null' && recepcaoStr !== 'undefined' && recepcaoStr !== '0';

    //         // REGRA: Pendente apenas se coluna 'Finalizado' estiver vazia 
    //         if (hasFinalizacao || !hasRecepcao) return;
    //         try {
    //             const dateObj = new Date(os.data_recepcao);
    //             if (isNaN(dateObj.getTime())) return;
    //             const hours = differenceInHours(now, dateObj);
    //             if (hours < 24) buckets['No Prazo (<24h)'] += os.total_amostras;
    //             else if (hours < 48) buckets['Atenção (24-48h)'] += os.total_amostras;
    //             else buckets['Crítico (>48h)'] += os.total_amostras;
    //         } catch (e) { }
    //     });

    //     return [
    //         { name: 'No Prazo', value: buckets['No Prazo (<24h)'], fill: '#10b981', fullLabel: 'No Prazo (<24h)' },
    //         { name: 'Atenção', value: buckets['Atenção (24-48h)'], fill: '#f59e0b', fullLabel: 'Atenção (24-48h)' },
    //         { name: 'Crítico', value: buckets['Crítico (>48h)'], fill: '#ef4444', fullLabel: 'Crítico (>48h)' }
    //     ];
    // }, [filteredOS]);

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

    // Gráfico por dia quando 'Todos os Laboratórios' está selecionado
    const consolidatedDailyStats = React.useMemo(() => {
        if (labId !== 'all' || labs.length === 0) return { data: [], keys: [], keyColors: {} };

        const grouped: Record<string, any> = {};
        const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4'];

        // Volume Recebido por lab por dia
        osList.forEach(os => {
            if (!os.data_recepcao || !os.lab_id) return;
            const labInfo = labs.find(l => l.id === os.lab_id);
            if (!labInfo) return;
            try {
                const dateObj = new Date(os.data_recepcao);
                if (isNaN(dateObj.getTime())) return;
                const dateKey = format(dateObj, 'yyyy-MM-dd');
                const displayDate = format(dateObj, 'dd/MM');
                if (!grouped[dateKey]) grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                const colKey = labInfo.nome + ' (Recebido)';
                grouped[dateKey][colKey] = (grouped[dateKey][colKey] || 0) + (os.total_amostras || 0);
                grouped[dateKey]['Total Recebido'] = (grouped[dateKey]['Total Recebido'] || 0) + (os.total_amostras || 0);
            } catch (e) { }
        });

        // Volume Produzido por lab por dia
        productionData.forEach(prod => {
            if (!prod.data_producao || !prod.lab_id) return;
            const labInfo = labs.find(l => l.id === prod.lab_id);
            if (!labInfo) return;
            try {
                const dateParts = prod.data_producao.split('-');
                const prodDateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 12, 0, 0);
                if (isNaN(prodDateObj.getTime())) return;
                const dateKey = format(prodDateObj, 'yyyy-MM-dd');
                const displayDate = format(prodDateObj, 'dd/MM');
                if (!grouped[dateKey]) grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                const colKey = labInfo.nome + ' (Produzido)';
                grouped[dateKey][colKey] = (grouped[dateKey][colKey] || 0) + (prod.peso || 0);
                grouped[dateKey]['Total Produzido'] = (grouped[dateKey]['Total Produzido'] || 0) + (prod.peso || 0);
            } catch (e) { }
        });

        const dataArr = Object.values(grouped).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate));

        // Montar keys: uma linha de 'Recebido' por lab + 'Total Recebido'
        const recKeys = labs.map(l => l.nome + ' (Recebido)');
        const prodKeys = labs.map(l => l.nome + ' (Produzido)');
        const keysList = [...recKeys, ...prodKeys, 'Total Recebido', 'Total Produzido'];

        const keyColors: Record<string, string> = {};
        labs.forEach((l, idx) => {
            const c = COLORS[idx % COLORS.length];
            keyColors[l.nome + ' (Recebido)'] = c;
            keyColors[l.nome + ' (Produzido)'] = c;
        });
        keyColors['Total Recebido'] = '#000000';
        keyColors['Total Produzido'] = '#6366f1';

        return { data: dataArr, keys: keysList, keyColors };
    }, [labId, labs, osList, productionData]);

    // Inicializa as keys selecionadas quando os dados chegam
    React.useEffect(() => {
        if (consolidatedDailyStats.keys.length > 0 && selectedConsolidatedKeys.length === 0) {
            setSelectedConsolidatedKeys(['Total Recebido', 'Total Produzido']);
        }
    }, [consolidatedDailyStats.keys]);

    const toggleConsolidatedKey = (key: string) => {
        setSelectedConsolidatedKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };


    const analysisMetrics = React.useMemo(() => {
        const days = analysisPeriod;

        // ─── Janela de tempo: últimos N dias ───────────────────────────────────
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        cutoff.setHours(0, 0, 0, 0);

        const prevCutoff = new Date();
        prevCutoff.setDate(prevCutoff.getDate() - days * 2);
        prevCutoff.setHours(0, 0, 0, 0);

        // Filtro dinâmico por lab (quando em modo 'all' + seleção no dropdown da sessão analítica)
        const applyLabFilter = (testLabId?: string) => {
            if (labId !== 'all') return true; // Confia no filtro global se não for todos
            if (analyticsLabId === 'all') return true; // Se estiver 'todos' localmente
            return testLabId === analyticsLabId;
        };

        const inWindow = (os: OSItem, from: Date, to: Date) => {
            if (!os.data_recepcao) return false;
            const d = new Date(os.data_recepcao);
            return d >= from && d < to;
        };

        // O.S. do período atual e período anterior
        const currentOS = osList.filter(os => {
            if (!applyLabFilter(os.lab_id)) return false;
            return inWindow(os, cutoff, new Date(cutoff.getTime() + days * 86400000));
        });
        const prevOS = osList.filter(os => {
            if (!applyLabFilter(os.lab_id)) return false;
            return inWindow(os, prevCutoff, cutoff);
        });

        if (currentOS.length === 0 && osList.length === 0) return null;

        // ─── Volume totais ────────────────────────────────────────────────────
        const sumAmostras = (arr: OSItem[]) =>
            arr.reduce((acc, os) => acc + (os.total_amostras || 0), 0);

        // Recebido = todas as O.S. que chegaram no período
        const currentReceived = sumAmostras(currentOS);
        const prevReceived = sumAmostras(prevOS);

        // Revisado = O.S. finalizadas cujo data_finalizacao cai no período atual
        const now = new Date();
        const revisedOS = osList.filter(os => {
            if (!os.data_finalizacao) return false;
            if (!applyLabFilter(os.lab_id)) return false;
            const d = new Date(os.data_finalizacao);
            return d >= cutoff && d <= now;
        });
        const prevRevisedOS = osList.filter(os => {
            if (!os.data_finalizacao) return false;
            if (!applyLabFilter(os.lab_id)) return false;
            const d = new Date(os.data_finalizacao);
            return d >= prevCutoff && d < cutoff;
        });
        const currentRevised = sumAmostras(revisedOS);
        const prevRevised = sumAmostras(prevRevisedOS);

        // Produzido (peso físico) do período — via dados de producaoService
        const prodWindowStart = cutoff.toISOString().split('T')[0];
        const filteredProd = productionData.filter(p => {
            if (!p.data_producao) return false;
            if (!applyLabFilter(p.lab_id)) return false;
            return p.data_producao >= prodWindowStart;
        });
        const prevProdWindowStart = prevCutoff.toISOString().split('T')[0];
        const prevFilteredProd = productionData.filter(p => {
            if (!p.data_producao) return false;
            if (!applyLabFilter(p.lab_id)) return false;
            return p.data_producao >= prevProdWindowStart && p.data_producao < prodWindowStart;
        });
        const currentProduced = filteredProd.reduce((acc, p) => acc + (p.peso || 0), 0);
        const prevProduced = prevFilteredProd.reduce((acc, p) => acc + (p.peso || 0), 0);

        // ─── ÍNDICE DE EFICIÊNCIA — Média Ponderada por Volume ────────────────
        // Para cada O.S. recebida no período, calcula:
        //   eficiência_i = amostras_finalizadas_i / total_amostras_i  (entre 0 e 1+)
        //   peso_i       = total_amostras_i
        // Índice Consolidado = Σ(eficiência_i × peso_i) / Σ(peso_i)
        let sumWeightedEfficiency = 0;
        let sumWeights = 0;

        currentOS.forEach(os => {
            const peso = os.total_amostras || 0;
            if (peso === 0) return;
            // Amostras finalizadas desta O.S.: 1 se já finalizou, proporcional se não
            const finalizada = !!os.data_finalizacao;
            const eficiencia = finalizada ? 1 : 0;
            sumWeightedEfficiency += eficiencia * peso;
            sumWeights += peso;
        });

        // Taxa de revisão = Revisado / Recebido (ponderada pelo período)
        const revisionRate = currentReceived > 0 ? (currentRevised / currentReceived) : 0;
        // Taxa de absorção = Produzido / Recebido
        const absorptionRate = currentReceived > 0 ? (currentProduced / currentReceived) : 0;
        // Índice ponderado de eficiência (finalização de O.S.)
        const weightedEfficiencyIndex = sumWeights > 0 ? (sumWeightedEfficiency / sumWeights) : 0;

        // ─── Tendências comparando período atual vs anterior ──────────────────
        const calcTrend = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        };

        const prodTrend = calcTrend(currentProduced, prevProduced);
        const revTrend = calcTrend(currentRevised, prevRevised);
        const recepTrend = calcTrend(currentReceived, prevReceived);

        // Projeção simples (extrapolação linear)
        const avgProduced = filteredProd.length > 0 ? (currentProduced / filteredProd.length) : 0;
        const projectedProduction = avgProduced * days;

        // ─── Alertas inteligentes ─────────────────────────────────────────────
        const alerts: { type: string; message: string }[] = [];
        if (revisionRate < 0.85 && currentReceived > 100) {
            alerts.push({
                type: 'warning',
                message: `Taxa de revisão crítica: ${(revisionRate * 100).toFixed(1)}% — Abaixo de 85% do recebido.`
            });
        }
        if (absorptionRate > 0 && absorptionRate < 0.7) {
            alerts.push({
                type: 'warning',
                message: `Capacidade de produção abaixo de 70% do volume recebido — Risco de acúmulo de saldo.`
            });
        }
        if (currentReceived > currentProduced * 1.5 && currentReceived > 200) {
            alerts.push({
                type: 'warning',
                message: 'Volume de entrada está superando a capacidade de produção (Risco de Saldo).'
            });
        }
        if (absorptionRate > 1.1) {
            alerts.push({
                type: 'success',
                message: 'Alta Performance: O laboratório está processando o saldo acumulado.'
            });
        }
        if (weightedEfficiencyIndex > 0.9) {
            alerts.push({
                type: 'success',
                message: `Excelente taxa de finalização no período: ${(weightedEfficiencyIndex * 100).toFixed(1)}% das O.S. concluídas.`
            });
        }

        // ─── Encontrar a última data disponível (evitando gaps com o "NOW" se a base for antiga) ───
        let maxDateStr = "";

        osList.forEach(os => {
            if (!applyLabFilter(os.lab_id)) return;
            if (os.data_recepcao && os.data_recepcao.substring(0, 10) > maxDateStr) maxDateStr = os.data_recepcao.substring(0, 10);
            if (os.data_finalizacao && os.data_finalizacao.substring(0, 10) > maxDateStr) maxDateStr = os.data_finalizacao.substring(0, 10);
        });
        productionData.forEach(prod => {
            if (!applyLabFilter(prod.lab_id)) return;
            if (prod.data_producao && prod.data_producao.substring(0, 10) > maxDateStr) maxDateStr = prod.data_producao.substring(0, 10);
        });

        const baseEndDate = maxDateStr ? new Date(maxDateStr + 'T12:00:00') : new Date(now);

        // ─── Dados suavizados para o gráfico (Geração de 14 dias contíguos até a data base) ────
        const daysMap = new Map();
        for (let i = 13; i >= 0; i--) {
            const d = new Date(baseEndDate);
            d.setDate(d.getDate() - i);
            const dateKey = format(d, 'yyyy-MM-dd');
            const displayDate = format(d, 'dd/MM');
            daysMap.set(dateKey, { name: displayDate, 'Volume Produzido (Análise)': 0, 'Volume Recebido': 0, 'Total Revisado (Analistas)': 0 });
        }

        osList.forEach(os => {
            if (!applyLabFilter(os.lab_id)) return;
            if (os.data_recepcao) {
                const pk = os.data_recepcao.substring(0, 10);
                if (daysMap.has(pk)) daysMap.get(pk)['Volume Recebido'] += (os.total_amostras || 0);
            }
            if (os.data_finalizacao) {
                const pk = os.data_finalizacao.substring(0, 10);
                if (daysMap.has(pk)) daysMap.get(pk)['Total Revisado (Analistas)'] += (os.total_amostras || 0);
            }
        });

        productionData.forEach(prod => {
            if (!applyLabFilter(prod.lab_id)) return;
            if (prod.data_producao) {
                const pk = prod.data_producao.substring(0, 10);
                if (daysMap.has(pk)) daysMap.get(pk)['Volume Produzido (Análise)'] += (prod.peso || 0);
            }
        });

        const smoothedData = Array.from(daysMap.values());

        return {
            currentProduced, currentRevised, currentReceived,
            prodTrend, revTrend, recepTrend,
            revisionRate, absorptionRate, weightedEfficiencyIndex,
            projectedProduction, alerts,
            smoothedData
        };
    }, [analysisPeriod, osList, productionData, labs, labId, analyticsLabId]);


    const processOSData = useCallback((rawData: OSItem[]) => {
        const mappedData = rawData.map(os => {
            let t = os.cliente;
            let c = os.cliente;
            if (os.cliente && os.cliente.includes('|||')) {
                const parts = os.cliente.split('|||');
                t = parts[0]?.trim() || t;
                c = parts[1]?.trim() || t;
            }
            return { ...os, tomador: t, cliente: c, lab_id: os.lab_id };
        });

        setOsList(mappedData);

        const total = mappedData.length;
        const faturados = mappedData.filter((d: OSItem) => d.status?.toLowerCase().includes('faturado')).length;
        const emAbertoValue = total - faturados;
        const totalAmostrasValue = mappedData.reduce((acc: number, curr: OSItem) => acc + (curr.total_amostras || 0), 0);
        const saldoAmostrasValue = mappedData.filter((d: OSItem) => !d.data_finalizacao && d.data_recepcao).reduce((acc: number, curr: OSItem) => acc + (curr.total_amostras || 0), 0);
        setStats({ total, faturados, emAberto: emAbertoValue, totalAmostras: totalAmostrasValue, saldoAmostras: saldoAmostrasValue });

        // ── APENAS inicializa seleções se ainda estiverem vazias (não reseta seleção do usuário)
        setSelectedChartClients(prev => {
            if (prev.length > 0) return prev;
            const topC = mappedData.reduce((acc: Record<string, number>, curr: OSItem) => {
                const cli = curr.cliente || 'Não Informado';
                acc[cli] = (acc[cli] || 0) + (curr.total_amostras || 0);
                return acc;
            }, {} as Record<string, number>);
            const sortedAll = Object.entries(topC).sort(([, a], [, b]) => b - a).map(([n]) => n);
            return [...sortedAll, 'Total Recebido'];
        });

        setSelectedReviewers(prev => {
            if (prev.length > 0) return prev;
            const revs = Array.from(new Set(mappedData.filter((d: OSItem) => d.revisor).map((d: OSItem) => d.revisor))) as string[];
            return [...revs, 'Volume Produzido (Análise)', 'Total Revisado (Analistas)', 'Volume Recebido'];
        });

        return mappedData;
    }, []);

    const loadData = useCallback(async () => {
        if (!labId) return;

        // ── STALE-WHILE-REVALIDATE ──────────────────────────────────────────
        // 1. Mostra dados do localStorage IMEDIATAMENTE (sem esperar Supabase)
        //    O usuário vê os gráficos em <100ms com dados do cache local
        const cachedData = (statusOSService as any).getCached?.(labId);
        if (cachedData && cachedData.length > 0) {
            processOSData(cachedData);
        }

        // 2. Busca dados frescos do Supabase em background
        setIsLoading(true);
        try {
            const rawData = (await statusOSService.getAll(labId)) as OSItem[];
            processOSData(rawData);

            try {
                const prodData = await producaoService.list(labId);
                if (prodData) setProductionData(prodData.map((p: ProducaoData) => ({ data_producao: p.data_producao || "", peso: (p.peso as number) || 0, lab_id: p.lab_id })));
            } catch (err) { console.warn("Producao chart data fail:", err); }

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            addToast({ title: "Erro de Conexão", description: "Não foi possível carregar os dados de monitoramento.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [labId, processOSData, addToast]);

    // Carrega dados toda vez que o labId muda
    useEffect(() => {
        if (labId) loadData();
    }, [labId, loadData]);

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
                    const safeDate = (d: Date | null) => d ? d.toISOString() : undefined;
                    const parsedBatch: any[] = batch.map(b => ({
                        ...b,
                        data_registro: safeDate(b.data_registro),
                        data_recepcao: safeDate(b.data_recepcao),
                        data_acondicionamento: safeDate(b.data_acondicionamento),
                        data_finalizacao: safeDate(b.data_finalizacao)
                    }));
                    await statusOSService.uploadData(parsedBatch, labId);
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
        if (!labId) return;
        setIsClearConfirmOpen(false);
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

    const handleExportAnaliticoPDF = async () => {
        if (!analiticoSectionRef.current) return;
        setIsGeneratingPDF(true);
        try {
            const element = analiticoSectionRef.current;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(imgData);
            const icw = pdfWidth - 20;
            const ich = (imgProps.height * icw) / imgProps.width;

            pdf.setFillColor(0, 0, 0); pdf.rect(0, 0, pdfWidth, 25, 'F');
            pdf.setTextColor(255, 255, 255); pdf.setFontSize(14); pdf.setFont("serif", "bold");
            pdf.text("ORIGO INTELLIGENCE - ANALYTICAL TREND REPORT", 10, 15);
            pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
            pdf.text(`Período de Análise: ${analysisPeriod} dias | Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 10, 20);

            pdf.addImage(imgData, "PNG", 10, 35, icw, ich);
            pdf.save(`Trend_Analysis_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
        } catch (error) { console.error("Erro ao gerar PDF:", error); } finally { setIsGeneratingPDF(false); }
    };

    return (
        <div className="max-w-[1400px] mx-auto py-12 px-6 text-black pb-32 min-h-screen font-sans">

            {/* Barra de progresso ultra-sutil no topo — aparece apenas durante sincronização */}
            <div
                className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
                style={{ opacity: isLoading ? 1 : 0, transition: 'opacity 0.4s ease' }}
            >
                <div
                    className="h-full bg-gradient-to-r from-transparent via-blue-500 to-transparent"
                    style={{
                        animation: isLoading ? 'progressBar 1.4s ease-in-out infinite' : 'none',
                        backgroundSize: '200% 100%',
                    }}
                />
            </div>

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
                                    <option value="all">TODOS OS LABORATÓRIOS (GERAL)</option>
                                    {labs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row flex-wrap gap-4 items-center">

                    <div className="flex items-center gap-1 bg-neutral-100 p-1.5 rounded-xl border border-neutral-200/50">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadData}
                            disabled={isLoading}
                            className="h-9 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:shadow-sm transition-all"
                        >
                            <RefreshCw
                                className="h-3.5 w-3.5 mr-2 transition-transform duration-700"
                                style={{ transform: isLoading ? 'rotate(360deg)' : 'rotate(0deg)', transition: isLoading ? 'transform 0.7s linear infinite' : '' }}
                            />
                            <span style={{ opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
                                {isLoading ? "Atualizando..." : "Sincronizar"}
                            </span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setIsClearConfirmOpen(true)} disabled={isLoading} className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Limpar
                        </Button>
                    </div>

                    <div className="relative group w-full md:w-auto">
                        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" title="Importar Excel" aria-label="Importar Excel" />
                        <Button className="h-12 w-full md:w-auto px-8 bg-black hover:bg-neutral-800 text-white rounded-xl shadow-[0_10px_20px_rgba(0,0,0,0.1)] flex items-center justify-center gap-3 active:scale-95 transition-all">
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
                    { id: 'revisores', label: 'Revisão', icon: Users },
                    { id: 'clientes', label: 'Recepção', icon: LayoutGrid },
                    { id: 'saldo_diario', label: 'Saldo de Análise', icon: ClipboardList }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                            "flex items-center gap-3 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all rounded-2xl border-2 whitespace-nowrap",
                            labId === 'all' && tab.id !== 'geral' ? "hidden" : "",
                            activeTab === tab.id
                                ? "bg-black text-white border-black shadow-[0_10px_20px_rgba(0,0,0,0.1)]"
                                : "bg-white text-neutral-400 border-neutral-100 hover:border-neutral-200 hover:text-neutral-600"
                        )}
                    >
                        <div key={`icon-${tab.id}`} className="shrink-0 flex items-center">
                            <tab.icon className={cn("h-4 w-4", activeTab === tab.id ? "text-white" : "text-neutral-300")} />
                        </div>
                        {tab.label}
                    </button>
                ))}
            </div>

            {labId === 'all' && (
                <div className="space-y-6 animate-fade-in mb-8">

                    {/* Filtro de laboratórios compartilhado */}
                    <div className="bg-white border border-neutral-200 rounded-2xl px-6 py-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 whitespace-nowrap shrink-0">Filtrar laboratórios:</span>
                        <div className="flex items-center gap-2 flex-wrap">
                            {labs.map((lab) => {
                                const recKey = lab.nome + ' (Recebido)';
                                const isActive = selectedConsolidatedKeys.includes(recKey);
                                const color = consolidatedDailyStats.keyColors[recKey] || '#999';
                                return (
                                    <button
                                        key={lab.id}
                                        type="button"
                                        onClick={() => {
                                            toggleConsolidatedKey(lab.nome + ' (Recebido)');
                                            toggleConsolidatedKey(lab.nome + ' (Produzido)');
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all text-[10px] font-black uppercase tracking-widest shrink-0",
                                            isActive ? "text-white border-transparent" : "bg-neutral-50 text-neutral-400 border-neutral-100 hover:border-neutral-300 hover:text-neutral-700"
                                        )}
                                        style={isActive ? { backgroundColor: color, borderColor: color } : {}}
                                    >
                                        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isActive ? 'white' : color }} />
                                        {lab.nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Dois gráficos empilhados */}
                    <ConsolidatedCharts
                        data={consolidatedDailyStats.data}
                        keys={consolidatedDailyStats.keys}
                        keyColors={consolidatedDailyStats.keyColors}
                        selectedKeys={selectedConsolidatedKeys}
                        labs={labs}
                    />
                </div>
            )}

            {activeTab === 'geral' && labId !== 'all' && (
                <div key="tab-geral-stats" className="animate-in fade-in duration-300">
                    <GeneralStatsGrid stats={stats} />

                </div>
            )}

            {(activeTab === 'geral' || activeTab === 'revisores') && labId !== 'all' && (
                <div key={`content-${activeTab}`} className="space-y-8 animate-in fade-in duration-300">
                    <ReviewerPerformanceSection
                        activeTab={activeTab}
                        toggleReviewerSelection={toggleReviewerSelection}
                        selectedReviewers={selectedReviewers}
                        revisorDailyStats={revisorDailyStats}
                        osList={osList}
                        labId={labId}
                    />

                    {activeTab === 'revisores' && (
                        <ReviewersTable
                            revisorStats={revisorStats}
                            selectedReviewers={selectedReviewers}
                            toggleReviewerSelection={toggleReviewerSelection}
                        />
                    )}
                </div>
            )
            }
            {activeTab === 'geral' && analysisMetrics && (
                <IntelligenceAnalytics
                    innerRef={analiticoSectionRef}
                    analysisMetrics={analysisMetrics}
                    analysisPeriod={analysisPeriod}
                    setAnalysisPeriod={setAnalysisPeriod as any}
                    handleExportAnaliticoPDF={handleExportAnaliticoPDF}
                    isGeneratingPDF={isGeneratingPDF}
                    labs={labs}
                    globalLabId={labId}
                    analyticsLabId={analyticsLabId}
                    setAnalyticsLabId={setAnalyticsLabId}
                />
            )}

            {activeTab === 'clientes' && (
                <ClientsTabSection
                    clienteDailyStats={clienteDailyStats}
                    clienteStats={clienteStats}
                    selectedChartClients={selectedChartClients}
                    toggleClientSelection={toggleClientSelection}
                    setSelectedChartClients={setSelectedChartClients}
                    carteiraClientesPivotStats={carteiraClientesPivotStats}
                    collapsedClients={collapsedClients}
                    toggleClientCollapse={toggleClientCollapse}
                    labId={labId}
                />
            )}

            {activeTab === 'saldo_diario' && (
                <DailyBalanceTabSection
                    saldoDiarioPivotStats={saldoDiarioPivotStats}
                    handleExportPDF={handleExportPDF}
                    isGeneratingPDF={isGeneratingPDF}
                    matrixTableRef={matrixTableRef}
                    collapsedClients={collapsedClients}
                    toggleClientCollapse={toggleClientCollapse}
                    pinnedCells={pinnedCells}
                    togglePinCell={togglePinCell}
                />
            )}

            {isClearConfirmOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fade-in flex flex-col items-center text-center">
                        <div className="h-16 w-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6">
                            <Trash2 className="h-8 w-8" />
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-tight text-neutral-900 mb-2">ATENÇÃO</h2>
                        <p className="text-sm font-medium text-neutral-500 mb-8">
                            Tem certeza que deseja apagar os registros deste laboratório? Essa ação limpará a tela imediatamente.
                        </p>
                        <div className="flex gap-4 w-full">
                            <Button
                                variant="outline"
                                className="flex-1 rounded-xl uppercase font-black text-[10px] tracking-widest h-12"
                                onClick={() => setIsClearConfirmOpen(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                className="flex-1 rounded-xl uppercase font-black text-[10px] tracking-widest h-12 bg-red-600 hover:bg-red-700"
                                onClick={handleClearData}
                            >
                                Apagar Tudo
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

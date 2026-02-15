import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { parseStatusOSFileInChunks } from "@/lib/statusOSParser";
import { statusOSService } from "@/services/statusOS.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, Search, Loader2, RefreshCw, Activity as ActivityIcon, Trash2, AlertTriangle, Clock, Star, Printer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, differenceInHours } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
// import { ptBR } from "date-fns/locale";

interface OSItem {
    id: string;
    os_numero: string;
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
    const { currentLab, user } = useAuth();
    const labId = currentLab?.id || user?.lab_id;

    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [osList, setOsList] = useState<OSItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [stats, setStats] = useState({ total: 0, faturados: 0, emAberto: 0, totalAmostras: 0, saldoAmostras: 0 });
    const [activeTab, setActiveTab] = useState<'geral' | 'revisores' | 'clientes' | 'saldo_diario'>('geral');
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const matrixTableRef = useRef<HTMLDivElement>(null);
    const [selectedChartClients, setSelectedChartClients] = useState<string[]>([]);
    const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
    const [productionData, setProductionData] = useState<any[]>([]);

    // Pinned Cells (Matrix) - Format: Record<"client|date", priorityLevel>
    // Levels: 1 (Alta/Red), 2 (Media/Amber), 3 (Baixa/Green), 0 (None)
    const [pinnedCells, setPinnedCells] = useState<Record<string, number>>(() => {
        const saved = localStorage.getItem('pinned_matrix_cells_v2_' + (labId || 'default'));
        return saved ? JSON.parse(saved) : {};
    });

    const togglePinCell = (client: string, date: string) => {
        setPinnedCells(prev => {
            const key = `${client}|${date}`;
            const currentLevel = prev[key] || 0;
            const nextLevel = (currentLevel + 1) % 4; // 0, 1, 2, 3

            const next = { ...prev };
            if (nextLevel === 0) {
                delete next[key];
            } else {
                next[key] = nextLevel;
            }

            localStorage.setItem('pinned_matrix_cells_v2_' + (labId || 'default'), JSON.stringify(next));
            return next;
        });
    };

    const toggleReviewerSelection = (reviewer: string) => {
        setSelectedReviewers(prev =>
            prev.includes(reviewer)
                ? prev.filter(r => r !== reviewer)
                : [...prev, reviewer]
        );
    };

    const toggleClientSelection = (client: string) => {
        setSelectedChartClients(prev =>
            prev.includes(client)
                ? prev.filter(c => c !== client)
                : [...prev, client]
        );
    };

    // Lista Filtrada Base para todas as agregações
    const filteredOS = React.useMemo(() => {
        return osList.filter((item: OSItem) =>
            item.os_numero.toString().includes(searchTerm) ||
            item.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.fazenda.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.revisor?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [osList, searchTerm]);

    // Agregações
    const revisorStats = React.useMemo(() => {
        const stats: Record<string, number> = {};
        filteredOS.forEach((os: OSItem) => {
            const rev = os.revisor || 'Não Informado';
            stats[rev] = (stats[rev] || 0) + (os.total_amostras || 0);
        });
        return Object.entries(stats)
            .sort(([, a], [, b]) => b - a)
            .map(([name, total]) => ({ name, total }));
    }, [filteredOS]);

    const clienteStats = React.useMemo(() => {
        const stats: Record<string, { totalAmostras: number; totalHoras: number; count: number }> = {};
        filteredOS.forEach((os: OSItem) => {
            const cli = os.cliente || 'Não Informado';
            if (!stats[cli]) stats[cli] = { totalAmostras: 0, totalHoras: 0, count: 0 };

            stats[cli].totalAmostras += (os.total_amostras || 0);
            if (os.horas) {
                stats[cli].totalHoras += os.horas;
                stats[cli].count += 1;
            }
        });

        return Object.entries(stats)
            .sort(([, a], [, b]) => b.totalAmostras - a.totalAmostras)
            .map(([name, data]) => ({
                name,
                total: data.totalAmostras,
                avgTime: data.count > 0 ? (data.totalHoras / data.count).toFixed(1) : '-'
            }));
    }, [filteredOS]);

    // Agregação para Gráfico de Produtividade Diária por Revisor
    const revisorDailyStats = React.useMemo(() => {
        const grouped: Record<string, any> = {};
        const revisoresSet = new Set<string>();

        // 1. Process Finished O.S. Data (Review / Analysts)
        filteredOS.forEach((os: OSItem) => {
            if (os.data_finalizacao) {
                try {
                    const finDateObj = new Date(os.data_finalizacao);
                    if (!isNaN(finDateObj.getTime())) {
                        const dateKey = format(finDateObj, 'yyyy-MM-dd');
                        const displayDate = format(finDateObj, 'dd/MM');

                        if (!grouped[dateKey]) {
                            grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                        }

                        // Total Revised (by analysts)
                        grouped[dateKey]['Total Produzido'] = (grouped[dateKey]['Total Produzido'] || 0) + (os.total_amostras || 0);

                        // Per individual analyst
                        if (os.revisor) {
                            revisoresSet.add(os.revisor);
                            grouped[dateKey][os.revisor] = (grouped[dateKey][os.revisor] || 0) + (os.total_amostras || 0);
                        }
                    }
                } catch (e) {
                    console.warn("Invalid finalization date:", os.data_finalizacao);
                }
            }
        });

        // 2. Process Physical Production Data (Analysis / Operation)
        // This makes the "Total Analisado" match exactly what is in the Operation tab
        productionData.forEach((prod: any) => {
            if (prod.data_producao) {
                try {
                    // Supabase DATE type is usually 'YYYY-MM-DD'
                    const dateParts = prod.data_producao.split('-');
                    const prodDateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 12, 0, 0);

                    if (!isNaN(prodDateObj.getTime())) {
                        const dateKey = format(prodDateObj, 'yyyy-MM-dd');
                        const displayDate = format(prodDateObj, 'dd/MM');

                        if (!grouped[dateKey]) {
                            grouped[dateKey] = { name: displayDate, rawDate: dateKey };
                        }

                        // Total Analyzed (by machine/operation)
                        grouped[dateKey]['Total Analisado'] = (grouped[dateKey]['Total Analisado'] || 0) + (prod.peso || 0);
                    }
                } catch (e) {
                    console.warn("Invalid production date:", prod.data_producao);
                }
            }
        });

        const data = Object.values(grouped).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate));
        const keys = Array.from(revisoresSet);

        // Generate consistent colors for reviewers
        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
        const keyColors = keys.reduce((acc, key, index) => {
            acc[key] = colors[index % colors.length];
            return acc;
        }, {} as Record<string, string>);

        return { data, keys, keyColors };
    }, [filteredOS, productionData]);

    // Agregação para Gráfico de Volume Diário por Cliente
    const clienteDailyStats = React.useMemo(() => {
        const grouped: Record<string, any> = {};
        const activeClients = selectedChartClients.length > 0 ? selectedChartClients : [];

        filteredOS.forEach((os: OSItem) => {
            if (!os.data_finalizacao || !os.cliente) return;
            try {
                const dateObj = new Date(os.data_finalizacao);
                if (isNaN(dateObj.getTime())) return;

                const dateKey = format(dateObj, 'yyyy-MM-dd');
                const displayDate = format(dateObj, 'dd/MM');

                if (!grouped[dateKey]) {
                    grouped[dateKey] = { name: displayDate, rawDate: dateKey, Outros: 0 };
                }

                if (activeClients.includes(os.cliente)) {
                    grouped[dateKey][os.cliente] = (grouped[dateKey][os.cliente] || 0) + os.total_amostras;
                } else {
                    grouped[dateKey]['Outros'] = (grouped[dateKey]['Outros'] || 0) + os.total_amostras;
                }
            } catch (e) {
                console.warn("Invalid date:", os.data_finalizacao);
            }
        });

        const data = Object.values(grouped).sort((a: any, b: any) => a.rawDate.localeCompare(b.rawDate));

        // Final keys: selected clients + 'Outros' (if 'Outros' has values)
        const keys = [...activeClients];
        const hasOutros = data.some(d => d.Outros > 0);
        if (hasOutros) {
            keys.push('Outros');
        }

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#06b6d4'];
        const keyColors = keys.reduce((acc, key, index) => {
            if (key === 'Outros') {
                acc[key] = '#94a3b8'; // Slate-400 for 'Others'
            } else {
                acc[key] = colors[index % colors.length];
            }
            return acc;
        }, {} as Record<string, string>);

        return { data, keys, keyColors };
    }, [filteredOS, selectedChartClients]);

    // Agregação para Tabela Pivot de Saldo de Análises Diário (Não Finalizadas)
    const saldoDiarioPivotStats = React.useMemo(() => {
        const matrix: Record<string, Record<string, { total: number; maxDelay: number }>> = {};
        const datesSet = new Set<string>();
        const clientsSet = new Set<string>();
        const delayedItems: (OSItem & { delayHours: number })[] = [];
        const now = new Date();
        let totalPendingAmostras = 0;
        let criticalCount = 0; // > 48h

        // Utiliza filteredOS para que a busca funcione nesta aba também
        filteredOS.forEach((os: OSItem) => {
            // SÓ entra se data_finalizacao estiver em BRANCO
            if (os.data_finalizacao || !os.data_recepcao || !os.cliente) return;

            try {
                const dateObj = new Date(os.data_recepcao);
                if (isNaN(dateObj.getTime())) return;

                const dateKey = format(dateObj, 'yyyy-MM-dd');
                datesSet.add(dateKey);
                clientsSet.add(os.cliente);

                const delayHours = differenceInHours(now, dateObj);
                totalPendingAmostras += os.total_amostras;

                if (delayHours >= 24) {
                    delayedItems.push({ ...os, delayHours });
                }
                if (delayHours >= 48) {
                    criticalCount++;
                }

                if (!matrix[os.cliente]) matrix[os.cliente] = {};
                if (!matrix[os.cliente][dateKey]) matrix[os.cliente][dateKey] = { total: 0, maxDelay: 0 };

                matrix[os.cliente][dateKey].total += os.total_amostras;
                if (delayHours > matrix[os.cliente][dateKey].maxDelay) {
                    matrix[os.cliente][dateKey].maxDelay = delayHours;
                }
            } catch (e) {
                console.warn("Invalid date:", os.data_recepcao);
            }
        });

        const sortedDates = Array.from(datesSet).sort();

        // Sort clients by priority:
        // 1. Clients with ANY pinned cell first
        // 2. Clients with the oldest delay (maxDelay) come first
        // 3. Then by total pending samples
        const sortedClients = Array.from(clientsSet).sort((a, b) => {
            // Find max priority for each row (smaller number is higher priority)
            const getPriorityRank = (client: string) => {
                const levels = Object.entries(pinnedCells)
                    .filter(([key]) => key.startsWith(client + '|'))
                    .map(([, level]) => level);
                if (levels.length === 0) return 99; // No priority
                return Math.min(...levels); // 1 is highest
            };

            const rankA = getPriorityRank(a);
            const rankB = getPriorityRank(b);

            if (rankA !== rankB) return rankA - rankB;

            const maxDelayA = Math.max(...Object.values(matrix[a]).map(d => d.maxDelay));
            const maxDelayB = Math.max(...Object.values(matrix[b]).map(d => d.maxDelay));

            if (maxDelayB !== maxDelayA) return maxDelayB - maxDelayA;

            const totalA = Object.values(matrix[a]).reduce((sum, d) => sum + d.total, 0);
            const totalB = Object.values(matrix[b]).reduce((sum, d) => sum + d.total, 0);
            return totalB - totalA;
        });

        // Sort delayed items by delay (descending - older first)
        const sortedDelayed = delayedItems.sort((a, b) => b.delayHours - a.delayHours);

        const avgDelay = delayedItems.length > 0
            ? Math.round(delayedItems.reduce((acc, curr) => acc + curr.delayHours, 0) / delayedItems.length)
            : 0;

        return { matrix, sortedDates, sortedClients, sortedDelayed, totalPendingAmostras, avgDelay, criticalCount };
    }, [filteredOS, pinnedCells]);

    useEffect(() => {
        if (labId) loadData();
    }, [labId]);

    const loadData = async () => {
        if (!labId) return;
        setIsLoading(true);
        try {
            const data: any = await statusOSService.getAll(labId);
            setOsList(data);

            // Calculate stats locally or fetch from service
            const total = data.length;
            const faturados = data.filter((d: any) => d.status?.toLowerCase().includes('faturado')).length;
            const emAberto = total - faturados;
            const totalAmostras = data.reduce((acc: number, curr: any) => acc + (curr.total_amostras || 0), 0);
            const saldoAmostras = data
                .filter((d: any) => !d.data_finalizacao)
                .reduce((acc: number, curr: any) => acc + (curr.total_amostras || 0), 0);

            setStats({ total, faturados, emAberto, totalAmostras, saldoAmostras });

            // Fetch physical production (Operation) to unify with analysis line
            const { data: prodData } = await supabase
                .from('operacao_producao')
                .select('*')
                .eq('lab_id', labId);
            if (prodData) setProductionData(prodData);

            // Initialize chart selection with top 5 clients if not already set
            const top5 = data
                .reduce((acc: any, curr: any) => {
                    const cli = curr.cliente || 'Não Informado';
                    acc[cli] = (acc[cli] || 0) + (curr.total_amostras || 0);
                    return acc;
                }, {} as Record<string, number>);

            const sortedTop5 = Object.entries(top5)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([name]) => name);

            setSelectedChartClients(sortedTop5);

            // Initialize reviewers - select all by default
            const revs = Array.from(new Set(data.filter((d: any) => d.revisor).map((d: any) => d.revisor))) as string[];
            setSelectedReviewers([...revs, 'Volume Produzido (Análise)', 'Total Revisado (Analistas)']);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        if (!labId) {
            alert("Erro: Nenhum laboratório selecionado. Por favor, selecione um laboratório no menu superior.");
            return;
        }

        if (!file) return;

        setIsUploading(true);
        try {
            // Use streaming/chunked parser to handle large files
            let totalRecords = 0;

            await parseStatusOSFileInChunks(file, async (batch) => {
                if (batch.length > 0) {
                    await statusOSService.uploadData(batch, labId);
                    totalRecords += batch.length;
                    // Optional: Update UI with progress if we had a progress bar
                }
            }, 2000); // Process 2000 rows at a time to keep memory low

            if (totalRecords === 0) {
                alert("Nenhum dado válido encontrado no arquivo.");
                return;
            }

            await loadData();
            alert(`Sucesso! ${totalRecords} registros processados.`);
        } catch (error: any) {
            console.error("Erro no upload:", error);
            // Show specific error message
            const msg = error.message || "Erro desconhecido";
            if (msg.includes("column") && msg.includes("horas")) {
                alert("Erro: A coluna 'horas' não existe no banco de dados. Por favor, execute o script SQL atualizado.");
            } else {
                alert(`Erro ao processar arquivo: ${msg}`);
            }
        } finally {
            setIsUploading(false);
            event.target.value = "";
        }
    };

    const handleClearData = async () => {
        if (!labId) return;

        if (!window.confirm("ATENÇÃO: Tem certeza que deseja apagar TODOS os dados de monitoramento?\n\nEsta ação não pode ser desfeita.")) {
            return;
        }

        setIsLoading(true);
        try {
            await statusOSService.clearData(labId);
            await loadData();
            alert("Dados apagados com sucesso.");
        } catch (error) {
            console.error("Erro ao limpar dados:", error);
            alert("Erro ao limpar dados. Verifique o console.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportPDF = async () => {
        if (!matrixTableRef.current) return;
        setIsGeneratingPDF(true);

        try {
            const element = matrixTableRef.current;

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff"
            });

            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4"
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const imgProps = pdf.getImageProperties(imgData);
            const imgContentWidth = pdfWidth - 20; // 10mm margin each side
            const imgContentHeight = (imgProps.height * imgContentWidth) / imgProps.width;

            // Header Section
            pdf.setFillColor(26, 32, 44); // bg-neutral-900 color
            pdf.rect(0, 0, pdfWidth, 20, 'F');

            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(14);
            pdf.setFont("helvetica", "bold");
            pdf.text("ORIGO INTELLIGENCE - RELATÓRIO DE SALDO DIÁRIO", 10, 12);

            pdf.setFontSize(8);
            pdf.setFont("helvetica", "normal");
            pdf.text(`LABORATÓRIO: ${currentLab?.nome || 'NÃO IDENTIFICADO'}`, 10, 17);
            pdf.text(`DATA EMISSÃO: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pdfWidth - 60, 17);

            // Add the table image
            pdf.addImage(imgData, "PNG", 10, 25, imgContentWidth, imgContentHeight);

            // Footer
            pdf.setFontSize(7);
            pdf.setTextColor(150, 150, 150);
            const footerY = Math.min(25 + imgContentHeight + 10, pdfHeight - 5);
            pdf.text("Análise baseada no monitoramento em tempo real de O.S. pendentes.", 10, footerY);
            pdf.text(`Página 1 de 1`, pdfWidth - 25, footerY);

            pdf.save(`Relatorio_Saldo_Diario_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            alert("Erro ao gerar PDF.");
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    return (
        <div className="max-w-[95%] mx-auto py-8 animate-fade-in text-black pb-24 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-black pb-8 mb-8">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-black text-white flex items-center justify-center rounded-lg shadow-lg">
                        <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 block mb-1">
                            Gestão HVI
                        </span>
                        <h1 className="text-3xl font-serif text-black leading-none">Monitoramento de O.S.</h1>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button variant="outline" onClick={loadData} disabled={isLoading} className="border-neutral-300">
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleClearData}
                        disabled={isLoading || osList.length === 0}
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Limpar Dados
                    </Button>
                    <div className="relative group">
                        <input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                            title="Upload Excel"
                            aria-label="Upload Excel"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md relative z-10 pointer-events-none">
                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Importar Excel
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-neutral-200">
                <button
                    onClick={() => setActiveTab('geral')}
                    className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'geral' ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                >
                    Visão Geral
                </button>
                <button
                    onClick={() => setActiveTab('revisores')}
                    className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'revisores' ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                >
                    Por Revisor
                </button>
                <button
                    onClick={() => setActiveTab('clientes')}
                    className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'clientes' ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                >
                    Por Cliente
                </button>
                <button
                    onClick={() => setActiveTab('saldo_diario')}
                    className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'saldo_diario' ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                >
                    Saldo de Análises Diário
                </button>
            </div>

            {activeTab === 'revisores' && (
                <div className="space-y-6">
                    {/* Selection Area for Reviewers */}
                    <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm animate-fade-in text-black">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Filtrar Gráfico (Revisores & Totais)</h3>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setSelectedReviewers([...revisorDailyStats.keys, 'Volume Produzido (Análise)', 'Total Revisado (Analistas)'])}
                                    className="text-[10px] font-bold text-neutral-400 hover:text-black transition-colors"
                                >
                                    SELECIONAR TUDO
                                </button>
                                <button
                                    onClick={() => setSelectedReviewers([])}
                                    className="text-[10px] font-bold text-neutral-400 hover:text-black transition-colors"
                                >
                                    LIMPAR SELEÇÃO
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {/* Static KPI Lines */}
                            <button
                                onClick={() => toggleReviewerSelection('Volume Produzido (Análise)')}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-2",
                                    selectedReviewers.includes('Volume Produzido (Análise)')
                                        ? "bg-black text-white border-black shadow-md"
                                        : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-400"
                                )}
                            >
                                <div className="h-2 w-2 rounded-full border border-white/20" style={{ backgroundColor: '#000000' }} />
                                Volume Produzido
                            </button>
                            <button
                                onClick={() => toggleReviewerSelection('Total Revisado (Analistas)')}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-2",
                                    selectedReviewers.includes('Total Revisado (Analistas)')
                                        ? "bg-red-600 text-white border-red-600 shadow-md"
                                        : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-400"
                                )}
                            >
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                                Total Revisado
                            </button>

                            {/* Individual Reviewers */}
                            {revisorDailyStats.keys.map(rev => (
                                <button
                                    key={rev}
                                    onClick={() => toggleReviewerSelection(rev)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-2",
                                        selectedReviewers.includes(rev)
                                            ? "bg-white text-black border-black shadow-sm"
                                            : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-400"
                                    )}
                                >
                                    <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: revisorDailyStats.keyColors[rev] || '#ddd' }}
                                    />
                                    {rev}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm text-black">
                        <h3 className="font-bold text-sm uppercase tracking-wide mb-6">Evolução Diária (Análise Operação vs Revisão Analistas)</h3>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={revisorDailyStats.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                                    <XAxis dataKey="name" stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                                    <YAxis stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend onClick={(e: any) => toggleReviewerSelection(e.value)} wrapperStyle={{ cursor: 'pointer' }} />
                                    {selectedReviewers.includes('Volume Produzido (Análise)') && (
                                        <Line
                                            type="monotone"
                                            name="Volume Produzido (Análise)"
                                            dataKey="Total Analisado"
                                            stroke="#000000"
                                            strokeWidth={4}
                                            strokeDasharray="5 5"
                                            dot={{ r: 5, strokeWidth: 2, fill: "#000000" }}
                                            activeDot={{ r: 8 }}
                                        />
                                    )}
                                    {selectedReviewers.includes('Total Revisado (Analistas)') && (
                                        <Line
                                            type="monotone"
                                            name="Total Revisado (Analistas)"
                                            dataKey="Total Produzido"
                                            stroke="#dc2626"
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 2, fill: "#dc2626" }}
                                            activeDot={{ r: 6 }}
                                        />
                                    )}
                                    {revisorDailyStats.keys.map((key) => selectedReviewers.includes(key) && (
                                        <Line
                                            key={key}
                                            type="monotone"
                                            dataKey={key}
                                            stroke={revisorDailyStats.keyColors[key]}
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                            activeDot={{ r: 5 }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm animate-fade-in">
                        <div className="p-4 border-b border-neutral-100 bg-neutral-50">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Total por Revisor</h3>
                        </div>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-neutral-50 text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                                <tr>
                                    <th className="p-4">Revisor</th>
                                    <th className="p-4 text-right">Total Amostras</th>
                                    <th className="p-4 w-full"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {revisorStats.map((stat) => (
                                    <tr
                                        key={stat.name}
                                        className={cn(
                                            "hover:bg-neutral-50 transition-colors cursor-pointer group",
                                            selectedReviewers.includes(stat.name) ? "bg-neutral-50/50" : ""
                                        )}
                                        onClick={() => toggleReviewerSelection(stat.name)}
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "h-4 w-4 rounded border flex items-center justify-center transition-all",
                                                    selectedReviewers.includes(stat.name)
                                                        ? "bg-black border-black text-white"
                                                        : "border-neutral-300 bg-white group-hover:border-neutral-500"
                                                )}>
                                                    {selectedReviewers.includes(stat.name) && <Star className="h-2 w-2 fill-white" />}
                                                </div>
                                                <span className="font-bold text-neutral-800">{stat.name}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold">{stat.total.toLocaleString('pt-BR')}</td>
                                        <td className="p-4">
                                            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden w-48">
                                                {/* eslint-disable-next-line react-dom/no-unsafe-inline-style, tailwindcss/no-custom-classname, react/inline-styles */}
                                                <div
                                                    className="h-full bg-black rounded-full"
                                                    style={{ width: `${(stat.total / (revisorStats[0]?.total || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'saldo_diario' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Summary Cards for Saldo Tab */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-neutral-900 text-white p-6 rounded-xl border border-neutral-800 shadow-lg">
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 block mb-2">Total Pendente</span>
                            <div className="text-3xl font-serif text-white">{saldoDiarioPivotStats.totalPendingAmostras.toLocaleString('pt-BR')}</div>
                            <div className="text-[9px] uppercase font-mono mt-1 text-neutral-500">Amostras sem finalização</div>
                        </div>
                        <div className={`p-6 rounded-xl border shadow-sm ${saldoDiarioPivotStats.criticalCount > 0 ? 'bg-red-50 border-red-200' : saldoDiarioPivotStats.sortedDelayed.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-200'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 block mb-2">Estado Crítico</span>
                            <div className={`text-3xl font-serif ${saldoDiarioPivotStats.criticalCount > 0 ? 'text-red-600 font-bold' : 'text-neutral-300'}`}>
                                {saldoDiarioPivotStats.criticalCount}
                            </div>
                            <div className="text-[9px] uppercase font-mono mt-1 text-neutral-400">Superior a 48 horas</div>
                        </div>
                        <div className={`p-6 rounded-xl border shadow-sm ${saldoDiarioPivotStats.avgDelay > 24 ? 'bg-neutral-50 border-neutral-200' : 'bg-white border-neutral-200'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 block mb-2">Média de Espera</span>
                            <div className={`text-3xl font-serif ${saldoDiarioPivotStats.avgDelay > 24 ? 'text-neutral-800' : 'text-neutral-300'}`}>
                                {saldoDiarioPivotStats.avgDelay}h
                            </div>
                            <div className="text-[9px] uppercase font-mono mt-1 text-neutral-400">Tempo médio de análise</div>
                        </div>
                    </div>

                    <div id="matrix-capture-container" ref={matrixTableRef} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-neutral-100 bg-neutral-900 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 bg-amber-500 rounded-full animate-pulse" />
                                <h3 className="font-bold text-sm uppercase tracking-wide">Saldo de Análises Diário por Produtor</h3>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleExportPDF}
                                    disabled={isGeneratingPDF}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 border border-white/10"
                                >
                                    {isGeneratingPDF ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Printer className="h-3 w-3" />
                                    )}
                                    {isGeneratingPDF ? "GERANDO..." : "RELATÓRIO PDF"}
                                </button>
                                <span className="text-[10px] font-mono opacity-60 hidden md:inline">Matriz de Produtores vs Entrada</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-[#1a202c] text-white text-[10px] uppercase font-bold tracking-wider">
                                    <tr>
                                        <th className="p-2 border-r border-[#2d3748] min-w-[280px] sticky left-0 z-10 bg-[#1a202c]">Produtor / Cliente</th>
                                        {saldoDiarioPivotStats.sortedDates.map(date => (
                                            <th key={date} className="p-2 text-center border-r border-[#2d3748] min-w-[100px]">
                                                {format(new Date(date + 'T12:00:00'), 'dd/MM/yyyy')}
                                            </th>
                                        ))}
                                        <th className="p-2 text-center bg-[#2d3748] sticky right-0 z-10">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 font-medium">
                                    {saldoDiarioPivotStats.sortedClients.map((client) => {
                                        let rowTotal = 0;
                                        return (
                                            <tr key={client} className="hover:bg-neutral-50 transition-colors group">
                                                <td className="p-2 font-bold text-neutral-800 border-r border-neutral-100 sticky left-0 z-10 bg-white group-hover:bg-neutral-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                    {client}
                                                </td>
                                                {saldoDiarioPivotStats.sortedDates.map(date => {
                                                    const cellData = saldoDiarioPivotStats.matrix[client]?.[date];
                                                    const val = cellData?.total || 0;
                                                    const delay = cellData?.maxDelay || 0;
                                                    rowTotal += val;

                                                    const isDelayed = delay >= 24;
                                                    const isCritical = delay >= 48;
                                                    const priorityLevel = pinnedCells[`${client}|${date}`] || 0;

                                                    return (
                                                        <td
                                                            key={date}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (val > 0) togglePinCell(client, date);
                                                            }}
                                                            className={cn(
                                                                "p-2 text-center border-r border-neutral-100 relative cursor-pointer transition-all min-w-[70px]",
                                                                priorityLevel === 1 ? "bg-red-600 shadow-inner" :
                                                                    priorityLevel === 2 ? "bg-amber-500 shadow-inner" :
                                                                        priorityLevel === 3 ? "bg-emerald-500 shadow-inner" :
                                                                            isCritical ? "bg-red-50/30" :
                                                                                isDelayed ? "bg-amber-50/30" : ""
                                                            )}
                                                        >
                                                            {val > 0 ? (
                                                                <div className="flex flex-col items-center select-none">
                                                                    <span className={cn(
                                                                        "font-mono text-sm leading-tight",
                                                                        priorityLevel > 0 ? "text-white font-black" :
                                                                            isCritical ? "text-red-700 font-black" :
                                                                                isDelayed ? "text-amber-700 font-bold" :
                                                                                    "text-neutral-700"
                                                                    )}>
                                                                        {val.toLocaleString('pt-BR')}
                                                                    </span>
                                                                    {isDelayed && (
                                                                        <div className={cn(
                                                                            "flex items-center gap-1 mt-0.5 text-[8px] font-bold px-1 py-0.2 rounded-full",
                                                                            priorityLevel === 1 ? "text-red-100 bg-red-400/50" :
                                                                                priorityLevel === 2 ? "text-amber-100 bg-amber-400/50" :
                                                                                    priorityLevel === 3 ? "text-emerald-100 bg-emerald-400/50" :
                                                                                        isCritical ? "text-red-600 bg-red-100 border border-red-200" :
                                                                                            "text-amber-600 bg-amber-100 border border-amber-200"
                                                                        )}>
                                                                            <Clock className="h-2 w-2" />
                                                                            {delay > 48 ? `${(delay / 24).toFixed(1)}d` : `${delay}h`}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-neutral-200">-</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-2 text-center font-mono font-bold bg-neutral-50 text-neutral-800 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)] border-l border-neutral-200">
                                                    {rowTotal.toLocaleString('pt-BR')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Linha de Totais por Dia */}
                                    <tr className="bg-neutral-50 text-neutral-900 font-bold text-[11px] border-t-2 border-neutral-200">
                                        <td className="p-2 border-r border-neutral-200 uppercase text-[10px] sticky left-0 z-10 bg-neutral-50">Total Geral / Dia</td>
                                        {saldoDiarioPivotStats.sortedDates.map(date => {
                                            const dayTotal = saldoDiarioPivotStats.sortedClients.reduce((acc, client) => acc + (saldoDiarioPivotStats.matrix[client]?.[date]?.total || 0), 0);
                                            return (
                                                <td key={date} className="p-2 text-center font-mono whitespace-nowrap border-r border-neutral-200 text-neutral-700">
                                                    {dayTotal.toLocaleString('pt-BR')}
                                                </td>
                                            );
                                        })}
                                        <td className="p-2 text-center font-mono bg-neutral-100 text-lg text-emerald-600 sticky right-0 z-10 border-l border-neutral-200">
                                            {saldoDiarioPivotStats.sortedClients.reduce((acc, client) => {
                                                const row = saldoDiarioPivotStats.matrix[client] || {};
                                                return acc + Object.values(row).reduce((a, b) => a + (b.total || 0), 0);
                                            }, 0).toLocaleString('pt-BR')}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Alertas Detalhados com Design Refinado */}
                    {saldoDiarioPivotStats.sortedDelayed.length > 0 && (
                        <div className="bg-white border border-red-100 rounded-xl overflow-hidden shadow-md">
                            <div className="p-4 border-b border-red-50 bg-white flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 bg-red-600 text-white flex items-center justify-center rounded-lg">
                                        <AlertTriangle className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm uppercase tracking-wide text-red-700">Amostras com Atraso Crítico</h3>
                                        <div className="text-[10px] text-red-400 font-medium uppercase font-mono tracking-wider">Atenção Necessária Imediata</div>
                                    </div>
                                </div>
                                <div className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold border border-red-100">
                                    {saldoDiarioPivotStats.sortedDelayed.length} O.S. PENDENTES
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] uppercase font-bold text-neutral-400 bg-neutral-50">
                                        <tr>
                                            <th className="p-4">O.S.</th>
                                            <th className="p-4">Produtor / Cliente</th>
                                            <th className="p-4 text-center">Data Entrada</th>
                                            <th className="p-4 text-center">Tempo de Espera</th>
                                            <th className="p-4 text-right">Amostras</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {saldoDiarioPivotStats.sortedDelayed.map((os) => (
                                            <tr key={os.id} className="hover:bg-red-50/20 transition-colors group">
                                                <td className="p-4 font-mono font-bold text-neutral-900 text-xs">#{os.os_numero}</td>
                                                <td className="p-4 font-bold text-neutral-700">{os.cliente}</td>
                                                <td className="p-4 text-center text-neutral-500 font-mono text-xs">
                                                    {format(new Date(os.data_recepcao), 'dd/MM HH:mm')}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5 ${os.delayHours && os.delayHours > 48 ? 'bg-red-600 text-white shadow-sm' : 'bg-amber-500 text-white shadow-sm'}`}>
                                                        <Clock className="h-3 w-3" />
                                                        {os.delayHours && os.delayHours > 48 ? `${(os.delayHours / 24).toFixed(1)} DIAS` : `${os.delayHours} HORAS`}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right font-bold text-black font-mono">
                                                    {os.total_amostras}
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
                <div className="space-y-6">
                    {/* Selection Area */}
                    <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Filtrar Gráfico (Top Clientes)</h3>
                            <button
                                onClick={() => setSelectedChartClients([])}
                                className="text-[10px] font-bold text-neutral-400 hover:text-black transition-colors"
                            >
                                LIMPAR SELEÇÃO
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {clienteStats.slice(0, 15).map(cli => (
                                <button
                                    key={cli.name}
                                    onClick={() => toggleClientSelection(cli.name)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-2",
                                        selectedChartClients.includes(cli.name)
                                            ? "bg-black text-white border-black shadow-md"
                                            : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-400"
                                    )}
                                >
                                    <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: clienteDailyStats.keyColors[cli.name] || '#ddd' }}
                                    />
                                    {cli.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Evolução Diária (Volume por Cliente)</h3>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 bg-neutral-300 rounded" />
                                <span className="text-[10px] font-bold text-neutral-400 uppercase">Sombreado: Demais Clientes</span>
                            </div>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={clienteDailyStats.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                                    <XAxis dataKey="name" stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                                    <YAxis stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend />
                                    {clienteDailyStats.keys.map((key) => (
                                        <Line
                                            key={key}
                                            type="monotone"
                                            dataKey={key}
                                            stroke={clienteDailyStats.keyColors[key]}
                                            strokeWidth={key === 'Outros' ? 1.5 : 3}
                                            strokeDasharray={key === 'Outros' ? "5 5" : undefined}
                                            dot={key === 'Outros' ? false : { r: 4, strokeWidth: 2 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm animate-fade-in text-black">
                        <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Volume e Performance por Cliente</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-neutral-50 text-[10px] uppercase font-bold text-neutral-500 tracking-wider font-mono">
                                    <tr>
                                        <th className="p-4 w-10"></th>
                                        <th className="p-4">Produtor / Cliente</th>
                                        <th className="p-4 text-center">Tempo Médio (H)</th>
                                        <th className="p-4 text-right">Amostras Totais</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 font-medium">
                                    {clienteStats.map((stat) => (
                                        <tr
                                            key={stat.name}
                                            className={cn(
                                                "hover:bg-neutral-50 transition-colors cursor-pointer group",
                                                selectedChartClients.includes(stat.name) ? "bg-blue-50/30" : ""
                                            )}
                                            onClick={() => toggleClientSelection(stat.name)}
                                        >
                                            <td className="p-4">
                                                <div className={cn(
                                                    "h-4 w-4 rounded border flex items-center justify-center transition-all",
                                                    selectedChartClients.includes(stat.name)
                                                        ? "bg-black border-black text-white"
                                                        : "border-neutral-300 bg-white group-hover:border-neutral-500"
                                                )}>
                                                    {selectedChartClients.includes(stat.name) && <Star className="h-2 w-2 fill-white" />}
                                                </div>
                                            </td>
                                            <td className="p-4 font-bold text-neutral-800">
                                                {stat.name}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="font-mono bg-neutral-100 px-2 py-1 rounded text-neutral-600 text-xs">
                                                    {stat.avgTime}h
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-black border-l border-neutral-50">
                                                {stat.total.toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'geral' && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <div className="bg-white border p-6 rounded-xl shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total Registros</span>
                                <FileSpreadsheet className="h-4 w-4 text-neutral-300" />
                            </div>
                            <div className="text-3xl font-serif">{stats.total}</div>
                        </div>

                        <div className="bg-white border p-6 rounded-xl shadow-sm border-amber-200">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Saldo de Análise</span>
                                <ActivityIcon className="h-4 w-4 text-amber-500" />
                            </div>
                            <div className="text-3xl font-serif text-amber-600">{stats.saldoAmostras.toLocaleString('pt-BR')}</div>
                            <div className="text-[9px] text-neutral-400 mt-1 uppercase font-mono">Amostras Pendentes</div>
                        </div>

                        <div className="bg-white border p-6 rounded-xl shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total Amostras</span>
                                <ActivityIcon className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="text-3xl font-serif text-blue-600">{stats.totalAmostras.toLocaleString('pt-BR')}</div>
                        </div>
                    </div>

                    {/* List Section */}
                    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Histórico Simplificado</h3>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar Cliente ou Revisor..."
                                    className="pl-9 w-64 h-9 text-xs"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-neutral-50 text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                                    <tr>
                                        <th className="p-4">O.S.</th>
                                        <th className="p-4">Cliente</th>
                                        <th className="p-4">Revisor</th>
                                        <th className="p-4 text-center">Horas</th>
                                        <th className="p-4 text-right">Amostras</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-neutral-400">
                                                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                                Carregando...
                                            </td>
                                        </tr>
                                    ) : filteredOS.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-neutral-400 font-mono text-xs">
                                                Nenhum registro encontrado.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredOS.map((os) => (
                                            <tr key={os.id} className="hover:bg-neutral-50 transition-colors group">
                                                <td className="p-4 font-mono font-bold text-black text-xs">{os.os_numero}</td>
                                                <td className="p-4 font-bold text-neutral-700">{os.cliente}</td>
                                                <td className="p-4 text-xs font-medium text-neutral-600">
                                                    {os.revisor || '-'}
                                                </td>
                                                <td className="p-4 text-center font-mono text-xs">
                                                    {os.horas ? `${os.horas}h` : '-'}
                                                </td>
                                                <td className="p-4 text-right font-bold text-neutral-800 font-mono">
                                                    {os.total_amostras}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-2 border-t border-neutral-100 bg-neutral-50 text-right text-[10px] text-neutral-400 uppercase font-bold">
                            Exibindo {filteredOS.length} de {osList.length} registros
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

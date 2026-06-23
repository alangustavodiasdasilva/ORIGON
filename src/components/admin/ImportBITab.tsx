import React, { useRef, useState, useEffect } from 'react';
import { FileSpreadsheet, Upload, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';
import { LabService, type Lab } from '@/entities/Lab';
import { supabase } from '@/lib/supabase';
import { differenceInDays, startOfDay } from 'date-fns';
import { parseAndInsertBIFile } from '@/lib/biParsers';

interface BiArquivo {
    id: string;
    lab_id: string;
    safra: string;
    tipo_planilha: string;
    updated_at: string;
}

const UPLOAD_MODELS = [
    { id: 'producao_hvi', name: 'Produção HVI Turno', desc: 'Planilha de produção HVI por turno.' },
    { id: 'producao_operador', name: 'Produção Operador', desc: 'Planilha de produção por operador/turno.' },
    { id: 'relatorio_verificacao', name: 'Relatório Verificação', desc: 'Relatório de verificação interna.' },
    { id: 'status_os', name: 'Status OS', desc: 'Monitoramento de Status de O.S.' }
];

export default function ImportBITab() {
    const { addToast } = useToast();
    
    const [labs, setLabs] = useState<Lab[]>([]);
    const [selectedLabId, setSelectedLabId] = useState<string>('');
    const [selectedSafra, setSelectedSafra] = useState<string>('');
    const [checkpoints, setCheckpoints] = useState<Record<string, Record<string, Record<string, string>>>>({});
    const [uploading, setUploading] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [currentModel, setCurrentModel] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const labsData = await LabService.list();
            setLabs(labsData);

            const { data, error } = await supabase.from('bi_arquivos').select('*');
            
            if (error) {
                console.warn("Erro ao buscar checkpoints:", error);
            } else if (data) {
                const newCheckpoints: Record<string, Record<string, Record<string, string>>> = {};
                data.forEach((row: BiArquivo) => {
                    const safra = row.safra || '2024/2025'; // Fallback for old data
                    if (!newCheckpoints[row.lab_id]) newCheckpoints[row.lab_id] = {};
                    if (!newCheckpoints[row.lab_id][safra]) newCheckpoints[row.lab_id][safra] = {};
                    newCheckpoints[row.lab_id][safra][row.tipo_planilha] = row.updated_at;
                });
                setCheckpoints(newCheckpoints);
            }
        } catch (error) {
            console.error("Erro geral", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUploadClick = (modelId: string) => {
        if (!selectedLabId) {
            addToast({ title: "Atenção", description: "Selecione o Laboratório antes de importar a planilha.", type: "warning" });
            return;
        }
        if (!selectedSafra) {
            addToast({ title: "Atenção", description: "Selecione a Safra antes de importar a planilha.", type: "warning" });
            return;
        }
        setCurrentModel(modelId);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentModel || !selectedLabId) return;

        setUploading(currentModel);
        try {
            addToast({ title: "Processando", description: `Lendo arquivo e inserindo nas tabelas do BI (Safra: ${selectedSafra})...`, type: "info" });
            
            await parseAndInsertBIFile(file, selectedLabId, selectedSafra, currentModel, (msg) => {
                console.log(msg);
            });

            addToast({ title: "Arquivo importado", description: `Os dados do modelo ${currentModel} foram extraídos e salvos com sucesso na tabela oficial.`, type: "success" });
            await loadData(); // Recarrega os dados para atualizar o checkpoint
        } catch (error: any) {
            console.error("Upload error", error);
            addToast({ title: "Erro na importação", description: error.message || "Falha ao processar o arquivo.", type: "error" });
        } finally {
            setUploading(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Helper para o Checkpoint
    const getStatus = (labId: string, modelId: string) => {
        if (!selectedSafra) return { status: 'none', days: -1 };
        const lastUpdated = checkpoints[labId]?.[selectedSafra]?.[modelId];
        if (!lastUpdated) return { status: 'none', days: -1 };

        const today = startOfDay(new Date());
        const updated = startOfDay(new Date(lastUpdated));
        const days = differenceInDays(today, updated);

        if (days === 0) return { status: 'ok', days: 0 }; // Hoje
        return { status: 'delayed', days };
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Secao de Upload */}
            <div className="p-8 border border-neutral-200 bg-white shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-black pb-6 mb-8 gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-black text-white flex items-center justify-center">
                                <FileSpreadsheet className="h-5 w-5" />
                            </div>
                            <h3 className="text-2xl font-serif">Importação BI & Modelos</h3>
                        </div>
                        <p className="text-sm text-neutral-500 mt-2">
                            Importe as planilhas. Os dados extraídos substituirão a carga antiga na tabela do banco.
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 w-full md:w-auto">
                        <div className="flex flex-col space-y-2 w-full md:w-48">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Safra</label>
                            <select
                                title="Selecionar Safra"
                                aria-label="Selecionar Safra"
                                value={selectedSafra}
                                onChange={(e) => setSelectedSafra(e.target.value)}
                                className="h-12 border-2 border-black bg-white text-black font-bold text-sm px-4 outline-none focus:ring-0 w-full"
                            >
                                <option value="" disabled>SELECIONE...</option>
                                <option value="2024/2025">2024/2025</option>
                                <option value="2025/2026">2025/2026</option>
                            </select>
                        </div>
                        <div className="flex flex-col space-y-2 w-full md:w-64">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Selecionar Laboratório</label>
                            <select
                                title="Selecionar Laboratório"
                                aria-label="Selecionar Laboratório"
                                value={selectedLabId}
                                onChange={(e) => setSelectedLabId(e.target.value)}
                                className="h-12 border-2 border-black bg-white text-black font-bold text-sm px-4 outline-none focus:ring-0 w-full"
                            >
                                <option value="" disabled>SELECIONE...</option>
                                {labs.map(l => (
                                    <option key={l.id} value={l.id}>{l.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <input 
                    type="file" 
                    title="Importar Planilha"
                    aria-label="Importar Planilha"
                    accept=".xlsx,.xls" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                />

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {UPLOAD_MODELS.map(model => (
                        <div key={model.id} className="p-6 border border-neutral-200 bg-neutral-50 hover:border-black transition-colors flex flex-col justify-between group">
                            <div className="mb-6">
                                <div className="h-12 w-12 bg-white border border-neutral-200 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                                </div>
                                <h4 className="text-sm font-bold uppercase tracking-widest text-black mb-2">{model.name}</h4>
                                <p className="text-xs text-neutral-500">{model.desc}</p>
                            </div>
                            <div className="space-y-3">
                                <Button 
                                    className="w-full h-10 text-[10px] uppercase font-bold tracking-widest bg-black text-white hover:bg-neutral-800"
                                    onClick={() => handleUploadClick(model.id)}
                                    disabled={uploading === model.id}
                                >
                                    {uploading === model.id ? (
                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                    ) : (
                                        <Upload className="h-3 w-3 mr-2" />
                                    )}
                                    Importar Dados
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Secao de Checkpoint */}
            <div className="p-8 border border-neutral-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 mb-8 border-b border-neutral-200 pb-4">
                    <Clock className="h-6 w-6 text-indigo-600" />
                    <div>
                        <h3 className="text-xl font-serif text-black">Checkpoint de Envio {selectedSafra ? `- Safra ${selectedSafra}` : ''}</h3>
                        <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Acompanhamento diário das tabelas</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="border-b-2 border-black">
                                    <th className="p-4 text-xs font-black uppercase tracking-widest text-neutral-500">Laboratório</th>
                                    {UPLOAD_MODELS.map(m => (
                                        <th key={m.id} className="p-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-center">
                                            {m.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {labs.map(lab => (
                                    <tr key={lab.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                        <td className="p-4 font-bold text-sm text-black uppercase">{lab.nome}</td>
                                        {UPLOAD_MODELS.map(m => {
                                            const stat = getStatus(lab.id, m.id);
                                            return (
                                                <td key={m.id} className="p-4 text-center">
                                                    {stat.status === 'ok' && (
                                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                                            <CheckCircle2 className="h-3 w-3" /> Em dia
                                                        </div>
                                                    )}
                                                    {stat.status === 'delayed' && (
                                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                                            <AlertCircle className="h-3 w-3" /> {stat.days} {stat.days === 1 ? 'dia' : 'dias'} atrás
                                                        </div>
                                                    )}
                                                    {stat.status === 'none' && (
                                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-100 text-neutral-500 border border-neutral-200 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                                            Pendente
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {labs.length === 0 && (
                                    <tr><td colSpan={5} className="p-8 text-center text-sm text-neutral-400">Nenhum laboratório cadastrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

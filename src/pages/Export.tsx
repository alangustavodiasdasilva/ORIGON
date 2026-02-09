import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Download, ArrowLeft, Settings2, FileStack, Terminal, ChevronDown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Sample } from "@/entities/Sample";
import type { Lote } from "@/entities/Lote";
import { SampleService } from "@/entities/Sample";
import { LoteService } from "@/entities/Lote";
import ExportPreview from "@/components/export/ExportPreview";

export default function Export() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const loteId = searchParams.get("loteId");

    const [lote, setLote] = useState<Lote | null>(null);
    const [samples, setSamples] = useState<Sample[]>([]);

    const [mode, setMode] = useState<"all" | "by_color">("all");
    const [separator, setSeparator] = useState<string>("tab");
    const hasHeader = true;
    const [decimalSeparator, setDecimalSeparator] = useState<"." | ",">(".");
    const [selectedColor, setSelectedColor] = useState<string>("#ef4444");

    useEffect(() => {
        if (loteId) {
            loadData();
        }
    }, [loteId]);

    const loadData = async () => {
        if (!loteId) return;
        const l = await LoteService.get(loteId);
        if (l) setLote(l);
        const s = await SampleService.listByLote(loteId);
        setSamples(s);
    };

    const handleDownload = () => {
        let filtered = samples;
        if (mode === "by_color" && selectedColor) {
            filtered = samples.filter(s => s.cor === selectedColor);
        }

        const headers = ["ID", "MIC", "LEN", "UNF", "STR", "RD", "+b"];
        const sep = separator === "tab" ? "\t" : separator;

        let content = "";
        if (hasHeader) {
            content += headers.join(sep) + "\n";
        }

        filtered.forEach(s => {
            const row = [
                s.amostra_id,
                s.mic?.toFixed(2),
                s.len?.toFixed(2),
                s.unf?.toFixed(1),
                s.str?.toFixed(1),
                s.rd?.toFixed(1),
                s.b?.toFixed(1)
            ].map(val => {
                if (val === undefined || val === null) return "";
                let str = val.toString();
                if (decimalSeparator === ",") str = str.replace(".", ",");
                return str;
            });
            content += row.join(sep) + "\n";
        });

        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const timestamp = new Date().toISOString().split('T')[0];
        link.download = `HVI_${lote?.nome || "Export"}_${mode}_${timestamp}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!loteId) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="bg-white p-16 rounded-[2.5rem] text-center space-y-8 max-w-xl border border-slate-200 shadow-xl">
                <div className="bg-slate-50 w-20 h-20 rounded-[1.5rem] border border-slate-100 flex items-center justify-center mx-auto shadow-sm">
                    <FileStack className="h-10 w-10 text-slate-300" />
                </div>
                <div className="space-y-4">
                    <h3 className="text-xl font-black text-slate-900 italic uppercase tracking-widest leading-none">Lote Indefinido</h3>
                    <p className="text-[10px] font-black text-slate-400 max-w-xs mx-auto uppercase tracking-widest leading-relaxed pt-2">É necessário uma sessão ativa de lote para iniciar o protocolo.</p>
                </div>
                <Button onClick={() => navigate("/")} className="h-14 px-12 bg-slate-950 text-white font-black text-[10px] uppercase tracking-[0.4em] transition-all hover:scale-105 rounded-xl shadow-lg">RETORNAR</Button>
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto space-y-12 animate-fade-in relative pb-10 text-slate-900">
            {/* Header - Compact */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-slate-200 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(-1)}
                            className="rounded-xl bg-white hover:bg-slate-50 text-slate-400 h-10 w-10 border border-slate-200 shadow-sm"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 italic uppercase tracking-tighter leading-none shadow-sm">Exportação de Dados</h1>
                        <div className="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-widest italic">
                            industrial_txt_v2
                        </div>
                    </div>
                    <div className="flex items-center gap-10 text-[10px] font-bold uppercase tracking-[0.4em] text-slate-400 italic leading-none pt-2">
                        <span className="flex items-center gap-2">
                            <Terminal className="h-3.5 w-3.5 text-blue-500" />
                            Node: <span className="text-blue-600 font-bold">{lote?.nome}</span>
                        </span>
                        <span className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-emerald-500 shadow-sm" />
                            Status: Validado
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-10 lg:grid-cols-12 animate-slide-up">
                <div className="lg:col-span-12 xl:col-span-4 space-y-8">
                    <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200/50">
                        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-[10px] font-black text-slate-900 italic uppercase tracking-[0.3em] flex items-center gap-3">
                                <Settings2 className="h-4 w-4 text-slate-400" />
                                Configurações de Saída
                            </h3>
                        </div>
                        <div className="p-10 space-y-10">
                            <div className="space-y-4">
                                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Escopo</Label>
                                <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-100 shadow-inner">
                                    <button
                                        onClick={() => setMode("all")}
                                        className={`py-3 rounded-lg text-[9px] font-black transition-all tracking-widest uppercase ${mode === "all" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"}`}
                                    >
                                        TODOS
                                    </button>
                                    <button
                                        onClick={() => setMode("by_color")}
                                        className={`py-3 rounded-lg text-[9px] font-black transition-all tracking-widest uppercase ${mode === "by_color" ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"}`}
                                    >
                                        POR_TAG
                                    </button>
                                </div>
                            </div>

                            {mode === "by_color" && (
                                <div className="space-y-4 animate-slide-up">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1 italic">Selecionar Tag</Label>
                                    <div className="flex gap-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                        {["#ef4444", "#f59e0b", "#10b981", "#3b82f6"].map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setSelectedColor(c)}
                                                className={`w-9 h-9 rounded-xl border-2 transition-all ${selectedColor === c ? 'border-slate-900 scale-110 shadow-lg' : 'border-transparent opacity-20 hover:opacity-100'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Delim</Label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-12 rounded-xl border border-slate-200 bg-white px-5 text-[10px] font-black text-slate-900 italic tracking-widest focus:ring-1 focus:ring-blue-500/10 outline-none appearance-none transition-all shadow-sm"
                                            value={separator}
                                            onChange={(e) => setSeparator(e.target.value)}
                                        >
                                            <option value="tab">TABULAÇÃO</option>
                                            <option value=";">PONTO_VÍRGULA</option>
                                            <option value=",">VÍRGULA</option>
                                            <option value="|">PIPE_LINE</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Ponto</Label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-12 rounded-xl border border-slate-200 bg-white px-5 text-[10px] font-black text-slate-900 italic tracking-widest focus:ring-1 focus:ring-blue-500/10 outline-none appearance-none transition-all shadow-sm"
                                            value={decimalSeparator}
                                            onChange={(e) => setDecimalSeparator(e.target.value as "." | ",")}
                                        >
                                            <option value=".">DOTPT (.)</option>
                                            <option value=",">VIRGPT (,)</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            <Button
                                className="w-full h-18 rounded-2xl bg-slate-950 text-white hover:bg-black shadow-[0_0_40px_rgba(0,0,0,0.1)] font-black text-[10px] uppercase tracking-[0.4em] transition-all hover:scale-[1.02] mt-4"
                                onClick={handleDownload}
                            >
                                <Download className="mr-3 h-5 w-5" /> EXECUTAR DUMP
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-12 xl:col-span-8 bg-white rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl shadow-slate-200/50 border border-slate-200 min-h-[600px]">
                    <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="text-[11px] font-black text-slate-900 italic uppercase tracking-[0.4em] leading-none">Pré-visualização do Buffer</h3>
                            <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest pt-1 italic opacity-60">Validação da sequência industrial de saída</p>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-50/10 overflow-auto">
                        <ExportPreview
                            samples={samples}
                            separator={separator}
                            hasHeader={hasHeader}
                            decimalSeparator={decimalSeparator}
                            mode={mode}
                            selectedColor={selectedColor}
                        />
                    </div>
                    <div className="p-10 border-t border-slate-100 bg-white flex flex-col items-center justify-center text-center space-y-3">
                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest italic leading-relaxed opacity-60">O conteúdo acima reflete o arquivo final salvo localmente pelo sistema.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

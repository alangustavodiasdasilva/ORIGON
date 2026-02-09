import { useState, useEffect } from "react";
import { StickyNote, Calculator, X, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ToolsWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTool, setActiveTool] = useState<'notes' | 'calc' | null>(null);
    const [note, setNote] = useState("");

    // Calc State
    const [calcValues, setCalcValues] = useState<string>("");
    const [calcResult, setCalcResult] = useState<number | null>(null);

    useEffect(() => {
        const savedNote = localStorage.getItem("fibertech_analyst_notes");
        if (savedNote) setNote(savedNote);
    }, []);

    const handleSaveNote = (text: string) => {
        setNote(text);
        localStorage.setItem("fibertech_analyst_notes", text);
    };

    const handleCalc = () => {
        const numbers = calcValues.split(/[\n, ]+/).map((v: string) => parseFloat(v)).filter((n: number) => !isNaN(n));
        if (numbers.length === 0) return;

        const sum = numbers.reduce((a: number, b: number) => a + b, 0);
        const avg = sum / numbers.length;
        setCalcResult(avg);
    };

    return (
        <div className="fixed bottom-8 left-8 z-[100] flex flex-col items-start gap-4">
            {/* Active Tool Window */}
            {activeTool === 'notes' && (
                <div className="w-80 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 shadow-2xl rounded-2xl overflow-hidden animate-slide-up origin-bottom-left">
                    <div className="bg-yellow-200 dark:bg-yellow-800/40 p-3 flex justify-between items-center cursor-move">
                        <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-100 font-bold text-xs uppercase tracking-widest">
                            <StickyNote className="h-3 w-3" /> Bloco de Notas
                        </div>
                        <button onClick={() => setActiveTool(null)} className="text-yellow-800/50 hover:text-yellow-900 dark:text-yellow-100/50 dark:hover:text-white">
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                    <textarea
                        className="w-full h-64 bg-transparent p-4 text-xs font-mono text-slate-800 dark:text-yellow-50 resize-none focus:outline-none"
                        placeholder="Digite suas observações aqui..."
                        value={note}
                        onChange={(e) => handleSaveNote(e.target.value)}
                    />
                </div>
            )}

            {activeTool === 'calc' && (
                <div className="w-72 bg-slate-950 text-white shadow-2xl rounded-2xl overflow-hidden animate-slide-up origin-bottom-left border border-slate-800">
                    <div className="bg-slate-900 p-3 flex justify-between items-center">
                        <div className="flex items-center gap-2 text-slate-300 font-bold text-xs uppercase tracking-widest">
                            <Calculator className="h-3 w-3" /> Média Rápida
                        </div>
                        <button onClick={() => setActiveTool(null)} className="text-slate-500 hover:text-white">
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Valores (separados por espaço)</label>
                            <textarea
                                className="w-full h-24 bg-slate-900 rounded-lg border border-slate-800 p-2 text-xs font-mono focus:outline-none focus:border-blue-600 transition-colors"
                                placeholder="ex: 4.2 4.5 3.9"
                                value={calcValues}
                                onChange={(e) => setCalcValues(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Resultado</span>
                            <span className="text-xl font-black text-blue-400 tabular-nums">
                                {calcResult !== null ? calcResult.toFixed(2) : '--'}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => { setCalcValues(""); setCalcResult(null); }} variant="secondary" className="flex-1 h-8 text-[9px] uppercase font-bold tracking-widest bg-slate-800 text-slate-400 hover:bg-slate-700">
                                <Trash2 className="h-3 w-3 mr-1" /> Limpar
                            </Button>
                            <Button onClick={handleCalc} className="flex-1 h-8 text-[9px] uppercase font-bold tracking-widest bg-blue-600 hover:bg-blue-500 text-white">
                                Calcular
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Toggle Button */}
            <div className={`flex items-center gap-2 transition-all ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                <Button
                    onClick={() => setActiveTool(activeTool === 'notes' ? null : 'notes')}
                    className="h-10 w-10 rounded-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 shadow-lg p-0"
                    title="Notas"
                >
                    <StickyNote className="h-5 w-5" />
                </Button>
                <Button
                    onClick={() => setActiveTool(activeTool === 'calc' ? null : 'calc')}
                    className="h-10 w-10 rounded-full bg-slate-800 hover:bg-slate-700 text-white shadow-lg p-0"
                    title="Calculadora"
                >
                    <Calculator className="h-5 w-5" />
                </Button>
            </div>

            <Button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-12 w-12 rounded-full shadow-xl p-0 transition-transform active:scale-90 z-10",
                    isOpen ? "bg-slate-200 hover:bg-slate-300 text-black rotate-45" : "bg-black hover:bg-slate-800 text-white dark:bg-blue-600 dark:hover:bg-blue-500"
                )}
            >
                <Plus className="h-6 w-6" />
            </Button>
        </div>
    );
}



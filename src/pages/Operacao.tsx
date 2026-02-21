import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Upload, BarChart3, Loader2, X, Sun, Moon, Sunset, ArrowRight, Save, Calendar, Copy, FileSpreadsheet, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Tesseract from 'tesseract.js';

import { LabService } from "@/entities/Lab";
import ProductionTrendChart from "@/components/analysis/ProductionTrendChart";
import { producaoService } from "@/services/producao.service";
import type { ProducaoData } from "@/services/producao.service";
import { parseProducaoFileInChunks } from "@/lib/producaoParser";

interface IOperacaoItem {
    id?: string;
    data_producao: string;
    turno: string;
    identificador_unico: string;
    peso: number;
    produto?: string;
    metadata?: any;
}

interface OCRBox {
    text: string;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    confidence: number;
}

interface OCRBlock {
    id: string;
    data: string;
    turnos: {
        nome: string;
        valores: {
            val: string;
            bbox?: OCRBox;
        }[];
        totalOriginal?: number;
        totalBbox?: OCRBox;
    }[];
}

interface OCRResult {
    blocks: OCRBlock[];
    allBoxes: OCRBox[];
}

export default function Operacao() {
    const { user, currentLab, selectLab, deselectLab } = useAuth();
    const { addToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessingOCR, setIsProcessingOCR] = useState(false);
    const [ocrDebugText, setOcrDebugText] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [pastedImage, setPastedImage] = useState<string | null>(null);
    const [ocrData, setOcrData] = useState<OCRResult | null>(null);
    const [chartData, setChartData] = useState<IOperacaoItem[]>([]);
    const [totalProduzido, setTotalProduzido] = useState(0);

    const turno1Total = chartData.filter((d: IOperacaoItem) => d.turno === 'TURNO 1').reduce((acc: number, curr: IOperacaoItem) => acc + curr.peso, 0);
    const turno2Total = chartData.filter((d: IOperacaoItem) => d.turno === 'TURNO 2').reduce((acc: number, curr: IOperacaoItem) => acc + curr.peso, 0);
    const turno3Total = chartData.filter((d: IOperacaoItem) => d.turno === 'TURNO 3').reduce((acc: number, curr: IOperacaoItem) => acc + curr.peso, 0);

    useEffect(() => {
        loadStats();
    }, [currentLab]);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            if (event.target?.result) {
                                setPastedImage(event.target.result as string);
                                processImageOCR(blob);
                            }
                        };
                        reader.readAsDataURL(blob);
                    }
                    e.preventDefault();
                    break;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [currentLab]);

    const loadStats = async () => {
        const targetLabId = currentLab?.id || user?.lab_id;
        if (!targetLabId) return;
        setIsLoading(true);
        try {
            const data = await producaoService.list(targetLabId);
            if (data) {
                const validData: IOperacaoItem[] = data.map((d: ProducaoData) => ({ ...d, peso: d.peso || 0 }));
                setChartData(validData);
                setTotalProduzido(validData.reduce((acc: number, curr: IOperacaoItem) => acc + curr.peso, 0));
            }
        } catch (error) {
            console.error("Failed load:", error);
            addToast({ title: "Erro de Carregamento", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const preprocessImage = async (imageBlob: Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    if (!ctx) { resolve(e.target?.result as string); return; }
                    const scale = 2;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                        data[i] = gray; data[i + 1] = gray; data[i + 2] = gray;
                    }
                    ctx.putImageData(imageData, 0, 0);
                    resolve(canvas.toDataURL("image/png", 1.0));
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(imageBlob);
        });
    };

    const fixOCRCharacters = (text: string): string => {
        return text.replace(/O/g, '0').replace(/I/g, '1').replace(/l/g, '1').replace(/B/g, '8').replace(/S/g, '5').replace(/Z/g, '7').replace(/G/g, '6');
    };

    const extractNumbersFromLine = (words: any[]) => {
        const values: { val: string; bbox: OCRBox }[] = [];
        words.forEach(w => {
            const rawText = w.text.trim();
            if (!rawText) return;
            const letterCount = (rawText.match(/[a-zA-Z]/g) || []).length;
            const digitCount = (rawText.match(/[0-9]/g) || []).length;
            if (letterCount >= 2 || (letterCount > 0 && digitCount === 0)) return;
            const clean = fixOCRCharacters(rawText).replace(/\./g, '');
            const numStr = clean.replace(/[^\d]/g, '');
            if (numStr.length > 0) {
                const val = parseInt(numStr);
                if (!isNaN(val) && val < 1000000) {
                    values.push({ val: String(val), bbox: { text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence } });
                }
            }
        });
        return values;
    };

    const processImageOCR = async (imageFile: File) => {
        setIsProcessingOCR(true);
        setOcrData(null);
        setOcrDebugText("Iniciando processamento...");
        try {
            const processedImageUrl = await preprocessImage(imageFile);
            const worker = await Tesseract.createWorker('eng');
            await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
            const result = (await worker.recognize(processedImageUrl)) as any;
            await worker.terminate();
            const rawText = result.data.text || "";
            let debugLog = `--- LEITURA BRUTA ---\n${rawText}\n-------------------\n\n`;
            let lines = result.data.lines || [];
            if (lines.length === 0 && rawText.trim().length > 0) {
                lines = rawText.split('\n').map((txt: string) => ({ text: txt, words: txt.split(/\s+/).filter(Boolean).map(w => ({ text: w, bbox: { x0: 0, x1: 0, y0: 0, y1: 0 }, confidence: 100 })) }));
            }
            const blocks: OCRBlock[] = [];
            let currentBlock: OCRBlock | null = null;
            let lastDate = '';
            const globalDateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
            const ensureBlock = (date: string) => {
                if (currentBlock && !currentBlock.data && date) { currentBlock.data = date; return; }
                if (currentBlock && currentBlock.data === date && date !== '') return;
                if (currentBlock && currentBlock.turnos.length === 0) { currentBlock.data = date; return; }
                currentBlock = { id: Math.random().toString(36).substr(2, 9), data: date, turnos: [] };
                blocks.push(currentBlock);
            };
            ensureBlock(lastDate);
            let sequentialNumericLineCount = 0;
            lines.forEach((line: any) => {
                const text = line.text.trim();
                const upper = text.toUpperCase();
                if (text.length < 3) return;
                const isDataRow = upper.includes("TURNO") || upper.includes("TOTAL");
                if (!isDataRow) {
                    const dateMatch = text.match(globalDateRegex);
                    if (dateMatch) {
                        let day = dateMatch[1], month = dateMatch[2], year = dateMatch[3];
                        if (year.length === 2) year = `20${year}`;
                        if (parseInt(month) <= 12 && parseInt(day) <= 31 && parseInt(year) >= 2020) {
                            const newDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                            if (newDate !== lastDate && lastDate !== '') sequentialNumericLineCount = 0;
                            lastDate = newDate;
                            ensureBlock(newDate);
                        }
                    }
                }
                const nums = extractNumbersFromLine(line.words || []);
                const isFuzzyTurno = /[T\[].{2,5}\s+[123]\b/.test(text) || upper.includes("TURNO");
                const isFuzzyTotal = upper.includes("TOTAL") || /TOT.{0,2}L/i.test(text) || upper.includes("AL GERAL");
                const hasLabel = isFuzzyTurno || isFuzzyTotal || upper.includes("T1") || upper.includes("T2");
                const visualNumbersCount = (text.replace(/[^0-9]/g, "").length);
                const isDataLine = hasLabel || nums.length >= 2 || (visualNumbersCount > 8 && nums.length >= 1);
                if (hasLabel && nums.length > 1) { while (nums.length > 0 && parseInt(nums[0].val) <= 3) nums.shift(); }
                if (isDataLine) {
                    let label = "TURNO INDEFINIDO";
                    const t1 = upper.includes("TURNO 1") || upper.includes("T1") || /[T\[].{2,5}\s*1\b/.test(text);
                    const t2 = upper.includes("TURNO 2") || upper.includes("T2") || /[T\[].{2,5}\s*2\b/.test(text);
                    const t3 = upper.includes("TURNO 3") || upper.includes("T3") || /[T\[].{2,5}\s*3\b/.test(text);
                    if (t1) { if (currentBlock && currentBlock.turnos.some(t => t.nome === "TURNO 1")) { ensureBlock(''); sequentialNumericLineCount = 0; } label = "TURNO 1"; sequentialNumericLineCount = 1; }
                    else if (t2) { label = "TURNO 2"; sequentialNumericLineCount = 2; }
                    else if (t3) { label = "TURNO 3"; sequentialNumericLineCount = 3; }
                    else if (isFuzzyTotal) { label = "TOTAL GERAL"; }
                    else {
                        let isSumRow = false;
                        if (currentBlock && currentBlock.turnos.length > 0 && nums.length > 2) {
                            const realTurnos = currentBlock.turnos.filter(t => !t.nome.includes('TOTAL') && !t.nome.includes('GERAL'));
                            if (realTurnos.length >= 1) {
                                const tMv = realTurnos.map(t => { const v = [...t.valores]; if (v.length > 3) v.pop(); return v; });
                                const maxCols = Math.min(nums.length > 3 ? nums.length - 1 : nums.length, ...tMv.map(v => v.length), 5);
                                const comps = Math.max(maxCols, Math.min(nums.length, 3));
                                let matches = 0;
                                for (let c = 0; c < comps; c++) {
                                    let colSum = 0; tMv.forEach(v => { if (v[c]) colSum += parseFloat(v[c].val.replace(/\./g, "").replace(",", ".")); });
                                    const currVal = parseFloat(nums[c].val.replace(/\./g, "").replace(",", "."));
                                    if (!isNaN(currVal) && colSum > 0 && Math.abs(colSum - currVal) <= Math.max(colSum * 0.20, 10)) matches++;
                                }
                                if (matches >= Math.max(1, Math.ceil(comps / 3))) isSumRow = true;
                                if (!isSumRow && realTurnos.length >= 1) isSumRow = true;
                            }
                        }
                        if (isSumRow) label = "TOTAL GERAL";
                        else if (nums.length >= 3) { sequentialNumericLineCount++; if (sequentialNumericLineCount === 1) label = "TURNO 1"; else if (sequentialNumericLineCount === 2) label = "TURNO 2"; else label = "TOTAL GERAL"; }
                        else return;
                    }
                    if (nums.length > 5) { const fv = parseInt(nums[0].val); if (fv === sequentialNumericLineCount && fv <= 3) nums.shift(); }
                    let tOrig = 0; if (nums.length > 4) { const li = nums.pop(); if (li) tOrig = parseInt(li.val.replace(/\./g, '')); }
                    if (nums.length > 0 && currentBlock) {
                        if (!currentBlock.turnos.some(t => t.nome === label && JSON.stringify(t.valores.map(v => v.val)) === JSON.stringify(nums.map(n => n.val)))) {
                            if (label === "TOTAL GERAL") {
                                const rt = currentBlock.turnos.filter(t => !t.nome.includes('TOTAL') && !t.nome.includes('GERAL'));
                                if (rt.length > 0) {
                                    const mc = Math.max(...rt.map(t => t.valores.length));
                                    const cv: { val: string; bbox: OCRBox }[] = [];
                                    for (let c = 0; c < mc; c++) {
                                        let cs = 0; rt.forEach(t => { if (t.valores[c]) cs += parseFloat(t.valores[c].val.replace(/\./g, "").replace(",", ".")); });
                                        cv.push({ val: String(cs), bbox: nums[c]?.bbox || { text: '', x0: 0, y0: 0, x1: 0, y1: 0, confidence: 100 } });
                                    }
                                    currentBlock.turnos.push({ nome: label, valores: cv, totalOriginal: tOrig });
                                } else currentBlock.turnos.push({ nome: label, valores: nums, totalOriginal: tOrig });
                            } else currentBlock.turnos.push({ nome: label, valores: nums, totalOriginal: tOrig });
                        }
                    }
                }
            });
            const validBlocks = blocks.filter(b => b.turnos.length > 0);
            setOcrDebugText(debugLog + `\nBlocos Válidos Finais: ${validBlocks.length}`);
            if (validBlocks.length === 0) {
                setOcrData({ blocks: [{ id: 'error_fallback', data: lastDate, turnos: [{ nome: "NENHUM DADO IDENTIFICADO", valores: [] }] }], allBoxes: [] });
                addToast({ title: "Atenção", description: "O texto foi lido mas não conseguimos identificar as colunas.", type: "warning" });
            } else {
                setOcrData({ blocks: validBlocks, allBoxes: result.data.words?.map((w: any) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence })) || [] });
                addToast({ title: "Sucesso", description: `${validBlocks.length} dias identificados.`, type: "success" });
            }
        } catch (error: any) {
            console.error(error); setOcrDebugText(`ERRO FATAL: ${error.message}`);
            addToast({ title: "Erro", description: "Falha ao processar imagem.", type: "error" });
        } finally { setIsProcessingOCR(false); }
    };

    const confirmOCRUpload = async () => {
        if (!currentLab?.id || !ocrData) return;
        const recordsToInsert: any[] = [];
        ocrData.blocks.forEach((block: OCRBlock) => {
            if (!block.data) return;
            block.turnos.forEach((turno: any) => {
                if (turno.nome.includes("TOTAL") || turno.nome.includes("GERAL")) return;
                turno.valores.forEach((item: any, index: number) => {
                    const cleaned = item.val.replace(/\./g, '').replace(',', '.');
                    const val = parseFloat(cleaned);
                    if (!isNaN(val) && val > 0) {
                        recordsToInsert.push({ lab_id: currentLab.id, identificador_unico: `${block.data}-${turno.nome.replace(" ", "")}-COL${index + 1}`, data_producao: block.data, turno: turno.nome, produto: `Linha/Mq ${index + 1}`, peso: val, metadata: { source: 'ocr_multi_day' } });
                    }
                });
            });
        });
        if (recordsToInsert.length === 0) { addToast({ title: "Sem dados", type: "warning" }); return; }
        setIsLoading(true);
        try {
            await producaoService.uploadData(recordsToInsert);
            addToast({ title: "Salvo com sucesso!", description: `${recordsToInsert.length} registros salvos.`, type: "success" });
            setOcrData(null); setPastedImage(null); loadStats();
        } catch (error) { addToast({ title: "Erro ao salvar", type: "error" }); } finally { setIsLoading(false); }
    };

    const handleClearAllData = async () => {
        const targetLabId = currentLab?.id || user?.lab_id;
        if (!confirm("LIMPAR TUDO?") || !targetLabId) return;
        try { await producaoService.deleteAll(targetLabId); loadStats(); addToast({ title: "Histórico Limpo", type: "success" }); } catch (error) { addToast({ title: "Erro ao limpar", type: "error" }); }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const targetLabId = currentLab?.id || user?.lab_id;

        if (!targetLabId) {
            addToast({ title: "Erro de Laboratório", description: "O seu usuário não está vinculado a nenhum laboratório.", type: "error" });
            event.target.value = "";
            return;
        }
        setIsUploading(true);
        try {
            let total = 0; await parseProducaoFileInChunks(file, targetLabId, async (batch: any[]) => { await producaoService.uploadData(batch); total += batch.length; }, 2000);
            addToast({ title: "Upload concluído", description: `${total} registros.`, type: "success" }); loadStats();
        } catch (error) {
            console.error("Upload producao error:", error);
            addToast({ title: "Erro no processamento", type: "error" });
        } finally {
            setIsUploading(false); event.target.value = "";
        }
    };

    const [labs, setLabs] = useState<any[]>([]);
    useEffect(() => { if (user?.acesso === 'admin_global' && !currentLab) { const fn = async () => { const l = await LabService.list(); setLabs(l); }; fn(); } }, [user, currentLab]);

    if (user?.acesso === 'admin_global' && !currentLab) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-12 animate-fade-in text-black">
                <div className="inline-flex p-4 bg-black rounded-2xl shadow-2xl"><FileSpreadsheet className="h-12 w-12 text-white" /></div>
                <h1 className="text-5xl font-serif">Selecione o Laboratório</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-7xl">
                    {labs.map((lab: any) => (
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
        <div className="max-w-[95%] mx-auto py-8 text-black pb-24">
            <div className="flex items-center justify-between mb-8 pb-8 border-b border-black">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-black text-white flex items-center justify-center rounded-lg"><FileSpreadsheet className="h-6 w-6" /></div>
                    <div><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Operação</span><h1 className="text-3xl font-serif">Diária</h1></div>
                </div>
                <div className="flex gap-3">
                    {user?.acesso === 'admin_global' && (
                        <Button
                            variant="outline"
                            onClick={() => deselectLab()}
                            className="bg-black text-white border-black hover:bg-neutral-800 hover:text-white"
                            title="Trocar Laboratório"
                        >
                            <Building2 className="h-4 w-4 mr-2" />
                            {currentLab?.nome || "Lab"}
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleClearAllData} className="text-red-600 border-red-100 hover:bg-red-50">Limpar Histórico</Button>
                    <div className="relative">
                        <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 opacity-0 cursor-pointer" title="Importar Excel" aria-label="Importar Excel" />
                        <Button className="bg-emerald-600 text-white">{isUploading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />} Importar Excel</Button>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12 animate-in fade-in duration-700">
                <div className="group bg-white border border-neutral-200 p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Turno 1</span>
                        <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center"><Sun className="h-4 w-4 text-amber-500" /></div>
                    </div>
                    <div className="text-4xl font-serif text-black mb-1">{turno1Total.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Carga de Amostras</div>
                </div>

                <div className="group bg-white border border-neutral-200 p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Turno 2</span>
                        <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center"><Sunset className="h-4 w-4 text-orange-500" /></div>
                    </div>
                    <div className="text-4xl font-serif text-black mb-1">{turno2Total.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Carga de Amostras</div>
                </div>

                <div className="group bg-white border border-neutral-200 p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500">
                    <div className="flex items-center justify-between mb-6">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Turno 3</span>
                        <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center"><Moon className="h-4 w-4 text-indigo-500" /></div>
                    </div>
                    <div className="text-4xl font-serif text-black mb-1">{turno3Total.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Carga de Amostras</div>
                </div>

                <div className="group bg-black p-8 rounded-[2rem] shadow-[0_10px_30px_rgba(0,0,0,0.15)] relative overflow-hidden transition-all duration-500 hover:-translate-y-1">
                    <div className="absolute -right-8 -bottom-8 opacity-10">
                        <BarChart3 className="h-40 w-40 text-white" />
                    </div>
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Produção Total</span>
                        <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><BarChart3 className="h-4 w-4 text-white" /></div>
                    </div>
                    <div className="text-4xl font-serif text-white mb-1 relative z-10">{totalProduzido.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight relative z-10">Total de Amostras Processadas</div>
                </div>
            </div>
            <ProductionTrendChart data={chartData} />
            {pastedImage && (
                <div className="fixed inset-0 bg-white/95 z-50 p-8 overflow-y-auto animate-fade-in">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4"><div className="h-10 w-10 bg-black text-white flex items-center justify-center rounded-lg"><Copy className="h-5 w-5" /></div><h2 className="text-2xl font-serif">Revisão de Dados OCR</h2></div>
                            <div className="flex gap-4">
                                <Button onClick={confirmOCRUpload} disabled={isLoading} className="bg-black text-white px-8"><Save className="h-4 w-4 mr-2" /> Salvar Tudo</Button>
                                <Button variant="ghost" onClick={() => { setOcrData(null); setPastedImage(null); }}><X className="h-6 w-6" /></Button>
                            </div>
                        </div>
                        {isProcessingOCR ? (
                            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                <Loader2 className="h-12 w-12 animate-spin text-black" />
                                <div className="text-center"><p className="font-bold text-lg">Processando Imagem com OCR...</p><p className="text-sm text-neutral-500">Estamos identificando datas, turnos e máquinas automaticamente.</p></div>
                            </div>
                        ) : ocrData && (
                            <div className="space-y-8 animate-fade-in">
                                {ocrData.blocks.map((block: OCRBlock, bIdx: number) => (
                                    <div key={block.id} className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-neutral-50 p-4 border-b border-neutral-200 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-neutral-200 shadow-sm">
                                                    <Calendar className="h-4 w-4 text-neutral-400" />
                                                    <input type="date" value={block.data} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                        const n = { ...ocrData };
                                                        n.blocks[bIdx].data = e.target.value;
                                                        setOcrData(n);
                                                    }} className="text-sm font-bold bg-transparent border-none focus:ring-0 p-0" title="Data do Bloco" />
                                                </div>
                                                <span className="text-xs font-bold uppercase text-neutral-400 tracking-widest">Dia {bIdx + 1}</span>
                                            </div>
                                            {!block.data && <div className="flex items-center gap-2 text-red-500 font-bold text-[10px] animate-pulse"><X className="h-3 w-3" /> DATA OBRIGATÓRIA</div>}
                                        </div>
                                        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                                            {block.turnos.map((turno: any) => (
                                                <div key={turno.nome} className={cn("p-4 rounded-xl border", turno.nome.includes("TOTAL") ? "bg-black text-white border-black" : "bg-neutral-50 border-neutral-100")}>
                                                    <div className="flex items-center gap-2 mb-4">
                                                        {turno.nome.includes("TURNO 1") && <Sun className="h-4 w-4 text-amber-500" />}
                                                        {turno.nome.includes("TURNO 2") && <Sunset className="h-4 w-4 text-orange-500" />}
                                                        {turno.nome.includes("TURNO 3") && <Moon className="h-4 w-4 text-indigo-500" />}
                                                        <h4 className="font-bold text-xs uppercase tracking-widest">{turno.nome}</h4>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {turno.valores.map((item: any, vIdx: number) => (
                                                            <div key={vIdx} className="flex items-center justify-between gap-3 bg-white p-2 rounded-lg border border-neutral-200 shadow-sm text-black">
                                                                <span className="text-[9px] font-bold text-neutral-400 uppercase">M{vIdx + 1}</span>
                                                                <input type="text" value={item.val} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                                    const n = { ...ocrData };
                                                                    const t = n.blocks[bIdx].turnos.find((t: any) => t.nome === turno.nome);
                                                                    if (t) t.valores[vIdx].val = e.target.value;
                                                                    setOcrData(n);
                                                                }} className="w-full text-right text-sm font-mono font-bold bg-transparent border-none focus:ring-0 p-0" title={`Máquina ${vIdx + 1}`} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-12 p-6 bg-neutral-900 rounded-xl text-white">
                            <div className="flex items-center gap-2 mb-4"><div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> <span className="font-bold text-xs uppercase tracking-widest">Logs do Motor de Inteligência</span></div>
                            <pre className="text-[10px] font-mono leading-relaxed opacity-50 overflow-x-auto whitespace-pre-wrap">{ocrDebugText}</pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

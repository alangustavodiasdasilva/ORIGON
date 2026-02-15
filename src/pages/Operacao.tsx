import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/contexts/ToastContext";
import { Upload, FileSpreadsheet, BarChart3, Copy, Loader2, X, Save, Trash2, Edit2, Calendar, LayoutGrid, List, Sun, Moon, Sunset, ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Tesseract from 'tesseract.js';

import { LabService } from "@/entities/Lab";
import ProductionTrendChart from "@/components/analysis/ProductionTrendChart";
import GlobalProductionChart from "@/components/analysis/GlobalProductionChart";
import { producaoService } from "@/services/producao.service";
import { parseProducaoFileInChunks } from "@/lib/producaoParser";

interface ProductionData {
    id: string;
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
    allBoxes: OCRBox[]; // Para visualização geral
}

export default function Operacao() {
    const { user, currentLab, selectLab, deselectLab } = useAuth();
    const { addToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessingOCR, setIsProcessingOCR] = useState(false);
    const [ocrDebugText, setOcrDebugText] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);

    const [pastedImage, setPastedImage] = useState<string | null>(null);
    const [isImageZoomed, setIsImageZoomed] = useState(false);

    // OCR multi-dias
    const [ocrData, setOcrData] = useState<OCRResult | null>(null);

    // Dados e Estado da View
    const [chartData, setChartData] = useState<ProductionData[]>([]);
    const [totalProduzido, setTotalProduzido] = useState(0);
    const [historyView, setHistoryView] = useState<'cards' | 'table'>('table'); // Padrão Tabela para densidade

    // Totais por Turno
    const turno1Total = chartData.filter(d => d.turno === 'TURNO 1').reduce((acc, curr) => acc + curr.peso, 0);
    const turno2Total = chartData.filter(d => d.turno === 'TURNO 2').reduce((acc, curr) => acc + curr.peso, 0);
    const turno3Total = chartData.filter(d => d.turno === 'TURNO 3').reduce((acc, curr) => acc + curr.peso, 0);

    useEffect(() => {
        loadStats();
    }, [currentLab]);

    // Handle CTRL+V
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
        if (!currentLab?.id) return;

        const { data } = await supabase
            .from('operacao_producao')
            .select('*')
            .eq('lab_id', currentLab.id)
            .order('data_producao', { ascending: true });

        if (data) {
            const validData: ProductionData[] = data.map(d => ({
                ...d,
                peso: d.peso || 0
            }));
            setChartData(validData);
            const total = validData.reduce((acc, curr) => acc + curr.peso, 0);
            setTotalProduzido(total);
        }
    };

    // Função de pré-processamento com grayscale para OCR
    const preprocessImage = async (imageBlob: Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        resolve(e.target?.result as string);
                        return;
                    }

                    // Escala 2x para clareza
                    const scale = 2;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;

                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // Apenas Grayscale (sem binarização que distorce letras e confunde layout)
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                        data[i] = gray;
                        data[i + 1] = gray;
                        data[i + 2] = gray;
                    }
                    ctx.putImageData(imageData, 0, 0);

                    resolve(canvas.toDataURL("image/png", 1.0));
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(imageBlob);
        });
    };

    const processImageOCR = async (imageFile: File) => {
        setIsProcessingOCR(true);
        setOcrData(null);
        setOcrDebugText("Iniciando processamento...");

        try {
            const processedImageUrl = await preprocessImage(imageFile);

            setOcrDebugText("Executando Tesseract (ENG)...");
            const worker = await Tesseract.createWorker('eng');
            await worker.setParameters({
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            });

            const result = (await worker.recognize(processedImageUrl)) as any;
            await worker.terminate();

            const rawText = result.data.text || "";
            let debugLog = `--- LEITURA BRUTA ---\n${rawText}\n-------------------\n\n`;

            // VOLTANDO PARA O PADRÃO ROBUSTO DE LINHAS DO TESSERACT
            // A reconstrução manual falhou (retornou 0), então vamos confiar na segmentação padrão
            // que o log provou estar correta (o texto bruto tem as quebras certas).
            let lines = result.data.lines || [];

            debugLog += `Linhas detectadas nativamente: ${lines.length}\n`;

            // FALLBACK: Se não vier linhas estruturadas mas tiver texto, criamos linhas artificiais
            if (lines.length === 0 && rawText.trim().length > 0) {
                debugLog += "AVISO: Linhas estruturadas vazias. Usando fallback de texto bruto.\n";
                lines = rawText.split('\n').map((txt: string) => ({
                    text: txt,
                    words: txt.split(/\s+/).filter(Boolean).map(w => ({ text: w, bbox: { x0: 0, x1: 0, y0: 0, y1: 0 }, confidence: 100 }))
                }));
            }

            // --- PROCESSAMENTO LINEAR ---
            const blocks: OCRBlock[] = [];
            let currentBlock: OCRBlock | null = null;
            let lastDate = '';

            const globalDateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;

            const ensureBlock = (date: string) => {
                // Se o bloco atual existe e não tem data, atualiza a data
                if (currentBlock && !currentBlock.data && date) {
                    currentBlock.data = date;
                    return;
                }
                // Se o bloco atual já tem a mesma data, reutiliza
                if (currentBlock && currentBlock.data === date && date !== '') {
                    return;
                }
                // Se o bloco atual está vazio (sem turnos), reutiliza
                if (currentBlock && currentBlock.turnos.length === 0) {
                    currentBlock.data = date;
                    return;
                }
                // Cria novo bloco
                currentBlock = {
                    id: Math.random().toString(36).substr(2, 9),
                    data: date,
                    turnos: []
                };
                blocks.push(currentBlock);
            };

            ensureBlock(lastDate);

            // Contagem de linhas numéricas para inferência de turno
            let sequentialNumericLineCount = 0;

            lines.forEach((line: any, index: number) => {
                const text = line.text.trim();
                const upper = text.toUpperCase();

                if (text.length < 3) return; // Ignora lixo muito curto

                // 1. DATA — Só detecta em linhas que NÃO são claramente de dados
                const isDataRow = upper.includes("TURNO") || upper.includes("TOTAL");
                if (!isDataRow) {
                    const dateMatch = text.match(globalDateRegex);
                    if (dateMatch) {
                        let day = dateMatch[1];
                        let month = dateMatch[2];
                        let year = dateMatch[3];

                        if (year.length === 2) year = `20${year}`;

                        // Validação básica de data
                        if (parseInt(month) <= 12 && parseInt(day) <= 31 && parseInt(year) >= 2020) {
                            const newDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                            // Se a data mudou, resetar contagem sequencial
                            if (newDate !== lastDate && lastDate !== '') {
                                sequentialNumericLineCount = 0;
                            }

                            lastDate = newDate;
                            ensureBlock(newDate);
                            debugLog += `[L${index}] DATA ENCONTRADA: ${newDate}\n`;
                        }
                    }
                }

                // 2. DADOS
                debugLog += `  [Words] ${(line.words || []).map((w: any) => w.text).join(' | ')}\n`;
                const nums = extractNumbersFromLine(line.words || []);
                debugLog += `  [Nums] ${nums.map((n: any) => n.val).join(', ')} (${nums.length} valores)\n`;

                // Detecção fuzzy de TURNO (OCR pode ler como TLIRNG, TURNG, [LURNG, etc.)
                const isFuzzyTurno = /[T\[].{2,5}\s+[123]\b/.test(text) || upper.includes("TURNO");
                const isFuzzyTotal = upper.includes("TOTAL") || /TOT.{0,2}L/i.test(text) || upper.includes("AL GERAL");
                const hasLabel = isFuzzyTurno || isFuzzyTotal || upper.includes("T1") || upper.includes("T2");
                const visualNumbersCount = (text.replace(/[^0-9]/g, "").length);

                // Aceita linha se tiver label OU muitos numeros (para pegar a linha de totais que as vezes n tem label)
                const isDataLine = hasLabel || nums.length >= 2 || (visualNumbersCount > 8 && nums.length >= 1);

                // --- LIMPEZA DE ARTEFATOS DO LABEL ---
                // Remove valores muito pequenos (0, 1, 2, 3) no início que provavelmente vieram do label
                // Ex: "TURNO 1" gera O→0 e 1→1 como artefatos
                if (hasLabel && nums.length > 1) {
                    while (nums.length > 0 && parseInt(nums[0].val) <= 3) {
                        debugLog += `  [Fix] Removido artefato de label: '${nums[0].val}'\n`;
                        nums.shift();
                    }
                }

                if (isDataLine) {
                    let label = "TURNO INDEFINIDO";

                    // Detecção de turno com fuzzy matching
                    const turno1Match = upper.includes("TURNO 1") || upper.includes("T1") || /[T\[].{2,5}\s*1\b/.test(text);
                    const turno2Match = upper.includes("TURNO 2") || upper.includes("T2") || /[T\[].{2,5}\s*2\b/.test(text);
                    const turno3Match = upper.includes("TURNO 3") || upper.includes("T3") || /[T\[].{2,5}\s*3\b/.test(text);

                    if (turno1Match) {
                        // Se o bloco atual já tem TURNO 1, é um novo dia
                        if (currentBlock && currentBlock.turnos.some(t => t.nome === "TURNO 1")) {
                            ensureBlock('');
                            sequentialNumericLineCount = 0;
                        }
                        label = "TURNO 1";
                        sequentialNumericLineCount = 1;
                    }
                    else if (turno2Match) {
                        label = "TURNO 2";
                        sequentialNumericLineCount = 2;
                    }
                    else if (turno3Match) {
                        label = "TURNO 3";
                        sequentialNumericLineCount = 3;
                    }
                    else if (isFuzzyTotal) {
                        label = "TOTAL GERAL";
                    }
                    else {
                        // Inferência Inteligente: Verifica se é uma linha de SOMA (Total Geral)
                        let isSumRow = false;
                        if (currentBlock && currentBlock.turnos.length > 0 && nums.length > 2) {
                            // Filtra apenas turnos reais (não totais anteriores) para a soma
                            const realTurnos = currentBlock.turnos.filter(t => !t.nome.includes('TOTAL') && !t.nome.includes('GERAL'));

                            if (realTurnos.length >= 1) {
                                // Para cada turno real, pegamos os valores SEM o último (que é o total do turno)
                                const turnoMachineValues = realTurnos.map(t => {
                                    const vals = [...t.valores];
                                    if (vals.length > 3) vals.pop(); // Remove total do turno (última coluna)
                                    return vals;
                                });

                                // Número de colunas a comparar
                                const maxCols = Math.min(
                                    nums.length > 3 ? nums.length - 1 : nums.length,
                                    ...turnoMachineValues.map(v => v.length),
                                    5
                                );
                                const comparisons = Math.max(maxCols, Math.min(nums.length, 3));

                                let matches = 0;
                                for (let c = 0; c < comparisons; c++) {
                                    let colSum = 0;
                                    turnoMachineValues.forEach(vals => {
                                        if (vals[c]) {
                                            const v = parseFloat(vals[c].val.replace(/\./g, "").replace(",", "."));
                                            if (!isNaN(v)) colSum += v;
                                        }
                                    });

                                    const currentVal = parseFloat(nums[c].val.replace(/\./g, "").replace(",", "."));
                                    const tolerance = Math.max(colSum * 0.20, 10);
                                    if (!isNaN(currentVal) && colSum > 0 && Math.abs(colSum - currentVal) <= tolerance) {
                                        matches++;
                                    }
                                }

                                debugLog += `  [SumCheck] Comparações: ${comparisons}, Matches: ${matches}\n`;

                                if (matches >= Math.max(1, Math.ceil(comparisons / 3))) {
                                    isSumRow = true;
                                    debugLog += `  [Info] Identificado como TOTAL GERAL por soma (Matches: ${matches}/${comparisons})\n`;
                                }

                                // Fallback: se já existe 1+ turno real e essa linha NÃO tem label de turno,
                                // é muito provavelmente a linha de TOTAL GERAL
                                if (!isSumRow && realTurnos.length >= 1) {
                                    isSumRow = true;
                                    debugLog += `  [Info] Identificado como TOTAL GERAL por fallback (${realTurnos.length} turnos, linha sem label)\n`;
                                }
                            }
                        }

                        if (isSumRow) {
                            label = "TOTAL GERAL";
                        } else {
                            // Inferência Sequencial padrão (somente quando NÃO há turnos anteriores no bloco)
                            if (nums.length >= 3) {
                                sequentialNumericLineCount++;
                                if (sequentialNumericLineCount === 1) label = "TURNO 1";
                                if (sequentialNumericLineCount === 2) label = "TURNO 2";
                                if (sequentialNumericLineCount >= 3) label = "TOTAL GERAL";
                            } else {
                                debugLog += `[L${index}] Ignorado (sem label e poucos numeros): ${text}\n`;
                                return;
                            }
                        }
                    }

                    // Limpa prefixo numérico se for índice
                    if (nums.length > 5) {
                        const firstVal = parseInt(nums[0].val);
                        if (firstVal === sequentialNumericLineCount && firstVal <= 3) {
                            nums.shift();
                            debugLog += `  [Fix] Removido indexador '${firstVal}'\n`;
                        }
                    }

                    // --- TRATAMENTO DE COLUNA DE TOTAIS ---
                    let totalOriginal = 0;
                    if (nums.length > 4) {
                        const lastItem = nums.pop(); // Remove o último
                        if (lastItem) {
                            totalOriginal = parseInt(lastItem.val.replace(/\./g, ''));
                            debugLog += `  [Info] Total extraído da linha: ${totalOriginal}\n`;
                        }
                    }

                    if (nums.length > 0) {
                        if (currentBlock) {
                            // Evitar duplicatas
                            const isDuplicate = currentBlock.turnos.some(t =>
                                t.nome === label &&
                                JSON.stringify(t.valores.map(v => v.val)) === JSON.stringify(nums.map(n => n.val))
                            );

                            if (!isDuplicate) {
                                // Para TOTAL GERAL, calcular os valores a partir dos turnos reais
                                // ao invés de confiar no OCR (que frequentemente erra nessa linha)
                                if (label === "TOTAL GERAL" && currentBlock) {
                                    const realTurnos = currentBlock.turnos.filter(t => !t.nome.includes('TOTAL') && !t.nome.includes('GERAL'));
                                    if (realTurnos.length > 0) {
                                        const maxCols = Math.max(...realTurnos.map(t => t.valores.length));
                                        const computedVals: typeof nums = [];
                                        for (let c = 0; c < maxCols; c++) {
                                            let colSum = 0;
                                            realTurnos.forEach(t => {
                                                if (t.valores[c]) {
                                                    const v = parseFloat(t.valores[c].val.replace(/\./g, "").replace(",", "."));
                                                    if (!isNaN(v)) colSum += v;
                                                }
                                            });
                                            computedVals.push({ val: String(colSum), bbox: nums[c]?.bbox || { text: '', x0: 0, y0: 0, x1: 0, y1: 0, confidence: 100 } });
                                        }
                                        currentBlock.turnos.push({
                                            nome: label,
                                            valores: computedVals,
                                            totalOriginal: totalOriginal
                                        });
                                        debugLog += `[L${index}] PROCESSADO: ${label} [CALCULADO: ${computedVals.map(n => n.val).join(', ')}]\n`;
                                    } else {
                                        currentBlock.turnos.push({
                                            nome: label,
                                            valores: nums,
                                            totalOriginal: totalOriginal
                                        });
                                        debugLog += `[L${index}] PROCESSADO: ${label} [${nums.map(n => n.val).join(', ')}] (Total: ${totalOriginal})\n`;
                                    }
                                } else {
                                    currentBlock.turnos.push({
                                        nome: label,
                                        valores: nums,
                                        totalOriginal: totalOriginal
                                    });
                                    debugLog += `[L${index}] PROCESSADO: ${label} [${nums.map(n => n.val).join(', ')}] (Total: ${totalOriginal})\n`;
                                }
                            } else {
                                debugLog += `[L${index}] IGNORADO (DUPLICATA): ${label}\n`;
                            }
                        }
                    }
                } else {
                    debugLog += `[L${index}] IGNORADO: ${text} (${nums.length} nums calc)\n`;
                }
            });

            // Finalização
            const validBlocks = blocks.filter(b => b.turnos.length > 0);
            debugLog += `\nBlocos Válidos Finais: ${validBlocks.length}`;

            setOcrDebugText(debugLog);

            if (validBlocks.length === 0) {
                // Fallback de erro visível
                setOcrData({
                    blocks: [{
                        id: 'error_fallback',
                        data: lastDate,
                        turnos: [{ nome: "NENHUM DADO IDENTIFICADO", valores: [] }]
                    }],
                    allBoxes: []
                });
                addToast({ title: "Atenção", description: "O texto foi lido mas não conseguimos identificar as colunas.", type: "warning" });
            } else {
                setOcrData({
                    blocks: validBlocks,
                    allBoxes: result.data.words?.map((w: any) => ({
                        text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence
                    })) || []
                });
                addToast({ title: "Sucesso", description: `${validBlocks.length} dias identificados.`, type: "success" });
            }

        } catch (error: any) {
            console.error(error);
            setOcrDebugText(`ERRO FATAL: ${error.message}\n${error.stack}`);
            addToast({ title: "Erro", description: "Falha ao processar imagem.", type: "error" });
        } finally {
            setIsProcessingOCR(false);
        }
    };



    const extractNumbersFromLine = (words: any[]) => {
        const values: { val: string; bbox: OCRBox }[] = [];
        words.forEach(w => {
            const rawText = w.text.trim();
            if (!rawText) return;

            // --- PROTEÇÃO CONTRA LABELS ---
            // Se a palavra original tem mais letras do que dígitos, é provavelmente
            // texto (como "TURNO", "TOTAL") e NÃO deve passar por fixOCRCharacters.
            // Sem isso, o "O" de "TURNO" vira "0" e é capturado como valor.
            const letterCount = (rawText.match(/[a-zA-Z]/g) || []).length;
            const digitCount = (rawText.match(/[0-9]/g) || []).length;
            if (letterCount >= 2 || (letterCount > 0 && digitCount === 0)) {
                return; // Skip: "TURNO", "TOTAL", "GERAL", etc.
            }

            const clean = fixOCRCharacters(rawText).replace(/\./g, ''); // Remove milhar
            const numStr = clean.replace(/[^\d]/g, ''); // Mantém apenas dígitos

            if (numStr.length > 0) {
                const val = parseInt(numStr);
                // Filtros de Bom Senso
                if (!isNaN(val) && val < 1000000) {
                    values.push({
                        val: String(val),
                        bbox: {
                            text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence
                        }
                    });
                }
            }
        });
        return values;
    };

    // Função para corrigir erros comuns de OCR (Letras que parecem números)
    const fixOCRCharacters = (text: string): string => {
        return text
            .replace(/O/g, '0')
            .replace(/I/g, '1')
            .replace(/l/g, '1')
            .replace(/B/g, '8')
            .replace(/S/g, '5')
            .replace(/Z/g, '7')
            .replace(/G/g, '6');
    };

    const handleEditDate = (date: string) => {
        const items = chartData.filter(d => d.data_producao === date);
        if (items.length === 0) return;

        const turnosMap: Record<string, ProductionData[]> = {};
        items.forEach(i => {
            if (!turnosMap[i.turno]) turnosMap[i.turno] = [];
            turnosMap[i.turno].push(i);
        });

        const turnosList = Object.keys(turnosMap).sort().map(turnoKey => {
            const turnoItems = turnosMap[turnoKey];
            turnoItems.sort((a, b) => (a.produto || "").localeCompare(b.produto || "", undefined, { numeric: true }));

            return {
                nome: turnoKey,
                valores: turnoItems.map(i => ({ val: i.peso.toLocaleString('pt-BR') }))
            };
        });

        setOcrData({
            blocks: [{
                id: "edit_mode",
                data: date,
                turnos: turnosList
            }],
            allBoxes: []
        });

        setPastedImage("EDIT_MODE");
    };

    const confirmOCRUpload = async () => {
        if (!currentLab?.id) {
            addToast({ title: "Erro de Sessão", description: "Laboratório não identificado.", type: "error" });
            return;
        }

        if (!ocrData || ocrData.blocks.length === 0) return;

        const recordsToInsert: any[] = [];
        const blocksWithoutDate: number[] = [];

        ocrData.blocks.forEach((block, bIdx) => {
            if (!block.data) {
                blocksWithoutDate.push(bIdx + 1);
                return;
            }

            block.turnos.forEach(turno => {
                // TOTAL GERAL é apenas referência — não salvar para não duplicar
                if (turno.nome.includes("TOTAL") || turno.nome.includes("GERAL")) return;

                turno.valores.forEach((item, index) => {
                    const cleanStr = item.val.replace(/\./g, '').replace(',', '.');
                    const val = parseFloat(cleanStr);

                    if (!isNaN(val) && val > 0) {
                        const uniqueID = `${block.data}-${turno.nome.replace(" ", "")}-COL${index + 1}`;
                        recordsToInsert.push({
                            lab_id: currentLab.id,
                            identificador_unico: uniqueID,
                            data_producao: block.data,
                            turno: turno.nome,
                            produto: `Linha/Mq ${index + 1}`,
                            peso: val,
                            metadata: { source: 'ocr_multi_day' }
                        });
                    }
                });
            });
        });

        if (blocksWithoutDate.length > 0) {
            addToast({
                title: "Data Obrigatória",
                description: `Preencha a data do(s) Dia(s): ${blocksWithoutDate.join(', ')}. Use o campo de data no topo de cada bloco.`,
                type: "warning"
            });
            return;
        }

        if (recordsToInsert.length === 0) {
            addToast({ title: "Nenhum Dado", description: "Não há valores válidos para salvar. Verifique os turnos.", type: "warning" });
            return;
        }

        setIsLoading(true);
        try {
            console.log('=== SALVANDO OCR ===');
            console.log('Registros:', recordsToInsert.length);
            console.log('lab_id:', currentLab.id);
            console.log('Amostra:', JSON.stringify(recordsToInsert[0], null, 2));
            const { data, error } = await supabase
                .from('operacao_producao')
                .upsert(recordsToInsert, { onConflict: 'lab_id,identificador_unico' });

            console.log('Resposta Supabase:', { data, error });
            if (error) throw error;

            addToast({ title: "Sucesso!", description: `${recordsToInsert.length} registros salvos com sucesso.`, type: "success" });
            setOcrData(null);
            setPastedImage(null);
            loadStats();
        } catch (error) {
            console.error(error);
            addToast({ title: "Erro no Banco", description: "Não foi possível salvar os registros.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };
    const handleDeleteDate = async (date: string) => {
        if (!confirm(`Excluir tudo de ${date.split('-').reverse().join('/')}?`)) return;
        const { error } = await supabase.from('operacao_producao').delete().eq('lab_id', currentLab?.id).eq('data_producao', date);
        if (!error) {
            addToast({ title: "Dia Excluído", type: "success" });
            loadStats();
        }
    };

    const handleClearAllData = async () => {
        if (!confirm("LIMPAR TODO O HISTÓRICO?")) return;
        if (!currentLab?.id) return;

        try {
            await producaoService.deleteAll(currentLab.id);
            loadStats();
        } catch (error) {
            console.error("Error clearing data:", error);
            alert("Erro ao limpar dados.");
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !currentLab?.id) return;
        setIsUploading(true);
        try {
            let totalRecords = 0;
            await parseProducaoFileInChunks(file, currentLab.id, async (batch) => {
                if (batch.length > 0) {
                    await producaoService.uploadData(batch);
                    totalRecords += batch.length;
                }
            }, 2000);

            if (totalRecords === 0) {
                alert("Atenção: Nenhum dado válido foi detectado no arquivo. Verifique se o formato está correto.");
            } else {
                alert(`Sucesso! ${totalRecords} registros de produção processados/atualizados.`);
            }
            loadStats();
        } catch (error: any) {
            console.error("Erro no upload:", error);
            alert("Erro ao processar o arquivo: " + (error.message || "Verifique o formato do Excel."));
        } finally {
            setIsUploading(false);
            if (event.target) event.target.value = "";
        }
    };

    // LAB SELECTION LOGIC
    const [labs, setLabs] = useState<any[]>([]);
    const [globalChartData, setGlobalChartData] = useState<any[]>([]);

    useEffect(() => {
        const loadGlobalData = async () => {
            if (user?.acesso === 'admin_global' && !currentLab) {
                const labsData = await LabService.list();
                setLabs(labsData);

                // Fetch global production data
                const { data: productionData } = await supabase
                    .from('operacao_producao')
                    .select('lab_id, peso, data_producao');

                if (productionData) {
                    // Group by Date and Lab
                    const dateMap: Record<string, Record<string, number>> = {};

                    productionData.forEach((d: any) => {
                        const date = d.data_producao; // YYYY-MM-DD
                        if (!dateMap[date]) dateMap[date] = {};
                        dateMap[date][d.lab_id] = (dateMap[date][d.lab_id] || 0) + (d.peso || 0);
                    });

                    // Convert to Array for Recharts
                    const chartData = Object.keys(dateMap).map(date => {
                        const entry: any = { date };
                        labsData.forEach(lab => {
                            entry[lab.id] = dateMap[date][lab.id] || 0;
                        });
                        return entry;
                    }).sort((a, b) => a.date.localeCompare(b.date));

                    setGlobalChartData(chartData);
                }
            }
        };
        loadGlobalData();
    }, [user, currentLab]);

    if (user?.acesso === 'admin_global' && !currentLab) {
        return (
            <div className="min-h-full flex flex-col items-center justify-center p-8 space-y-12 animate-fade-in">
                <div className="text-center space-y-6 max-w-2xl">
                    <div className="inline-flex items-center justify-center p-4 bg-black rounded-2xl mb-6 shadow-2xl">
                        <FileSpreadsheet className="h-12 w-12 text-white" />
                    </div>
                    <h1 className="text-5xl lg:text-6xl font-serif text-black leading-tight">
                        Selecione o Laboratório
                    </h1>
                    <p className="text-xl text-neutral-600 font-light">
                        Escolha um laboratório para gerenciar a Operação Diária e visualizar estatísticas de produção.
                    </p>
                </div>

                <div className="w-full max-w-7xl space-y-12">
                    {/* Global Production Trend Chart */}
                    {globalChartData.length > 0 && (
                        <div className="animate-fade-in-up">
                            <GlobalProductionChart data={globalChartData} labs={labs} />
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                        {labs.map((lab) => (
                            <button
                                key={lab.id}
                                onClick={() => selectLab(lab.id)}
                                className="group relative flex flex-col p-8 bg-white border-2 border-neutral-200 hover:border-black rounded-2xl transition-all duration-300 text-left hover:shadow-xl hover:-translate-y-1"
                            >
                                <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ArrowRight className="h-6 w-6 text-black" />
                                </div>
                                <div className="h-12 w-12 bg-neutral-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-black group-hover:text-white transition-colors">
                                    <ShieldCheck className="h-6 w-6" />
                                </div>
                                <h3 className="text-2xl font-serif text-black mb-2">{lab.nome}</h3>
                                <p className="text-sm font-mono text-neutral-500 uppercase tracking-wider">
                                    {lab.cidade || 'N/A'} - {lab.estado || 'N/A'}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[95%] mx-auto space-y-8 animate-fade-in text-black pb-24 pt-8 min-h-screen">
            {isImageZoomed && pastedImage && (
                <div className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setIsImageZoomed(false)}>
                    <img src={pastedImage} className="max-w-full max-h-full object-contain" alt="Imagem Ampliada" />
                </div>
            )}

            {pastedImage && createPortal(
                <div className="fixed inset-0 z-[9999] bg-white flex flex-col animate-in fade-in duration-200">
                    <div className="h-16 border-b border-black flex justify-between items-center px-6 bg-neutral-50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className={cn("text-white p-2 rounded-md", pastedImage === "EDIT_MODE" ? "bg-orange-600" : "bg-black")}>
                                {pastedImage === "EDIT_MODE" ? <Edit2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-lg uppercase tracking-wider leading-none">
                                    {pastedImage === "EDIT_MODE" ? "Edição de Registro" : "Conferência Inteligente"}
                                </h3>
                                <p className="text-[10px] text-neutral-500 font-bold">
                                    {ocrData?.blocks.length || 0} DIAS IDENTIFICADOS NA IMAGEM
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Indicador de blocos sem data */}
                            {ocrData && ocrData.blocks.some(b => !b.data) && (
                                <span className="text-[10px] font-bold text-red-500 animate-pulse uppercase">⚠ Preencha a(s) data(s)</span>
                            )}
                            <Button
                                onClick={confirmOCRUpload}
                                disabled={!ocrData || ocrData.blocks.length === 0 || isLoading}
                                className={cn(
                                    "text-white font-bold uppercase tracking-widest gap-2 shadow-lg h-10 px-6 min-w-[180px] transition-all",
                                    ocrData && ocrData.blocks.some(b => !b.data)
                                        ? "bg-orange-500 hover:bg-orange-600"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {isLoading ? "Salvando..." : "Confirmar Tudo"}
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => { setPastedImage(null); setOcrData(null); }}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        {pastedImage !== "EDIT_MODE" && (
                            <div className="w-2/5 bg-neutral-800 p-8 overflow-auto flex items-center justify-center relative border-r border-neutral-300">
                                <div className="relative inline-block w-full">
                                    <img src={pastedImage!} alt="Original" className="w-full object-contain shadow-2xl rounded-sm block" id="ocr-image-preview" />

                                    {/* Overlay de Bounding Boxes */}
                                    {ocrData?.allBoxes && ocrData.allBoxes.map((box, idx) => {
                                        const boxStyle = {
                                            "--x0": `${(box.x0 / 2 / ((document.getElementById('ocr-image-preview') as HTMLImageElement)?.naturalWidth || 1)) * 100}%`,
                                            "--y0": `${(box.y0 / 2 / ((document.getElementById('ocr-image-preview') as HTMLImageElement)?.naturalHeight || 1)) * 100}%`,
                                            "--w": `${((box.x1 - box.x0) / 2 / ((document.getElementById('ocr-image-preview') as HTMLImageElement)?.naturalWidth || 1)) * 100}%`,
                                            "--h": `${((box.y1 - box.y0) / 2 / ((document.getElementById('ocr-image-preview') as HTMLImageElement)?.naturalHeight || 1)) * 100}%`,
                                            left: "var(--x0)",
                                            top: "var(--y0)",
                                            width: "var(--w)",
                                            height: "var(--h)"
                                        } as React.CSSProperties;

                                        {/* eslint-disable-next-line react-dom/no-unsafe-inline-style, tailwindcss/no-custom-classname, react/inline-styles */ }
                                        return (
                                            <div
                                                key={idx}
                                                className={cn(
                                                    "absolute border border-emerald-500/50 hover:border-emerald-500 hover:bg-emerald-500/20 transition-all cursor-pointer group rounded-sm",
                                                    box.confidence < 80 && "border-orange-500/50",
                                                    ocrData.blocks.some(b => b.turnos.some(t =>
                                                        (t.totalOriginal && Math.abs(t.valores.reduce((acc, v) => acc + (parseFloat(v.val) || 0), 0) - t.totalOriginal) > 2) &&
                                                        (t.valores.some(v => v.bbox?.text === box.text) || t.totalBbox?.text === box.text)
                                                    )) && "border-red-600 bg-red-600/10 z-30 ring-2 ring-red-600/50"
                                                )}
                                                // eslint-disable-next-line react-dom/no-unsafe-inline-style
                                                style={boxStyle}
                                                onClick={() => {
                                                    const inputId = `ocr-input-${idx}`;
                                                    const el = document.getElementById(inputId);
                                                    el?.focus();
                                                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }}
                                            >
                                                <div className="absolute bottom-full left-0 bg-black text-white text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                                                    {box.text} ({Math.round(box.confidence)}%)
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className={cn("bg-white flex flex-col transition-all overflow-y-auto relative", pastedImage === "EDIT_MODE" ? "w-full" : "w-3/5")}>
                            {isProcessingOCR ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-6 text-neutral-400 animate-pulse">
                                    <Loader2 className="h-16 w-16 animate-spin text-emerald-600" />
                                    <span className="text-lg font-bold uppercase tracking-widest text-emerald-800">Processando...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-1">
                                        {ocrData ? (
                                            <div className="p-8 space-y-12 pb-8">
                                                {ocrData.blocks.map((block, bIdx) => (
                                                    <div key={block.id} className="border border-neutral-200 rounded-xl p-6 bg-neutral-50 shadow-sm relative group hover:border-emerald-300 transition-all">
                                                        <div className="flex items-center gap-4 mb-6 border-b border-black/10 pb-4">
                                                            <div className="bg-black text-white px-3 py-1 text-xs font-bold rounded uppercase">DIA {bIdx + 1}</div>
                                                            <div className="flex-1">
                                                                <Input type="date" value={block.data} onChange={(e) => {
                                                                    const newBlocks = [...ocrData.blocks];
                                                                    newBlocks[bIdx].data = e.target.value;
                                                                    setOcrData({ ...ocrData, blocks: newBlocks });
                                                                }} className={cn(
                                                                    "font-mono font-bold text-xl h-10 w-48 bg-white",
                                                                    !block.data
                                                                        ? "border-red-400 ring-2 ring-red-300 animate-pulse focus:ring-red-500"
                                                                        : "border-emerald-200 focus:ring-emerald-500"
                                                                )} />
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-red-500" onClick={() => {
                                                                const newBlocks = ocrData.blocks.filter((_, i) => i !== bIdx);
                                                                setOcrData({ ...ocrData, blocks: newBlocks });
                                                            }}><Trash2 className="h-4 w-4" /></Button>
                                                        </div>
                                                        <div className="space-y-6">
                                                            {block.turnos.map((turno, tIdx) => {
                                                                const isTotalRow = turno.nome.includes("TOTAL") || turno.nome.includes("GERAL");
                                                                const totalTurno = turno.valores.reduce((a, b) => a + (parseFloat(b.val.replace(/\./g, "").replace(",", ".")) || 0), 0);
                                                                const hasDiscrepancy = !isTotalRow && turno.totalOriginal && Math.abs(totalTurno - turno.totalOriginal) > 2;

                                                                if (isTotalRow) {
                                                                    return (
                                                                        <div key={tIdx} className="bg-neutral-900 text-white p-4 rounded-lg border-2 border-neutral-700 relative overflow-hidden">
                                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-400" />
                                                                            <div className="flex justify-between items-center mb-3">
                                                                                <div className="flex items-center gap-2">
                                                                                    <Input value={turno.nome} onChange={(e) => {
                                                                                        const newBlocks = [...ocrData.blocks];
                                                                                        newBlocks[bIdx].turnos[tIdx].nome = e.target.value;
                                                                                        setOcrData({ ...ocrData, blocks: newBlocks });
                                                                                    }} className="font-black text-sm uppercase w-48 h-8 border-none p-0 focus-visible:ring-0 bg-transparent text-yellow-400" />
                                                                                </div>
                                                                                <span className="font-mono font-black text-xl text-yellow-400">
                                                                                    {totalTurno.toLocaleString('pt-BR')}
                                                                                </span>
                                                                            </div>
                                                                            <div className="grid grid-cols-6 gap-2">
                                                                                {turno.valores.map((item, vIdx) => (
                                                                                    <Input
                                                                                        key={vIdx}
                                                                                        title={`Valor ${vIdx + 1}`}
                                                                                        placeholder="0"
                                                                                        value={item.val}
                                                                                        onChange={(e) => {
                                                                                            const newBlocks = [...ocrData.blocks];
                                                                                            newBlocks[bIdx].turnos[tIdx].valores[vIdx].val = e.target.value;
                                                                                            setOcrData({ ...ocrData, blocks: newBlocks });
                                                                                        }}
                                                                                        className="text-center font-mono text-sm h-8 bg-neutral-800 border-neutral-700 text-neutral-100 hover:ring-2 hover:ring-yellow-500"
                                                                                    />
                                                                                ))}
                                                                                <button onClick={() => {
                                                                                    const newBlocks = [...ocrData.blocks];
                                                                                    newBlocks[bIdx].turnos[tIdx].valores.push({ val: "0" });
                                                                                    setOcrData({ ...ocrData, blocks: newBlocks });
                                                                                }} className="border border-dashed border-neutral-600 rounded text-neutral-500 hover:text-yellow-400">+</button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <div key={tIdx} className={cn(
                                                                        "bg-white p-4 rounded border transition-colors",
                                                                        hasDiscrepancy ? "border-red-400 bg-red-50/30" : "border-neutral-200"
                                                                    )}>
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <Input value={turno.nome} onChange={(e) => {
                                                                                    const newBlocks = [...ocrData.blocks];
                                                                                    newBlocks[bIdx].turnos[tIdx].nome = e.target.value;
                                                                                    setOcrData({ ...ocrData, blocks: newBlocks });
                                                                                }} className="font-bold text-sm uppercase w-48 h-8 border-none p-0 focus-visible:ring-0 bg-transparent" />
                                                                                {hasDiscrepancy && (
                                                                                    <span className="text-[9px] font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                                                                        Soma não bate: {turno.totalOriginal} na imagem
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span
                                                                                className={cn(
                                                                                    "font-mono font-bold",
                                                                                    hasDiscrepancy ? "text-red-600" : "text-emerald-600"
                                                                                )}
                                                                            >
                                                                                {totalTurno.toLocaleString('pt-BR')}
                                                                            </span>
                                                                        </div>
                                                                        <div className="grid grid-cols-6 gap-2">
                                                                            {turno.valores.map((item, vIdx) => (
                                                                                <Input
                                                                                    key={vIdx}
                                                                                    title={`Valor ${vIdx + 1}`}
                                                                                    placeholder="0"
                                                                                    id={`ocr-input-${ocrData.allBoxes.findIndex(b => b.text === item.bbox?.text && b.x0 === item.bbox?.x0)}`}
                                                                                    value={item.val}
                                                                                    onChange={(e) => {
                                                                                        const newBlocks = [...ocrData.blocks];
                                                                                        newBlocks[bIdx].turnos[tIdx].valores[vIdx].val = e.target.value;
                                                                                        setOcrData({ ...ocrData, blocks: newBlocks });
                                                                                    }}
                                                                                    className={cn(
                                                                                        "text-center font-mono text-sm h-8 transition-all hover:ring-2 hover:ring-emerald-500",
                                                                                        hasDiscrepancy && "border-red-200 focus:border-red-500 focus:ring-red-500"
                                                                                    )}
                                                                                />
                                                                            ))}
                                                                            <button onClick={() => {
                                                                                const newBlocks = [...ocrData.blocks];
                                                                                newBlocks[bIdx].turnos[tIdx].valores.push({ val: "0" });
                                                                                setOcrData({ ...ocrData, blocks: newBlocks });
                                                                            }} className="border border-dashed rounded text-neutral-400 hover:text-emerald-500">+</button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                            <Button variant="outline" size="sm" className="w-full border-dashed text-xs uppercase" onClick={() => {
                                                                const newBlocks = [...ocrData.blocks];
                                                                newBlocks[bIdx].turnos.push({ nome: "NOVO TURNO", valores: [{ val: "0" }, { val: "0" }, { val: "0" }] });
                                                                setOcrData({ ...ocrData, blocks: newBlocks });
                                                            }}>+ Turno</Button>
                                                        </div>
                                                    </div>
                                                ))}
                                                <Button variant="ghost" className="w-full py-8 border-2 border-dashed border-neutral-300 text-neutral-400 hover:bg-neutral-50 uppercase font-bold" onClick={() => {
                                                    setOcrData({ ...ocrData, blocks: [...ocrData.blocks, { id: Math.random().toString(), data: "", turnos: [] }] });
                                                }}>+ Bloco Manual</Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2 w-full max-w-md mx-auto mt-20">
                                                <div className="flex flex-col items-center justify-center p-8 text-neutral-400 border-2 border-dashed border-neutral-200 rounded-xl">
                                                    <Copy className="h-10 w-10 mb-4" />
                                                    <p>Cole uma imagem (CTRL+V)</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* DEBUG PANEL - ALWAYS VISIBLE */}
                                    {ocrDebugText && (
                                        <div className="p-4 bg-neutral-100 border-t border-neutral-200">
                                            <p className="text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-wider">Log de Leitura OCR (Debug)</p>
                                            <textarea
                                                title="Log de Leitura OCR"
                                                placeholder="Nenhum log disponível"
                                                className="w-full h-48 text-[10px] font-mono p-3 border border-neutral-300 bg-white text-neutral-700 rounded-lg shadow-inner resize-y focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                                value={ocrDebugText}
                                                readOnly
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )
            }

            {/* Header Page */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-black pb-8">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 border border-black flex items-center justify-center bg-black text-white">
                        <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 block mb-1">
                            Gestão Industrial {currentLab && <span className="bg-neutral-100 px-2 py-0.5 rounded text-black ml-2">{currentLab.nome}</span>}
                        </span>
                        <h1 className="text-4xl font-serif text-black leading-none">Operação Diária</h1>
                    </div>
                </div>

                {/* Trocar Lab Button */}
                {user?.acesso === 'admin_global' && currentLab && (
                    <Button
                        onClick={() => deselectLab()}
                        variant="ghost"
                        className="h-10 px-4 font-bold text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Trocar Laboratório
                    </Button>
                )}
            </div>

            <div className="space-y-8">                {/* Top Section */}
                {/* Top Section */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                    {/* Upload Card - Modernizado */}
                    <div className="md:col-span-2 relative group cursor-pointer overflow-hidden bg-white border border-neutral-200 hover:border-black transition-all duration-300">
                        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer" title="Upload" />
                        <div className="absolute inset-0 bg-neutral-50 group-hover:bg-neutral-100 transition-colors z-0" />
                        <div className="relative z-10 w-full h-full p-4 flex flex-col items-center justify-center gap-3 text-neutral-400 group-hover:text-black transition-colors">
                            <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform duration-300">
                                <Upload className="h-5 w-5" />
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] font-bold uppercase tracking-widest">{isUploading ? "Processando..." : "Upload Dados"}</p>
                                <p className="text-[8px] font-mono mt-1 opacity-60">XLSX • CSV</p>
                            </div>
                        </div>
                    </div>

                    {/* Cards de Turnos + Total */}
                    <div className="md:col-span-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Turno 1 */}
                        <div className="bg-white border border-neutral-200 p-6 flex flex-col justify-between relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">Turno 1</span>
                                <Sun className="h-4 w-4 text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="mt-auto">
                                <div className="text-3xl font-serif text-black">{turno1Total.toLocaleString('pt-BR')}</div>
                                <div className="text-[9px] text-neutral-400 font-mono mt-1">AMOSTRAS</div>
                            </div>
                        </div>

                        {/* Turno 2 */}
                        <div className="bg-white border border-neutral-200 p-6 flex flex-col justify-between relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">Turno 2</span>
                                <Sunset className="h-4 w-4 text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="mt-auto">
                                <div className="text-3xl font-serif text-black">{turno2Total.toLocaleString('pt-BR')}</div>
                                <div className="text-[9px] text-neutral-400 font-mono mt-1">AMOSTRAS</div>
                            </div>
                        </div>

                        {/* Turno 3 */}
                        <div className="bg-white border border-neutral-200 p-6 flex flex-col justify-between relative overflow-hidden group hover:shadow-lg transition-all duration-300">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">Turno 3</span>
                                <Moon className="h-4 w-4 text-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="mt-auto">
                                <div className="text-3xl font-serif text-black">{turno3Total.toLocaleString('pt-BR')}</div>
                                <div className="text-[9px] text-neutral-400 font-mono mt-1">AMOSTRAS</div>
                            </div>
                        </div>

                        {/* Total Geral */}
                        <div className="bg-black text-white p-6 flex flex-col justify-between relative group hover:shadow-xl transition-all duration-300">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">Total Geral</span>
                                <button onClick={handleClearAllData} className="text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Limpar"><Trash2 className="h-3 w-3" /></button>
                            </div>
                            <div className="mt-auto">
                                <div className="text-4xl font-serif text-white tracking-tight">{totalProduzido.toLocaleString('pt-BR')}</div>
                                <div className="text-[9px] text-neutral-500 font-mono mt-1 uppercase">Total de Amostras</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chart */}
                <div className="w-full">
                    <ProductionTrendChart data={chartData} />
                </div>

                {/* History Section - With Toggle */}
                <div className="space-y-4 pb-20">
                    <div className="flex items-center justify-between border-b border-black pb-4">
                        <h3 className="font-bold text-lg uppercase tracking-tight flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" /> Histórico de Produção
                        </h3>
                        {/* View Toggle */}
                        <div className="flex bg-neutral-100 p-1 rounded-lg border border-neutral-200">
                            <button
                                onClick={() => setHistoryView('table')}
                                className={cn("p-2 rounded text-neutral-500 hover:text-black transition-all", historyView === 'table' && "bg-white shadow text-black")}
                                title="Visualização em Tabela"
                            >
                                <List className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setHistoryView('cards')}
                                className={cn("p-2 rounded text-neutral-500 hover:text-black transition-all", historyView === 'cards' && "bg-white shadow text-black")}
                                title="Visualização em Cards"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {historyView === 'cards' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                            {(() => {
                                const dateGroups: Record<string, ProductionData[]> = {};
                                chartData.forEach(item => {
                                    if (!dateGroups[item.data_producao]) dateGroups[item.data_producao] = [];
                                    dateGroups[item.data_producao].push(item);
                                });
                                const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

                                return sortedDates.map(date => {
                                    const dayItems = dateGroups[date];
                                    const dayTotal = dayItems.reduce((acc, curr) => acc + (curr.peso || 0), 0);
                                    const turnosNoDia: Record<string, number> = {};
                                    dayItems.forEach(i => turnosNoDia[i.turno] = (turnosNoDia[i.turno] || 0) + i.peso);

                                    return (
                                        <div key={date} className="bg-white border border-neutral-200 p-6 rounded-xl hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-between">
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Data de Referência</h4>
                                                    <h3 className="font-serif text-3xl text-black leading-none">{date.split('-').reverse().join('/')}</h3>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-mono font-black">{dayTotal.toLocaleString('pt-BR')}</div>
                                                </div>
                                            </div>
                                            <div className="space-y-2 mb-8">
                                                {Object.entries(turnosNoDia).sort().map(([turno, total]) => (
                                                    <div key={turno} className="flex items-center justify-between text-xs border-b border-dashed border-neutral-200 pb-1">
                                                        <span className="font-bold text-neutral-600">{turno}</span>
                                                        <span className="font-mono font-medium text-neutral-800">{total.toLocaleString('pt-BR')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex gap-3 pt-4 border-t border-neutral-100">
                                                <Button onClick={() => handleEditDate(date)} className="flex-1 bg-neutral-900 text-white hover:bg-black h-10 text-xs font-bold uppercase tracking-widest"><Edit2 className="h-3 w-3 mr-2" /> Editar Dia</Button>
                                                <button onClick={() => handleDeleteDate(date)} className="w-10 h-10 flex items-center justify-center text-neutral-300 hover:text-red-500 hover:bg-red-50" title="Excluir este dia"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    ) : (
                        <div className="space-y-8 animate-fade-in">
                            {(() => {
                                const dateGroups: Record<string, ProductionData[]> = {};
                                chartData.forEach(item => {
                                    if (!dateGroups[item.data_producao]) dateGroups[item.data_producao] = [];
                                    dateGroups[item.data_producao].push(item);
                                });
                                const sortedDates = Object.keys(dateGroups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

                                if (sortedDates.length === 0) return (
                                    <div className="text-center py-12 text-neutral-400 border-2 border-dashed border-neutral-200 rounded-xl">Sem dados registrados.</div>
                                );

                                return sortedDates.map(date => {
                                    const dayItems = dateGroups[date];

                                    // Identificar Máquinas e Turnos dinamicamente
                                    const machines = Array.from(new Set(dayItems.map(i => i.produto || "Desconhecido")))
                                        .filter(m => dayItems.some(i => i.produto === m && i.peso > 0))
                                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                                    const shifts = Array.from(new Set(dayItems.map(i => i.turno))).sort();

                                    // Calcular Totais
                                    const getVal = (shift: string, machine: string) => {
                                        return dayItems.filter(d => d.turno === shift && d.produto === machine)
                                            .reduce((acc, curr) => acc + curr.peso, 0);
                                    };

                                    const getShiftTotal = (shift: string) => {
                                        return dayItems.filter(d => d.turno === shift).reduce((acc, curr) => acc + curr.peso, 0);
                                    };

                                    const getMachineTotal = (machine: string) => {
                                        return dayItems.filter(d => d.produto === machine).reduce((acc, curr) => acc + curr.peso, 0);
                                    };

                                    const grandTotal = dayItems.reduce((acc, curr) => acc + curr.peso, 0);

                                    return (
                                        <div key={date} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-neutral-50 px-6 py-4 border-b border-neutral-200 flex justify-between items-center group">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-5 w-5 text-neutral-400" />
                                                    <span className="font-bold text-lg font-mono text-black">{date.split('-').reverse().join('/')}</span>
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditDate(date)} className="text-xs font-bold uppercase hover:underline">Editar</button>
                                                    <span className="text-neutral-300">|</span>
                                                    <button onClick={() => handleDeleteDate(date)} className="text-xs font-bold uppercase hover:text-red-500">Excluir</button>
                                                </div>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-center border-collapse">
                                                    <thead>
                                                        <tr>
                                                            <th className="p-3 text-left font-bold text-neutral-400 text-[10px] uppercase tracking-wider border-b border-neutral-100">Turno</th>
                                                            {machines.map(m => (
                                                                <th key={m} className="p-3 font-bold text-black border-2 border-red-500 bg-red-50/10 min-w-[100px] text-xs uppercase">
                                                                    {m}
                                                                </th>
                                                            ))}
                                                            <th className="p-3 font-black text-black border-4 border-yellow-400 bg-yellow-50 min-w-[100px] text-xs uppercase">
                                                                Total Geral
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {shifts.map(shift => (
                                                            <tr key={shift} className="hover:bg-neutral-50 transition-colors">
                                                                <td className="p-3 text-left font-bold text-neutral-600 text-xs border-b border-neutral-100 border-r">{shift}</td>
                                                                {machines.map(m => {
                                                                    const val = getVal(shift, m);
                                                                    return (
                                                                        <td key={m} className="p-3 border-2 border-red-100 font-mono text-neutral-600">
                                                                            {val > 0 ? val.toLocaleString('pt-BR') : '-'}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td className="p-3 border-x-4 border-yellow-100 font-mono font-bold bg-yellow-50/20">
                                                                    {getShiftTotal(shift).toLocaleString('pt-BR')}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {/* Linha de Totais */}
                                                        <tr className="bg-neutral-50/50 font-bold">
                                                            <td className="p-3 text-left font-black text-black text-xs uppercase border-t border-neutral-200">Total</td>
                                                            {machines.map(m => (
                                                                <td key={m} className="p-3 border-2 border-red-500 font-mono font-black text-black bg-red-50/10 border-t-2">
                                                                    {getMachineTotal(m).toLocaleString('pt-BR')}
                                                                </td>
                                                            ))}
                                                            <td className="p-3 border-4 border-yellow-400 font-mono font-black text-xl text-black bg-yellow-100/50">
                                                                {grandTotal.toLocaleString('pt-BR')}
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}

import Tesseract from 'tesseract.js';

export interface HVIDataRow {
    numero: string;
    hvi: string;
    data_analise: string;
    hora_analise: string;
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    b: number;
    etiqueta?: string;
}

export interface ExtractionResult {
    mala: string;
    etiqueta: string;
    rows: HVIDataRow[];
    rawText: string;
}

export interface SingleSampleData {
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    b: number;
    mala: string;
    etiqueta: string;
    data_analise: string;
    hora_analise: string;
}

// Extrai número decimal do texto (suporte ao padrão brasileiro: vírgula como decimal)
const extractDecimal = (text: string): number => {
    if (!text) return 0;
    let cleaned = text.replace(/\s/g, '');

    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
    } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
    }

    const match = cleaned.match(/(\d+\.?\d*)/);
    if (match) {
        const value = parseFloat(match[1]);
        return isNaN(value) ? 0 : value;
    }
    return 0;
};

// Correção inteligente de valores baseada nas faixas típicas de HVI
const sanitizeValue = (val: number, type: 'mic' | 'len' | 'unf' | 'str' | 'rd' | 'b'): number => {
    if (val === 0) return 0;
    switch (type) {
        case 'mic':
            if (val >= 20 && val < 100) return val / 10;
            if (val >= 200 && val < 1000) return val / 100;
            break;
        case 'len':
            if (val >= 200 && val < 500) return val / 10;
            if (val >= 2000 && val < 5000) return val / 100;
            break;
        case 'unf':
            if (val >= 700 && val < 1000) return val / 10;
            if (val >= 7000 && val < 10000) return val / 100;
            break;
        case 'str':
            if (val >= 100 && val <= 600) return val / 10;
            if (val >= 1000 && val <= 6000) return val / 100;
            break;
        case 'rd':
            if (val >= 700 && val < 1000) return val / 10;
            if (val >= 7000 && val < 10000) return val / 100;
            break;
        case 'b':
            if (val >= 40 && val < 200) return val / 10;
            if (val >= 400 && val < 2000) return val / 100;
            break;
    }
    return val;
};

// Formata número para exibição em padrão brasileiro
export const formatDecimalBR = (value: number, decimals: number = 2): string => {
    return value.toFixed(decimals).replace('.', ',');
};

// Extrai data e hora do texto
const extractDateTime = (text: string): { data: string; hora: string } => {
    const match = text.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})/);
    if (match) return { data: match[1], hora: match[2] };

    const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
    return {
        data: dateMatch ? dateMatch[1] : new Date().toLocaleDateString('pt-BR'),
        hora: timeMatch ? timeMatch[1] : new Date().toLocaleTimeString('pt-BR'),
    };
};

// Extrai o número HVI dominante das linhas da tabela principal
const extractHVI = (text: string): string => {
    const labelMatch = text.match(/HVI\s*[:#]?\s*(\d+)/i) || text.match(/Inst\s*[:.]?\s*(\d+)/i);
    if (labelMatch) {
        const n = parseInt(labelMatch[1], 10);
        if (n >= 1 && n <= 7) return labelMatch[1];
    }
    const hviMatches = [...text.matchAll(/^\s*\d+\s+(\d+)\s+\d{2}\/\d{2}\/\d{4}/gm)];
    if (hviMatches.length > 0) {
        const hviCount: Record<string, number> = {};
        for (const m of hviMatches) {
            const h = m[1];
            hviCount[h] = (hviCount[h] || 0) + 1;
        }
        const mostFrequent = Object.entries(hviCount).sort((a, b) => b[1] - a[1])[0];
        if (mostFrequent) {
            const n = parseInt(mostFrequent[0], 10);
            if (n >= 1 && n <= 7) return mostFrequent[0];
        }
    }
    return '1';
};

// Constrói um HVIDataRow para a linha de Média
const buildMediaRow = (nums: string[], text: string): HVIDataRow => {
    const dateTime = extractDateTime(text);
    const hvi = extractHVI(text);
    return {
        numero: 'M',
        hvi,
        data_analise: dateTime.data,
        hora_analise: dateTime.hora,
        mic: sanitizeValue(extractDecimal(nums[0]), 'mic'),
        len: sanitizeValue(extractDecimal(nums[1]), 'len'),
        unf: sanitizeValue(extractDecimal(nums[2]), 'unf'),
        str: sanitizeValue(extractDecimal(nums[3]), 'str'),
        rd: sanitizeValue(extractDecimal(nums[4]), 'rd'),
        b: sanitizeValue(extractDecimal(nums[5]), 'b'),
    };
};

// Auxiliar para extrair números de uma linha limpando datas e horas para evitar ruídos
const getNumbersFromLine = (line: string): string[] => {
    let cleaned = line.replace(/\d{2}\/\d{2}\/\d{2,4}/g, ' ');
    cleaned = cleaned.replace(/\d{2}:\d{2}(?::\d{2})?/g, ' ');
    return cleaned.match(/\d+(?:[,.]\d+)?/g) || [];
};

// ============================================================
// PARSER PRINCIPAL ULTRA-ROBUSTO
// ============================================================
const parseHVIData = (text: string): ExtractionResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result: ExtractionResult = { mala: '', etiqueta: '', rows: [], rawText: text };

    // --- Extrai Mala ---
    const malaMatch =
        text.match(/Mala[:\s]*(\d{6,10})/i) ||
        text.match(/^(\d{8})/m) ||
        text.match(/(\d{8})\s+\d{15,}/);
    if (malaMatch) result.mala = malaMatch[1];

    // --- Extrai Etiqueta (SEMPRE 20 dígitos) ---
    const etiquetaMatch =
        text.match(/Etiqueta[:\s]*(\d{20})/i) ||
        text.match(/\d{8}\s+(\d{20})/) ||
        text.match(/(\d{20})/);
    if (etiquetaMatch) {
        result.etiqueta = etiquetaMatch[1];
    } else {
        // Fallback: OCR pode ter colocado espaços no meio da etiqueta
        const etiquetaSpacedMatch = text.match(/Etiqueta[:\s]*([\d\s]{20,35})/i);
        if (etiquetaSpacedMatch) {
            const cleaned = etiquetaSpacedMatch[1].replace(/\s+/g, '');
            if (cleaned.length >= 20) {
                result.etiqueta = cleaned.substring(0, 20);
            }
        }
    }

    const individualRows: { numList: string[]; text: string }[] = [];
    const possibleStatsRows: { numList: string[]; text: string; lineIndex: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasDate = /\d{2}\/\d{2}\/\d{2,4}/.test(line);
        const hasTime = /\d{2}:\d{2}/.test(line);
        
        const allNumbers = getNumbersFromLine(line);

        if ((hasDate || hasTime) && allNumbers.length >= 6) {
            const metrics = allNumbers.slice(-6);
            individualRows.push({ numList: metrics, text: line });
        } else if (allNumbers.length >= 6) {
            const metrics = allNumbers.slice(-6);
            possibleStatsRows.push({
                numList: metrics,
                text: line,
                lineIndex: i
            });
        }
    }

    console.log('[OCR] Linhas individuais encontradas:', individualRows.length);
    console.log('[OCR] Candidatos a Estatísticas encontrados:', possibleStatsRows.length);

    let bestMediaRowCandidate: string[] | null = null;
    let maxScore = -1;

    for (const candidate of possibleStatsRows) {
        let score = 0;

        if (/[Mm].{0,2}[dD][iI]?[aáà]/i.test(candidate.text)) {
            score += 100;
        }

        if (/[Mm][ií][nN]/i.test(candidate.text)) score -= 80;
        if (/[Mm][aáA][xX]/i.test(candidate.text)) score -= 80;
        if (/[dD]esv|[pP]adr|[sS]td/i.test(candidate.text)) score -= 80;

        const prevText = lines.slice(0, candidate.lineIndex).join('\n');
        const hasMinBefore = /[Mm][ií][nN]/i.test(prevText);
        const hasMaxBefore = /[Mm][aáA][xX]/i.test(prevText);
        if (hasMinBefore && hasMaxBefore) {
            score += 30;
        }

        if (individualRows.length > 0) {
            const calculatedAvgs = [0, 1, 2, 3, 4, 5].map(idx => {
                const vals = individualRows.map(r => extractDecimal(r.numList[idx])).filter(v => v > 0);
                return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
            });

            const candidateMic = extractDecimal(candidate.numList[0]);
            const candidateLen = extractDecimal(candidate.numList[1]);
            const sanitizedCalculatedMic = sanitizeValue(calculatedAvgs[0], 'mic');
            const sanitizedCalculatedLen = sanitizeValue(calculatedAvgs[1], 'len');

            const micDiff = Math.abs(sanitizeValue(candidateMic, 'mic') - sanitizedCalculatedMic);
            const lenDiff = Math.abs(sanitizeValue(candidateLen, 'len') - sanitizedCalculatedLen);

            if (micDiff < 0.15 && lenDiff < 0.8) {
                score += 50;
            }
        }

        const micVal = extractDecimal(candidate.numList[0]);
        const lenVal = extractDecimal(candidate.numList[1]);
        if (micVal < 1.0 && lenVal < 1.5) {
            score -= 60;
        }

        console.log(`[OCR] Candidato [${candidate.text}] Score:`, score);

        if (score > maxScore && score > 0) {
            maxScore = score;
            bestMediaRowCandidate = candidate.numList;
        }
    }

    if (bestMediaRowCandidate) {
        console.log('[OCR] Média selecionada por pontuação:', bestMediaRowCandidate);
        result.rows.push(buildMediaRow(bestMediaRowCandidate, text));
        return result;
    }

    if (possibleStatsRows.length >= 3) {
        console.log('[OCR] FALLBACK 1: Posição física na tabela');
        let descIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/desc/i.test(lines[i]) || /escr/i.test(lines[i])) {
                descIdx = i;
                break;
            }
        }
        if (descIdx !== -1) {
            const belowDesc = possibleStatsRows.filter(r => r.lineIndex > descIdx);
            if (belowDesc.length >= 3) {
                result.rows.push(buildMediaRow(belowDesc[2].numList, text));
                return result;
            }
        }
    }

    if (individualRows.length > 0) {
        console.warn('[OCR] FALLBACK 2: Cálculo matemático direto das amostras');
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
        const parsedIndividuals = individualRows.map(row => ({
            mic: sanitizeValue(extractDecimal(row.numList[0]), 'mic'),
            len: sanitizeValue(extractDecimal(row.numList[1]), 'len'),
            unf: sanitizeValue(extractDecimal(row.numList[2]), 'unf'),
            str: sanitizeValue(extractDecimal(row.numList[3]), 'str'),
            rd: sanitizeValue(extractDecimal(row.numList[4]), 'rd'),
            b: sanitizeValue(extractDecimal(row.numList[5]), 'b')
        }));

        const calculatedRow: HVIDataRow = {
            numero: 'M',
            hvi: extractHVI(text),
            data_analise: extractDateTime(text).data,
            hora_analise: extractDateTime(text).hora,
            mic: parseFloat(avg(parsedIndividuals.map(r => r.mic)).toFixed(2)),
            len: parseFloat(avg(parsedIndividuals.map(r => r.len)).toFixed(2)),
            unf: parseFloat(avg(parsedIndividuals.map(r => r.unf)).toFixed(1)),
            str: parseFloat(avg(parsedIndividuals.map(r => r.str)).toFixed(1)),
            rd: parseFloat(avg(parsedIndividuals.map(r => r.rd)).toFixed(1)),
            b: parseFloat(avg(parsedIndividuals.map(r => r.b)).toFixed(1))
        };

        result.rows.push(calculatedRow);
        return result;
    }

    const allDecimals = text.match(/\d+[,.]\d+/g) || text.match(/\d+/g) || [];
    if (allDecimals.length >= 6) {
        console.warn('[OCR] FALLBACK 3: Decimais/inteiros sequenciais brutos');
        result.rows.push(buildMediaRow(allDecimals.slice(0, 6), text));
    }

    return result;
};

// ============================================================
// SERVIÇO PÚBLICO
// ============================================================
export const OCRExtractionService = {
    async extractFromImage(file: File, onProgress?: (progress: number) => void): Promise<ExtractionResult> {
        try {
            const imageUrl = URL.createObjectURL(file);

            let ocrResult: Tesseract.RecognizeResult;
            try {
                ocrResult = await Tesseract.recognize(
                    imageUrl,
                    'por+eng',
                    {
                        logger: (m) => {
                            if (m.status === 'recognizing text' && onProgress) {
                                onProgress(Math.round(m.progress * 100));
                            }
                        }
                    }
                );
            } catch {
                console.warn('[OCR] Falha com por+eng, tentando apenas eng...');
                ocrResult = await Tesseract.recognize(
                    imageUrl,
                    'eng',
                    {
                        logger: (m) => {
                            if (m.status === 'recognizing text' && onProgress) {
                                onProgress(Math.round(m.progress * 100));
                            }
                        }
                    }
                );
            }

            URL.revokeObjectURL(imageUrl);

            const rawText = ocrResult.data.text;

            const normalizedText = rawText
                .replace(/\r\n/g, '\n')
                .replace(/[ \t]+/g, ' ')
                .replace(/[|\\]/g, ' ')
                .replace(/—|–/g, '-');

            console.log('[OCR] Raw text:', rawText);
            console.log('[OCR] Normalized text:', normalizedText);

            return parseHVIData(normalizedText);
        } catch (error) {
            console.error('[OCR] Erro:', error);
            throw error;
        }
    },

    // =========================================================================
    // MOTOR DE REANÁLISE INTELIGENTE DE IA POR PROCESSAMENTO DE VISÃO COMPUTACIONAL
    // =========================================================================
    async extractFromImageWithAI(
        file: File, 
        onStepChange?: (step: string) => void,
        onProgress?: (progress: number) => void
    ): Promise<ExtractionResult> {
        try {
            if (onStepChange) onStepChange("Carregando imagem original...");
            
            const imageBlob = await new Promise<Blob>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    if (onStepChange) onStepChange("Iniciando Super-Resolução 3x Bilinear...");
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Canvas context não disponível'));
                        return;
                    }

                    // Aumenta em 3x a resolução física da imagem para destacar pequenos textos de tabela
                    canvas.width = img.width * 3;
                    canvas.height = img.height * 3;
                    
                    // DESATIVAR SMOOTHING PARA PRESERVAR FONTES DE CAPTURA CRISP E NÍTIDAS (Pixel-Art upscaling)
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    if (onStepChange) onStepChange("Analisando brilho e histograma...");
                    
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;

                    // Encontra valores mínimos e máximos para o alongamento do contraste (Contrast Stretching)
                    let min = 255;
                    let max = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        if (gray < min) min = gray;
                        if (gray > max) max = gray;
                    }

                    const range = max - min || 1;

                    if (onStepChange) onStepChange("Aplicando Realce de Contraste e Aguçamento...");

                    // Aplica alongamento de contraste e limiarização suave (Soft Thresholding)
                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        
                        // Normaliza contraste para a escala cheia de 0-255
                        const stretched = ((gray - min) / range) * 255;
                        
                        // Torna escuros mais escuros e claros mais claros, preservando a legibilidade
                        let finalVal = stretched;
                        if (stretched < 140) {
                            finalVal = Math.max(0, stretched - 50); // realça letras pretas
                        } else {
                            finalVal = Math.min(255, stretched + 50); // branqueia fundo
                        }
                        
                        data[i] = finalVal;
                        data[i + 1] = finalVal;
                        data[i + 2] = finalVal;
                    }
                    ctx.putImageData(imageData, 0, 0);

                    if (onStepChange) onStepChange("Conversão e otimização para Redes Neurais...");
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Falha ao binarizar canvas'));
                    }, 'image/png');
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });

            if (onStepChange) onStepChange("Executando rede neural de OCR (Tesseract LSTM)...");
            
            const processedUrl = URL.createObjectURL(imageBlob);

            const ocrResult = await Tesseract.recognize(
                processedUrl,
                'por+eng',
                {
                    logger: (m) => {
                        if (m.status === 'recognizing text' && onProgress) {
                            onProgress(Math.round(m.progress * 100));
                        }
                    }
                }
            );

            URL.revokeObjectURL(processedUrl);

            if (onStepChange) onStepChange("Extraindo dados com heurística adaptativa de média...");

            const rawText = ocrResult.data.text;
            const normalizedText = rawText
                .replace(/\r\n/g, '\n')
                .replace(/[ \t]+/g, ' ')
                .replace(/[|\\]/g, ' ')
                .replace(/—|–/g, '-');

            console.log('[OCR IA] Raw text:', rawText);
            console.log('[OCR IA] Normalized text:', normalizedText);

            return parseHVIData(normalizedText);
        } catch (error) {
            console.error('[OCR IA] Erro no processamento com IA:', error);
            throw error;
        }
    },

    rowToSingleSample(row: HVIDataRow, mala: string, etiqueta: string): SingleSampleData {
        return {
            mic: row.mic,
            len: row.len,
            unf: row.unf,
            str: row.str,
            rd: row.rd,
            b: row.b,
            mala,
            etiqueta,
            data_analise: row.data_analise,
            hora_analise: row.hora_analise,
        };
    }
};

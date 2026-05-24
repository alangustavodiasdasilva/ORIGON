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

    // --- Extrai Etiqueta ---
    const etiquetaMatch =
        text.match(/Etiqueta[:\s]*(\d{12,25})/i) ||
        text.match(/\d{8}\s+(\d{15,25})/) ||
        text.match(/(\d{18,25})/);
    if (etiquetaMatch) result.etiqueta = etiquetaMatch[1];

    // 1. Identificar linhas da tabela principal (linhas individuais com Data e/ou Hora)
    // Elas contêm padrões como: "28/10/2025" ou "17:24:00"
    const individualRows: { numList: string[]; text: string }[] = [];
    const possibleStatsRows: { numList: string[]; text: string; label: string; lineIndex: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasDate = /\d{2}\/\d{2}\/\d{2,4}/.test(line);
        const hasTime = /\d{2}:\d{2}/.test(line);
        const numbers = line.match(/\d+[,.]\d+/g) || [];

        if ((hasDate || hasTime) && numbers.length >= 6) {
            // É uma linha de dados individual da tabela principal
            individualRows.push({ numList: numbers, text: line });
        } else if (numbers.length >= 6) {
            // Pode ser uma linha de estatísticas (Mínimo, Máximo, Média, Desvio)
            // Extrai o rótulo antes dos números para checagem posterior
            const firstNumIdx = line.indexOf(numbers[0]);
            const label = line.substring(0, firstNumIdx).trim();
            possibleStatsRows.push({
                numList: numbers,
                text: line,
                label: label,
                lineIndex: i
            });
        }
    }

    console.log('[OCR] Linhas individuais encontradas:', individualRows.length);
    console.log('[OCR] Candidatos a Estatísticas encontrados:', possibleStatsRows.length);

    // 2. Classificar e Selecionar a linha de Média das Estatísticas
    // Dentre os candidatos a estatísticas, a Média é classificada com base em regras de pontuação:
    let bestMediaRowCandidate: string[] | null = null;
    let maxScore = -1;

    for (const candidate of possibleStatsRows) {
        let score = 0;

        // Regra A: O rótulo contém termos semelhantes a "Média"
        // Captura: "Média", "Media", "M6dia", "Med", "Mèdia", "Medias"
        if (/[Mm].{0,2}[dD][iI]?[aáà]/i.test(candidate.label)) {
            score += 100;
        }

        // Regra B: Evitar palavras-chave de Mínimo, Máximo ou Desvio Padrão
        if (/[Mm][ií][nN]/i.test(candidate.label)) score -= 80;
        if (/[Mm][aáA][xX]/i.test(candidate.label)) score -= 80;
        if (/[dD]esv|[pP]adr|[sS]td/i.test(candidate.label)) score -= 80;

        // Regra C: Posição relativa se detectado "Mínimo" e "Máximo" anteriormente no texto
        const prevText = lines.slice(0, candidate.lineIndex).join('\n');
        const hasMinBefore = /[Mm][ií][nN]/i.test(prevText);
        const hasMaxBefore = /[Mm][aáA][xX]/i.test(prevText);
        if (hasMinBefore && hasMaxBefore) {
            score += 30;
        }

        // Regra D: Comparação Matemática (A Média tem que estar muito próxima da média aritmética dos dados individuais!)
        if (individualRows.length > 0) {
            const calculatedAvgs = [0, 1, 2, 3, 4, 5].map(idx => {
                const vals = individualRows.map(r => extractDecimal(r.numList[idx])).filter(v => v > 0);
                return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
            });

            // Mede a proximidade do Micronaire e do Comprimento (Len) da linha candidata
            const candidateMic = extractDecimal(candidate.numList[0]);
            const candidateLen = extractDecimal(candidate.numList[1]);
            const sanitizedCalculatedMic = sanitizeValue(calculatedAvgs[0], 'mic');
            const sanitizedCalculatedLen = sanitizeValue(calculatedAvgs[1], 'len');

            const micDiff = Math.abs(sanitizeValue(candidateMic, 'mic') - sanitizedCalculatedMic);
            const lenDiff = Math.abs(sanitizeValue(candidateLen, 'len') - sanitizedCalculatedLen);

            // Se a diferença for menor que 0.2 no Mic e menor que 1.0 no Len, é extremamente provável que seja a média real!
            if (micDiff < 0.15 && lenDiff < 0.8) {
                score += 50;
            }
        }

        // Regra E: Desvio Padrão costuma ter valores muito pequenos (< 1.5) no Micronaire e Comprimento.
        // Se a linha tem valores pequenos, reduz pontuação de Média
        const micVal = extractDecimal(candidate.numList[0]);
        const lenVal = extractDecimal(candidate.numList[1]);
        if (micVal < 1.0 && lenVal < 1.5) {
            score -= 60;
        }

        console.log(`[OCR] Score do Candidato [${candidate.label} | ${candidate.numList.join(' ')}]:`, score);

        if (score > maxScore && score > 0) {
            maxScore = score;
            bestMediaRowCandidate = candidate.numList;
        }
    }

    if (bestMediaRowCandidate) {
        console.log('[OCR] Linha de Média SELECIONADA com sucesso por inteligência de Score:', bestMediaRowCandidate);
        result.rows.push(buildMediaRow(bestMediaRowCandidate.slice(0, 6), text));
        return result;
    }

    // ================================================================
    // FALLBACK 1 — Se falhar a pontuação, usa estritamente a posição física
    // ================================================================
    // A tabela de estatísticas é sempre: Mínimo (idx 0), Máximo (idx 1), Média (idx 2)
    if (possibleStatsRows.length >= 3) {
        console.log('[OCR] Usando FALLBACK 1 (Posição Fixa 3ª linha de Estatísticas)');
        // Procura a linha que esteja abaixo da palavra "Descrição" ou similar
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
                result.rows.push(buildMediaRow(belowDesc[2].numList.slice(0, 6), text));
                return result;
            }
        }
    }

    // ================================================================
    // FALLBACK 2 — Cálculo Matemático a partir das amostras individuais
    // ================================================================
    if (individualRows.length > 0) {
        console.warn('[OCR] Usando FALLBACK 2 (Cálculo Matemático das amostras individuais)');
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

        console.log('[OCR] Média calculada matematicamente:', calculatedRow);
        result.rows.push(calculatedRow);
        return result;
    }

    // FALLBACK 3 - Qualquer linha com 6 decimais
    const allDecimals = text.match(/\d+[,.]\d+/g) || [];
    if (allDecimals.length >= 6) {
        console.warn('[OCR] Usando FALLBACK 3 (Primeiros 6 decimais encontrados)');
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

            // Normaliza o texto preservando a estrutura de linhas
            const normalizedText = rawText
                .replace(/\r\n/g, '\n')     // quebras de linha Windows
                .replace(/[ \t]+/g, ' ')     // colapsa espaços múltiplos
                .replace(/[|\\]/g, ' ')       // remove separadores de coluna OCR
                .replace(/—|–/g, '-');        // normaliza traços

            console.log('[OCR] Raw text:', rawText);
            console.log('[OCR] Normalized text:', normalizedText);

            const extractedData = parseHVIData(normalizedText);

            return extractedData;
        } catch (error) {
            console.error('[OCR] Erro:', error);
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

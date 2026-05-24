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

    // "1.234,56" → ponto é milhar, vírgula é decimal
    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
    }
    // "4,20" → vírgula é decimal
    else if (cleaned.includes(',')) {
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
            // MIC típico: 2.0 a 6.0
            if (val >= 20 && val < 100) return val / 10;
            if (val >= 200 && val < 1000) return val / 100;
            break;
        case 'len':
            // LEN típico: 20.0 a 40.0
            if (val >= 200 && val < 500) return val / 10;
            if (val >= 2000 && val < 5000) return val / 100;
            break;
        case 'unf':
            // UNF típico: 70.0 a 90.0
            if (val >= 700 && val < 1000) return val / 10;
            if (val >= 7000 && val < 10000) return val / 100;
            break;
        case 'str':
            // STR típico: 15.0 a 50.0
            if (val >= 100 && val <= 600) return val / 10;
            if (val >= 1000 && val <= 6000) return val / 100;
            break;
        case 'rd':
            // RD típico: 70.0 a 90.0
            if (val >= 700 && val < 1000) return val / 10;
            if (val >= 7000 && val < 10000) return val / 100;
            break;
        case 'b':
            // +b típico: 4.0 a 18.0
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
    if (match) {
        return { data: match[1], hora: match[2] };
    }
    const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
    return {
        data: dateMatch ? dateMatch[1] : new Date().toLocaleDateString('pt-BR'),
        hora: timeMatch ? timeMatch[1] : new Date().toLocaleTimeString('pt-BR')
    };
};

// Extrai o número HVI dominante das linhas da tabela principal
const extractHVI = (text: string): string => {
    // Tenta encontrar pelo cabeçalho "HVI: X"
    const labelMatch = text.match(/HVI\s*[:#]?\s*(\d+)/i) || text.match(/Inst\s*[:.]?\s*(\d+)/i);
    if (labelMatch) {
        const n = parseInt(labelMatch[1], 10);
        if (n >= 1 && n <= 7) return labelMatch[1];
    }

    // Tenta achar nas linhas da tabela: padrão "Nº_sequencial HVI data"
    // Ex: "1 6 28/10/2025 17:24:00 ..." → HVI = 6
    const tableRowMatch = text.match(/^\s*\d+\s+(\d+)\s+\d{2}\/\d{2}/m);
    if (tableRowMatch) {
        const n = parseInt(tableRowMatch[1], 10);
        if (n >= 1 && n <= 7) return tableRowMatch[1];
    }

    return '1';
};

// Constrói um HVIDataRow para a linha de Média com 6 valores capturados
const buildMediaRow = (
    nums: string[],
    text: string
): HVIDataRow => {
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
// PARSER PRINCIPAL
// ============================================================
const parseHVIData = (text: string): ExtractionResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result: ExtractionResult = {
        mala: '',
        etiqueta: '',
        rows: [],
        rawText: text
    };

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

    // ================================================================
    // PRIORIDADE 1 — Localizar a linha "3- Média" / "Média" / "Media"
    //
    // A tela CBRA tem uma tabela de estatísticas com 4 linhas:
    //   1- Mínimo | 2- Máximo | 3- Média | 4- Desvio Padrão
    //
    // O OCR pode ler "Média" como: Média, Media, M6dia, Médias, Méd, etc.
    // A estratégia usa 3 passes progressivamente mais flexíveis.
    // ================================================================

    // --- Passo 1A: regex direto na linha com variante de "Média" + 6 números ---
    for (const line of lines) {
        // Padrão: "3- Média  4,14  28,79  80,4  29,5  77,7  10,4"
        // O prefixo "3-" é opcional; aceita "Média", "Media", "M6dia", "Medias", etc.
        const m = line.match(
            /(?:\d[-.\s]*)?\s*[Mm][eé6][d][i]?[aáà][a-z]*[^0-9]{0,10}([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/i
        );
        if (m) {
            console.log('[OCR] Média encontrada (Passo 1A):', line);
            result.rows.push(buildMediaRow([m[1], m[2], m[3], m[4], m[5], m[6]], text));
            return result;
        }
    }

    // --- Passo 1B: qualquer linha contendo "media" ou "média" com >= 6 números ---
    for (const line of lines) {
        if (/m[eé6][d][i]?[aáà]/i.test(line)) {
            const nums = line.match(/([\d,.]+)/g);
            if (nums && nums.length >= 6) {
                console.log('[OCR] Média encontrada (Passo 1B):', line);
                result.rows.push(buildMediaRow(nums.slice(0, 6), text));
                return result;
            }
        }
    }

    // --- Passo 1C: por POSIÇÃO na tabela de estatísticas ---
    // Procura a sequência: Mínimo → Máximo → (próxima linha com 6 números = Média)
    {
        let foundMin = false;
        let foundMax = false;
        for (const line of lines) {
            const isMin = /m[ií]n[i]?m/i.test(line);
            const isMax = /m[aá]x[i]?m/i.test(line);
            const isDesvio = /desvio|padr[aã]o|std|desvpad/i.test(line);

            if (isMin && !foundMin) { foundMin = true; continue; }
            if (isMax && foundMin && !foundMax) { foundMax = true; continue; }
            if (isDesvio) break; // passou da Média sem encontrar

            if (foundMax) {
                const nums = line.match(/([\d,.]+)/g);
                if (nums && nums.length >= 6) {
                    console.log('[OCR] Média encontrada (Passo 1C - posição):', line);
                    result.rows.push(buildMediaRow(nums.slice(0, 6), text));
                    return result;
                }
            }
        }
    }

    // ================================================================
    // PRIORIDADE 2 — Fallback: linhas individuais da tabela HVI principal
    // (com data e hora explícitas na coluna Análise)
    // ================================================================
    if (result.rows.length === 0) {
        for (const line of lines) {
            const rowMatch = line.match(
                /^\s*(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)/
            );
            if (rowMatch) {
                const rawHvi = parseInt(rowMatch[2], 10);
                const validHvi = (!isNaN(rawHvi) && rawHvi >= 1 && rawHvi <= 7) ? rowMatch[2] : '1';
                result.rows.push({
                    numero: rowMatch[1],
                    hvi: validHvi,
                    data_analise: rowMatch[3],
                    hora_analise: rowMatch[4],
                    mic: sanitizeValue(extractDecimal(rowMatch[5]), 'mic'),
                    len: sanitizeValue(extractDecimal(rowMatch[6]), 'len'),
                    unf: sanitizeValue(extractDecimal(rowMatch[7]), 'unf'),
                    str: sanitizeValue(extractDecimal(rowMatch[8]), 'str'),
                    rd: sanitizeValue(extractDecimal(rowMatch[9]), 'rd'),
                    b: sanitizeValue(extractDecimal(rowMatch[10]), 'b'),
                });
            }
        }
    }

    // ================================================================
    // PRIORIDADE 3 — Fallback genérico: qualquer linha com >= 6 decimais
    // ================================================================
    if (result.rows.length === 0) {
        for (const line of lines) {
            const numbers = line.match(/([\d,.]+)/g);
            if (numbers && numbers.length >= 6) {
                const dateTime = extractDateTime(line);
                const numMatch = line.match(/^\s*(\d+)/);
                result.rows.push({
                    numero: numMatch ? numMatch[1] : '1',
                    hvi: '1',
                    data_analise: dateTime.data,
                    hora_analise: dateTime.hora,
                    mic: sanitizeValue(extractDecimal(numbers[0]), 'mic'),
                    len: sanitizeValue(extractDecimal(numbers[1]), 'len'),
                    unf: sanitizeValue(extractDecimal(numbers[2]), 'unf'),
                    str: sanitizeValue(extractDecimal(numbers[3]), 'str'),
                    rd: sanitizeValue(extractDecimal(numbers[4]), 'rd'),
                    b: sanitizeValue(extractDecimal(numbers[5]), 'b'),
                });
            }
        }
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

            const result = await Tesseract.recognize(
                imageUrl,
                'por+eng', // Português + Inglês para melhor leitura de "Média"
                {
                    logger: (m) => {
                        if (m.status === 'recognizing text' && onProgress) {
                            onProgress(Math.round(m.progress * 100));
                        }
                    }
                }
            );

            URL.revokeObjectURL(imageUrl);

            const rawText = result.data.text;

            // Normaliza o texto preservando a estrutura de linhas
            const normalizedText = rawText
                .replace(/\r\n/g, '\n')        // quebras de linha Windows
                .replace(/[ \t]+/g, ' ')        // colapsa espaços múltiplos
                .replace(/[|\\]/g, ' ')          // remove separadores de coluna
                .replace(/—|–/g, '-');           // normaliza traços

            console.log('[OCR] Raw text:', rawText);
            console.log('[OCR] Normalized text:', normalizedText);

            const extractedData = parseHVIData(normalizedText);

            // Fallback de último recurso: pega os primeiros 6 decimais encontrados
            if (extractedData.rows.length === 0) {
                console.warn('[OCR] Nenhuma linha encontrada. Aplicando fallback de último recurso.');
                const allNumbers = rawText.match(/\d+[,.]\d+/g) || [];
                if (allNumbers.length >= 6) {
                    extractedData.rows.push({
                        numero: '1',
                        hvi: '1',
                        data_analise: new Date().toLocaleDateString('pt-BR'),
                        hora_analise: new Date().toLocaleTimeString('pt-BR'),
                        mic: extractDecimal(allNumbers[0] ?? '0'),
                        len: extractDecimal(allNumbers[1] ?? '0'),
                        unf: extractDecimal(allNumbers[2] ?? '0'),
                        str: extractDecimal(allNumbers[3] ?? '0'),
                        rd: extractDecimal(allNumbers[4] ?? '0'),
                        b: extractDecimal(allNumbers[5] ?? '0'),
                    });
                }
            }

            return extractedData;
        } catch (error) {
            console.error('[OCR] Erro:', error);
            throw error;
        }
    },

    // Converte uma linha de dados para o formato SingleSampleData
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

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
    // Padrão da tabela principal: "Nº HVI Data ..." → pega o HVI mais frequente
    const hviMatches = [...text.matchAll(/^\s*\d+\s+(\d+)\s+\d{2}\/\d{2}\/\d{4}/gm)];
    if (hviMatches.length > 0) {
        const hviCount: Record<string, number> = {};
        for (const m of hviMatches) {
            const h = m[1];
            hviCount[h] = (hviCount[h] || 0) + 1;
        }
        // Retorna o HVI mais frequente
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
// PARSER PRINCIPAL
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

    // ================================================================
    // ESTRATÉGIA PRINCIPAL: Âncora no cabeçalho "Descrição"
    //
    // A tabela de estatísticas SEMPRE tem esta ordem:
    //   [Cabeçalho] Descrição | Mic | Len | Unf | Str | Rd | +b
    //   Linha 1: 1- Mínimo
    //   Linha 2: 2- Máximo
    //   Linha 3: N- Média   ← QUEREMOS ESTA
    //   Linha 4: 4- Desvio Padrão
    //
    // Usamos posição, não reconhecimento do texto "Média",
    // porque OCR frequentemente distorce caracteres acentuados.
    // ================================================================

    // Encontrar a linha do cabeçalho "Descrição" (OCR pode distorcer como
    // "Descricao", "Descri§ao", "Descri¢ao", "Descrigao", "Oescricao", etc.)
    let descricaoIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        // Padrão muito flexível: linha que contém "escri" (parte de "Descrição")
        // seguida de vogais/caracteres — evita falsos positivos na tabela principal
        if (/descri/i.test(lines[i])) {
            descricaoIdx = i;
            console.log('[OCR] Cabeçalho "Descrição" encontrado na linha', i, ':', lines[i]);
            break;
        }
    }

    if (descricaoIdx >= 0) {
        // Coletar linhas de dados da tabela de estatísticas.
        // Usamos /\d+[,.]\d+/g para capturar SOMENTE valores decimais (vírgula ou ponto).
        // Isso exclui automaticamente os rótulos como "1-", "2-", "3-", "4-".
        const statsRows: string[][] = [];

        for (let i = descricaoIdx + 1; i < lines.length; i++) {
            const decimalNums = lines[i].match(/\d+[,.]\d+/g);
            if (decimalNums && decimalNums.length >= 6) {
                statsRows.push(decimalNums);
                console.log(`[OCR] Linha stats[${statsRows.length - 1}]:`, lines[i], '→ nums:', decimalNums);
            }
            // Para quando encontra 4 linhas de dados (Mínimo, Máximo, Média, Desvio)
            if (statsRows.length >= 4) break;
        }

        // A 3ª linha (índice 2) é sempre a Média
        if (statsRows.length >= 3) {
            const mediaNums = statsRows[2];
            console.log('[OCR] MÉDIA extraída (posição 2):', mediaNums);
            result.rows.push(buildMediaRow(mediaNums.slice(0, 6), text));
            return result;
        }

        // Se não encontrou 3 linhas, mas tem pelo menos 1,
        // verifica se alguma linha é claramente a Média pelo conteúdo
        if (statsRows.length > 0 && statsRows.length < 3) {
            console.warn('[OCR] Tabela de estatísticas incompleta, tentando alternativas...');
        }
    }

    // ================================================================
    // FALLBACK 1: Busca pela palavra "Média" / "Media" e variantes
    // Cobre casos onde o OCR lê razoavelmente bem o texto
    // ================================================================
    for (const line of lines) {
        // Aceita: Média, Media, M6dia, Medias, M-dia, Madia, etc.
        // O padrão [Mm].{0,2}[dD] captura a maioria das distorções de "Mé"
        if (/[Mm].{0,2}[dD][iI]?[aáà]/i.test(line) && !/[Mm][aáA][xX]/i.test(line) && !/[Mm][ií][nN]/i.test(line)) {
            const decimalNums = line.match(/\d+[,.]\d+/g);
            if (decimalNums && decimalNums.length >= 6) {
                console.log('[OCR] MÉDIA encontrada por keyword (Fallback 1):', line);
                result.rows.push(buildMediaRow(decimalNums.slice(0, 6), text));
                return result;
            }
        }
    }

    // ================================================================
    // FALLBACK 2: Posição relativa — Mínimo → Máximo → próxima = Média
    // ================================================================
    {
        let foundMin = false;
        let foundMax = false;
        for (const line of lines) {
            const isMin = /[Mm][ií][nN]/i.test(line);
            const isMax = /[Mm][aáA][xX]/i.test(line);
            const isDesvio = /[dD]esv|[pP]adr|[sS]td/i.test(line);

            if (isMin && !foundMin) { foundMin = true; continue; }
            if (isMax && foundMin && !foundMax) { foundMax = true; continue; }
            if (isDesvio && foundMax) break;

            if (foundMax && !isDesvio) {
                const decimalNums = line.match(/\d+[,.]\d+/g);
                if (decimalNums && decimalNums.length >= 6) {
                    console.log('[OCR] MÉDIA encontrada por posição Min→Max→? (Fallback 2):', line);
                    result.rows.push(buildMediaRow(decimalNums.slice(0, 6), text));
                    return result;
                }
            }
        }
    }

    // ================================================================
    // FALLBACK 3: Linhas individuais da tabela HVI principal
    // (apenas se todas as estratégias acima falharem)
    // ================================================================
    if (result.rows.length === 0) {
        console.warn('[OCR] Usando Fallback 3: linhas individuais da tabela HVI');
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
        // Se encontrou múltiplas linhas individuais, tenta calcular a média delas
        if (result.rows.length > 1) {
            const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
            const dateTime = extractDateTime(text);
            const hvi = extractHVI(text);
            const avgRow: HVIDataRow = {
                numero: 'M',
                hvi,
                data_analise: dateTime.data,
                hora_analise: dateTime.hora,
                mic: parseFloat(avg(result.rows.map(r => r.mic)).toFixed(2)),
                len: parseFloat(avg(result.rows.map(r => r.len)).toFixed(2)),
                unf: parseFloat(avg(result.rows.map(r => r.unf)).toFixed(1)),
                str: parseFloat(avg(result.rows.map(r => r.str)).toFixed(1)),
                rd: parseFloat(avg(result.rows.map(r => r.rd)).toFixed(1)),
                b: parseFloat(avg(result.rows.map(r => r.b)).toFixed(1)),
            };
            result.rows = [avgRow];
            console.log('[OCR] Média calculada das linhas individuais:', avgRow);
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

            // Tenta primeiro com português (melhor para acentos),
            // se falhar usa inglês (mais confiável para números)
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

            // Último recurso: pega os primeiros 6 decimais encontrados no texto
            if (extractedData.rows.length === 0) {
                console.warn('[OCR] ÚLTIMO RECURSO: extraindo primeiros 6 decimais do texto bruto');
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

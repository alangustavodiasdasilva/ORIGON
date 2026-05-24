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

// Faixas de valores esperadas para cada métrica do HVI de algodão.
// Estas faixas são a chave para a extração robusta — em vez de depender de posição,
// identificamos os valores pelas suas características numéricas.
const HVI_RANGES = {
    mic: (v: number) => v >= 2.0  && v <= 7.5,   // Micronaire: 2.0 - 7.5
    len: (v: number) => v >= 18.0 && v <= 45.0,  // Comprimento (mm): 18 - 45
    unf: (v: number) => v >= 60.0 && v <= 100.0, // Uniformidade (%): 60 - 100
    str: (v: number) => v >= 10.0 && v <= 65.0,  // Resistência (g/tex): 10 - 65
    rd:  (v: number) => v >= 50.0 && v <= 100.0, // Reflectância (%): 50 - 100
    b:   (v: number) => v >= 0.1  && v <= 30.0,  // Amarelecimento (+b): 0.1 - 30
};

// Encontra a primeira sequência de 6 números consecutivos que corresponde
// às faixas esperadas das 6 métricas HVI (Mic, Len, Unf, Str, Rd, +b).
// Esta abordagem é imune a números extras na linha (índices, colunas adicionais, artefatos OCR).
const findHVIMetrics = (text: string): number[] | null => {
    const tokens = (text.match(/\d+(?:[,.]\d+)?/g) || []).map(n => extractDecimal(n));

    for (let i = 0; i <= tokens.length - 6; i++) {
        if (
            HVI_RANGES.mic(tokens[i]) &&
            HVI_RANGES.len(tokens[i + 1]) &&
            HVI_RANGES.unf(tokens[i + 2]) &&
            HVI_RANGES.str(tokens[i + 3]) &&
            HVI_RANGES.rd(tokens[i + 4]) &&
            HVI_RANGES.b(tokens[i + 5])
        ) {
            return tokens.slice(i, i + 6);
        }
    }
    return null;
};

// Função para extrair número decimal do texto (padrão brasileiro: vírgula = decimal)
const extractDecimal = (text: string): number => {
    if (!text) return 0;

    let cleaned = text.replace(/\s/g, '');

    // Se tem vírgula E ponto, o ponto é milhar e vírgula é decimal (ex: 1.234,56)
    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, '');
        cleaned = cleaned.replace(',', '.');
    }
    // Se só tem vírgula, ela é o separador decimal (ex: 4,20)
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

// Função para formatar número para exibição (padrão brasileiro)
export const formatDecimalBR = (value: number, decimals: number = 2): string => {
    return value.toFixed(decimals).replace('.', ',');
};

// Função para extrair a data e hora da coluna Análise
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

// Extrai o número do HVI do texto
const extractHviNumber = (text: string): string => {
    const labelMatch = text.match(/HVI\s*[:#]?\s*(\d+)/i) || text.match(/Inst\s*[:.]?\s*(\d+)/i);
    if (labelMatch) {
        const n = parseInt(labelMatch[1], 10);
        if (n >= 1 && n <= 7) return labelMatch[1];
    }
    const tableRowMatch = text.match(/^\s*\d+\s+(\d+)\s+\d{2}\/\d{2}/m);
    if (tableRowMatch) {
        const n = parseInt(tableRowMatch[1], 10);
        if (n >= 1 && n <= 7) return tableRowMatch[1];
    }
    return '1';
};

// Parser principal para extrair dados do texto OCR
const parseHVIData = (text: string): ExtractionResult => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result: ExtractionResult = {
        mala: '',
        etiqueta: '',
        rows: [],
        rawText: text
    };

    // Extrai Mala
    const malaMatch = text.match(/Mala[:\s]*(\d{6,10})/i) ||
        text.match(/^(\d{8})/m) ||
        text.match(/(\d{8})\s+\d{15,}/);
    if (malaMatch) result.mala = malaMatch[1];

    // Extrai Etiqueta
    const etiquetaMatch = text.match(/Etiqueta[:\s]*(\d{12,25})/i) ||
        text.match(/\d{8}\s+(\d{15,25})/) ||
        text.match(/(\d{18,25})/);
    if (etiquetaMatch) result.etiqueta = etiquetaMatch[1];

    // ─── PRIORIDADE 1: LINHA DE MÉDIA ─────────────────────────────────────────
    // Encontra qualquer linha com variação de "Média/Media/Med" e usa extração
    // por faixas de valores — completamente imune a colunas extras ou índices.
    for (const line of lines) {
        if (/m[eé]d/i.test(line)) {
            const metrics = findHVIMetrics(line);
            if (metrics) {
                const dateTime = extractDateTime(text);
                const validHvi = extractHviNumber(text);

                result.rows.push({
                    numero: 'M',
                    hvi: validHvi,
                    data_analise: dateTime.data,
                    hora_analise: dateTime.hora,
                    mic: metrics[0],
                    len: metrics[1],
                    unf: metrics[2],
                    str: metrics[3],
                    rd:  metrics[4],
                    b:   metrics[5]
                });
                break;
            }
        }
    }

    // ─── PRIORIDADE 2: LINHAS INDIVIDUAIS COM DATA ────────────────────────────
    // Se não encontrou Média, extrai linhas individuais usando o padrão de data
    // como âncora para isolar a porção de métricas da linha.
    if (result.rows.length === 0) {
        for (const line of lines) {
            const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{2,4})/);
            if (!dateMatch) continue;

            const timeMatch = line.match(/(\d{2}:\d{2}(?::\d{2})?)/);
            const dateStr = dateMatch[1];
            const timeStr = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString('pt-BR');

            // Extrai apenas a parte da linha após a data+hora para isolar as métricas
            const dateIndex = line.indexOf(dateStr);
            const timeLen = timeMatch ? timeMatch[1].length + 1 : 0; // +1 para o espaço
            const afterDateAndTime = line.substring(dateIndex + dateStr.length + timeLen);

            const metrics = findHVIMetrics(afterDateAndTime);
            if (metrics) {
                const beforeDate = line.substring(0, dateIndex);
                const numbersBefore = beforeDate.match(/\d+/g) || [];
                const numero = numbersBefore[0] || '1';
                const hvi = numbersBefore[1] || '1';
                const rawHvi = parseInt(hvi, 10);
                const validHvi = (!isNaN(rawHvi) && rawHvi >= 1 && rawHvi <= 7) ? hvi : '1';

                result.rows.push({
                    numero,
                    hvi: validHvi,
                    data_analise: dateStr,
                    hora_analise: timeStr,
                    mic: metrics[0],
                    len: metrics[1],
                    unf: metrics[2],
                    str: metrics[3],
                    rd:  metrics[4],
                    b:   metrics[5]
                });
            }
        }
    }

    // ─── PRIORIDADE 3: VARREDURA GLOBAL ───────────────────────────────────────
    // Última opção: varre o texto completo procurando qualquer sequência válida de métricas HVI.
    if (result.rows.length === 0) {
        const metrics = findHVIMetrics(text);
        if (metrics) {
            const dateTime = extractDateTime(text);
            result.rows.push({
                numero: '1',
                hvi: '1',
                data_analise: dateTime.data,
                hora_analise: dateTime.hora,
                mic: metrics[0],
                len: metrics[1],
                unf: metrics[2],
                str: metrics[3],
                rd:  metrics[4],
                b:   metrics[5]
            });
        }
    }

    return result;
};

export const OCRExtractionService = {
    async extractFromImage(file: File, onProgress?: (progress: number) => void): Promise<ExtractionResult> {
        try {
            const imageUrl = URL.createObjectURL(file);

            const result = await Tesseract.recognize(
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

            URL.revokeObjectURL(imageUrl);

            // Normaliza o texto para remover artefatos OCR de linhas de grade,
            // MAS mantém '/' para preservar os padrões de data (DD/MM/YYYY).
            const rawText = result.data.text;
            const normalizedText = rawText
                .replace(/\r\n/g, '\n')          // normaliza quebras de linha Windows
                .replace(/[|\\]/g, ' ')            // remove APENAS pipes e barras invertidas (grade)
                .replace(/—|–/g, '-')              // normaliza traços especiais
                .replace(/\s+[lI]\s+/g, ' ')       // remove letras órfãs de grade (l / I) entre espaços
                .replace(/[ \t]+/g, ' ');          // colapsa múltiplos espaços

            console.log('[OCR] Raw text:', rawText);
            console.log('[OCR] Normalized text:', normalizedText);

            const extractedData = parseHVIData(normalizedText);

            // Fallback de emergência: se não encontrou nada, tenta no texto bruto original
            if (extractedData.rows.length === 0) {
                console.warn('[OCR] Nenhuma métrica encontrada no texto normalizado. Tentando texto bruto...');
                const metricsFromRaw = findHVIMetrics(rawText);
                if (metricsFromRaw) {
                    const dateTime = extractDateTime(rawText);
                    extractedData.rows.push({
                        numero: '1',
                        hvi: '1',
                        data_analise: dateTime.data,
                        hora_analise: dateTime.hora,
                        mic: metricsFromRaw[0],
                        len: metricsFromRaw[1],
                        unf: metricsFromRaw[2],
                        str: metricsFromRaw[3],
                        rd:  metricsFromRaw[4],
                        b:   metricsFromRaw[5]
                    });
                }
            }

            return extractedData;
        } catch (error) {
            console.error('OCR Error:', error);
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
            mala: mala,
            etiqueta: etiqueta,
            data_analise: row.data_analise,
            hora_analise: row.hora_analise
        };
    }
};

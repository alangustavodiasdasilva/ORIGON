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

// Função para extrair número decimal do texto (padrão brasileiro: vírgula = decimal)
// Função para extrair número decimal do texto (padrão brasileiro: vírgula = decimal)
const extractDecimal = (text: string): number => {
    if (!text) return 0;

    // Remove espaços
    let cleaned = text.replace(/\s/g, '');

    // Se tem vírgula E ponto, o ponto é milhar e vírgula é decimal (ex: 1.234,56)
    if (cleaned.includes('.') && cleaned.includes(',')) {
        cleaned = cleaned.replace(/\./g, ''); // Remove pontos de milhar
        cleaned = cleaned.replace(',', '.'); // Vírgula vira ponto decimal
    }
    // Se só tem vírgula, ela é o separador decimal (ex: 4,20)
    else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
    }
    // Se só tem ponto, mantém como está (ex: 4.20)

    const match = cleaned.match(/(\d+\.?\d*)/);
    if (match) {
        const value = parseFloat(match[1]);
        return isNaN(value) ? 0 : value;
    }
    return 0;
};

// Funções de correção inteligente baseadas em faixas típicas de HVI
const sanitizeValue = (val: number, type: 'mic' | 'len' | 'unf' | 'str' | 'rd' | 'b'): number => {
    if (val === 0) return 0;

    // Remove casas decimais extras se for um número inteiro muito grande que parece ser erro de ponto
    // Ex: 301.0 -> 301 -> tratado abaixo

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
            // STR típico: 15.0 a 50.0 (Resistência)
            // Range aceitável expandido: 10.0 a 60.0
            if (val >= 100 && val <= 600) return val / 10; // ex: 301 -> 30.1
            if (val >= 1000 && val <= 6000) return val / 100; // ex: 3010 -> 30.1
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

// Função para formatar número para exibição (padrão brasileiro)
export const formatDecimalBR = (value: number, decimals: number = 2): string => {
    return value.toFixed(decimals).replace('.', ',');
};

// Função para extrair a data e hora da coluna Análise
const extractDateTime = (text: string): { data: string; hora: string } => {
    // Procura por padrão de data DD/MM/YYYY HH:MM:SS
    const match = text.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})/);
    if (match) {
        return { data: match[1], hora: match[2] };
    }
    // Tenta padrão alternativo
    const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
    return {
        data: dateMatch ? dateMatch[1] : new Date().toLocaleDateString('pt-BR'),
        hora: timeMatch ? timeMatch[1] : new Date().toLocaleTimeString('pt-BR')
    };
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

    // Extrai Mala - procura por padrão próximo a "Mala" ou número de 8 dígitos no início
    const malaMatch = text.match(/Mala[:\s]*(\d{6,10})/i) ||
        text.match(/^(\d{8})/m) ||
        text.match(/(\d{8})\s+\d{15,}/);
    if (malaMatch) {
        result.mala = malaMatch[1];
    }

    // Extrai Etiqueta - número longo de 15+ dígitos
    const etiquetaMatch = text.match(/Etiqueta[:\s]*(\d{12,25})/i) ||
        text.match(/\d{8}\s+(\d{15,25})/) ||
        text.match(/(\d{18,25})/);
    if (etiquetaMatch) {
        result.etiqueta = etiquetaMatch[1];
    }

    // PRIORIDADE 1: Procura pela linha "Média" ou "Media" na tabela de descrição
    // Esta é a linha que o usuário quer extrair (destacada em vermelho)
    for (const line of lines) {
        // Procura por linha que contém "Média" ou "2- Média" seguida de valores numéricos
        const mediaMatch = line.match(
            /[2-]?\s*M[eé]dia[:\s]*([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/i
        );

        if (mediaMatch) {
            const dateTime = extractDateTime(text); // Pega data/hora do texto geral

            // Tenta encontrar o número da máquina HVI:
            // 1. Procura explicitamente por HVI: X ou Inst: X
            // 2. Procura nas linhas da tabela (padrão: Num HVI Data ...)
            let hviNumber = '1';

            const labelMatch = text.match(/HVI\s*[:#]?\s*(\d+)/i) || text.match(/Inst\s*[:\.]?\s*(\d+)/i);
            if (labelMatch) {
                hviNumber = labelMatch[1];
            } else {
                // Tenta achar na tabela. Padrão comum: Número Sequencial | HVI | Data
                // Ex: "1 2 25/01/2024..." -> HVI é 2
                const tableRowMatch = text.match(/^\s*\d+\s+(\d+)\s+\d{2}\/\d{2}/m) ||
                    text.match(/^\s*\d+\s+(\d+)\s+\d{2}:\d{2}/m);
                if (tableRowMatch) {
                    hviNumber = tableRowMatch[1];
                }
            }

            result.rows.push({
                numero: 'M', // M de Média
                hvi: hviNumber,
                data_analise: dateTime.data,
                hora_analise: dateTime.hora,
                mic: sanitizeValue(extractDecimal(mediaMatch[1]), 'mic'),
                len: sanitizeValue(extractDecimal(mediaMatch[2]), 'len'),
                unf: sanitizeValue(extractDecimal(mediaMatch[3]), 'unf'),
                str: sanitizeValue(extractDecimal(mediaMatch[4]), 'str'),
                rd: sanitizeValue(extractDecimal(mediaMatch[5]), 'rd'),
                b: sanitizeValue(extractDecimal(mediaMatch[6]), 'b')
            });
            break; // Encontrou a média, para de procurar
        }
    }

    // PRIORIDADE 2: Se não encontrou Média, tenta extrair linhas individuais da tabela HVI
    if (result.rows.length === 0) {
        for (const line of lines) {
            // Procura por linha que começa com número e contém padrão de data
            const rowMatch = line.match(
                /^\s*(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/
            );

            if (rowMatch) {
                result.rows.push({
                    numero: rowMatch[1],
                    hvi: rowMatch[2],
                    data_analise: rowMatch[3],
                    hora_analise: rowMatch[4],
                    mic: sanitizeValue(extractDecimal(rowMatch[5]), 'mic'),
                    len: sanitizeValue(extractDecimal(rowMatch[6]), 'len'),
                    unf: sanitizeValue(extractDecimal(rowMatch[7]), 'unf'),
                    str: sanitizeValue(extractDecimal(rowMatch[8]), 'str'),
                    rd: sanitizeValue(extractDecimal(rowMatch[9]), 'rd'),
                    b: sanitizeValue(extractDecimal(rowMatch[10]), 'b')
                });
            }
        }
    }

    // PRIORIDADE 3: Se ainda não encontrou, tenta padrão mais flexível
    if (result.rows.length === 0) {
        const numberPattern = /(\d+[,\.]\d+)/g;

        for (const line of lines) {
            const numbers = line.match(numberPattern);
            // Uma linha de dados típica tem 6 valores numéricos (Mic, Len, Unf, Str, Rd, +b)
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
                    b: sanitizeValue(extractDecimal(numbers[5]), 'b')
                });
            }
        }
    }

    return result;
};

export const OCRExtractionService = {
    async extractFromImage(file: File, onProgress?: (progress: number) => void): Promise<ExtractionResult> {
        return new Promise(async (resolve, reject) => {
            try {
                const imageUrl = URL.createObjectURL(file);

                const result = await Tesseract.recognize(
                    imageUrl,
                    'por', // Português
                    {
                        logger: (m) => {
                            if (m.status === 'recognizing text' && onProgress) {
                                onProgress(Math.round(m.progress * 100));
                            }
                        }
                    }
                );

                URL.revokeObjectURL(imageUrl);

                const extractedData = parseHVIData(result.data.text);

                // Se não conseguiu extrair dados, retorna erro
                if (extractedData.rows.length === 0 && !extractedData.mala && !extractedData.etiqueta) {
                    // Tenta extrair com um parsing mais agressivo
                    console.log('OCR Raw Text:', result.data.text);

                    // Fallback: extrai valores numéricos encontrados
                    const allNumbers = result.data.text.match(/\d+[,\.]\d+/g) || [];
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
                            b: extractDecimal(allNumbers[5] ?? '0')
                        });
                    }
                }

                resolve(extractedData);
            } catch (error) {
                console.error('OCR Error:', error);
                reject(error);
            }
        });
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
            mala: mala,
            etiqueta: etiqueta,
            data_analise: row.data_analise,
            hora_analise: row.hora_analise
        };
    }
};

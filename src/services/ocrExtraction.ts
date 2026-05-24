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

    // --- PRIORIDADE 1: LINHA DE MÉDIA COM EXTRAÇÃO ROBUSTA ---
    // A linha de "Média" é a que o usuário quer salvar. Em vez de regex posicional rígida,
    // buscamos por qualquer linha que contenha variações de "Média/Media/Med" (caso insensível).
    for (const line of lines) {
        if (/m[eé]d/i.test(line)) {
            // Encontra todos os números decimais e inteiros presentes na linha
            const numbers = line.match(/\d+(?:[,.]\d+)?/g) || [];
            
            // Uma linha válida de HVI deve conter pelo menos as 6 métricas de fibra (Mic, Len, Unf, Str, Rd, +b)
            if (numbers.length >= 6) {
                // Pegamos os últimos 6 números da linha, descartando o índice inicial (como o "3-" em "3- Média")
                const metrics = numbers.slice(-6);
                const dateTime = extractDateTime(text);

                // Tenta encontrar o número do HVI
                let hviNumber = '1';
                const labelMatch = text.match(/HVI\s*[:#]?\s*(\d+)/i) || text.match(/Inst\s*[:.]?\s*(\d+)/i);
                if (labelMatch) {
                    hviNumber = labelMatch[1];
                } else {
                    const tableRowMatch = text.match(/^\s*\d+\s+(\d+)\s+\d{2}\/\d{2}/m) ||
                        text.match(/^\s*\d+\s+(\d+)\s+\d{2}:\d{2}/m);
                    if (tableRowMatch) {
                        hviNumber = tableRowMatch[1];
                    }
                }

                const hviNum = parseInt(hviNumber, 10);
                const validHvi = (!isNaN(hviNum) && hviNum >= 1 && hviNum <= 7) ? hviNumber : '1';

                result.rows.push({
                    numero: 'M', // M de Média
                    hvi: validHvi,
                    data_analise: dateTime.data,
                    hora_analise: dateTime.hora,
                    mic: sanitizeValue(extractDecimal(metrics[0]), 'mic'),
                    len: sanitizeValue(extractDecimal(metrics[1]), 'len'),
                    unf: sanitizeValue(extractDecimal(metrics[2]), 'unf'),
                    str: sanitizeValue(extractDecimal(metrics[3]), 'str'),
                    rd: sanitizeValue(extractDecimal(metrics[4]), 'rd'),
                    b: sanitizeValue(extractDecimal(metrics[5]), 'b')
                });
                break; // Encontrou e processou a média com sucesso
            }
        }
    }

    // --- PRIORIDADE 2: LINHAS INDIVIDUAIS COM EXTRAÇÃO ROBUSTA ---
    // Caso a linha de Média não tenha sido encontrada (ou OCR falhou em lê-la), tentamos extrair as linhas individuais
    if (result.rows.length === 0) {
        for (const line of lines) {
            const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{2,4})/);
            if (dateMatch) {
                const timeMatch = line.match(/(\d{2}:\d{2}(?::\d{2})?)/);
                const dateStr = dateMatch[1];
                const timeStr = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString('pt-BR');
                
                // Dividimos a linha a partir da posição da data para obter apenas as métricas na direita
                const dateIndex = line.indexOf(dateStr);
                const afterDateAndTime = line.substring(dateIndex + dateStr.length + (timeMatch ? timeMatch[1].length : 0));
                
                const numbersAfter = afterDateAndTime.match(/\d+(?:[,.]\d+)?/g) || [];
                
                if (numbersAfter.length >= 6) {
                    const metrics = numbersAfter.slice(0, 6);
                    
                    // Extraímos o número da amostra e o HVI da parte esquerda anterior à data
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
                        mic: sanitizeValue(extractDecimal(metrics[0]), 'mic'),
                        len: sanitizeValue(extractDecimal(metrics[1]), 'len'),
                        unf: sanitizeValue(extractDecimal(metrics[2]), 'unf'),
                        str: sanitizeValue(extractDecimal(metrics[3]), 'str'),
                        rd: sanitizeValue(extractDecimal(metrics[4]), 'rd'),
                        b: sanitizeValue(extractDecimal(metrics[5]), 'b')
                    });
                }
            }
        }
    }

    // --- PRIORIDADE 3: PARSING GENÉRICO DE METRICAS ---
    if (result.rows.length === 0) {
        for (const line of lines) {
            const numbers = line.match(/\d+(?:[,.]\d+)?/g) || [];
            if (numbers.length >= 6) {
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
        try {
            const imageUrl = URL.createObjectURL(file);

            const result = await Tesseract.recognize(
                imageUrl,
                'eng', // 'eng' é muito mais preciso para tabelas numéricas com vírgula
                {
                    logger: (m) => {
                        if (m.status === 'recognizing text' && onProgress) {
                            onProgress(Math.round(m.progress * 100));
                        }
                    }
                }
            );

            URL.revokeObjectURL(imageUrl);

            // Normaliza o texto antes do parsing para ser imune a ruídos de linhas de grade:
            const rawText = result.data.text;
            const normalizedText = rawText
                .replace(/\r\n/g, '\n')              // normaliza quebras de linha Windows
                .replace(/[|\\/\[\]\(\)!_]/g, ' ')   // remove barras, pipes, colchetes, etc. (lidos como separadores de colunas)
                .replace(/—|–/g, '-')                 // normaliza traços especiais
                .replace(/\s+[lI]\s+/gi, ' ')        // limpa ruídos de letras órfãs que representam linhas de grade
                .replace(/[ \t]+/g, ' ');            // colapsa múltiplos espaços/tabs em um só

            console.log('[OCR] Raw text:', rawText);
            console.log('[OCR] Normalized text:', normalizedText);

            const extractedData = parseHVIData(normalizedText);

            // Se não conseguiu extrair dados, retorna erro
            if (extractedData.rows.length === 0 && !extractedData.mala && !extractedData.etiqueta) {
                // Tenta extrair com um parsing mais agressivo
                console.log('OCR Raw Text:', result.data.text);

                // Fallback: extrai valores numéricos encontrados
                const allNumbers = result.data.text.match(/\d+[,.]\d+/g) || [];
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

            return extractedData;
        } catch (error) {
            console.error('OCR Error:', error);
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
            mala: mala,
            etiqueta: etiqueta,
            data_analise: row.data_analise,
            hora_analise: row.hora_analise
        };
    }
};

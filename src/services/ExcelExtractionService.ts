import * as xlsx from 'xlsx';
import { type ExtractionResult, type HVIDataRow } from './ocrExtraction';

const autoCorrectDecimal = (value: number | string, field: string): number => {
    let numStr = String(value).replace(',', '.');
    if (!numStr || numStr.includes('.')) {
        return parseFloat(numStr) || 0;
    }
    
    // Removes non-numeric chars except dot
    numStr = numStr.replace(/[^\d.]/g, '');
    if (!numStr) return 0;

    if (field === 'mic') {
        if (numStr.length > 1) numStr = numStr.slice(0, 1) + '.' + numStr.slice(1);
    } else if (field === 'len') {
        if (numStr.length > 2) numStr = numStr.slice(0, 2) + '.' + numStr.slice(2);
    } else if (['unf', 'str', 'rd'].includes(field)) {
        if (numStr.length > 2) numStr = numStr.slice(0, 2) + '.' + numStr.slice(2);
    } else if (field === 'b') {
        if (numStr.length >= 2) numStr = numStr.slice(0, -1) + '.' + numStr.slice(-1);
    }

    return parseFloat(numStr) || 0;
};

export class ExcelExtractionService {
    public static async extractFromExcel(file: File): Promise<ExtractionResult> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = xlsx.read(data, { type: 'array' });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // Convert sheet to array of arrays
                    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    
                    const rows: HVIDataRow[] = [];
                    let headerFound = false;
                    let headerMap: Record<string, number> = {};

                    // Mapeamento esperado
                    const EXPECTED_HEADERS = {
                        etiqueta: ['ETIQUETA', 'TAG'],
                        hvi: ['HVI', 'MAQUINA', 'MÁQUINA'],
                        mic: ['MIC', 'MICRONAIRE'],
                        len: ['LEN', 'LENGTH', 'COMPRIMENTO'],
                        unf: ['UNF', 'UNIFORMITY', 'UNIFORMIDADE'],
                        str: ['STR', 'STRENGTH', 'RESISTÊNCIA', 'RESISTENCIA'],
                        rd: ['RD', 'REFLECTANCE', 'REFLETÂNCIA', 'REFLETANCIA'],
                        b: ['B', '+B', 'YELLOWNESS']
                    };

                    let malaRef = "";

                    for (const row of jsonData) {
                        // Tenta achar a Mala de Checagem antes do header
                        if (!headerFound) {
                            for (let i = 0; i < row.length; i++) {
                                const val = String(row[i]).toUpperCase();
                                if (val.includes('MALA DE CHECAGEM')) {
                                    // Pega o próximo valor não vazio na linha
                                    for (let j = i + 1; j < row.length; j++) {
                                        if (row[j]) {
                                            malaRef = String(row[j]);
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        // Localizar o cabeçalho
                        if (!headerFound) {
                            let matches = 0;
                            const currentHeaderMap: Record<string, number> = {};
                            
                            for (let i = 0; i < row.length; i++) {
                                const cellVal = String(row[i] || '').toUpperCase().trim();
                                
                                for (const [key, variants] of Object.entries(EXPECTED_HEADERS)) {
                                    if (variants.includes(cellVal)) {
                                        currentHeaderMap[key] = i;
                                        matches++;
                                        break;
                                    }
                                }
                            }
                            
                            // Se achou pelo menos MIC, LEN, STR, consideramos que achou o header
                            if (currentHeaderMap.mic !== undefined && currentHeaderMap.len !== undefined && currentHeaderMap.str !== undefined) {
                                headerFound = true;
                                headerMap = currentHeaderMap;
                            }
                            continue;
                        }

                        // Ler as linhas de dados após o cabeçalho
                        if (headerFound) {
                            // Ignora linhas totalmente vazias ou de rodapé
                            if (!row || row.length === 0) continue;
                            
                            const getVal = (key: string) => {
                                const idx = headerMap[key];
                                return idx !== undefined ? row[idx] : undefined;
                            };

                            const etiqueta = getVal('etiqueta') ? String(getVal('etiqueta')) : undefined;
                            const hviVal = getVal('hvi') ? String(getVal('hvi')) : '1';
                            const micVal = autoCorrectDecimal(getVal('mic') || '', 'mic');
                            const lenVal = autoCorrectDecimal(getVal('len') || '', 'len');
                            
                            // Se as colunas obrigatórias não são números válidos, não é uma linha de dados (pode ser total ou saldo)
                            if (isNaN(micVal) || isNaN(lenVal)) continue;

                            const unfVal = autoCorrectDecimal(getVal('unf') || '', 'unf');
                            const strVal = autoCorrectDecimal(getVal('str') || '', 'str');
                            const rdVal = autoCorrectDecimal(getVal('rd') || '', 'rd');
                            const bVal = autoCorrectDecimal(getVal('b') || '', 'b');

                            rows.push({
                                numero: String(rows.length + 1),
                                data_analise: '',
                                hora_analise: '',
                                hvi: hviVal,
                                etiqueta: etiqueta || '',
                                mic: isNaN(micVal) ? 0 : micVal,
                                len: isNaN(lenVal) ? 0 : lenVal,
                                unf: isNaN(unfVal) ? 0 : unfVal,
                                str: isNaN(strVal) ? 0 : strVal,
                                rd: isNaN(rdVal) ? 0 : rdVal,
                                b: isNaN(bVal) ? 0 : bVal,
                            });
                        }
                    }

                    resolve({
                        rawText: "Dados extraídos via Planilha (Excel)",
                        mala: malaRef,
                        etiqueta: "",
                        rows: rows
                    });

                } catch (error) {
                    console.error("Erro ao ler Excel:", error);
                    reject(new Error("Falha ao processar o arquivo Excel. Verifique se o formato é válido."));
                }
            };

            reader.onerror = () => {
                reject(new Error("Erro ao ler o arquivo."));
            };

            reader.readAsArrayBuffer(file);
        });
    }
}

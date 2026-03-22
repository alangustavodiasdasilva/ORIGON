import * as XLSX from 'xlsx';

export interface ParseResult {
    totalLido: number;
    totalValidos: number;
    totalRejeitados: number;
    erros: string[];
}

export interface StatusOSRawData {
    Laboratório: string;
    Contrato: string;
    Tomador: string;
    Cliente: string;
    Fazenda: string;
    Variedade: string;
    Usina: string;
    "O.S.": number | string;
    Romaneio: string | number;
    Inicial: string | number;
    Final: string | number;
    Amostras: number;
    Protocolo: number | string;
    "Nota Fiscal": string | null;
    Fatura: number | string | null;
    Status: string;
    Registrado: number; // Excel Serial Date
    Recepção: number; // Excel Serial Date
    Acondicionado: number; // Excel Serial Date
    Finalizado: number; // Excel Serial Date
    Revisor: string;
    Horas: number;
    "Peso  Mala": number;
    "Peso Médio Amostra": number;
}

export interface StatusOSParsed {
    os_numero: string;
    romaneio: string;
    cliente: string;
    fazenda: string;
    usina: string;
    variedade: string;

    data_registro: Date | null;
    data_recepcao: Date | null;
    data_acondicionamento: Date | null;
    data_finalizacao: Date | null;

    revisor: string;
    status: string;

    total_amostras: number;
    peso_mala: number;
    peso_medio: number;
    horas: number;

    nota_fiscal: string;
    fatura: string;
}

// Helper to convert Excel Serial Date to JS Date
function excelDateToJSDate(serial: number): Date | null {
    if (!serial || isNaN(serial)) return null;
    // Excel base date is Dec 30 1899.
    // However, there is a leap year bug in Excel (1900 is treated as leap year).
    // Usually: (serial - 25569) * 86400 * 1000
    // Adjusting for timezone might be needed, but usually we want UTC or Local.
    // Let's use a standard conversion.
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    const fractional_day = serial - Math.floor(serial) + 0.0000001;
    const total_seconds = Math.floor(86400 * fractional_day);
    const seconds = total_seconds % 60;
    const minutes = Math.floor(total_seconds / 60) % 60;
    const hours = Math.floor(total_seconds / (60 * 60));

    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}

// New streaming/chunked parser
export const parseStatusOSFileInChunks = async (
    file: File,
    onBatch: (batch: StatusOSParsed[]) => Promise<void>,
    batchSize: number = 2000
): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                // Use dense mode for better memory usage
                const workbook = XLSX.read(data, { type: 'binary', dense: true, cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Detectamos o range real para garantir que pegamos tudo
                XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

                // Usamos stream_to_json ou similar se disponível, mas aqui otimizamos o sheet_to_json
                const rawData = XLSX.utils.sheet_to_json<StatusOSRawData>(worksheet, {
                    range: 6, // Começa na linha 7 (0-indexed + header)
                    raw: false,
                    defval: ""
                });

                let currentBatch: StatusOSParsed[] = [];
                let result: ParseResult = { totalLido: 0, totalValidos: 0, totalRejeitados: 0, erros: [] };
                let rowIndex = 6; // Começa na linha 7 do excel real

                for (const row of rawData) {
                    rowIndex++;
                    result.totalLido++;
                    const getVal = (possibleKeys: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const pk of possibleKeys) {
                            const match = rowKeys.find(k => k.trim().toLowerCase() === pk.trim().toLowerCase());
                            if (match && row[match as keyof StatusOSRawData] !== undefined) return row[match as keyof StatusOSRawData];
                        }
                        return undefined;
                    };

                    const parseExcelDate = (val: any): Date | null => {
                        if (!val) return null;
                        if (val instanceof Date) return val;
                        if (typeof val === 'number') return excelDateToJSDate(val);
                        if (typeof val === 'string') {
                            const d = new Date(val);
                            if (!isNaN(d.getTime())) return d;
                            // Tenta formato DD/MM/YYYY
                            const parts = val.split(/[/-]/);
                            if (parts.length === 3) {
                                if (parts[2].length === 4) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                                if (parts[0].length === 4) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                            }
                        }
                        return null;
                    };

                    const parseNum = (val: any): number => {
                        if (typeof val === 'number') return val;
                        if (!val) return 0;
                        const str = String(val).replace(/\./g, '').replace(',', '.').trim();
                        const n = parseFloat(str);
                        return isNaN(n) ? 0 : n;
                    };

                    const tomadorVal = String(getVal(["Tomador", "Contratante", "tomador"]) || "").trim();
                    const clienteVal = String(getVal(["Cliente", "Beneficiário", "cliente"]) || "").trim();
                    let finalCliente = clienteVal;
                    if (tomadorVal && clienteVal && tomadorVal !== clienteVal) {
                        finalCliente = `${tomadorVal}|||${clienteVal}`;
                    } else if (tomadorVal && !clienteVal) {
                        finalCliente = tomadorVal;
                    }

                    const parsed: StatusOSParsed = {
                        os_numero: String(getVal(["O.S.", "OS", "Ordem de Serviço", "os"]) || ""),
                        romaneio: String(getVal(["Romaneio", "Rom", "romaneio"]) || ""),
                        cliente: finalCliente,
                        fazenda: String(getVal(["Fazenda", "Faz", "fazenda"]) || ""),
                        usina: String(getVal(["Usina", "unidade", "usina"]) || ""),
                        variedade: String(getVal(["Variedade", "Var", "variedade"]) || ""),

                        data_registro: parseExcelDate(getVal(["Registrado", "Data Registro", "Registro", "registrado", "Dt. Registro", "Dt Registro"])),
                        data_recepcao: parseExcelDate(getVal(["Recepção", "Data Recepção", "Recepcao", "recepcao", "Dt. Recepção", "Dt Recepção", "Dt. Recepcão", "Dt Recepcão"])),
                        data_acondicionamento: parseExcelDate(getVal(["Acondicionado", "Data Acondicionamento", "acondicionado", "Dt. Acondicionado"])),
                        data_finalizacao: parseExcelDate(getVal(["Finalizado", "Data Finalização", "Finalização", "finalizado", "Dt. Finalização", "Dt Finalização"])),

                        revisor: String(getVal(["Revisor", "Analista", "revisor"]) || ""),
                        status: String(getVal(["Status", "Situação", "status"]) || ""),

                        total_amostras: parseNum(getVal(["Amostras", "Qtde", "Quantidade", "Total Amostras", "amostras"])),
                        peso_mala: parseNum(getVal(["Peso Mala", "Peso  Mala", "peso_mala"])),
                        peso_medio: parseNum(getVal(["Peso Médio Amostra", "Peso Médio", "Peso Medio", "peso_medio"])),
                        horas: parseNum(getVal(["Horas", "Duração", "horas"])),

                        nota_fiscal: String(getVal(["Nota Fiscal", "NF", "nota_fiscal"]) || ""),
                        fatura: String(getVal(["Fatura", "Fat", "fatura"]) || ""),
                    };

                    let hasError = false;
                    let rowErrors = [];

                    if (!parsed.os_numero) { hasError = true; rowErrors.push("O.S. ausente"); }
                    if (!parsed.cliente) { hasError = true; rowErrors.push("Cliente ausente"); }
                    if (!parsed.data_recepcao) { hasError = true; rowErrors.push("Data Recepção ausente/inválida"); }
                    if (parsed.total_amostras <= 0) { hasError = true; rowErrors.push("Total de Amostras zerado ou inválido"); }

                    if (hasError) {
                        result.totalRejeitados++;
                        if (result.erros.length < 15) {
                            result.erros.push(`Linha ${rowIndex} (O.S. ${parsed.os_numero || '?' }): ${rowErrors.join(" | ")}`);
                        }
                    } else {
                        result.totalValidos++;
                        currentBatch.push(parsed);

                        if (currentBatch.length >= batchSize) {
                            await onBatch(currentBatch);
                            currentBatch = [];
                        }
                    }
                }

                // Final batch
                if (currentBatch.length > 0) {
                    await onBatch(currentBatch);
                }

                resolve(result);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};

export const parseStatusOSFile = async (file: File): Promise<StatusOSParsed[]> => {
    // Legacy support or wrapper
    const allData: StatusOSParsed[] = [];
    await parseStatusOSFileInChunks(file, async (batch) => {
        allData.push(...batch);
    });
    return allData;
};

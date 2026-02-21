import * as XLSX from 'xlsx';

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
): Promise<number> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                // Use dense mode for better memory usage
                const workbook = XLSX.read(data, { type: 'binary', dense: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Manually parse cells to avoid creating huge JSON array
                // sheet_to_json is easy but memory intensive.
                // For 1.3M rows, even holding the 'worksheet' object might be heavy, but unavoidable in browser implementation of SheetJS without logic changes.
                // Just avoiding 'rawData' big array helps.

                const rawData = XLSX.utils.sheet_to_json<StatusOSRawData>(worksheet, { range: 6 });

                let currentBatch: StatusOSParsed[] = [];
                let totalProcessed = 0;

                for (const row of rawData) {
                    const getVal = (keys: string[]) => {
                        for (const key of keys) {
                            if (row[key as keyof StatusOSRawData] !== undefined) return row[key as keyof StatusOSRawData];
                        }
                        return undefined;
                    };

                    const tomadorVal = String(getVal(["Tomador", "tomador"]) || "").trim();
                    const clienteVal = String(getVal(["Cliente", "cliente"]) || "").trim();
                    let finalCliente = clienteVal;
                    if (tomadorVal && clienteVal && tomadorVal !== clienteVal) {
                        finalCliente = `${tomadorVal}|||${clienteVal}`;
                    } else if (tomadorVal && !clienteVal) {
                        finalCliente = tomadorVal;
                    }

                    const rawRegistrado = getVal(["Registrado", "Registro", "registrado"]);
                    const rawRecepcao = getVal(["Recepção", "Recepcao", "recepção", "recepcao"]);
                    const rawAcondicionado = getVal(["Acondicionado", "acondicionado"]);
                    const rawFinalizado = getVal(["Finalizado", "finalizado"]);
                    const rawAmostras = getVal(["Amostras", "amostras", "Total Amostras"]);
                    const rawPesoMala = getVal(["Peso  Mala", "Peso Mala", "peso mala"]);
                    const rawPesoMedio = getVal(["Peso Médio Amostra", "Peso Medio Amostra", "Peso Médio", "Peso Medio"]);
                    const rawHoras = getVal(["Horas", "horas"]);

                    const parsed: StatusOSParsed = {
                        os_numero: String(getVal(["O.S.", "OS", "o.s."]) || ""),
                        romaneio: String(getVal(["Romaneio", "romaneio"]) || ""),
                        cliente: finalCliente,
                        fazenda: String(getVal(["Fazenda", "fazenda"]) || ""),
                        usina: String(getVal(["Usina", "usina"]) || ""),
                        variedade: String(getVal(["Variedade", "variedade"]) || ""),

                        data_registro: excelDateToJSDate(Number(rawRegistrado)),
                        data_recepcao: excelDateToJSDate(Number(rawRecepcao)),
                        data_acondicionamento: excelDateToJSDate(Number(rawAcondicionado)),
                        data_finalizacao: excelDateToJSDate(Number(rawFinalizado)),

                        revisor: String(getVal(["Revisor", "revisor"]) || ""),
                        status: String(getVal(["Status", "status"]) || ""),

                        total_amostras: Number(rawAmostras || 0),
                        peso_mala: Number(rawPesoMala || 0),
                        peso_medio: Number(rawPesoMedio || 0),
                        horas: Number(rawHoras || 0),

                        nota_fiscal: getVal(["Nota Fiscal", "nota fiscal"]) ? String(getVal(["Nota Fiscal", "nota fiscal"])) : "",
                        fatura: getVal(["Fatura", "fatura"]) ? String(getVal(["Fatura", "fatura"])) : "",
                    };

                    if (parsed.os_numero && parsed.cliente) {
                        currentBatch.push(parsed);
                    }

                    if (currentBatch.length >= batchSize) {
                        await onBatch(currentBatch);
                        totalProcessed += currentBatch.length;
                        currentBatch = [];
                    }
                }

                // Final batch
                if (currentBatch.length > 0) {
                    await onBatch(currentBatch);
                    totalProcessed += currentBatch.length;
                }

                resolve(totalProcessed);
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

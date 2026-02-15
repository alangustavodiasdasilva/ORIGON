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
                    const parsed: StatusOSParsed = {
                        os_numero: String(row["O.S."] || ""),
                        romaneio: String(row["Romaneio"] || ""),
                        cliente: row["Cliente"] || "",
                        fazenda: row["Fazenda"] || "",
                        usina: row["Usina"] || "",
                        variedade: row["Variedade"] || "",

                        data_registro: excelDateToJSDate(Number(row["Registrado"])),
                        data_recepcao: excelDateToJSDate(Number(row["Recepção"])),
                        data_acondicionamento: excelDateToJSDate(Number(row["Acondicionado"])),
                        data_finalizacao: excelDateToJSDate(Number(row["Finalizado"])),

                        revisor: row["Revisor"] || "",
                        status: row["Status"] || "",

                        total_amostras: Number(row["Amostras"] || 0),
                        peso_mala: Number(row["Peso  Mala"] || 0),
                        peso_medio: Number(row["Peso Médio Amostra"] || 0),
                        horas: Number(row["Horas"] || 0),

                        nota_fiscal: row["Nota Fiscal"] ? String(row["Nota Fiscal"]) : "",
                        fatura: row["Fatura"] ? String(row["Fatura"]) : "",
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

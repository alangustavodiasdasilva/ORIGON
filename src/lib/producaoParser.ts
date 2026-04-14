import * as XLSX from 'xlsx';

export interface ParseResult {
    totalLido: number;
    totalValidos: number;
    totalRejeitados: number;
    erros: string[];
}

export interface ProducaoParsed {
    lab_id: string;
    identificador_unico: string;
    data_producao: string;
    turno: string;
    produto: string;
    peso: number;
    metadata: any;
}

const parseDate = (cell: any): string | null => {
    if (!cell) return null;
    if (typeof cell === 'number' && cell > 30000) {
        const date = XLSX.SSF.parse_date_code(cell);
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    if (typeof cell === 'string') {
        // Aceitar formatos: DD/MM/AAAA, DD-MM-AAAA, DD/MM/AA, etc.
        const match = cell.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
        if (match) {
            let year = parseInt(match[3], 10);
            if (year < 100) year += 2000;
            return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        }
    }
    return null;
};

export const parseProducaoFileInChunks = async (
    file: File,
    labId: string,
    onBatch: (batch: ProducaoParsed[]) => Promise<void>,
    batchSize: number = 2000
): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary', dense: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                // 1. Detect Mode: Matrix (Machine Cols) or List (Operator Rows)
                let machineMap: Record<number, number> = {};
                let listColIndex = -1;
                let listOperatorIndex = -1;
                let headerRowIndex = -1;
                let isListMode = false;

                for (let i = 0; i < Math.min(rows.length, 60); i++) {
                    const row = rows[i];
                    let foundMachines = 0;
                    const tempMap: Record<number, number> = {};

                    row.forEach((cell, colIdx) => {
                        const sVal = String(cell).toUpperCase().trim();
                        
                        // Machine Column Check (1, 2, 3...)
                        const val = parseInt(sVal);
                        if (!isNaN(val) && val > 0 && val < 1000 && !sVal.includes("/")) {
                            tempMap[colIdx] = val;
                            foundMachines++;
                        }

                        // List Mode Header Detection
                        if (sVal === "AMOSTRAS" || sVal.includes("TOTAL AMOSTRAS") || sVal === "PRODUÇÃO") {
                            listColIndex = colIdx;
                        }
                        if (sVal === "OPERADOR" || sVal === "ANALISTA" || sVal.includes("NOME")) {
                            listOperatorIndex = colIdx;
                        }
                    });

                    if (foundMachines > 5) {
                        machineMap = tempMap;
                        headerRowIndex = i;
                        isListMode = false;
                        break;
                    }

                    if (listColIndex !== -1) {
                        headerRowIndex = i;
                        isListMode = true;
                        // Se não achou index de operador, assume um padrão
                        if (listOperatorIndex === -1) listOperatorIndex = Math.max(0, listColIndex - 1);
                        break;
                    }
                }

                if (headerRowIndex === -1) {
                    throw new Error("Não foi possível detectar o formato da planilha (Colunas de Máquinas ou Lista de Amostras) nas primeiras 60 linhas.");
                }

                let currentBlockDate: string | null = null;
                let currentTurnoLabel: string = "";
                let currentBatch: ProducaoParsed[] = [];
                let result: ParseResult = { totalLido: 0, totalValidos: 0, totalRejeitados: 0, erros: [] };

                for (let i = 0; i < rows.length; i++) {
                    if (i === headerRowIndex) continue;

                    const row = rows[i];
                    if (!row || row.length === 0) continue;

                    // 1. Ignorar linhas vazias ou de resumos (TOTAL, SOMA, etc) - CHECAGEM PROFUNDA
                    const rowString = row.join(" ").toUpperCase();
                    const isSummaryRow = rowString.includes("TOTAL") || rowString.includes("SOMA") || 
                                         rowString.includes("MÉDIA") || rowString.includes("RESUMO") ||
                                         rowString.includes("GERAL");

                    if (isSummaryRow) continue;

                    // 2. Extrair Data e Turno (comum a ambos os modos)
                    const potentialDate = row.map(parseDate).find(d => d !== null);
                    if (potentialDate) currentBlockDate = potentialDate;

                    const turnoLabel = row.map(c => String(c || "").toUpperCase().trim()).find(s => s.includes("TURNO") || s === "COMERCIAL");
                    if (turnoLabel) currentTurnoLabel = turnoLabel;

                    if (!currentBlockDate || !currentTurnoLabel) continue;

                    // 3. Processamento de Dados baseado no Modo
                    if (isListMode) {
                        // MODO LISTA: Uma linha = Um registro
                        const cell = row[listColIndex] || row[listColIndex - 1]; // Fallback for shifted Excel rows
                        let val = NaN;
                        if (typeof cell === 'number') val = cell;
                        else if (typeof cell === 'string' && cell.trim() !== "") {
                            const clean = cell.replace(/\./g, "").replace(",", ".");
                            if (!isNaN(parseFloat(clean))) val = parseFloat(clean);
                        }

                        if (!isNaN(val) && val > 0) {
                            const operator = String(row[listOperatorIndex] || "").trim() || "N/A";
                            currentBatch.push({
                                lab_id: labId,
                                identificador_unico: `${currentBlockDate}-${currentTurnoLabel.replace(/[^A-Z0-9]/g, "")}-ROW${i}-${val}`,
                                data_producao: currentBlockDate,
                                turno: currentTurnoLabel.replace(":", "").trim(),
                                produto: operator,
                                peso: val,
                                metadata: { source: 'excel_list_mode' }
                            });
                            result.totalValidos++;
                        }
                    } else {
                        // MODO MATRIZ: Colunas de Máquinas
                        const machineIndices = Object.keys(machineMap).map(Number);
                        for (const colIdx of machineIndices) {
                            const cell = row[colIdx];
                            if (cell === null || cell === "" || cell === undefined) continue;

                            let val = NaN;
                            if (typeof cell === 'number') val = cell;
                            else if (typeof cell === 'string') {
                                const clean = cell.replace(/\./g, "").replace(",", ".");
                                if (!isNaN(parseFloat(clean))) val = parseFloat(clean);
                            }

                            if (!isNaN(val) && val > 0) {
                                const mNum = machineMap[colIdx];
                                currentBatch.push({
                                    lab_id: labId,
                                    identificador_unico: `${currentBlockDate}-${currentTurnoLabel.replace(/[^A-Z0-9]/g, "")}-MQ${mNum}`,
                                    data_producao: currentBlockDate,
                                    turno: currentTurnoLabel.replace(":", "").trim(),
                                    produto: `Máquina ${mNum}`,
                                    peso: val,
                                    metadata: { source: 'excel_matrix_mode' }
                                });
                                result.totalValidos++;
                            }
                        }
                    }

                    if (currentBatch.length >= batchSize) {
                        await onBatch(currentBatch);
                        currentBatch = [];
                    }
                }

                console.log(`Finished parsing. Total Validos: ${result.totalValidos}, Total Rejeitados: ${result.totalRejeitados}`);

                if (currentBatch.length > 0) {
                    await onBatch(currentBatch);
                }

                resolve(result);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = reject;
        reader.readAsBinaryString(file);
    });
};

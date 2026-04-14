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

                // 1. Detect Header Row for Machine Mapping
                let machineMap: Record<number, number> = {};
                let headerRowIndex = -1;

                for (let i = 0; i < Math.min(rows.length, 50); i++) {
                    const row = rows[i];
                    let foundNumbers = 0;
                    const tempMap: Record<number, number> = {};

                    row.forEach((cell, colIdx) => {
                        const val = parseInt(String(cell));
                        if (!isNaN(val) && val > 0 && val < 1000) {
                            tempMap[colIdx] = val;
                            foundNumbers++;
                        }
                    });

                    if (foundNumbers > 5) {
                        machineMap = tempMap;
                        headerRowIndex = i;
                        break;
                    }
                }

                if (headerRowIndex === -1) {
                    throw new Error("Não foi possível detectar o cabeçalho das máquinas (1, 2, 3...) nas primeiras 50 linhas.");
                }

                console.log(`Detected machines at row ${headerRowIndex}:`, machineMap);

                let currentBlockDate: string | null = null;
                let currentTurnoLabel: string = "";
                let currentBatch: ProducaoParsed[] = [];
                let result: ParseResult = { totalLido: 0, totalValidos: 0, totalRejeitados: 0, erros: [] };

                for (let i = 0; i < rows.length; i++) {
                    if (i === headerRowIndex) continue;

                    const row = rows[i];
                    if (!row || row.length === 0) {
                        // Reset turno on empty row to avoid importing trailing summary/total rows
                        currentTurnoLabel = "";
                        continue;
                    }

                    // Check for valid content in row (not just nulls/empty strings)
                    const hasContent = row.some(cell => cell !== null && cell !== "" && cell !== undefined);
                    if (!hasContent) {
                        currentTurnoLabel = "";
                        continue;
                    }

                    // 1. Check for date in columns 0 or 1
                    const potentialDate = parseDate(row[0]) || parseDate(row[1]);
                    if (potentialDate) {
                        currentBlockDate = potentialDate;
                        // Important: if this is JUST a date row (no turno or data yet), 
                        // we might reset turno or wait for the next row to tell us.
                    }

                    // 2. Check for turno label in columns 0 or 1
                    const firstCell = String(row[0] || "").toUpperCase().trim();
                    const secondCell = String(row[1] || "").toUpperCase().trim();

                    if (firstCell.includes("TURNO")) currentTurnoLabel = firstCell;
                    else if (secondCell.includes("TURNO")) currentTurnoLabel = secondCell;

                    // 3. If we have date + turno, process data columns
                    if (currentBlockDate && currentTurnoLabel) {
                        let foundInRow = 0;

                        // Iterate through ALL columns that might have data
                        // We use the machineMap as reference indices
                        const machineIndices = Object.keys(machineMap).map(Number);

                        // We also check columns immediately to the LEFT of machine labels (offset handling)
                        const colsToCheck = new Set<number>();
                        machineIndices.forEach(idx => {
                            colsToCheck.add(idx);
                            if (idx > 0) colsToCheck.add(idx - 1);
                        });

                        const sortedCols = Array.from(colsToCheck).sort((a, b) => a - b);

                        for (const colIdx of sortedCols) {
                            const cell = row[colIdx];
                            if (cell === null || cell === "" || cell === undefined) continue;

                            let val = NaN;
                            if (typeof cell === 'number') val = cell;
                            else if (typeof cell === 'string' && cell.trim() !== "") {
                                const clean = cell.replace(/\./g, "").replace(",", ".");
                                if (!clean.includes("/") && !isNaN(parseFloat(clean))) {
                                    val = parseFloat(clean);
                                }
                            }

                            result.totalLido++;

                            if (isNaN(val) || val < 0) {
                                result.totalRejeitados++;
                                if (result.erros.length < 15) result.erros.push(`Linha ${i + 1}, Mq ${machineMap[colIdx] || '?' }: peso inválido (${cell})`);
                                continue;
                            }
                            if (!currentBlockDate) {
                                result.totalRejeitados++;
                                if (result.erros.length < 15) result.erros.push(`Linha ${i + 1}: Data de produção não identificada pelo bloco.`);
                                continue;
                            }
                            if (!currentTurnoLabel) {
                                result.totalRejeitados++;
                                if (result.erros.length < 15) result.erros.push(`Linha ${i + 1}: Turno não identificado.`);
                                continue;
                            }

                            // Find which machine this column belongs to
                            // Rule: Exact match first, then offset +1
                            let machineNumber: number | undefined = machineMap[colIdx];
                            if (machineNumber === undefined && machineMap[colIdx + 1] !== undefined) {
                                machineNumber = machineMap[colIdx + 1];
                            }

                            if (machineNumber !== undefined) {
                                currentBatch.push({
                                    lab_id: labId,
                                    identificador_unico: `${currentBlockDate}-${currentTurnoLabel.replace(/[^A-Z0-9]/g, "")}-MQ${machineNumber}`,
                                    data_producao: currentBlockDate,
                                    turno: currentTurnoLabel.replace(":", "").trim(),
                                    produto: `Linha/Mq ${machineNumber}`,
                                    peso: val,
                                    metadata: { source: 'excel_upload_streaming_robust' }
                                });
                                result.totalValidos++;
                            }
                        }

                        if (currentBatch.length >= batchSize) {
                            await onBatch(currentBatch);
                            currentBatch = [];
                        }
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

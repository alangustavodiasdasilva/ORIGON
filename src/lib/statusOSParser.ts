import * as XLSX from 'xlsx';

export interface StatusOSParsed {
    id: string;
    os_numero: string;
    romaneio: string;
    cliente: string;
    tomador?: string;
    fazenda?: string;
    data_registro: string | Date | null;
    data_recepcao: string | Date | null;
    data_acondicionamento: string | Date | null;
    data_finalizacao: string | Date | null;
    revisor: string;
    status: string;
    total_amostras: number;
    peso_mala: number;
    peso_medio: number;
    horas: number;
    nota_fiscal: string;
    fatura: string;
    lab_id?: string;
}

export interface ParseResult {
    success: boolean;
    count: number;
    totalValidos: number;
    totalRejeitados: number;
    totalAmostras: number;
    erros: string[];
}

function excelDateToJSDate(serial: number): Date | null {
    if (!serial || isNaN(serial)) return null;
    try {
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        const fractional_day = serial - Math.floor(serial) + 0.0000001;
        const total_seconds = Math.floor(86400 * fractional_day);
        const seconds = total_seconds % 60;
        const minutes = Math.floor(total_seconds / 60) % 60;
        const hours = Math.floor(total_seconds / (60 * 60));
        return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
    } catch (e) {
        return null;
    }
}

export const parseStatusOSFileInChunks = async (
    file: File,
    onBatch: (batch: StatusOSParsed[]) => Promise<void>,
    batchSize: number = 2000
): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const dataBuffer = e.target?.result;
                const workbook = XLSX.read(dataBuffer, { type: 'binary', cellDates: false });
                const sheetNames = workbook.SheetNames;
                
                // Escolhe a aba 'Sheet1' ou a que tem mais dados
                let activeSheetName = sheetNames.includes('Sheet1') ? 'Sheet1' : sheetNames[0];
                let worksheet = workbook.Sheets[activeSheetName];
                
                const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                console.log(`[StatusOSParser] Processando: ${activeSheetName} | Linhas: ${rawRows.length}`);

                // Mapeamento Posicional Detectado para o formato do usuário
                let colMap = { os: 7, am: 11, cli: 3, tomador: 2, rom: 8, data: 16, status: 15, rev: 20, horas: 17, pMala: 21, pMedio: 22 };

                // Scan inteligente para validar se os índices batem ou precisam de ajuste
                let startIdx = 0;
                for (let i = 0; i < Math.min(50, rawRows.length); i++) {
                    const row = rawRows[i];
                    // Se a coluna 7 tem um número de O.S. (6 dígitos aprox) e a 11 tem amostras, começamos aqui
                    const possibleOS = Number(row[7]);
                    const possibleAM = Number(row[11]);
                    if (!isNaN(possibleOS) && possibleOS > 100000 && !isNaN(possibleAM) && possibleAM > 0) {
                        startIdx = i;
                        console.log(`[StatusOSParser] Dados detectados a partir da linha ${i + 1}`);
                        break;
                    }
                }

                const aggregatedMap = new Map<string, StatusOSParsed>();
                let totalVolume = 0;
                let totalRejeitados = 0;

                for (let i = startIdx; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || row.length < 5) continue;

                    // Ignora linhas de resumo/totais mas CONTINUA lendo para encontrar mais dados abaixo
                    const rowStr = JSON.stringify(row).toLowerCase();
                    if (rowStr.includes('total geral') || rowStr.includes('média:') || rowStr.includes('resumo')) {
                        console.log(`[StatusOSParser] Linha de sub-total ignorada em ${i+1}. Prosseguindo...`);
                        continue;
                    }

                    const osRaw = row[colMap.os];
                    let os = (typeof osRaw === 'number') ? String(Math.floor(osRaw)) : String(osRaw || "").trim();
                    const am = Math.floor(Number(row[colMap.am]) || 0);
                    
                    // Valida se tem amostras. Se a O.S. for vazia, gera uma temporária para não perder o dado
                    if (isNaN(am) || am <= 0) {
                        continue;
                    }
                    
                    if (!os || os === "0" || os === "null" || os.length > 15) {
                        os = `AVULSO-${i}`;
                    }

                    const romRaw = row[colMap.rom];
                    const rom = (typeof romRaw === 'number') ? String(Math.floor(romRaw)) : String(romRaw || "").trim();
                    
                    const tomadorVal = String(row[colMap.tomador] || "").trim();
                    const clienteVal = String(row[colMap.cli] || "").trim();
                    const status = String(row[colMap.status] || "Pendente").trim();
                    const revisor = String(row[colMap.rev] || "").trim();
                    const horasVal = Number(row[colMap.horas]) || 0;
                    
                    let date: Date | null = null;
                    const rawDate = row[colMap.data];
                    if (typeof rawDate === 'number') date = excelDateToJSDate(rawDate);
                    else if (rawDate instanceof Date) date = rawDate;
                    else if (typeof rawDate === 'string' && rawDate.trim()) {
                        const d = new Date(rawDate.trim());
                        if (!isNaN(d.getTime())) date = d;
                    }

                    // Força a data para ISO string para evitar o erro de 'invalid input for type integer' 
                    // em colunas que por ventura o Supabase/Postgres tente inferir
                    const dateISO = date ? date.toISOString() : null;

                    const finalCliente = (tomadorVal && clienteVal && tomadorVal !== clienteVal) ? `${tomadorVal}|||${clienteVal}` : (tomadorVal || clienteVal || "NÃO INFORMADO");
                    const aggKey = `${os}`; // Unicidade absoluta por O.S. para o banco

                    if (aggregatedMap.has(aggKey)) {
                        const existing = aggregatedMap.get(aggKey)!;
                        existing.total_amostras += am;
                        existing.horas += Math.floor(horasVal);
                    } else {
                        aggregatedMap.set(aggKey, {
                            id: crypto.randomUUID(),
                            os_numero: os,
                            romaneio: rom,
                            cliente: finalCliente,
                            tomador: tomadorVal || "NÃO INFORMADO",
                            fazenda: clienteVal || "NÃO INFORMADO",
                            data_registro: null,
                            data_recepcao: dateISO,
                            data_acondicionamento: null,
                            data_finalizacao: (status.toLowerCase().includes('finalizado')) ? dateISO : null,
                            revisor: revisor,
                            status: status,
                            total_amostras: am,
                            peso_mala: Math.floor(Number(row[colMap.pMala]) || 0),
                            peso_medio: Math.floor(Number(row[colMap.pMedio]) || 0),
                            horas: Math.floor(horasVal),
                            nota_fiscal: "",
                            fatura: ""
                        });
                    }
                    totalVolume += am;
                }

                const aggregatedData = Array.from(aggregatedMap.values());
                console.log(`[StatusOSParser] Finalizado. Amostras: ${totalVolume}, Lotes: ${aggregatedData.length}`);

                for (let i = 0; i < aggregatedData.length; i += batchSize) {
                    await onBatch(aggregatedData.slice(i, i + batchSize));
                }

                resolve({
                    success: true,
                    count: aggregatedData.length,
                    totalValidos: aggregatedData.length,
                    totalRejeitados: totalRejeitados,
                    totalAmostras: totalVolume,
                    erros: []
                });

            } catch (error: any) {
                console.error("[StatusOSParser] Erro Fatal:", error);
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};

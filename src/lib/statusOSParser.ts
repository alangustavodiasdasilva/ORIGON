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
                const activeSheetName = sheetNames.includes('Sheet1') ? 'Sheet1' : sheetNames[0];
                const worksheet = workbook.Sheets[activeSheetName];

                const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
                console.log(`[StatusOSParser] Processando: ${activeSheetName} | Linhas: ${rawRows.length}`);

                // ── Normalização de strings para comparação ─────────────────────────
                const norm = (s: any) => String(s || '').toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

                // ── Detecção Inteligente de Cabeçalho ──────────────────────────────
                // Escaneia as primeiras 30 linhas para encontrar o cabeçalho da tabela
                interface ColMap { os: number; am: number; cli: number; tomador: number; rom: number; data: number; dataFin: number; status: number; rev: number; horas: number; pMala: number; pMedio: number; }
                // Valores padrão (compatibilidade com formato antigo)
                let colMap: ColMap = { os: 7, am: 11, cli: 3, tomador: 2, rom: 8, data: 16, dataFin: -1, status: 15, rev: 20, horas: 17, pMala: 21, pMedio: 22 };
                let headerRowIdx = -1;

                for (let i = 0; i < Math.min(30, rawRows.length); i++) {
                    const row = rawRows[i];
                    const textCols = row.filter((c: any) => typeof c === 'string' && c.trim().length > 1);
                    if (textCols.length < 4) continue;

                    const tryMap: Partial<ColMap> = {};
                    row.forEach((cell: any, idx: number) => {
                        const n = norm(cell);
                        if (n === '' ) return;

                        // OS / Número
                        if (tryMap.os === undefined && (n === 'os' || n.includes('n. os') || n.includes('num os') || n.includes('n.os') || n.includes('ordem de servico') || n === 'ordem')) tryMap.os = idx;
                        // Amostras — detecta singular "Amostra" e plural "Amostras"
                        if (tryMap.am === undefined && (n === 'am' || n === 'amostra' || n === 'amostras' || n.includes('total am') || n.includes('qtd am') || n.includes('qtd. am') || n === 'n. amostras' || n === 'qtd. amostras')) tryMap.am = idx;
                        // Cliente / Fazenda
                        if (tryMap.cli === undefined && n.includes('cliente') && !n.includes('tomador')) tryMap.cli = idx;
                        // Tomador
                        if (tryMap.tomador === undefined && n.includes('tomador')) tryMap.tomador = idx;
                        // Romaneio
                        if (tryMap.rom === undefined && (n.includes('romaneio') || n === 'rom' || n === 'rom.')) tryMap.rom = idx;
                        // Data Recepção — NÃO confunde com coluna Finalizado
                        if (tryMap.data === undefined && (n.includes('recepcao') || n.includes('recebimento') || n.includes('data rec') || n.includes('data de rec') || n === 'recebido') && !n.includes('finali')) tryMap.data = idx;
                        // Data Finalização ou Quantidade de Amostras Finalizadas
                        if (tryMap.dataFin === undefined && (n === 'finalizado' || n.includes('data fin') || n.includes('data de finali') || n === 'data fin.' || n === 'finalizado em' || n.includes('finalizadas') || n.includes('finalizada') || (n.includes('finali') && !n.includes('revisor') && !n.includes('dest')))) tryMap.dataFin = idx;
                        // Status
                        if (tryMap.status === undefined && (n === 'status' || n.includes('situacao') || n.includes('situac'))) tryMap.status = idx;
                        // Revisor / Analista / Dest
                        if (tryMap.rev === undefined && (n === 'revisor' || n.includes('analista') || n.includes('dest') || n.includes('destino') || n.includes('responsavel'))) tryMap.rev = idx;
                        // Horas
                        if (tryMap.horas === undefined && (n.includes('hora') && !n.includes('acond'))) tryMap.horas = idx;
                        // Peso Mala
                        if (tryMap.pMala === undefined && ((n.includes('peso') && n.includes('mala')) || n === 'p.mala' || n === 'peso mala')) tryMap.pMala = idx;
                        // Peso Médio
                        if (tryMap.pMedio === undefined && ((n.includes('peso') && (n.includes('medio') || n.includes('med'))) || n === 'p.medio' || n === 'peso medio')) tryMap.pMedio = idx;
                    });

                    // Se encontrou os campos essenciais, confirma este mapeamento
                    if (tryMap.os !== undefined && tryMap.am !== undefined) {
                        headerRowIdx = i;
                        colMap = {
                            os: tryMap.os ?? 7,
                            am: tryMap.am ?? 11,
                            cli: tryMap.cli ?? 3,
                            tomador: tryMap.tomador ?? 2,
                            rom: tryMap.rom ?? 8,
                            data: tryMap.data ?? 16,
                            dataFin: tryMap.dataFin ?? -1,
                            status: tryMap.status ?? 15,
                            rev: tryMap.rev ?? 20,
                            horas: tryMap.horas ?? 17,
                            pMala: tryMap.pMala ?? 21,
                            pMedio: tryMap.pMedio ?? 22,
                        };
                        console.log(`[StatusOSParser] Cabeçalho detectado na linha ${i + 1}. Mapa:`, colMap);
                        break;
                    }
                }

                // Define o início dos dados
                let startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

                // Se não encontrou cabeçalho, usa detecção posicional (compatibilidade com formato legado)
                if (headerRowIdx < 0) {
                    for (let i = 0; i < Math.min(50, rawRows.length); i++) {
                        const row = rawRows[i];
                        const possibleOS = Number(row[7]);
                        const possibleAM = Number(row[11]);
                        if (!isNaN(possibleOS) && possibleOS > 100000 && !isNaN(possibleAM) && possibleAM > 0) {
                            startIdx = i;
                            console.log(`[StatusOSParser] Modo legado: dados a partir da linha ${i + 1}`);
                            break;
                        }
                    }
                }

                const aggregatedMap = new Map<string, StatusOSParsed>();
                let totalVolume = 0;
                let totalRejeitados = 0;

                for (let i = startIdx; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || row.length < 5) continue;

                    // Ignora linhas de resumo mas CONTINUA lendo o resto do arquivo
                    const rowStr = JSON.stringify(row).toLowerCase();
                    if (rowStr.includes('total geral') || rowStr.includes('média:') || rowStr.includes('resumo')) {
                        console.log(`[StatusOSParser] Sub-total ignorado na linha ${i + 1}`);
                        continue;
                    }

                    const osRaw = row[colMap.os];
                    let os = (typeof osRaw === 'number') ? String(Math.floor(osRaw)) : String(osRaw || '').trim();
                    const am = Math.floor(Number(row[colMap.am]) || 0);

                    if (isNaN(am) || am <= 0) continue;

                    if (!os || os === '0' || os === 'null' || os.length > 15) {
                        os = `AVULSO-${i}`;
                    }

                    const romRaw = row[colMap.rom];
                    const rom = (typeof romRaw === 'number') ? String(Math.floor(romRaw)) : String(romRaw || '').trim();

                    const tomadorVal = String(row[colMap.tomador] || '').trim();
                    const clienteVal = String(row[colMap.cli] || '').trim();
                    const status = String(row[colMap.status] || 'Pendente').trim();
                    const revisor = String(row[colMap.rev] || '').trim();
                    const horasVal = Number(row[colMap.horas]) || 0;

                    // ── Função auxiliar para parse robusto de Datas em Texto (PT-BR) ──
                    const parseStringDate = (raw: string): Date | null => {
                        if (!raw) return null;
                        const trimmed = String(raw).trim();
                        // 1. Tentar parse nativo direto
                        let d = new Date(trimmed);
                        if (!isNaN(d.getTime())) return d;
                        
                        // 2. Tentar quebrar formato brasileiro (DD/MM/YYYY ou DD/MM/YY)
                        const parts = trimmed.split(/[/ -]/);
                        if (parts.length >= 3) {
                            const [p1, p2, p3] = parts;
                            // Se o primeiro elemento for dia (maior que 12 ou deduzido)
                            // Assumimos formato padrão PT-BR: DD/MM/YYYY
                            let day = parseInt(p1);
                            let month = parseInt(p2);
                            let year = parseInt(p3.split(' ')[0]); // ignora horas se houver
                            
                            if (year < 100) year += 2000;
                            
                            // Cria data forçando hora meio-dia para evitar conflitos de fuso
                            const brDate = new Date(year, month - 1, day, 12, 0, 0);
                            if (!isNaN(brDate.getTime())) return brDate;
                        }
                        return null;
                    };

                    // ── Data de Recepção ──────────────────────────────────────────────
                    let dateRec: Date | null = null;
                    const rawDateRec = row[colMap.data];
                    if (typeof rawDateRec === 'number') dateRec = excelDateToJSDate(rawDateRec);
                    else if (rawDateRec instanceof Date) dateRec = rawDateRec;
                    else if (typeof rawDateRec === 'string') dateRec = parseStringDate(rawDateRec);

                    const dateRecISO = dateRec ? dateRec.toISOString() : null;

                    // ── Data de Finalização (coluna dedicada OU fallback por status) ──
                    let dateFin: Date | null = null;
                    const statusNorm = norm(status);
                    let isFinalizado = statusNorm.includes('finaliz') || statusNorm.includes('faturad') || statusNorm.includes('conclu') || statusNorm.includes('aprovad');
                    let isQuantityFormat = false;

                    if (colMap.dataFin >= 0) {
                        const rawDateFin = row[colMap.dataFin];
                        if (typeof rawDateFin === 'number') {
                            if (rawDateFin > 30000) {
                                dateFin = excelDateToJSDate(rawDateFin);
                            } else if (rawDateFin > 0) {
                                isFinalizado = true;
                                isQuantityFormat = true;
                            }
                        }
                        else if (rawDateFin instanceof Date) {
                            dateFin = rawDateFin;
                        }
                        else if (typeof rawDateFin === 'string' && rawDateFin.trim()) {
                            const trimmed = rawDateFin.trim();
                            const numStr = Number(trimmed);
                            if (!isNaN(numStr) && numStr > 0 && numStr < 30000) {
                                isFinalizado = true;
                                isQuantityFormat = true;
                            } else {
                                dateFin = parseStringDate(trimmed);
                                if (!dateFin && (norm(trimmed) === 'sim' || norm(trimmed) === 'ok')) isFinalizado = true;
                            }
                        }
                    }
                    
                    // Fallback: se houver indicativo que foi finalizado (status, quantidade ou booleano),
                    // mas não houver data explícita, adotaremos a data de recepção para a consistência
                    if (!dateFin && (isFinalizado || isQuantityFormat) && dateRec) {
                        dateFin = dateRec;
                    }
                    const dateFinISO = dateFin ? dateFin.toISOString() : null;

                    const finalCliente = (tomadorVal && clienteVal && tomadorVal !== clienteVal)
                        ? `${tomadorVal}|||${clienteVal}`
                        : (tomadorVal || clienteVal || 'NÃO INFORMADO');
                    const aggKey = `${os}`;

                    if (aggregatedMap.has(aggKey)) {
                        const existing = aggregatedMap.get(aggKey)!;
                        existing.total_amostras += am;
                        existing.horas += Math.floor(horasVal);
                        // Atualiza finalização se antes estava vazia
                        if (!existing.data_finalizacao && dateFinISO) {
                            existing.data_finalizacao = dateFinISO;
                            if (revisor && !existing.revisor) existing.revisor = revisor;
                        }
                    } else {
                        aggregatedMap.set(aggKey, {
                            id: crypto.randomUUID(),
                            os_numero: os,
                            romaneio: rom,
                            cliente: finalCliente,
                            tomador: tomadorVal || 'NÃO INFORMADO',
                            fazenda: clienteVal || 'NÃO INFORMADO',
                            data_registro: null,
                            data_recepcao: dateRecISO,
                            data_acondicionamento: null,
                            data_finalizacao: dateFinISO,
                            revisor: revisor,
                            status: status,
                            total_amostras: am,
                            peso_mala: Math.floor(Number(row[colMap.pMala]) || 0),
                            peso_medio: Math.floor(Number(row[colMap.pMedio]) || 0),
                            horas: Math.floor(horasVal),
                            nota_fiscal: '',
                            fatura: ''
                        });
                    }
                    totalVolume += am;
                }

                const aggregatedData = Array.from(aggregatedMap.values());
                console.log(`[StatusOSParser] Finalizado. Amostras: ${totalVolume}, O.S.: ${aggregatedData.length}`);

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
                console.error('[StatusOSParser] Erro Fatal:', error);
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};

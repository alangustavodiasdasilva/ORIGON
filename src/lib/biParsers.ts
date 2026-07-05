import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export const parseAndInsertBIFile = async (
    file: File,
    labId: string,
    safra: string,
    modelType: string,
    onProgress?: (msg: string) => void
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                
                if (rows.length === 0) throw new Error("A planilha está vazia.");

                // Deletar os dados antigos desse laboratório e dessa safra específica (em loop por causa do limite do Supabase)
                const tableName = `bi_${modelType === 'relatorio_verificacao' ? 'verificacao' : modelType}`;
                if (onProgress) onProgress(`Limpando dados antigos da tabela ${tableName} para a safra ${safra}...`);
                
                let hasMoreToDelete = true;
                while (hasMoreToDelete) {
                    const { data: deletedRows, error: deleteError } = await supabase
                        .from(tableName)
                        .delete()
                        .eq('lab_id', labId)
                        .eq('safra', safra)
                        .select('id')
                        .limit(1000);
                        
                    if (deleteError) throw new Error(`Falha ao limpar dados antigos: ${deleteError.message}`);
                    if (!deletedRows || deletedRows.length === 0) {
                        hasMoreToDelete = false;
                    }
                }

                const rowsToInsert: any[] = [];

                if (modelType === 'producao_hvi') {
                    // Uses producaoParser.ts logic
                    const { parseProducaoFileInChunks } = await import('./producaoParser');
                    await parseProducaoFileInChunks(file, labId, async (batch) => {
                        const chunkToInsert = batch.map(b => ({
                            lab_id: labId,
                            safra: safra,
                            data: b.data_producao,
                            turno: b.turno,
                            maquina: b.produto, // no modo matriz, produto contém o nome da máquina
                            amostras: b.peso
                        }));
                        const { error } = await supabase.from('bi_producao_hvi').insert(chunkToInsert);
                        if (error) throw new Error(`Erro ao inserir dados: ${error.message}`);
                    });
                } else if (modelType === 'producao_operador') {
                    // Produção Operador
                    let headerRow = -1;
                    let colData = -1, colTurno = -1, colOperador = -1;

                    for (let i = 0; i < Math.min(30, rows.length); i++) {
                        const row = rows[i];
                        if (!row) continue;
                        const sRow = row.map(c => String(c || '').toUpperCase().trim());
                        
                        colData = sRow.findIndex(s => s === 'DATA');
                        colTurno = sRow.findIndex(s => s === 'TURNO');
                        colOperador = sRow.findIndex(s => s === 'OPERADOR' || s === 'ANALISTA');

                        if (colData !== -1 && colOperador !== -1) {
                            headerRow = i;
                            break;
                        }
                    }

                    if (headerRow === -1) throw new Error("Cabeçalhos não encontrados na planilha de Produção Operador.");

                    let currentData: string | null = null;
                    let currentTurno: string | null = null;

                    for (let i = headerRow + 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;

                        if (row.join(" ").toUpperCase().includes("TOTAL")) continue;

                        // Atualiza a Data se existir na linha
                        if (row[colData] !== undefined && row[colData] !== null && String(row[colData]).trim() !== "") {
                            if (typeof row[colData] === 'number') {
                                const d = XLSX.SSF.parse_date_code(row[colData]);
                                currentData = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')} ${String(d.H).padStart(2, '0')}:${String(d.M).padStart(2, '0')}:${String(d.S).padStart(2, '0')}`;
                            } else if (row[colData] instanceof Date) {
                                currentData = row[colData].toISOString();
                            } else {
                                currentData = String(row[colData]);
                            }
                        }

                        // Atualiza o Turno se existir na linha
                        if (row[colTurno] !== undefined && row[colTurno] !== null && String(row[colTurno]).trim() !== "") {
                            currentTurno = String(row[colTurno]);
                        }

                        // Pega o Operador
                        const operador = row[colOperador] !== undefined && row[colOperador] !== null ? String(row[colOperador]) : null;

                        // Se não tem operador nesta linha, ignora
                        if (!operador || operador.trim() === "") continue;

                        // Acha o próximo número (Amostras) depois da coluna Operador
                        let amostrasVal = 0;
                        for (let c = colOperador + 1; c < row.length; c++) {
                            const raw = row[c];
                            if (typeof raw === 'number') {
                                amostrasVal = raw;
                                break;
                            } else if (typeof raw === 'string' && raw.trim() !== '') {
                                const parsed = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
                                if (!isNaN(parsed)) {
                                    amostrasVal = parsed;
                                    break;
                                }
                            }
                        }

                        if (amostrasVal > 0 && currentData && currentTurno) {
                            rowsToInsert.push({
                                lab_id: labId,
                                safra: safra,
                                data: currentData,
                                turno: currentTurno,
                                operador: operador,
                                amostras: amostrasVal
                            });
                        }
                    }

                    if (rowsToInsert.length > 0) {
                        const { error } = await supabase.from('bi_producao_operador').insert(rowsToInsert);
                        if (error) throw new Error(`Erro ao inserir Produção Operador: ${error.message}`);
                    }

                } else if (modelType === 'status_os') {
                    // Status OS
                    const expectedCols = [
                        'Laboratório', 'Contrato', 'Tomador', 'Cliente', 'Fazenda', 
                        'Variedade', 'Usina', 'O.S.', 'Romaneio', 'Inicial', 'Final', 
                        'Amostras', 'Protocolo', 'Nota Fiscal', 'Fatura', 'Status', 
                        'Registrado', 'Recepção', 'Acondicionado', 'Finalizado', 
                        'Revisor', 'Horas', 'Peso Mala', 'Peso Médio Amostra'
                    ];

                    let headerRow = -1;
                    for (let i = 0; i < Math.min(50, rows.length); i++) {
                        const row = rows[i];
                        if (!row) continue;
                        // Forca conversao para string de todos os valores da linha
                        const sRow = row.map(c => String(c || '').toUpperCase().trim());
                        if (sRow.includes('O.S.') || sRow.includes('ROMANEIO') || sRow.includes('O.S') || sRow.includes('OS')) {
                            headerRow = i;
                            break;
                        }
                    }

                    if (headerRow === -1) {
                        const debugInfo = JSON.stringify(rows.slice(0, 15).map(r => r.filter(Boolean)));
                        throw new Error(`Cabeçalhos não encontrados na planilha de Status OS. Dados lidos: ${debugInfo.substring(0, 300)}...`);
                    }

                    const headers = rows[headerRow] as string[];
                    const colMap: Record<string, number> = {};
                    expectedCols.forEach(col => {
                        const idx = headers.findIndex(h => typeof h === 'string' && h.toLowerCase().trim() === col.toLowerCase().trim());
                        if (idx !== -1) colMap[col] = idx;
                    });

                    for (let i = headerRow + 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;

                        const getVal = (col: string) => row[colMap[col]] !== undefined && row[colMap[col]] !== null ? String(row[colMap[col]]) : null;
                        const getNum = (col: string) => {
                            const val = row[colMap[col]];
                            if (typeof val === 'number') return val;
                            return null;
                        };
                        const getDateVal = (col: string) => {
                            const val = row[colMap[col]];
                            if (val === undefined || val === null || val === '') return null;
                            if (typeof val === 'number' && val > 30000) {
                                const d = XLSX.SSF.parse_date_code(val);
                                return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')} ${String(d.H).padStart(2, '0')}:${String(d.M).padStart(2, '0')}:${String(d.S).padStart(2, '0')}`;
                            }
                            if (val instanceof Date) return val.toISOString();
                            return String(val);
                        };

                        rowsToInsert.push({
                            lab_id: labId,
                            safra: safra,
                            laboratorio: getVal('Laboratório'),
                            contrato: getVal('Contrato'),
                            tomador: getVal('Tomador'),
                            cliente: getVal('Cliente'),
                            fazenda: getVal('Fazenda'),
                            variedade: getVal('Variedade'),
                            usina: getVal('Usina'),
                            os_numero: getVal('O.S.'),
                            romaneio: getVal('Romaneio'),
                            inicial: getVal('Inicial'),
                            final: getVal('Final'),
                            amostras: getNum('Amostras'),
                            protocolo: getVal('Protocolo'),
                            nota_fiscal: getVal('Nota Fiscal'),
                            fatura: getVal('Fatura'),
                            status: getVal('Status'),
                            registrado: getDateVal('Registrado'),
                            recepcao: getDateVal('Recepção'),
                            acondicionado: getDateVal('Acondicionado'),
                            finalizado: getDateVal('Finalizado'),
                            revisor: getVal('Revisor'),
                            horas: getVal('Horas'),
                            peso_mala: getNum('Peso Mala'),
                            peso_medio_amostra: getNum('Peso Médio Amostra')
                        });
                    }

                    if (rowsToInsert.length > 0) {
                        const chunkSize = 1000;
                        for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
                            const chunk = rowsToInsert.slice(i, i + chunkSize);
                            const { error } = await supabase.from('bi_status_os').insert(chunk);
                            if (error) throw new Error(`Erro ao inserir Status OS: ${error.message}`);
                        }
                    }

                } else if (modelType === 'relatorio_verificacao') {
                    // Verificacao
                    let headerRow = -1;
                    for (let i = 0; i < Math.min(20, rows.length); i++) {
                        if (rows[i] && rows[i].some(c => typeof c === 'string' && c.toLowerCase().includes('etiqueta'))) {
                            headerRow = i;
                            break;
                        }
                    }

                    if (headerRow === -1) throw new Error("Cabeçalhos não encontrados na planilha de Verificação.");
                    const cols = rows[headerRow] as string[];

                    for (let i = headerRow + 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0) continue;

                        const record: any = { lab_id: labId, safra: safra };
                        cols.forEach((colName, idx) => {
                            if (colName && colName !== '') {
                                // Mapeia para o nome do banco
                                let dbCol = colName.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                                dbCol = dbCol.replace(/^_+|_+$/g, ''); // Remove underscores repetidos nas pontas
                                
                                if (dbCol.length > 0) {
                                    const val = row[idx];
                                    if (val instanceof Date) {
                                        record[dbCol] = val.toISOString();
                                    } else if (typeof val === 'number' && ['data', 'entrada', 'analise'].includes(dbCol) && val > 30000) {
                                        const d = XLSX.SSF.parse_date_code(val);
                                        record[dbCol] = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')} ${String(d.H).padStart(2, '0')}:${String(d.M).padStart(2, '0')}:${String(d.S).padStart(2, '0')}`;
                                    } else {
                                        record[dbCol] = val !== undefined && val !== null ? String(val) : null;
                                    }
                                }
                            }
                        });

                        if (Object.keys(record).length > 2) {
                            rowsToInsert.push(record);
                        }
                    }

                    if (rowsToInsert.length > 0) {
                        const chunkSize = 1000;
                        for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
                            const chunk = rowsToInsert.slice(i, i + chunkSize);
                            const { error } = await supabase.from('bi_verificacao').insert(chunk);
                            if (error) throw new Error(`Erro ao inserir Verificacao: ${error.message}`);
                        }
                    }
                }

                // Atualizar status de importacao geral (Checkpoint)
                const { data: existingCheck } = await supabase
                    .from('bi_arquivos')
                    .select('id')
                    .eq('lab_id', labId)
                    .eq('tipo_planilha', modelType)
                    .eq('safra', safra)
                    .maybeSingle();

                if (existingCheck && existingCheck.id) {
                    const { error: updateErr } = await supabase
                        .from('bi_arquivos')
                        .update({ updated_at: new Date().toISOString() })
                        .eq('id', existingCheck.id);
                    if (updateErr) console.warn("Erro ao atualizar checkpoint:", updateErr);
                } else {
                    const { error: insertErr } = await supabase
                        .from('bi_arquivos')
                        .insert({ 
                            lab_id: labId, 
                            tipo_planilha: modelType,
                            safra: safra,
                            updated_at: new Date().toISOString() 
                        });
                    if (insertErr) console.warn("Erro ao inserir checkpoint:", insertErr);
                }

                resolve();
            } catch (err: any) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
        reader.readAsArrayBuffer(file);
    });
};

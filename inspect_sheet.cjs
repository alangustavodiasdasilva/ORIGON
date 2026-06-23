// Script para diagnosticar o problema da planilha de Status OS
const XLSX = require('xlsx');
const fs = require('fs');

const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
console.log('Arquivos encontrados:', files.join('\n  '));
console.log('');

files.forEach(filePath => {
    console.log('========================================');
    console.log('Analisando:', filePath);
    console.log('========================================');

    try {
        const buf = fs.readFileSync(filePath);
        const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
        console.log('Sheets:', wb.SheetNames.join(', '));

        wb.SheetNames.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            const raw = XLSX.utils.sheet_to_json(ws, { raw: false, header: 1, defval: '' });
            console.log(`\n--- Aba: "${sheetName}" | ${raw.length} linhas ---`);

            // Mostrar primeiras 10 linhas
            for (let i = 0; i < Math.min(10, raw.length); i++) {
                const row = raw[i];
                const cells = row.filter(c => String(c || '').trim() !== '');
                if (cells.length > 0) {
                    console.log(`  L${i + 1}: ${JSON.stringify(cells).substring(0, 300)}`);
                }
            }

            // Buscar linha de cabeçalho (com O.S., Cliente, Tomador, Recepção, Amostras)
            let headerIdx = -1;
            for (let i = 0; i < Math.min(50, raw.length); i++) {
                const rowStr = JSON.stringify(raw[i] || []).toLowerCase();
                const matchCount = ['o.s.', 'os', 'cliente', 'tomador', 'recep', 'amostr'].filter(k => rowStr.includes(k)).length;
                if (matchCount >= 2) {
                    headerIdx = i;
                    console.log(`\n  >>> CABEÇALHO detectado na L${i + 1}: ${JSON.stringify(raw[i]).substring(0, 500)}`);
                    break;
                }
            }

            if (headerIdx >= 0) {
                const rows = XLSX.utils.sheet_to_json(ws, { raw: false, range: headerIdx, defval: '' });
                const cols = Object.keys(rows[0] || {});
                console.log(`\n  Colunas (range a partir de L${headerIdx + 1}):`, cols.join(' | '));
                console.log('  Total de linhas de dados:', rows.length);

                // Amostras column detection
                const amostrasKey = cols.find(k => ['amostras', 'qtde', 'quantidade', 'total amostras'].includes(k.toLowerCase().trim()));
                const recepcaoKey = cols.find(k => k.toLowerCase().includes('recep'));
                const clienteKey = cols.find(k => k.toLowerCase().trim() === 'cliente');
                const tomadorKey = cols.find(k => k.toLowerCase().trim() === 'tomador');
                const osKey = cols.find(k => ['o.s.', 'os', 'ordem de serviço'].includes(k.toLowerCase().trim()));

                console.log(`\n  Chaves identificadas:`);
                console.log(`    O.S.: "${osKey}" | Cliente: "${clienteKey}" | Tomador: "${tomadorKey}" | Recepção: "${recepcaoKey}" | Amostras: "${amostrasKey}"`);

                if (amostrasKey) {
                    let totalAmostras = 0;
                    let totalValidos = 0;
                    let totalRejeitados = 0;
                    const motivosRejeicao = {};

                    rows.forEach((row, idx) => {
                        const os = row[osKey];
                        const cli = row[clienteKey];
                        const rec = row[recepcaoKey];
                        const am = row[amostrasKey];

                        // parseNum exatamente como o sistema faz
                        const parseNum = (val) => {
                            if (typeof val === 'number') return val;
                            if (!val) return 0;
                            const str = String(val).replace(/\./g, '').replace(',', '.').trim();
                            const n = parseFloat(str);
                            return isNaN(n) ? 0 : n;
                        };

                        const amNum = parseNum(am);

                        let erros = [];
                        if (!os) erros.push('OS ausente');
                        if (!cli) erros.push('Cliente ausente');
                        if (!rec) erros.push('Recepção ausente');
                        if (amNum <= 0) erros.push(`Amostras=${am}(→${amNum})`);

                        if (erros.length > 0) {
                            totalRejeitados++;
                            const key = erros.join(' | ');
                            motivosRejeicao[key] = (motivosRejeicao[key] || 0) + 1;
                        } else {
                            totalValidos++;
                            totalAmostras += amNum;
                        }
                    });

                    console.log(`\n  === RESULTADO (igual ao parser do sistema) ===`);
                    console.log(`  Total Amostras (válidas): ${totalAmostras.toLocaleString('pt-BR')}`);
                    console.log(`  Registros válidos: ${totalValidos}`);
                    console.log(`  Registros rejeitados: ${totalRejeitados}`);
                    console.log(`  Motivos de rejeição:`);
                    Object.entries(motivosRejeicao).sort(([, a], [, b]) => b - a).slice(0, 10).forEach(([motivo, count]) => {
                        console.log(`    ${count}x: ${motivo}`);
                    });

                    // Mostrar sample de rows rejeitadas
                    let shown = 0;
                    console.log(`\n  Exemplos de rows rejeitadas:`);
                    rows.some((row, idx) => {
                        const os = row[osKey];
                        const cli = row[clienteKey];
                        const rec = row[recepcaoKey];
                        const am = row[amostrasKey];
                        const amNum = am ? parseFloat(String(am).replace(/\./g, '').replace(',', '.')) : 0;
                        if (!os || !cli || !rec || amNum <= 0) {
                            console.log(`    Row${idx}: OS="${os}" | Cli="${cli}" | Rec="${rec}" | Am="${am}"→${amNum}`);
                            shown++;
                        }
                        return shown >= 5;
                    });
                } else {
                    console.log('  AVISO: Coluna de Amostras NÃO encontrada!');
                    console.log('  Todas as colunas:', cols);
                }
            } else {
                console.log('\n  AVISO: Cabeçalho não detectado com keywords padrão.');
                console.log('  Testando range=6 (como o sistema usa por padrão):');
                const rowsRange6 = XLSX.utils.sheet_to_json(ws, { raw: false, range: 6, defval: '' });
                console.log('  Rows com range=6:', rowsRange6.length);
                if (rowsRange6.length > 0) {
                    console.log('  Colunas:', Object.keys(rowsRange6[0]).join(' | '));
                }
            }
        });
    } catch (e) {
        console.error('Erro ao processar arquivo:', e.message);
    }
});

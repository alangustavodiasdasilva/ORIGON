import fs from 'fs';
import * as XLSX from 'xlsx';

const filePath = 'c:/Users/alang/OneDrive/Desktop/analise abrapa/docde exempli/Produção_HVI_Turno-177.xlsx';
const outPath = 'c:/Users/alang/OneDrive/Desktop/analise abrapa/excel_dump.json';

try {
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const result = {
        sheets: wb.SheetNames,
        data: {}
    };

    wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        // Read potentially up to 50 rows to see structure
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, blankrows: false }).slice(0, 50);
        result.data[sheetName] = rows;
    });

    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log('Dump written to ' + outPath);

} catch (e) {
    console.error('Error:', e);
}

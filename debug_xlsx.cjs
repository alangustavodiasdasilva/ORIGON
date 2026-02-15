const XLSX = require('xlsx');
const fs = require('fs');

try {
    const buf = fs.readFileSync('temp_producao.xlsx');
    console.log("File size:", buf.length);
    console.log("First 4 bytes:", buf.slice(0, 4).toString('hex'));

    const workbook = XLSX.read(buf, { type: 'buffer' });
    console.log("SheetNames:", workbook.SheetNames);

    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log("Rows count:", data.length);
    console.log("First row:", JSON.stringify(data[0]));
} catch (e) {
    console.error("FAILED:");
    console.error(e.message);
    console.error(e.stack);
}

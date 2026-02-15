const XLSX = require('xlsx');

const dest = 'docde exempli/Produção_HVI_Turno-177 (1).xlsx';

const inspect = () => {
    try {
        const workbook = XLSX.readFile(dest);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const fs = require('fs');
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        let output = "";
        output += "--- Scanning for Header (1, 2, 3...) ---\n";
        for (let i = 0; i < 50; i++) {
            const row = rows[i] || [];
            const nums = row.filter(c => typeof c === 'number' && c > 0 && c < 50);
            if (nums.length > 5) {
                output += `Potential Header Found at Row ${i}: ${JSON.stringify(row)}\n`;
                break;
            }
        }
        output += "--- First 50 Rows with Indices ---\n";
        rows.slice(0, 50).forEach((row, index) => {
            output += `Row ${index}: ${JSON.stringify(row)}\n`;
        });
        fs.writeFileSync('inspection_output.txt', output);
        console.log("Output written to inspection_output.txt");
    } catch (err) {
        console.error("Error:", err);
    }
};

inspect();

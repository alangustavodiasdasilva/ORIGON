const XLSX = require('xlsx');
const fs = require('fs');

// Altere o caminho para o arquivo que o usuário está enviando, se souber. 
// Geralmente fica nos downloads ou desktop.
const filePath = 'c:/Users/alang/Downloads/PLANILHA.xlsx'; // Exemplo

function inspect(path) {
    if (!fs.existsSync(path)) {
        console.log(`Arquivo não encontrado em ${path}`);
        return;
    }
    const workbook = XLSX.readFile(path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Pega as primeiras 100 linhas para análise
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, defval: "" }).slice(0, 100);
    
    console.log("--- COLUNAS ENCONTRADAS (Primeiras linhas) ---");
    data.forEach((row, i) => {
        if (i < 10) console.log(`Linha ${i}:`, row.join(" | "));
    });
}

// Tenta achar arquivos .xlsx no Desktop ou Downloads do usuário
const base = 'c:/Users/alang/OneDrive/Desktop/';
const files = fs.readdirSync(base).filter(f => f.endsWith('.xlsx'));
console.log("Arquivos encontrados:", files);

if (files.length > 0) {
    inspect(base + files[0]);
}

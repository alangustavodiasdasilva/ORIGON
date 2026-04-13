const parseNum = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).trim();
    
    // Heurística de Separação Numérica:
    // 1. Se tem vírgula e ponto (ex: 1.234,56): Ponto é milhar, vírgula é decimal.
    if (str.includes(',') && str.includes('.')) {
        return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    }
    
    // 2. Se tem apenas vírgula (ex: 1234,56 ou 1,5): Vírgula é decimal.
    if (str.includes(',')) {
        return parseFloat(str.replace(',', '.'));
    }
    
    // 3. Se tem apenas ponto (ex: 1.234 ou 147.000): 
    // Verificamos a posição do ponto. Se estiver no final (ex: .50) é decimal.
    if (str.includes('.')) {
        const parts = str.split('.');
        // Se a última parte tem 3 dígitos, provavelmente é milhar (1.234)
        // A menos que seja algo como 0.500
        if (parts[parts.length - 1].length === 3 && parts[0].length >= 1) {
            return parseFloat(str.replace(/\./g, ''));
        }
        return parseFloat(str);
    }
    
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
};

const tests = [
    "147000",
    "147.000",
    "1.234.567",
    "1,23",
    "1.234,56",
    "1234.56",
    "0.500",
    "100.5",
    "1.50"
];

tests.forEach(t => {
    console.log(`Input: ${t} -> Result: ${parseNum(t)}`);
});

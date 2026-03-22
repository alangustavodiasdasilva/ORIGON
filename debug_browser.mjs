import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('pageerror', err => {
            console.error('CRASH FATAL NA PAGINA:', err.message, err.stack);
        });

        page.on('console', msg => {
            if (msg.type() === 'error') {
               console.error('ERRO CONSOLE:', msg.text());
            } else if (msg.type() === 'warning') {
               console.warn('WARN CONSOLE:', msg.text());
            } else {
               console.log('LOG CONSOLE:', msg.text());
            }
        });

        console.log("Acessando a página...");
        await page.goto('http://localhost:5173/ORIGON/', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Espera pra dar tempo de quebrar o React
        await new Promise(r => setTimeout(r, 4000));
        
        const rootContent = await page.$eval('#root', el => el.innerHTML);
        console.log("Tamanho do DOM renderizado:", rootContent.length);
        if (rootContent.length < 50) {
            console.log("A TELA ESTA BRANCA.");
        }

        await browser.close();
    } catch (err) {
        console.error("Erro na execução do script puppeteer", err);
    }
})();

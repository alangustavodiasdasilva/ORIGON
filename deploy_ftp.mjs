import ftp from "basic-ftp";
import fs from "fs";

async function upload() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Conectando ao FTP...");
        await client.access({
            host: "147.79.84.129",
            user: "u716118284",
            password: "Bureau@@2025",
            secure: false
        });
        
        console.log("Conectado! Acessando pasta public_html...");
        await client.ensureDir("public_html");
        
        console.log("Enviando os arquivos da pasta dist...");
        await client.uploadFromDir("dist");
        
        console.log("Upload concluído com sucesso!");
    }
    catch(err) {
        console.error("Erro no FTP:", err);
    }
    client.close();
}

upload();

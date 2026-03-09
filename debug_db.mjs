import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Tenta ler do .env se existir
if (fs.existsSync('.env')) {
    dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontradas.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
    console.log("--- Verificando Tabela status_os_hvi ---");

    // 1. Contador Total
    const { count, error: countError } = await supabase
        .from('status_os_hvi')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error("Erro ao contar registros:", countError);
    } else {
        console.log("Total de registros no banco:", count);
    }

    // 2. Amostra de dados (para ver o formato das colunas)
    const { data: sample, error: sampleError } = await supabase
        .from('status_os_hvi')
        .select('*')
        .limit(1);

    if (sampleError) {
        console.error("Erro ao buscar amostra:", sampleErrorError);
    } else if (sample && sample.length > 0) {
        console.log("Amostra de um registro:", JSON.stringify(sample[0], null, 2));
    } else {
        console.log("Tabela está vazia.");
    }

    // 3. Verificar se há registros com datas vazias que podem causar erro
    // Na verdade, queremos ver se existem strings "" em vez de NULL
    // Mas o erro acontece no INSERT.
}

checkDatabase();

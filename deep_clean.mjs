import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
    dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAndVerify() {
    console.log("Iniciando limpeza profunda do Supabase...");

    // Deletar tudo. Usamos um filtro que sempre é verdadeiro para forçar o delete em todas as linhas
    const { data, error: delError } = await supabase
        .from('status_os_hvi')
        .delete()
        .neq('cliente', 'LINHA_QUE_NAO_EXISTE_123456789'); // Filtro 'catch-all'

    if (delError) {
        console.error("Erro ao deletar:", delError);
        return;
    }

    // Verificar se sobrou algo
    const { count, error: countError } = await supabase
        .from('status_os_hvi')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error("Erro ao contar:", countError);
    } else {
        console.log(`Limpeza concluída. Total de registros agora: ${count}`);
    }
}

clearAndVerify();

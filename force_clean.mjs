import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
    dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanAndCheck() {
    console.log("--- Limpando Tabela status_os_hvi ---");

    // 1. Tentar deletar tudo
    const { error: delError } = await supabase
        .from('status_os_hvi')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (delError) console.error("Erro ao deletar:", delError);
    else console.log("Deleção concluída.");

    // 2. Contar novamente
    const { count, error: countError } = await supabase
        .from('status_os_hvi')
        .select('*', { count: 'exact', head: true });

    console.log("Total de registros após limpeza:", count);
}

cleanAndCheck();

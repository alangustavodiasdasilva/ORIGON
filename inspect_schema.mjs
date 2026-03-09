import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
    dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log("--- Inspecionando colunas de status_os_hvi ---");

    // Podemos usar a API de rpc ou tentar um erro proposital para ver as colunas
    // Mas uma forma melhor é consultar information_schema se tivermos permissão
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'status_os_hvi' });

    if (error) {
        // Se RPC não existir, tentamos via query direta (pode falhar por RLS)
        console.log("RPC falhou, tentando query direta no information_schema...");
        const { data: cols, error: err2 } = await supabase.from('information_schema.columns')
            .select('column_name, data_type, is_nullable')
            .eq('table_name', 'status_os_hvi');

        if (err2) {
            console.error("Não foi possível acessar information_schema:", err2);
        } else {
            console.log("Colunas:", cols);
        }
    } else {
        console.log("Colunas (via RPC):", data);
    }
}

inspectSchema();

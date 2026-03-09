import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
    dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Checando Supabase...");
    const { data, error, count } = await supabase
        .from('status_os_hvi')
        .select('*', { count: 'exact' })
        .limit(5);

    if (error) {
        console.error("Erro no Supabase:", error);
        return;
    }

    console.log(`Total real no Supabase: ${count}`);
    if (data && data.length > 0) {
        console.log("Primeiras 5 linhas:", JSON.stringify(data, null, 2));
    }

    console.log("Checando LocalStorage mockado (se existisse no Node)...");
}

inspect();

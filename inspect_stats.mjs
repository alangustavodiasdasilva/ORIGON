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
    const { data, error, count } = await supabase
        .from('status_os_hvi')
        .select('lab_id, total_amostras', { count: 'exact' });

    if (error) {
        console.error("Erro:", error);
        return;
    }

    console.log(`Total de linhas no banco: ${count}`);
    const sum = data.reduce((acc, curr) => acc + (curr.total_amostras || 0), 0);
    console.log(`Soma total de amostras no banco: ${sum}`);

    // Agrupar por lab_id
    const labs = {};
    data.forEach(d => {
        labs[d.lab_id] = (labs[d.lab_id] || 0) + (d.total_amostras || 0);
    });
    console.log("Soma por Lab ID:", labs);
}

inspect();

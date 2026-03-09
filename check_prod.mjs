import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data, error } = await supabase.from('producao_hvi').select('*');
    if (error) { console.error(error); return; }

    const medias = data.filter(d => JSON.stringify(d).toLowerCase().includes('media') || JSON.stringify(d).toLowerCase().includes('média'));
    console.log("Found Media records in Prod DB:", medias.length);
    if (medias.length > 0) {
        console.log("Sample:", medias[0]);
    }
}
check();

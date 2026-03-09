import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data, error } = await supabase.from('status_os_hvi').select('revisor').not('revisor', 'is', null);
    if (error) { console.error(error); return; }

    const uniqueRevisores = Array.from(new Set(data.map(d => d.revisor)));
    console.log("Distinct Revisores:", uniqueRevisores);
}
check();

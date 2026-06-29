import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: lotes } = await supabase.from('lotes').select('*').order('updated_at', { ascending: false }).limit(1);
    if (!lotes || lotes.length === 0) return console.log('No lotes found');
    const lote = lotes[0];
    console.log('Latest Lote updated at:', lote.updated_at);
    console.log('Configuracoes:', JSON.stringify(lote.configuracoes_analise, null, 2));
}
check();

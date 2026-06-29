import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: lotes } = await supabase.from('lotes').select('*').limit(1);
    if (!lotes || lotes.length === 0) return console.log('No lotes found');
    const lote = lotes[0];
    console.log('Lote:', lote.id);
    console.log('Configuracoes:', lote.configuracoes_analise);
    
    // Try to update using ANON key (will fail if RLS requires auth)
    const { data, error } = await supabase.from('lotes').update({ configuracoes_analise: { ...lote.configuracoes_analise, test: 1 } }).eq('id', lote.id).select();
    console.log('Update result:', error ? error.message : data);
}
check();

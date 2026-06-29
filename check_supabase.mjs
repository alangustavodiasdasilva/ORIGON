import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLock() {
    const { data: samples, error: err1 } = await supabase.from('amostras').select('*').limit(1);
    if (err1) { console.error("Fetch err", err1); return; }
    
    if (samples.length === 0) { console.log("No samples"); return; }
    const sample = samples[0];
    console.log("Original locked:", sample.locked);
    
    const { data: updated, error: err2 } = await supabase.from('amostras').update({ locked: true }).eq('id', sample.id).select().single();
    if (err2) { console.error("Update err", err2); return; }
    
    console.log("Updated locked:", updated.locked);
}
testLock();

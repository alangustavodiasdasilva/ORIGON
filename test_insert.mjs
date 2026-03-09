import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env')) {
    dotenv.config();
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const labId = 'a5fb27a7-cd77-44d2-b673-0b2a7fef61bc';
    const now = new Date().toISOString();

    console.log("--- Testando Inserção com String Vazia ---");
    const { error: err1 } = await supabase.from('status_os_hvi').upsert({
        id: crypto.randomUUID(),
        lab_id: labId,
        os_numero: 'TEST_EMPTY',
        data_registro: '', // Isso deve falhar se for timestamp
        created_at: now
    });
    console.log("Resultado (String Vazia):", err1 ? err1.message : "Sucesso");

    console.log("--- Testando Inserção com NULL ---");
    const { error: err2 } = await supabase.from('status_os_hvi').upsert({
        id: crypto.randomUUID(),
        lab_id: labId,
        os_numero: 'TEST_NULL',
        data_registro: null, // Isso deve funcionar
        created_at: now
    });
    console.log("Resultado (NULL):", err2 ? err2.message : "Sucesso");
}

testInsert();

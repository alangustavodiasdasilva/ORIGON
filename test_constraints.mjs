import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
  // Query information_schema for constraints on 'maquinas' table
  const { data, error } = await supabase.rpc('run_sql', {
    sql: `
      SELECT conname, pg_get_constraintdef(c.oid) AS consrc 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'maquinas';
    `
  });

  if (error) {
    // If we can't run raw SQL, let's just try to insert machine 8 and catch the exact error
    console.log("Trying to insert machine 8 to see the error:");
    const { data: m, error: e } = await supabase.from('maquinas').insert([{
        identificacao: '8',
        numero_serie: '886',
        modelo: 'USTER',
        lab_id: '15d31599-4d64-4e9b-b235-95a9477e0964' // just a dummy or null
    }]);
    console.log(e);
  } else {
    console.log(data);
  }
}

checkConstraints();

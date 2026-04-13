import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
   const { data, error } = await supabase
     .from('auditoria_documentos')
     .select('*')
     .limit(1);
     
   if (error) {
      console.error("Error fetching data:", error);
   } else {
      console.log("Columns found in auditoria_documentos:");
      if (data && data.length > 0) {
         console.log(Object.keys(data[0]));
      } else {
         console.log("Table is empty, trying to insert a dummy record to see schema error or via RPC...");
         const { error: insertErr } = await supabase.from('auditoria_documentos').insert([{ id: 'dummy-id-to-fail' }]);
         console.log("Insert Error:", insertErr);
      }
   }
}

checkSchema();

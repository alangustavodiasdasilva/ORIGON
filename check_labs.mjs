import { createClient } from '@supabase/supabase-js';

const VITE_SUPABASE_URL = "https://xzooieduvylbrpptodth.supabase.co"
const VITE_SUPABASE_ANON_KEY = "sb_publishable_fqd3zGYVcqP3XDwClfqF7g_KRCce9Za"

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function checkLabs() {
    const { data: labs, error } = await supabase.from('laboratorios').select('*');
    if (error) {
        console.error("Error fetching labs:", error);
    } else {
        console.log("Labs in DB:");
        console.log(JSON.stringify(labs, null, 2));
    }
}

checkLabs();

import { createClient } from '@supabase/supabase-js';

const VITE_SUPABASE_URL = "https://xzooieduvylbrpptodth.supabase.co"
const VITE_SUPABASE_ANON_KEY = "sb_publishable_fqd3zGYVcqP3XDwClfqF7g_KRCce9Za"

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function deleteLab() {
    const { error } = await supabase.from('laboratorios').delete().eq('id', 'c2b7549c-e1a3-4669-b6d7-714d4d0bbe28');
    if (error) {
        console.error("Error deleting lab:", error);
    } else {
        console.log("Lab deleted successfully.");
    }
}

deleteLab();

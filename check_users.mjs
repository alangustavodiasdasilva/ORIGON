import { createClient } from '@supabase/supabase-js';

const VITE_SUPABASE_URL = "https://xzooieduvylbrpptodth.supabase.co"
const VITE_SUPABASE_ANON_KEY = "sb_publishable_fqd3zGYVcqP3XDwClfqF7g_KRCce9Za"

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function checkUsers() {
    const { data: users, error } = await supabase.from('analistas').select('*');
    if (error) {
        console.error("Error fetching users:", error);
    } else {
        console.log("Users in DB:");
        console.log(JSON.stringify(users, null, 2));
    }
}

checkUsers();

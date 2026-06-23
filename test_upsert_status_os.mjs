import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xzooieduvylbrpptodth.supabase.co';
const supabaseKey = 'sb_publishable_fqd3zGYVcqP3XDwClfqF7g_KRCce9Za';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpsert() {
    const data = {
        // use a real UUID manually generated or crypto.randomUUID()
        id: crypto.randomUUID(),
        os_numero: "TEST-123",
        romaneio: "123",
        cliente: "Test Client",
        lab_id: "a5fb27a7-cd77-44d2-b673-0b2a7fef61bc"
    };

    console.log("Testing upsert with onConflict os_numero,lab_id");
    let res = await supabase.from('status_os_hvi').upsert([data], { onConflict: 'os_numero,lab_id' });
    console.log("Response 1:", res.error?.message || "Success", res.error?.details || "");

    console.log("Testing upsert with onConflict os_numero");
    res = await supabase.from('status_os_hvi').upsert([data], { onConflict: 'os_numero' });
    console.log("Response 2:", res.error?.message || "Success", res.error?.details || "");

    console.log("Testing upsert with onConflict id");
    res = await supabase.from('status_os_hvi').upsert([data], { onConflict: 'id' });
    console.log("Response 3:", res.error?.message || "Success", res.error?.details || "");
}

testUpsert();

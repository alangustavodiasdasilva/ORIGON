import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data: lotes } = await supabase.from('lotes').select('id').limit(1);
    if (!lotes || lotes.length === 0) return console.log('No lotes found');
    const loteId = lotes[0].id;
    
    let received = false;
    
    // Subscribe
    const channel = supabase.channel('test-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lotes' }, payload => {
          console.log('REALTIME EVENT RECEIVED:', payload);
          received = true;
      })
      .subscribe(async (status) => {
          console.log('Subscribe status:', status);
          if (status === 'SUBSCRIBED') {
              console.log('Updating lote', loteId, '...');
              // Trigger update
              const { error } = await supabase.from('lotes').update({ updated_at: new Date().toISOString() }).eq('id', loteId);
              if (error) console.error('Update error:', error);
          }
      });
      
    setTimeout(() => {
        if (!received) {
            console.log('NO REALTIME EVENT RECEIVED - REALTIME IS LIKELY DISABLED FOR LOTES');
        }
        process.exit(0);
    }, 5000);
}
check();

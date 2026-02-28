import { supabase } from '../lib/supabase';

export interface VerificacaoState {
    amostras: any[];
    analises: any[];
    date: string;
}

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

export const verificacaoService = {
    async save(labId: string, state: VerificacaoState): Promise<void> {
        if (!isSupabaseEnabled()) return;

        try {
            const { error } = await supabase
                .from('verificacao_interna')
                .upsert({
                    lab_id: labId,
                    date: state.date,
                    data_json: {
                        amostras: state.amostras,
                        analises: state.analises
                    },
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'lab_id,date'
                });

            if (error) {
                console.error("Error saving verification to Supabase:", error);
                throw error;
            }
        } catch (err) {
            console.error("Failed to save verification:", err);
            throw err;
        }
    },

    async get(labId: string, date: string): Promise<VerificacaoState | null> {
        if (!isSupabaseEnabled()) return null;

        try {
            const { data, error } = await supabase
                .from('verificacao_interna')
                .select('data_json')
                .eq('lab_id', labId)
                .eq('date', date)
                .maybeSingle();

            if (error) {
                console.error("Error fetching verification from Supabase:", error);
                throw error;
            }

            if (data && data.data_json) {
                return {
                    amostras: data.data_json.amostras || [],
                    analises: data.data_json.analises || [],
                    date: date
                };
            }
            return null;
        } catch (err) {
            console.error("Failed to fetch verification:", err);
            return null;
        }
    }
};

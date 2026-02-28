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
        // Envia para o Supabase se habilitado e labId for válido (UUID)
        if (isSupabaseEnabled() && labId && labId !== 'all') {
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

                if (error) throw error;
            } catch (err) {
                console.error("Failed to save verification to Supabase:", err);
            }
        }

        // Always update local storage as well for immediate feedback and local persistence
        const storeKey = `fibertech_verificacao_${labId}`;
        localStorage.setItem(storeKey, JSON.stringify(state));
    },

    async get(labId: string, date: string): Promise<VerificacaoState | null> {
        if (isSupabaseEnabled() && labId && labId !== 'all') {
            try {
                const { data, error } = await supabase
                    .from('verificacao_interna')
                    .select('*')
                    .eq('lab_id', labId)
                    .eq('date', date)
                    .maybeSingle();

                if (error) throw error;

                if (data && data.data_json) {
                    const state = {
                        amostras: data.data_json.amostras || [],
                        analises: data.data_json.analises || [],
                        date: date
                    };

                    // Sincroniza o cache local com os dados frescos da nuvem
                    const storeKey = `fibertech_verificacao_${labId}`;
                    localStorage.setItem(storeKey, JSON.stringify(state));

                    return state;
                }
            } catch (err) {
                console.error("Failed to fetch verification from Supabase:", err);
            }
        }

        // Fallback Local se a nuvem falhar ou não tiver dados
        const storeKey = `fibertech_verificacao_${labId}`;
        const stored = localStorage.getItem(storeKey);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.date === date) return parsed;
            } catch (e) {
                console.warn("Error parsing local verification state:", e);
            }
        }

        return null;
    }
};

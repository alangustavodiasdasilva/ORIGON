import { supabase } from '../lib/supabase';

export interface ProducaoData {
    id?: string;
    lab_id: string;
    identificador_unico: string;
    data_producao: string;
    turno: string;
    produto: string;
    peso: number;
    metadata?: any;
    created_at?: string;
}

const STORAGE_KEY = 'fibertech_producao_data';

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

const getStoredProducao = (): ProducaoData[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

const saveStoredProducao = (data: ProducaoData[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.slice(-5000))); // Keep last 5000
    } catch (e) {
        console.warn("Storage full, could not save all production data:", e);
    }
};

export const producaoService = {
    async uploadData(data: ProducaoData[], _labId?: string) {
        if (data.length === 0) return;

        if (isSupabaseEnabled()) {
            try {
                // Chunking upload (batches of 1000)
                const BATCH_SIZE = 1000;
                for (let i = 0; i < data.length; i += BATCH_SIZE) {
                    const chunk = data.slice(i, i + BATCH_SIZE).map(d => ({
                        ...d,
                        created_at: new Date().toISOString() // Ensure fresh timestamp on upload
                    }));

                    const { error } = await supabase
                        .from('operacao_producao')
                        .upsert(chunk, {
                            onConflict: 'lab_id,identificador_unico',
                            ignoreDuplicates: false
                        });

                    if (error) throw error;
                }
                return; // Success
            } catch (err) {
                console.warn("Supabase upload failed, falling back to local:", err);
            }
        }

        // FALLBACK: Local Storage
        const local = getStoredProducao();
        // Upsert logic for local
        const updated = [...local];
        const now = new Date().toISOString();
        data.forEach(item => {
            const idx = updated.findIndex(u => u.identificador_unico === item.identificador_unico && u.lab_id === item.lab_id);
            if (idx >= 0) updated[idx] = { ...item, created_at: now } as any;
            else updated.push({ ...item, created_at: now } as any);
        });
        saveStoredProducao(updated);
    },

    async list(labId?: string): Promise<ProducaoData[]> {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        if (isSupabaseEnabled()) {
            try {
                // Background cleanup: Delete records older than 24h
                supabase
                    .from('operacao_producao')
                    .delete()
                    .lt('created_at', twentyFourHoursAgo)
                    .then(({ error }) => {
                        if (error) console.warn("Background cleanup error (producao):", error);
                    });

                let query = supabase
                    .from('operacao_producao')
                    .select('*')
                    .gte('created_at', twentyFourHoursAgo); // Only fetch recent data

                if (labId) {
                    query = query.eq('lab_id', labId);
                }

                const { data, error } = await query.order('data_producao', { ascending: true });
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.warn("Supabase list failed, falling back to local:", err);
            }
        }

        // Local Storage filtering
        const local = getStoredProducao();
        const filtered = local.filter(p => {
            const createdAt = (p as any).created_at ? new Date((p as any).created_at).getTime() : 0;
            const cutoff = new Date(twentyFourHoursAgo).getTime();
            // If no created_at (legacy data), deciding to keep or discard? 
            // Logic: If no created_at, assume old and hide, OR show if strictly required. 
            // Given the requirement "must add to view", assume strictly ephemeral.
            // But for safety on existing data without timestamp, maybe we should keep them?
            // User said "dados que ele adicionar terão periodo de 24 horas".
            // Let's rely on timestamp if present.
            return createdAt >= cutoff;
        });

        // Clean up local storage
        if (filtered.length !== local.length) {
            saveStoredProducao(filtered);
        }

        return labId ? filtered.filter(p => p.lab_id === labId) : filtered;
    },

    async deleteAll(labId: string) {
        if (isSupabaseEnabled()) {
            try {
                const { error } = await supabase
                    .from('operacao_producao')
                    .delete()
                    .eq('lab_id', labId);

                if (error) throw error;
            } catch (err) {
                console.warn("Supabase delete failed:", err);
            }
        }
        const local = getStoredProducao().filter(p => p.lab_id !== labId);
        saveStoredProducao(local);
    }
};

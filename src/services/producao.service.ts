import { supabase } from '../lib/supabase';

export interface ProducaoData {
    id?: string;
    lab_id: string;
    identificador_unico: string;
    data_producao: string;
    turno: string;
    produto: string;
    peso: number;
    metadata?: Record<string, unknown>;
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); 
    } catch (e) {
        console.warn("Storage full, could not save all production data:", e);
    }
};

export const producaoService = {
    async uploadData(data: ProducaoData[]): Promise<boolean> {
        if (data.length === 0) return true;

        if (isSupabaseEnabled()) {
            let fullSuccess = true;
            try {
                const BATCH_SIZE = 250;
                const PARALLEL_LIMIT = 4;
                let inserted = 0;

                const allChunks: ProducaoData[][] = [];
                for (let i = 0; i < data.length; i += BATCH_SIZE) {
                    allChunks.push(data.slice(i, i + BATCH_SIZE).map(d => ({
                        ...d,
                        created_at: new Date().toISOString()
                    })));
                }

                for (let g = 0; g < allChunks.length; g += PARALLEL_LIMIT) {
                    const group = allChunks.slice(g, g + PARALLEL_LIMIT);
                    const results = await Promise.all(
                        group.map(chunk =>
                            supabase.from('operacao_producao').upsert(chunk, {
                                onConflict: 'lab_id,identificador_unico',
                                ignoreDuplicates: false
                            })
                        )
                    );

                    for (const { error } of results) {
                        if (error) {
                            console.error(`[ProducaoService] Falha em lote paralelo:`, error.message);
                            fullSuccess = false;
                        }
                    }

                    inserted += group.reduce((acc, c) => acc + c.length, 0);
                }

                if (inserted > 0) return true;

            } catch (err: any) {
                console.error("Supabase upload error fatal:", err);
            }
            if (!fullSuccess) console.warn("Upload de Produção ocorreu com erros parciais.");
        }

        // FALLBACK: Local Storage
        const local = getStoredProducao();
        // Upsert logic for local
        const updated = [...local];
        const now = new Date().toISOString();
        data.forEach(item => {
            const idx = updated.findIndex(u => u.identificador_unico === item.identificador_unico && u.lab_id === item.lab_id);
            if (idx >= 0) updated[idx] = { ...item, created_at: now };
            else updated.push({ ...item, created_at: now });
        });
        saveStoredProducao(updated);
        return false;
    },

    async list(labId?: string): Promise<ProducaoData[]> {
        if (isSupabaseEnabled()) {
            try {
                let allData: ProducaoData[] = [];
                let from = 0;
                const limit = 1000;
                let hasMore = true;

                while (hasMore) {
                    let query = supabase
                        .from('operacao_producao')
                        .select('*');

                    if (labId && labId !== 'all') {
                        query = query.eq('lab_id', labId);
                    }

                    const { data, error } = await query
                        .order('data_producao', { ascending: true })
                        .range(from, from + limit - 1);

                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        allData = [...allData, ...data];
                        if (data.length < limit) {
                            hasMore = false;
                        } else {
                            from += limit;
                            if (from > 5000000) hasMore = false;
                        }
                    } else {
                        hasMore = false;
                    }
                }
                
                // Atualiza cache local APÓS receber dados novos
                saveStoredProducao(allData);
                
                return allData;
            } catch (err) {
                console.warn("Supabase list failed, falling back to local:", err);
            }
        }

        // Local Storage filtering
        const local = getStoredProducao();
        const filtered = local;

        return labId === 'all' ? filtered : (labId ? filtered.filter(p => p.lab_id === labId) : filtered);
    },

    subscribe(callback: () => void): () => void {
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const enabled = !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
        if (!enabled) return () => {};

        const channel = supabase
            .channel('producao-realtime-' + Math.random().toString(36).slice(2))
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'operacao_producao' },
                () => callback()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    async deleteAll(labId: string) {
        // 1. Apaga do localStorage imediatamente
        if (!labId || labId === 'all') {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            const local = getStoredProducao().filter(p => p.lab_id !== labId);
            saveStoredProducao(local);
        }

        // 2. Tenta apagar no Supabase como background task sem travar o UI
        if (isSupabaseEnabled()) {
            try {
                let query = supabase.from('operacao_producao').delete();
                if (labId !== 'all' && labId) {
                    query = query.eq('lab_id', labId);
                } else {
                    query = query.not('identificador_unico', 'is', null);
                }
                const { error } = await query;
                if (error) console.error("Erro deletando base supabase", error);
            } catch (err) {
                console.warn("Supabase delete failed:", err);
            }
        }

        return true;
    }
};

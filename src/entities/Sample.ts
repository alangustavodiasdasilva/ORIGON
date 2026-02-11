
import { supabase } from "@/lib/supabase";

export interface Sample {
    id: string;
    lote_id: string;
    amostra_id: string; // "01", "02", etc.
    hvi?: string; // Número da máquina HVI (ex: "2")
    mic?: number;
    len?: number;
    unf?: number;
    str?: number;
    rd?: number;
    b?: number;
    mala?: string;
    etiqueta?: string;
    data_analise?: string;
    hora_analise?: string;
    cor?: string; // Hex color code
    historico_modificacoes: Array<{
        timestamp: string;
        usuario: string;
        campo: string;
        valor_anterior: any;
        valor_novo: any;
        tipo_modificacao: 'criacao' | 'edicao' | 'cor_alterada';
    }>;
}

const STORAGE_KEY = 'fibertech_samples';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const getStoredSamples = (): Sample[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Error reading samples from storage", error);
        return [];
    }
};

const saveStoredSamples = (samples: Sample[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
    } catch (error) {
        console.error("Error saving samples to storage", error);
        throw error;
    }
};

export const SampleService = {
    async list(): Promise<Sample[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').select('*');
            if (error) throw error;
            return data || [];
        }
        return getStoredSamples();
    },

    async listByLote(loteId: string): Promise<Sample[]> {
        if (isSupabaseEnabled()) {
            // Optimized Select: Exclude 'historico_modificacoes' (heavy JSON) to speed up load
            const { data, error } = await supabase
                .from('amostras')
                .select('id, lote_id, amostra_id, hvi, mic, len, unf, str, rd, b, mala, etiqueta, data_analise, hora_analise, cor')
                .eq('lote_id', loteId)
                .order('amostra_id');
            if (error) throw error;
            return (data || []) as Sample[];
        }
        return getStoredSamples()
            .filter(s => s.lote_id === loteId)
            .sort((a, b) => a.amostra_id.localeCompare(b.amostra_id));
    },

    async create(data: Omit<Sample, 'id'>): Promise<Sample> {
        if (isSupabaseEnabled()) {
            const { data: newSample, error } = await supabase.from('amostras').insert([data]).select().single();
            if (error) throw error;
            return newSample;
        }

        const samples = getStoredSamples();
        const newSample: Sample = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
        };
        samples.push(newSample);
        saveStoredSamples(samples);
        return newSample;
    },

    async bulkCreate(dataList: Omit<Sample, 'id'>[]): Promise<Sample[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').insert(dataList).select();
            if (error) throw error;
            return data;
        }

        const samples = getStoredSamples();
        const newSamples = dataList.map(data => ({
            ...data,
            id: Math.random().toString(36).substr(2, 9),
        }));
        samples.push(...newSamples);
        saveStoredSamples(samples);
        return newSamples;
    },

    async update(id: string, data: Partial<Sample>): Promise<Sample> {
        if (isSupabaseEnabled()) {
            const { data: updated, error } = await supabase.from('amostras').update(data).eq('id', id).select().single();
            if (error) throw error;
            return updated;
        }

        const samples = getStoredSamples();
        const index = samples.findIndex(s => s.id === id);
        if (index === -1) throw new Error("Sample not found");

        samples[index] = { ...samples[index], ...data };
        saveStoredSamples(samples);
        return samples[index];
    },

    async bulkUpdate(updates: Record<string, Partial<Sample>>): Promise<void> {
        if (isSupabaseEnabled()) {
            // Supabase doesn't have a direct "bulk update different rows with different data" in one call easily like this
            // But we can use an RPC or multiple calls. For simplicity here, we'll do promise.all
            const promises = Object.entries(updates).map(([id, data]) =>
                supabase.from('amostras').update(data).eq('id', id)
            );
            await Promise.all(promises);
            return;
        }

        const samples = getStoredSamples();
        let changed = false;
        Object.entries(updates).forEach(([id, data]) => {
            const index = samples.findIndex(s => s.id === id);
            if (index !== -1) {
                samples[index] = { ...samples[index], ...data };
                changed = true;
            }
        });
        if (changed) saveStoredSamples(samples);
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('amostras').delete().eq('id', id);
            if (error) throw error;
            return;
        }

        const samples = getStoredSamples();
        const filtered = samples.filter(s => s.id !== id);
        saveStoredSamples(filtered);
    },

    async getLoteCounts(): Promise<Record<string, number>> {
        if (isSupabaseEnabled()) {
            // Optimization: Fetch only lote_id column instead of full rows
            const { data, error } = await supabase.from('amostras').select('lote_id');
            if (error) throw error;

            const counts: Record<string, number> = {};
            (data || []).forEach((row: any) => {
                if (row.lote_id) {
                    counts[row.lote_id] = (counts[row.lote_id] || 0) + 1;
                }
            });
            return counts;
        }

        const samples = getStoredSamples();
        const counts: Record<string, number> = {};
        samples.forEach(s => {
            if (s.lote_id) {
                counts[s.lote_id] = (counts[s.lote_id] || 0) + 1;
            }
        });
        return counts;
    },

    subscribe(callback: () => void): () => void {
        if (!isSupabaseEnabled()) return () => { };

        const channel = supabase
            .channel(`amostras-changes-${Math.random().toString(36).substr(2, 9)}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'amostras' },
                () => callback()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
};

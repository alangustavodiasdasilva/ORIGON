
import { supabase } from "@/lib/supabase";
import { AuditLogService } from "./AuditLog";

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
    locked?: boolean;
    aprovado_hvi?: boolean;
    aprovado_por?: string;
    aprovado_em?: string;
    leituras_geradas?: any[]; // Armazena as 6 leituras de HVI geradas
    historico_modificacoes: Array<{
        timestamp: string;
        usuario: string;
        campo: string;
        valor_anterior: any;
        valor_novo: any;
        tipo_modificacao: 'criacao' | 'edicao' | 'cor_alterada' | 'aprovacao_hvi';
    }>;
}

const STORAGE_KEY = 'fibertech_samples';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const listeners = new Set<() => void>();

const notify = () => {
    listeners.forEach(cb => {
        try {
            cb();
        } catch (e) {
            console.error("Error in SampleService listener:", e);
        }
    });
};

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
            const samples = data || [];
            saveStoredSamples(samples);
            return samples;
        }
        return getStoredSamples();
    },

    async get(id: string): Promise<Sample | undefined> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').select('*').eq('id', id).single();
            if (!error && data) return data;
        }
        return getStoredSamples().find(s => s.id === id);
    },

    async listByLote(loteId: string): Promise<Sample[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').select('*').eq('lote_id', loteId).order('amostra_id');
            if (error) throw error;
            return data || [];
        }
        return getStoredSamples()
            .filter(s => s.lote_id === loteId)
            .sort((a, b) => a.amostra_id.localeCompare(b.amostra_id));
    },

    async create(data: Omit<Sample, 'id'>): Promise<Sample> {
        if (isSupabaseEnabled()) {
            const { data: newSample, error } = await supabase.from('amostras').insert([data]).select().single();
            if (error) throw error;
            AuditLogService.logAction('amostras', newSample.id, 'CREATE', null, newSample);
            notify();
            return newSample;
        }

        const samples = getStoredSamples();
        const newSample: Sample = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
        };
        samples.push(newSample);
        saveStoredSamples(samples);
        AuditLogService.logAction('amostras', newSample.id, 'CREATE', null, newSample);
        notify();
        return newSample;
    },

    async bulkCreate(dataList: Omit<Sample, 'id'>[]): Promise<Sample[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').insert(dataList).select();
            if (error) throw error;
            data.forEach((s: any) => AuditLogService.logAction('amostras', s.id, 'CREATE', null, s));
            notify();
            return data;
        }

        const samples = getStoredSamples();
        const newSamples = dataList.map(data => ({
            ...data,
            id: Math.random().toString(36).substr(2, 9),
        }));
        samples.push(...newSamples);
        saveStoredSamples(samples);
        newSamples.forEach(s => AuditLogService.logAction('amostras', s.id, 'CREATE', null, s));
        notify();
        return newSamples;
    },

    async update(id: string, data: Partial<Sample>): Promise<Sample> {
        const oldSample = await this.get(id);
        if (isSupabaseEnabled()) {
            const { data: updated, error } = await supabase.from('amostras').update(data).eq('id', id).select().single();
            if (error) throw error;
            AuditLogService.logAction('amostras', id, 'UPDATE', oldSample, updated);
            notify();
            return updated;
        }

        const samples = getStoredSamples();
        const index = samples.findIndex(s => s.id === id);
        if (index === -1) throw new Error("Sample not found");

        const updated = { ...samples[index], ...data };
        samples[index] = updated;
        saveStoredSamples(samples);
        AuditLogService.logAction('amostras', id, 'UPDATE', oldSample, updated);
        notify();
        return updated;
    },

    async bulkUpdate(updates: Record<string, Partial<Sample>>): Promise<void> {
        if (isSupabaseEnabled()) {
            const promises = Object.entries(updates).map(async ([id, data]) => {
                const oldSample = await this.get(id);
                const { data: updated, error } = await supabase.from('amostras').update(data).eq('id', id).select().single();
                if (!error && updated) {
                    AuditLogService.logAction('amostras', id, 'UPDATE', oldSample, updated);
                }
                return { updated, error };
            });
            await Promise.all(promises);
            notify();
            return;
        }

        const samples = getStoredSamples();
        let changed = false;
        Object.entries(updates).forEach(([id, data]) => {
            const index = samples.findIndex(s => s.id === id);
            if (index !== -1) {
                const oldSample = { ...samples[index] };
                samples[index] = { ...samples[index], ...data };
                AuditLogService.logAction('amostras', id, 'UPDATE', oldSample, samples[index]);
                changed = true;
            }
        });
        if (changed) {
            saveStoredSamples(samples);
            notify();
        }
    },

    async delete(id: string): Promise<void> {
        const oldSample = await this.get(id);
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').delete().eq('id', id).select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Permissão negada ou item já excluído.");
            }
            AuditLogService.logAction('amostras', id, 'DELETE', oldSample, null);
            notify();
            return;
        }

        const samples = getStoredSamples();
        const filtered = samples.filter(s => s.id !== id);
        saveStoredSamples(filtered);
        AuditLogService.logAction('amostras', id, 'DELETE', oldSample, null);
        notify();
    },

    async deleteByLote(loteId: string): Promise<number> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('amostras').delete().eq('lote_id', loteId).select();
            if (error) throw error;
            const count = data ? data.length : 0;
            // Apenas notifica uma vez após apagar tudo
            if (count > 0) notify();
            return count;
        }

        const samples = getStoredSamples();
        const filtered = samples.filter(s => s.lote_id !== loteId);
        const deletedCount = samples.length - filtered.length;
        if (deletedCount > 0) {
            saveStoredSamples(filtered);
            notify();
        }
        return deletedCount;
    },

    subscribe(callback: () => void): () => void {
        listeners.add(callback);

        let unsubscribeSupabase = () => {};
        if (isSupabaseEnabled()) {
            const channel = supabase
                .channel(`amostras-changes-${Math.random().toString(36).substr(2, 9)}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'amostras' },
                    () => callback()
                )
                .subscribe();

            unsubscribeSupabase = () => {
                supabase.removeChannel(channel);
            };
        }

        return () => {
            listeners.delete(callback);
            unsubscribeSupabase();
        };
    }
};

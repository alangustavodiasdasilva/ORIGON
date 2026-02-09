
import { supabase } from "@/lib/supabase";

export interface Lote {
    id: string;
    nome: string;
    descricao?: string;
    cidade?: string;
    lab_id?: string;
    status: 'aberto' | 'finalizado';
    analista_responsavel: string;
    created_at: string;
    updated_at: string;
}

const STORAGE_KEY = 'fibertech_lotes';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const getStoredLotes = (): Lote[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Error reading lotes from storage", error);
        return [];
    }
};

const saveStoredLotes = (lotes: Lote[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lotes));
    } catch (error) {
        console.error("Error saving lotes to storage", error);
        throw error;
    }
};

export const LoteService = {
    async list(): Promise<Lote[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('lotes').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }
        return getStoredLotes();
    },

    async get(id: string): Promise<Lote | undefined> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('lotes').select('*').eq('id', id).single();
            if (error) return undefined;
            return data;
        }
        return getStoredLotes().find(l => l.id === id);
    },

    async create(data: Omit<Lote, 'id' | 'created_at' | 'updated_at'>): Promise<Lote> {
        if (isSupabaseEnabled()) {
            const { data: newLote, error } = await supabase.from('lotes').insert([data]).select().single();
            if (error) throw error;
            return newLote;
        }

        const lotes = getStoredLotes();
        const newLote: Lote = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        lotes.push(newLote);
        saveStoredLotes(lotes);
        return newLote;
    },

    async update(id: string, data: Partial<Lote>): Promise<Lote> {
        if (isSupabaseEnabled()) {
            const { data: updated, error } = await supabase.from('lotes').update(data).eq('id', id).select().single();
            if (error) throw error;
            return updated;
        }

        const lotes = getStoredLotes();
        const index = lotes.findIndex(l => l.id === id);
        if (index === -1) throw new Error("Lote not found");

        lotes[index] = { ...lotes[index], ...data, updated_at: new Date().toISOString() };
        saveStoredLotes(lotes);
        return lotes[index];
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('lotes').delete().eq('id', id);
            if (error) throw error;
            return;
        }

        const lotes = getStoredLotes();
        const filtered = lotes.filter(l => l.id !== id);
        saveStoredLotes(filtered);
    }
};

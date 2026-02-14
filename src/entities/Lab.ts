
import { supabase } from "@/lib/supabase";

export interface Lab {
    id: string;
    nome: string;
    codigo: string;
    cidade?: string;
    estado?: string;
    created_at: string;
    updated_at: string;
}

const STORAGE_KEY = 'fibertech_labs';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const getStoredLabs = (): Lab[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const saveStoredLabs = (labs: Lab[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labs));
};

export const LabService = {
    async list(): Promise<Lab[]> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase.from('laboratorios').select('*');
                if (error) throw error;

                // CRITICAL SAFETY NET: If Supabase is empty but we have local data, use local data
                if ((!data || data.length === 0)) {
                    const localData = getStoredLabs();
                    if (localData.length > 0) {
                        console.warn("Supabase is empty. Falling back to LOCAL STORAGE to prevent data loss.");
                        return localData;
                    }
                }

                return data;
            } catch (error) {
                console.warn("Supabase (Laboratorios) unavailable, falling back to local storage:", error);
                return getStoredLabs();
            }
        }
        return getStoredLabs();
    },

    async get(id: string): Promise<Lab | undefined> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('laboratorios').select('*').eq('id', id).single();
            if (error) return undefined;
            return data;
        }
        return getStoredLabs().find(l => l.id === id);
    },

    async create(data: Omit<Lab, 'id' | 'created_at' | 'updated_at'>): Promise<Lab> {
        if (isSupabaseEnabled()) {
            const payload = { ...data, id: crypto.randomUUID() };
            const { data: newLab, error } = await supabase.from('laboratorios').insert([payload]).select().single();
            if (error) {
                console.error("Supabase create lab error:", error);
                throw error;
            }
            return newLab;
        }

        const labs = getStoredLabs();
        const newLab: Lab = {
            ...data,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        labs.push(newLab);
        saveStoredLabs(labs);
        return newLab;
    },

    async update(id: string, data: Partial<Lab>): Promise<Lab> {
        if (isSupabaseEnabled()) {
            const { data: updated, error } = await supabase.from('laboratorios').update(data).eq('id', id).select().single();
            if (error) throw error;
            return updated;
        }

        const labs = getStoredLabs();
        const index = labs.findIndex(l => l.id === id);
        if (index === -1) throw new Error("Lab not found");

        labs[index] = { ...labs[index], ...data, updated_at: new Date().toISOString() };
        saveStoredLabs(labs);
        return labs[index];
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('laboratorios').delete().eq('id', id);
            if (error) throw error;
            return;
        }

        const labs = getStoredLabs();
        const filtered = labs.filter(l => l.id !== id);
        saveStoredLabs(filtered);
    }
};

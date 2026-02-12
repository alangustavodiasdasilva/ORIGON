
import { supabase } from "@/lib/supabase";

export type AccessLevel = 'admin_global' | 'admin_lab' | 'user' | 'quality_admin';

export interface Analista {
    id: string;
    nome: string;
    email: string;
    foto?: string; // URL da foto ou Base64
    senha?: string; // Em produção, nunca salvar senha em plain text
    lab_id?: string; // Pode ser null se for admin global
    cargo: string;
    acesso: AccessLevel;
    created_at: string;
    updated_at: string;
    last_active?: string;
    current_lote_id?: string | null;
}

const STORAGE_KEY = 'fibertech_analistas';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const getStoredAnalistas = (): Analista[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const saveStoredAnalistas = (analistas: Analista[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(analistas));
};

export const AnalistaService = {
    async list(): Promise<Analista[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('analistas').select('*');
            if (error) throw error;
            return data || [];
        }
        return getStoredAnalistas();
    },

    async listByLab(labId: string): Promise<Analista[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('analistas').select('*').eq('lab_id', labId);
            if (error) throw error;
            return data || [];
        }
        return getStoredAnalistas().filter(a => a.lab_id === labId);
    },

    async get(id: string): Promise<Analista | undefined> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('analistas').select('*').eq('id', id).single();
            if (error) return undefined;
            return data;
        }
        return getStoredAnalistas().find(a => a.id === id);
    },

    async create(data: Omit<Analista, 'id' | 'created_at' | 'updated_at'>): Promise<Analista> {
        if (isSupabaseEnabled()) {
            const { data: newAnalista, error } = await supabase.from('analistas').insert([data]).select().single();
            if (error) throw error;
            return newAnalista;
        }

        const analistas = getStoredAnalistas();
        if (analistas.some(a => a.email === data.email)) {
            throw new Error("Email já cadastrado");
        }

        const newAnalista: Analista = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        analistas.push(newAnalista);
        saveStoredAnalistas(analistas);
        return newAnalista;
    },

    async update(id: string, data: Partial<Analista>): Promise<Analista | undefined> {
        if (isSupabaseEnabled()) {
            try {
                // Remove undefined fields which cause 400 Bad Request
                const cleanData = { ...data };
                Object.keys(cleanData).forEach(key => (cleanData as any)[key] === undefined && delete (cleanData as any)[key]);

                if (Object.keys(cleanData).length === 0) return undefined;

                const { data: updated, error } = await supabase.from('analistas').update(cleanData).eq('id', id).select().single();

                if (error) {
                    console.warn(`Supabase update warning for analista ${id}:`, error);
                    return undefined;
                }
                return updated;
            } catch (err) {
                console.warn(`Unexpected error updating analista ${id}:`, err);
                return undefined;
            }
        }

        const analistas = getStoredAnalistas();
        const index = analistas.findIndex(a => a.id === id);
        if (index === -1) throw new Error("Analista not found");

        const updatedAnalista = { ...analistas[index], ...data, updated_at: new Date().toISOString() };
        analistas[index] = updatedAnalista;
        saveStoredAnalistas(analistas);
        return updatedAnalista;
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('analistas').delete().eq('id', id);
            if (error) throw error;
            return;
        }

        const analistas = getStoredAnalistas();
        const filtered = analistas.filter(a => a.id !== id);
        saveStoredAnalistas(filtered);
    },

    async updateLastActive(id: string, loteId?: string | null): Promise<void> {
        try {
            const updateData: any = { last_active: new Date().toISOString() };

            // Treat empty string as null for UUID columns
            if (loteId !== undefined) {
                updateData.current_lote_id = loteId === "" ? null : loteId;
            }

            if (isSupabaseEnabled()) {
                await supabase.from('analistas').update(updateData).eq('id', id);
                return;
            }

            const analistas = getStoredAnalistas();
            const index = analistas.findIndex(a => a.id === id);
            if (index !== -1) {
                analistas[index].last_active = new Date().toISOString();
                if (loteId !== undefined) analistas[index].current_lote_id = loteId;
                saveStoredAnalistas(analistas);
            }
        } catch (error) {
            // Suppress heartburn errors, just log warning
            console.warn("Failed to update user presence", error);
        }
    }
};


import { supabase } from "@/lib/supabase";
import { AuditLogService } from "./AuditLog";

export type AccessLevel = 'admin_global' | 'admin_lab' | 'user' | 'quality_admin';

export interface Analista {
    id: string;
    nome: string;
    email: string;
    foto?: string | null; // URL da foto ou Base64
    senha?: string; // Em produção, nunca salvar senha em plain text
    lab_id?: string | null; // Pode ser null se for admin global
    cargo: string;
    acesso: AccessLevel;
    created_at: string;
    updated_at: string;
    last_active?: string;
    current_lote_id?: string | null;
}

const STORAGE_KEY = 'fibertech_analistas';

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

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
            try {
                const { data, error } = await supabase.from('analistas').select('*').order('nome');
                if (error) throw error;
                const analistas = data || [];
                saveStoredAnalistas(analistas);
                return analistas;
            } catch (err) {
                console.warn("Supabase list failed, falling back to local:", err);
            }
        }
        return getStoredAnalistas();
    },

    async listByLab(labId: string): Promise<Analista[]> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase.from('analistas').select('*').eq('lab_id', labId);
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.warn("Supabase listByLab failed, falling back to local:", err);
            }
        }
        return getStoredAnalistas().filter(a => a.lab_id === labId);
    },

    async get(id: string): Promise<Analista | undefined> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase.from('analistas').select('*').eq('id', id).single();
                if (!error && data) return data;
            } catch (err) {
                console.warn("Supabase get failed, falling back to local:", err);
            }
        }
        return getStoredAnalistas().find(a => a.id === id);
    },

    async create(data: Omit<Analista, 'id' | 'created_at' | 'updated_at'>): Promise<Analista> {
        if (isSupabaseEnabled()) {
            const { data: newAnalista, error } = await supabase.from('analistas').insert([data]).select().single();
            if (error) {
                console.error('Supabase create error for analista:', error);
                throw new Error(error.message);
            }
            AuditLogService.logAction('analistas', newAnalista.id, 'CREATE', null, newAnalista);
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
        AuditLogService.logAction('analistas', newAnalista.id, 'CREATE', null, newAnalista);
        return newAnalista;
    },

    async update(id: string, data: Partial<Analista>): Promise<Analista | undefined> {
        const oldAnalista = await this.get(id);
        if (isSupabaseEnabled()) {
            try {
                // Remove undefined fields which cause 400 Bad Request
                const cleanData = { ...data };
                Object.keys(cleanData).forEach(key => (cleanData as any)[key] === undefined && delete (cleanData as any)[key]);

                if (Object.keys(cleanData).length === 0) return undefined;

                const { data: updated, error } = await supabase.from('analistas').update(cleanData).eq('id', id).select().single();

                if (error) {
                    console.error(`Supabase update error for analista ${id}:`, error);
                    throw new Error(error.message);
                }
                AuditLogService.logAction('analistas', id, 'UPDATE', oldAnalista, updated);
                return updated;
            } catch (err: any) {
                console.warn(`Unexpected error updating analista ${id}:`, err);
                throw err;
            }
        }

        const analistas = getStoredAnalistas();
        const index = analistas.findIndex(a => a.id === id);
        if (index === -1) throw new Error("Analista not found");

        const updatedAnalista = { ...analistas[index], ...data, updated_at: new Date().toISOString() };
        analistas[index] = updatedAnalista;
        saveStoredAnalistas(analistas);
        AuditLogService.logAction('analistas', id, 'UPDATE', oldAnalista, updatedAnalista);
        return updatedAnalista;
    },

    async delete(id: string): Promise<void> {
        const oldAnalista = await this.get(id);
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('analistas').delete().eq('id', id).select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Permissão negada pelo servidor ou analista já excluído.");
            }
            AuditLogService.logAction('analistas', id, 'DELETE', oldAnalista, null);
        }
        // SEMPRE sincroniza o localStorage após deletar — evita o "fantasma"
        // que voltava quando o Supabase estava lento ou era o fallback
        const analistas = getStoredAnalistas();
        saveStoredAnalistas(analistas.filter(a => a.id !== id));
        if (!isSupabaseEnabled()) {
            AuditLogService.logAction('analistas', id, 'DELETE', oldAnalista, null);
        }
    },

    subscribe(callback: () => void): () => void {
        if (!isSupabaseEnabled()) {
            // Sem Supabase, retorna no-op
            return () => {};
        }

        const channel = supabase
            .channel('analistas-realtime-' + Math.random().toString(36).slice(2))
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'analistas' },
                () => callback()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    async updateLastActive(id: string, loteId?: string | null): Promise<void> {
        try {
            const now = new Date().toISOString();

            // Atualiza no Supabase SOMENTE current_lote_id (last_active não existe na tabela)
            if (isSupabaseEnabled() && loteId !== undefined) {
                const supabaseUpdate: any = {
                    current_lote_id: loteId === "" ? null : loteId
                };
                const { error } = await supabase.from('analistas').update(supabaseUpdate).eq('id', id);
                if (error) console.warn("[AnalistaService] Ping RLS:", error.message);
            }

            // Mantém last_active apenas no localStorage (presença local)
            const analistas = getStoredAnalistas();
            const index = analistas.findIndex(a => a.id === id);
            if (index !== -1) {
                analistas[index].last_active = now;
                if (loteId !== undefined) analistas[index].current_lote_id = loteId === "" ? null : loteId;
                saveStoredAnalistas(analistas);
            }
        } catch (error) {
            console.warn("Got unexpected error updating user heartbeat:", error);
        }
    }
};

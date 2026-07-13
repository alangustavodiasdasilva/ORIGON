
import { supabase } from "@/lib/supabase";
import { AuditLogService } from "./AuditLog";
import { safeSetItem } from "@/lib/safeStorage";

export interface Lote {
    id: string;
    nome: string;
    descricao?: string;
    cidade?: string;
    lab_id?: string;
    status: 'aberto' | 'finalizado';
    analista_responsavel: string;
    configuracoes_analise?: Record<string, any>;
    created_at: string;
    updated_at: string;
}

const STORAGE_KEY = 'fibertech_lotes';

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

const listeners = new Set<() => void>();

const notify = () => {
    listeners.forEach(cb => {
        try {
            cb();
        } catch (e) {
            console.error("Error in LoteService listener:", e);
        }
    });
};

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
        safeSetItem(STORAGE_KEY, JSON.stringify(lotes));
    } catch (error) {
        console.error("Error saving lotes to storage", error);
        throw error;
    }
};

export const LoteService = {
    async list(): Promise<Lote[]> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase.from('lotes').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                const lotes = data || [];
                saveStoredLotes(lotes);
                return lotes;
            } catch (err) {
                console.warn("Supabase LoteService.list failed, falling back to local:", err);
            }
        }
        return getStoredLotes();
    },

    async get(id: string): Promise<Lote | undefined> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase.from('lotes').select('*').eq('id', id).single();
                if (!error && data) return data;
            } catch (err) {
                console.warn("Supabase LoteService.get failed:", err);
            }
        }
        return getStoredLotes().find(l => l.id === id);
    },

    async create(data: Omit<Lote, 'id' | 'created_at' | 'updated_at'>): Promise<Lote> {
        if (isSupabaseEnabled()) {
            const { data: newLote, error } = await supabase.from('lotes').insert([data]).select().single();
            if (error) throw error;
            AuditLogService.logAction('lotes', newLote.id, 'CREATE', null, newLote);
            notify();
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
        AuditLogService.logAction('lotes', newLote.id, 'CREATE', null, newLote);
        notify();
        return newLote;
    },

    async update(id: string, data: Partial<Lote>): Promise<Lote> {
        const oldLote = await this.get(id);
        if (isSupabaseEnabled()) {
            const { data: updated, error } = await supabase.from('lotes').update(data).eq('id', id).select().single();
            if (error) throw error;
            AuditLogService.logAction('lotes', id, 'UPDATE', oldLote, updated);
            notify();
            return updated;
        }

        const lotes = getStoredLotes();
        const index = lotes.findIndex(l => l.id === id);
        if (index === -1) throw new Error("Lote not found");

        const updated = { ...lotes[index], ...data, updated_at: new Date().toISOString() };
        lotes[index] = updated;
        saveStoredLotes(lotes);
        AuditLogService.logAction('lotes', id, 'UPDATE', oldLote, updated);
        notify();
        return updated;
    },

    async delete(id: string): Promise<void> {
        const oldLote = await this.get(id);
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase.from('lotes').delete().eq('id', id).select();
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Permissão negada ou item já excluído.");
            }
            AuditLogService.logAction('lotes', id, 'DELETE', oldLote, null);
            notify();
            return;
        }

        const lotes = getStoredLotes();
        const filtered = lotes.filter(l => l.id !== id);
        saveStoredLotes(filtered);
        AuditLogService.logAction('lotes', id, 'DELETE', oldLote, null);
        notify();
    },

    subscribe(callback: () => void): () => void {
        listeners.add(callback);

        let unsubscribeSupabase = () => {};
        if (isSupabaseEnabled()) {
            const channel = supabase
                .channel(`lotes-changes-${Math.random().toString(36).substr(2, 9)}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'lotes' },
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


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

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

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
                const { data, error } = await supabase.from('laboratorios').select('*').order('nome');
                if (error) throw error;

                // Se Supabase retornou dados, ele é fonte de verdade — sincroniza o localStorage
                if (data && data.length > 0) {
                    saveStoredLabs(data);
                    return data;
                }

                // Se Supabase veio vazio mas local tem dados: preserva local (evita apagar tudo)
                const localData = getStoredLabs();
                if (localData.length > 0) {
                    console.warn("Supabase retornou vazio. Usando localStorage como fallback.");
                    return localData;
                }

                return [];
            } catch (error) {
                console.warn("Supabase (Laboratorios) indisponível, usando localStorage:", error);
                return getStoredLabs();
            }
        }
        return getStoredLabs();
    },

    async get(id: string): Promise<Lab | undefined> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase.from('laboratorios').select('*').eq('id', id).single();
                if (!error && data) return data;
            } catch (err) {
                console.warn("Supabase LabService.get failed:", err);
            }
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
            // Sincroniza localStorage com novo lab
            const stored = getStoredLabs();
            stored.push(newLab);
            saveStoredLabs(stored);
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
            // Sincroniza localStorage
            const stored = getStoredLabs();
            const idx = stored.findIndex(l => l.id === id);
            if (idx >= 0) stored[idx] = updated;
            saveStoredLabs(stored);
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
        }
        // SEMPRE limpa do localStorage — independente do Supabase estar ativo ou não
        // Isso evita o "ghost lab" que voltava após atualização de página
        const stored = getStoredLabs();
        saveStoredLabs(stored.filter(l => l.id !== id));
    },

    /**
     * Inscreve para atualizações em tempo real da tabela 'laboratorios'.
     * Chame no useEffect e retorne o unsubscribe para cleanup.
     *
     * Exemplo de uso em um componente:
     *   useEffect(() => {
     *     return LabService.subscribe(() => loadLabs());
     *   }, []);
     */
    subscribe(onUpdate: () => void): () => void {
        if (!isSupabaseEnabled()) return () => { };

        const channel = supabase
            .channel('laboratorios-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'laboratorios' },
                () => { onUpdate(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }
};

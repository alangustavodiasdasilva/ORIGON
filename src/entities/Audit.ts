
import { supabase } from "@/lib/supabase";

export interface AuditCategory {
    id: string;
    name: string;
    description: string;
    labId?: string;
}

export interface AuditDocument {
    id: string;
    name: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    data?: string; // Optional (loaded on demand)
    uploadDate: string;
    category: string;
    analystName: string;
    status: 'pending' | 'verified';
    labId?: string;
}

const DOCS_KEY = 'fibertech_audit_docs';
const CATS_KEY = 'fibertech_audit_categories';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const DEFAULT_CATEGORIES: AuditCategory[] = [
    { id: "calib", name: "Certificados de Calibração", description: "Certificados HVI, balanças e equipamentos auxiliares." },
    { id: "pops", name: "POPs (Procedimentos)", description: "Instruções de trabalho e procedimentos operacionais padrão." },
    { id: "maint", name: "Registros de Manutenção", description: "Histórico de manutenções preventivas e corretivas." },
    { id: "train", name: "Treinamentos de Equipe", description: "Evidências de capacitação e treinamentos técnicos." },
    { id: "interlab", name: "Relatórios de Interlaboratorial", description: "Resultados e análises de participação em ensaios externos." }
];

export const AuditService = {
    // --- CATEGORIES ---
    async listCategories(): Promise<AuditCategory[]> {
        if (isSupabaseEnabled()) {
            // Using select('*') is safest if we are unsure of all columns, 
            // but usually camelCase columns work if created that way.
            const { data, error } = await supabase.from('auditoria_categorias').select('*');
            if (error) throw error;
            return data || [];
        }
        const data = localStorage.getItem(CATS_KEY);
        if (!data) {
            localStorage.setItem(CATS_KEY, JSON.stringify(DEFAULT_CATEGORIES));
            return DEFAULT_CATEGORIES;
        }
        return JSON.parse(data);
    },

    async saveCategory(cat: AuditCategory): Promise<void> {
        if (isSupabaseEnabled()) {
            const payload = {
                id: cat.id || self.crypto.randomUUID(),
                name: cat.name,
                description: cat.description,
                lab_id: cat.labId
            };
            const { error } = await supabase.from('auditoria_categorias').upsert(payload);
            if (error) throw error;
            return;
        }

        const cats = await this.listCategories();
        const existingIndex = cats.findIndex(c => c.id === cat.id);
        if (existingIndex >= 0) {
            cats[existingIndex] = cat;
        } else {
            cats.push({ ...cat, id: cat.id || crypto.randomUUID() });
        }
        localStorage.setItem(CATS_KEY, JSON.stringify(cats));
    },

    async deleteCategory(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('auditoria_categorias').delete().eq('id', id);
            if (error) throw error;
            return;
        }
        const cats = await this.listCategories();
        const filtered = cats.filter(c => c.id !== id);
        localStorage.setItem(CATS_KEY, JSON.stringify(filtered));
    },

    // --- DOCUMENTS ---
    async list(): Promise<AuditDocument[]> {
        if (isSupabaseEnabled()) {
            // Select everything EXCEPT 'data' for performance
            // Use alias for lab_id -> labId so it matches the interface
            const { data, error } = await supabase
                .from('auditoria_documentos')
                .select('id, name, fileName, fileSize, fileType, uploadDate, category, analystName, status, labId:lab_id');

            if (error) throw error;
            return data || [];
        }
        const data = localStorage.getItem(DOCS_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        // Remove data field from listing to simulate performance optimization
        return parsed.map((d: AuditDocument) => {
            const { data, ...rest } = d;
            return rest;
        });
    },

    async getContent(id: string): Promise<string | null> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase
                .from('auditoria_documentos')
                .select('data')
                .eq('id', id)
                .single();
            if (error) return null;
            return data?.data || null;
        }
        const raw = localStorage.getItem(DOCS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const doc = parsed.find((d: AuditDocument) => d.id === id);
        return doc ? doc.data : null;
    },

    async listByLab(labId: string): Promise<AuditDocument[]> {
        const allDocs = await this.list();
        return allDocs.filter(d => d.labId === labId);
    },

    async upload(doc: Omit<AuditDocument, 'id' | 'uploadDate' | 'status'>): Promise<AuditDocument> {
        if (isSupabaseEnabled()) {
            // Map labId to lab_id for partial match
            const { labId, ...rest } = doc;
            const payload = {
                ...rest,
                lab_id: labId,
                status: 'verified'
            };
            const { data, error } = await supabase.from('auditoria_documentos').insert([payload]).select().single();

            if (error) throw error;
            return data;
        }
        const docs = await this.list();
        const newDoc: AuditDocument = {
            ...doc,
            id: crypto.randomUUID(),
            uploadDate: new Date().toISOString(),
            status: 'verified'
        };
        docs.push(newDoc);
        localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
        return newDoc;
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('auditoria_documentos').delete().eq('id', id);
            if (error) throw error;
            return;
        }
        const docs = await this.list();
        const filtered = docs.filter(d => d.id !== id);
        localStorage.setItem(DOCS_KEY, JSON.stringify(filtered));
    }
};

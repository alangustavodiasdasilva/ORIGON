
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
            return (data || []).map((c: any) => ({
                ...c,
                labId: c.lab_id || c.labId // Normalize snake_case to camelCase
            }));
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
                lab_id: cat.labId // Assuming DB uses snake_case
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
            // Reverting to select * to avoid "column not found" errors if schema varies
            // We manually strip 'data' to keep memory usage low
            const { data, error } = await supabase.from('auditoria_documentos').select('*');

            if (error) throw error;
            return (data || []).map((d: any) => ({
                id: d.id,
                name: d.name,
                // Robust mapping from snake_case DB columns to camelCase UI props
                fileName: d.file_name || d.fileName || "arquivo_sem_nome",
                fileSize: d.file_size || d.fileSize || 0,
                fileType: d.file_type || d.fileType || "application/octet-stream",
                category: d.category,
                analystName: d.analyst_name || d.analystName || "Sistema",
                uploadDate: d.created_at || d.upload_date || d.uploadDate || new Date().toISOString(),
                status: d.status || 'pending',
                labId: d.lab_id || d.labId,
                data: undefined // Strip heavy data
            }));
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
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase
                .from('auditoria_documentos')
                .select('*')
                .eq('lab_id', labId);
            if (error) throw error;
            return (data || []).map((d: any) => ({
                id: d.id,
                name: d.name,
                fileName: d.file_name || d.fileName || "arquivo_sem_nome",
                fileSize: d.file_size || d.fileSize || 0,
                fileType: d.file_type || d.fileType || "application/octet-stream",
                category: d.category,
                analystName: d.analyst_name || d.analystName || "Sistema",
                uploadDate: d.created_at || d.upload_date || d.uploadDate || new Date().toISOString(),
                status: d.status || 'pending',
                labId: d.lab_id || d.labId,
                data: undefined
            }));
        }
        const allDocs = await this.list();
        return allDocs.filter(d => d.labId === labId);
    },

    async upload(doc: Omit<AuditDocument, 'id' | 'uploadDate' | 'status'>): Promise<AuditDocument> {
        console.group("AuditService.upload");
        console.log("Input Doc:", doc);

        if (isSupabaseEnabled()) {
            // Map camelCase DTO to snake_case DB columns
            const { labId, analystName, fileName, fileSize, fileType, ...rest } = doc;
            const payload = {
                name: rest.name,         // From rest (doc.name)
                category: rest.category, // From rest (doc.category)
                // data: rest.data,      // data might be in rest, but we don't save it to DB usually?
                // Wait! 'data' IS passed in doc. If we don't save it to DB, where does it go?
                // The DB seems to lack a 'data' column? 
                // Step 2195 line 113 says 'data: undefined // Strip heavy data'. 
                // But getContent fetches 'data'. So 'data' column MUST exist.
                // Let's add it if it's there.
                data: rest.data,

                lab_id: labId || null,
                file_name: fileName,
                file_size: fileSize,
                file_type: fileType,
                status: 'verified'
            };
            console.log("Payload to DB (Explicit):", payload);

            try {
                const { data, error, status } = await supabase
                    .from('auditoria_documentos')
                    .insert([payload])
                    .select('id, name, file_name, file_size, file_type, category, created_at, status, lab_id')
                    .single();

                console.log("DB Response:", { status, data, error });

                if (error) throw error;

                console.log("Upload Success:", data);
                return {
                    id: data.id,
                    name: data.name,
                    fileName: data.file_name,
                    fileSize: data.file_size,
                    fileType: data.file_type,
                    category: data.category,
                    analystName: analystName, // Use input value since DB doesn't store/return it
                    uploadDate: data.created_at, // Use created_at from DB
                    status: data.status,
                    labId: data.lab_id
                };
            } catch (err) {
                console.error("Upload Failed:", err);
                throw err;
            } finally {
                console.groupEnd();
            }
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

    async updateDocument(id: string, updates: Partial<AuditDocument>): Promise<void> {
        if (isSupabaseEnabled()) {
            const payload: any = {};
            if (updates.category) payload.category = updates.category;
            if (updates.status) payload.status = updates.status;

            const { error } = await supabase
                .from('auditoria_documentos')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
            return;
        }

        const raw = localStorage.getItem(DOCS_KEY);
        if (!raw) return;

        try {
            const docs = JSON.parse(raw);
            const index = docs.findIndex((d: AuditDocument) => d.id === id);

            if (index >= 0) {
                docs[index] = { ...docs[index], ...updates };
                localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
            }
        } catch (e) {
            console.error("Failed to update local document", e);
        }
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

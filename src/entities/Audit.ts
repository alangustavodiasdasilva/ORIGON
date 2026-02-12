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

let detectedDbColumns: string[] = [];
// Helper to find best matching column
const findCol = (details: string[], cols: string[]) => {
    for (const d of details) {
        if (cols.includes(d)) return d;
    }
    return details[0]; // fallback
};

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
            const { data, error } = await supabase
                .from('auditoria_categorias')
                .select('*');

            if (error) {
                console.error("Error fetching categories:", error);
                throw error;
            }
            return (data || []).map((d: any) => ({
                ...d,
                labId: d.lab_id
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
            const isNew = !cat.id;
            const id = cat.id || crypto.randomUUID();

            const payload = {
                id,
                name: cat.name,
                description: cat.description
            };

            let error;
            if (isNew) {
                const result = await supabase.from('auditoria_categorias').insert([payload]);
                error = result.error;
            } else {
                const result = await supabase.from('auditoria_categorias').update(payload).eq('id', id);
                error = result.error;
            }

            if (error) {
                console.error("Supabase Error saving category:", error);
                throw error;
            }
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
            console.log("DEBUG: Fetching audit_docs...");
            const { data, error } = await supabase
                .from('auditoria_documentos')
                .select('*');

            if (error) {
                console.error("DEBUG: Fetch error audit_docs:", error);
                throw error;
            }

            if (data && data.length > 0) {
                detectedDbColumns = Object.keys(data[0]);
                console.log("DEBUG: Columns found:", detectedDbColumns);
            }

            const docs = (data || []).map((d: any) => {
                try {
                    return {
                        id: d.id,
                        name: d.name || 'Sem Nome',
                        fileName: d.fileName || d.filename || d.file_name || d.name || 'unknown',
                        fileSize: d.fileSize || d.filesize || d.file_size || 0,
                        fileType: d.fileType || d.filetype || d.file_type || 'application/octet-stream',
                        uploadDate: d.uploadDate || d.uploaddate || d.upload_date || d.created_at || new Date().toISOString(),
                        category: d.category || 'Geral',
                        analystName: d.analystName || d.analystname || d.analyst_name || 'Desconhecido',
                        status: d.status || 'verified',
                        labId: d.labId || d.labid || d.lab_id,
                        data: d.data
                    };
                } catch (err) {
                    console.error("Mapping error for doc:", d, err);
                    return null;
                }
            }).filter((d: any) => d !== null) as AuditDocument[];

            // Post-process: Generate Signed URLs for Storage Paths
            // Identify paths: Not empty, not base64 (starts with data:), not http (already public/external)
            const pathsToSign: string[] = [];
            const docIndices: number[] = [];

            docs.forEach((doc, index) => {
                if (doc.data && !doc.data.startsWith('data:') && !doc.data.startsWith('http')) {
                    pathsToSign.push(doc.data);
                    docIndices.push(index);
                }
            });

            if (pathsToSign.length > 0) {
                console.log("DEBUG: Signing URLs for", pathsToSign.length, "docs");
                const { data: signedData, error: signError } = await supabase.storage
                    .from('audit-docs')
                    .createSignedUrls(pathsToSign, 3600); // Valid for 1 hour

                if (signedData) {
                    signedData.forEach((item, i) => {
                        if (item.signedUrl) {
                            docs[docIndices[i]].data = item.signedUrl;
                        } else {
                            console.warn("Failed to sign url for path:", pathsToSign[i], item.error);
                        }
                    });
                } else if (signError) {
                    console.error("Error batch signing URLs:", signError);
                }
            }

            return docs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        }
        const data = localStorage.getItem(DOCS_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return parsed.map((d: AuditDocument) => {
            const { data, ...rest } = d;
            return rest;
        });
    },

    async getContent(id: string): Promise<string | null> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase
                .from('auditoria_documentos')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) return null;

            const rawData = data.data; // This might be base64, http url, or storage path

            if (rawData && !rawData.startsWith('data:') && !rawData.startsWith('http')) {
                // It's a storage path, get signed URL
                const { data: signed } = await supabase.storage
                    .from('audit-docs')
                    .createSignedUrl(rawData, 3600);
                return signed?.signedUrl || null;
            }

            return rawData || null;
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

    async upload(doc: Omit<AuditDocument, 'id' | 'uploadDate' | 'status'>, file?: File): Promise<AuditDocument> {
        if (isSupabaseEnabled()) {
            let finalData = doc.data;

            // 1. Upload to Supabase Storage if file is provided
            if (file) {
                try {
                    console.log("DEBUG: Starting Storage Upload...", file.name);
                    const fileExt = file.name.split('.').pop() || 'file';
                    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const uniquePath = `${Date.now()}_${cleanName}`;

                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from('audit-docs')
                        .upload(uniquePath, file, {
                            cacheControl: '3600',
                            upsert: false
                        });

                    if (uploadError) {
                        console.error("Storage Upload Failed:", uploadError);
                        throw uploadError;
                    }

                    // 2. Store RELATIVE PATH (for secure access)
                    finalData = uniquePath;
                    console.log("DEBUG: File stored at path:", finalData);
                } catch (err) {
                    console.error("Critical Storage Error:", err);
                    throw err;
                }
            }

            // Define possible schemas to retry automatically
            const strategies = [
                {
                    name: 'lowercase',
                    map: {
                        name: 'name', fileName: 'filename', fileSize: 'filesize', fileType: 'filetype',
                        category: 'category', analystName: 'analystname', labId: 'labid',
                        status: 'status', data: 'data', uploadDate: 'uploaddate'
                    }
                },
                {
                    name: 'snake_case',
                    map: {
                        name: 'name', fileName: 'file_name', fileSize: 'file_size', fileType: 'file_type',
                        category: 'category', analystName: 'analyst_name', labId: 'lab_id',
                        status: 'status', data: 'data', uploadDate: 'created_at'
                    }
                },
                {
                    name: 'camelCase',
                    map: {
                        name: 'name', fileName: 'fileName', fileSize: 'fileSize', fileType: 'fileType',
                        category: 'category', analystName: 'analystName', labId: 'labId',
                        status: 'status', data: 'data', uploadDate: 'uploadDate'
                    }
                }
            ];

            let lastError;

            for (const strategy of strategies) {
                console.log(`DEBUG: Trying DB insert strategy: ${strategy.name}`);
                try {
                    const payload: any = {};
                    payload[strategy.map.name] = doc.name;
                    payload[strategy.map.fileName] = doc.fileName;
                    payload[strategy.map.fileSize] = doc.fileSize;
                    payload[strategy.map.fileType] = doc.fileType;
                    payload[strategy.map.category] = doc.category;
                    payload[strategy.map.analystName] = doc.analystName;
                    payload[strategy.map.labId] = doc.labId; // Allow null/undefined
                    payload[strategy.map.status] = 'verified';
                    payload[strategy.map.data] = finalData;
                    payload[strategy.map.uploadDate] = new Date().toISOString();

                    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

                    const { data, error } = await supabase
                        .from('auditoria_documentos')
                        .insert([payload])
                        .select()
                        .single();

                    if (error) {
                        if (error.code === 'PGRST204' || error.code === '42703' || error.message?.includes('column')) {
                            console.warn(`Strategy ${strategy.name} failed with column error. Retrying...`);
                            lastError = error;
                            continue;
                        }
                        throw error;
                    }

                    console.log(`DEBUG: Strategy ${strategy.name} SUCCEEDED!`);

                    const d = data;
                    return {
                        id: d.id,
                        name: d.name,
                        fileName: d.fileName || d.filename || d.file_name,
                        fileSize: d.fileSize || d.filesize || d.file_size,
                        fileType: d.fileType || d.filetype || d.file_type,
                        uploadDate: d.uploadDate || d.uploaddate || d.upload_date || d.created_at,
                        category: d.category,
                        analystName: d.analystName || d.analystname || d.analyst_name,
                        status: d.status,
                        labId: d.labId || d.labid || d.lab_id,
                        data: d.data
                    };

                } catch (err: any) {
                    lastError = err;
                    if (err.code === 'PGRST204' || err.code === '42703' || err.message?.includes('column')) {
                        continue;
                    }
                    throw err;
                }
            }
            throw lastError;
        }

        const raw = localStorage.getItem(DOCS_KEY);
        const allDocs = raw ? JSON.parse(raw) : [];

        const newDoc: AuditDocument = {
            ...doc,
            id: crypto.randomUUID(),
            uploadDate: new Date().toISOString(),
            status: 'verified'
        };

        allDocs.push(newDoc);
        localStorage.setItem(DOCS_KEY, JSON.stringify(allDocs));
        return newDoc;
    },

    async delete(id: string): Promise<void> {
        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('auditoria_documentos').delete().eq('id', id);
            if (error) throw error;
            return;
        }
        const raw = localStorage.getItem(DOCS_KEY);
        if (!raw) return;
        const docs = JSON.parse(raw);
        const filtered = docs.filter((d: AuditDocument) => d.id !== id);
        localStorage.setItem(DOCS_KEY, JSON.stringify(filtered));
    }
};

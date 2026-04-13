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
    status: 'pending' | 'verified' | 'completed';
    labId?: string;
    // Novos campos para formato de "Tarefa/Afazer"
    isTask?: boolean;
    deadline?: string;
    assignedTo?: string;
    observation?: string;
}

const DOCS_KEY = 'fibertech_audit_docs';
const CATS_KEY = 'fibertech_audit_categories';

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

let detectedDbColumns: string[] = [];
// Helper removed as it was unused

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
            try {
                const { data, error } = await supabase
                    .from('auditoria_categorias')
                    .select('*');

                if (error) throw error;

                return (data || []).map((d: any) => ({
                    ...d,
                    labId: d.lab_id
                }));
            } catch (error) {
                console.warn("Supabase (Categorias) unavailable, falling back to local storage:", error);
                // Fallback to local storage
            }
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
            try {
                console.log("DEBUG: Fetching audit_docs...");
                const { data, error } = await supabase
                    .from('auditoria_documentos')
                    .select('*');

                if (error) throw error;

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
                            data: d.data,
                            isTask: d.isTask || d.istask || d.is_task || false,
                            deadline: d.deadline,
                            assignedTo: d.assignedTo || d.assignedto || d.assigned_to,
                            observation: d.observation
                        };
                    } catch (err) {
                        console.error("Mapping error for doc:", d, err);
                        return null;
                    }
                }).filter((d: any) => d !== null) as AuditDocument[];

                // Post-process: Generate Signed URLs for Storage Paths
                const pathsToSign: string[] = [];
                const docIndices: number[] = [];

                docs.forEach((doc, index) => {
                    if (doc.data && !doc.data.startsWith('data:') && !doc.data.startsWith('http')) {
                        pathsToSign.push(doc.data);
                        docIndices.push(index);
                    }
                });

                if (pathsToSign.length > 0) {
                    try {
                        const { data: signedData, error: _signError } = await supabase.storage
                            .from('audit-docs')
                            .createSignedUrls(pathsToSign, 3600); // Valid for 1 hour

                        if (signedData) {
                            signedData.forEach((item, i) => {
                                if (item.signedUrl) {
                                    docs[docIndices[i]].data = item.signedUrl;
                                }
                            });
                        }
                    } catch (signErr) {
                        console.warn("Failed to sign URLs, proceeding with raw paths:", signErr);
                    }
                }

                return docs.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());

            } catch (authError) {
                console.warn("Supabase (Audit Docs) unavailable, falling back to local storage:", authError);
                // Fallback proceed to local storage code below
            }
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
                    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const uniquePath = `${Date.now()}_${cleanName}`;

                    const { error: uploadError } = await supabase.storage
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
            const strategies: Array<{ name: string, map: Record<string, string> }> = [
                {
                    name: 'lowercase',
                    map: {
                        name: 'name', fileName: 'filename', fileSize: 'filesize', fileType: 'filetype',
                        category: 'category', analystName: 'analystname', labId: 'labid',
                        status: 'status', data: 'data', uploadDate: 'uploaddate',
                        isTask: 'istask', deadline: 'deadline', assignedTo: 'assignedto', observation: 'observation'
                    }
                },
                {
                    name: 'snake_case',
                    map: {
                        name: 'name', fileName: 'file_name', fileSize: 'file_size', fileType: 'file_type',
                        category: 'category', analystName: 'analyst_name', labId: 'lab_id',
                        status: 'status', data: 'data', uploadDate: 'created_at',
                        isTask: 'is_task', deadline: 'deadline', assignedTo: 'assigned_to', observation: 'observation'
                    }
                },
                {
                    name: 'camelCase',
                    map: {
                        name: 'name', fileName: 'fileName', fileSize: 'fileSize', fileType: 'fileType',
                        category: 'category', analystName: 'analystName', labId: 'labId',
                        status: 'status', data: 'data', uploadDate: 'uploadDate',
                        isTask: 'isTask', deadline: 'deadline', assignedTo: 'assignedTo', observation: 'observation'
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

                    if (doc.isTask !== undefined) payload[strategy.map.isTask] = doc.isTask;
                    if (doc.deadline) payload[strategy.map.deadline] = doc.deadline;
                    if (doc.assignedTo) payload[strategy.map.assignedTo] = doc.assignedTo;
                    if (doc.observation) payload[strategy.map.observation] = doc.observation;

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
                        data: d.data,
                        isTask: d.isTask || d.istask || d.is_task,
                        deadline: d.deadline,
                        assignedTo: d.assignedTo || d.assignedto || d.assigned_to,
                        observation: d.observation
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

    /**
     * Cria uma tarefa no checklist com o mínimo de campos necessários.
     * Detecta automaticamente o esquema de nomenclatura do banco (snake_case ou camelCase).
     */
    async createTask(params: {
        name: string;
        labId?: string;
        isTask?: boolean;
        deadline?: string;
        assignedTo?: string;
        observation?: string;
        category?: string;
        createdBy?: string;
    }): Promise<AuditDocument> {
        if (isSupabaseEnabled()) {
            // Tenta inserir com snake_case (padrão do Supabase)
            const snakePayload: Record<string, unknown> = {
                name: params.name,
                status: 'verified',
                category: params.category || 'Checklist Operacional',
                is_task: params.isTask ?? true,
            };
            if (params.labId) snakePayload.lab_id = params.labId;
            if (params.deadline) snakePayload.deadline = params.deadline;
            if (params.assignedTo) snakePayload.assigned_to = params.assignedTo;
            if (params.observation) snakePayload.observation = params.observation;
            if (params.createdBy) snakePayload.created_by = params.createdBy;

            const { data: snakeData, error: snakeError } = await supabase
                .from('auditoria_documentos')
                .insert([snakePayload])
                .select()
                .single();

            if (!snakeError && snakeData) {
                const d = snakeData;
                return {
                    id: d.id,
                    name: d.name || params.name,
                    fileName: params.name + '.task',
                    fileSize: 0,
                    fileType: 'task/custom',
                    uploadDate: d.created_at || new Date().toISOString(),
                    category: d.category || params.category || 'Checklist Operacional',
                    analystName: d.created_by || params.createdBy || 'Sistema',
                    status: d.status || 'verified',
                    labId: d.lab_id || params.labId,
                    isTask: d.is_task ?? true,
                    deadline: d.deadline || params.deadline,
                    assignedTo: d.assigned_to || params.assignedTo,
                    observation: d.observation || params.observation,
                };
            }

            // Fallback: tenta camelCase se snake_case falhou com erro de coluna
            if (snakeError && (snakeError.code === '42703' || snakeError.message?.includes('column'))) {
                console.warn('snake_case failed, trying camelCase:', snakeError.message);
                const camelPayload: Record<string, unknown> = {
                    name: params.name,
                    status: 'verified',
                    category: params.category || 'Checklist Operacional',
                    isTask: params.isTask ?? true,
                };
                if (params.labId) camelPayload.labId = params.labId;
                if (params.deadline) camelPayload.deadline = params.deadline;
                if (params.assignedTo) camelPayload.assignedTo = params.assignedTo;
                if (params.observation) camelPayload.observation = params.observation;

                const { data: camelData, error: camelError } = await supabase
                    .from('auditoria_documentos')
                    .insert([camelPayload])
                    .select()
                    .single();

                if (camelError) throw camelError;
                const d = camelData!;
                return {
                    id: d.id, name: d.name || params.name,
                    fileName: params.name + '.task', fileSize: 0, fileType: 'task/custom',
                    uploadDate: d.uploadDate || d.created_at || new Date().toISOString(),
                    category: d.category || 'Checklist Operacional',
                    analystName: params.createdBy || 'Sistema',
                    status: d.status || 'verified',
                    labId: d.labId || params.labId,
                    isTask: d.isTask ?? true,
                    deadline: d.deadline || params.deadline,
                    assignedTo: d.assignedTo || params.assignedTo,
                    observation: d.observation || params.observation,
                };
            }

            if (snakeError) throw snakeError;
        }

        // Fallback local storage
        const raw = localStorage.getItem(DOCS_KEY);
        const allDocs = raw ? JSON.parse(raw) : [];
        const newDoc: AuditDocument = {
            id: crypto.randomUUID(),
            name: params.name,
            fileName: params.name + '.task',
            fileSize: 0,
            fileType: 'task/custom',
            uploadDate: new Date().toISOString(),
            category: params.category || 'Checklist Operacional',
            analystName: params.createdBy || 'Sistema',
            status: 'verified',
            labId: params.labId,
            isTask: params.isTask ?? true,
            deadline: params.deadline,
            assignedTo: params.assignedTo,
            observation: params.observation,
        };
        allDocs.push(newDoc);
        localStorage.setItem(DOCS_KEY, JSON.stringify(allDocs));
        return newDoc;
    },


    subscribe(callback: () => void): () => void {
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const enabled = !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
        if (!enabled) return () => {};

        const channel = supabase
            .channel('audit-realtime-' + Math.random().toString(36).slice(2))
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'auditoria_documentos' },
                () => callback()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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

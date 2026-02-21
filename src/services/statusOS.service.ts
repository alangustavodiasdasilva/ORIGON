import { supabase } from "@/lib/supabase";

export interface StatusOS {
    id: string;
    os_numero: string;
    romaneio: string;
    cliente: string;
    fazenda: string;
    usina: string;
    variedade: string;
    data_registro: string;
    data_recepcao: string;
    data_acondicionamento: string;
    data_finalizacao: string;
    revisor: string;
    status: string;
    total_amostras: number;
    peso_mala: number;
    peso_medio: number;
    horas: number;
    nota_fiscal: string;
    fatura: string;
    lab_id?: string;
    created_at: string;
}

const STORAGE_KEY = 'fibertech_status_os_data';

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

const getStoredStatusOS = (): StatusOS[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

const saveStoredStatusOS = (data: StatusOS[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.slice(-5000))); // Keep last 5000
    } catch (e) {
        console.warn("Storage full, could not save all StatusOS data:", e);
    }
};

export const statusOSService = {
    async uploadData(data: any[], labId: string) {
        const now = new Date().toISOString();
        // Formata os dados para o banco
        const formattedData = data.map(item => ({
            lab_id: labId,
            os_numero: item.os_numero,
            romaneio: item.romaneio,
            cliente: item.cliente,
            fazenda: item.fazenda,
            usina: item.usina,
            variedade: item.variedade,
            data_registro: item.data_registro,
            data_recepcao: item.data_recepcao,
            data_acondicionamento: item.data_acondicionamento,
            data_finalizacao: item.data_finalizacao,
            revisor: item.revisor,
            status: item.status,
            total_amostras: item.total_amostras,
            peso_mala: item.peso_mala,
            peso_medio: item.peso_medio,
            horas: item.horas,
            nota_fiscal: item.nota_fiscal,
            fatura: item.fatura,
            created_at: now // Explicitly set created_at
        }));

        if (isSupabaseEnabled()) {
            try {
                // Chunking upload (batches of 1000)
                const BATCH_SIZE = 1000;
                for (let i = 0; i < formattedData.length; i += BATCH_SIZE) {
                    const chunk = formattedData.slice(i, i + BATCH_SIZE);
                    const { error } = await supabase
                        .from('status_os_hvi')
                        .upsert(chunk, { onConflict: 'os_numero,lab_id' }); // Use composite key to avoid single-key constraint violations if present

                    if (error) {
                        // Fallback to older onConflict if lab_id is not part of it
                        const { error: fallbackError } = await supabase
                            .from('status_os_hvi')
                            .upsert(chunk, { onConflict: 'os_numero' });
                        if (fallbackError) throw fallbackError;
                    }
                }
                // We still save to local storage explicitly to have instant availability!
                // Fallthrough to local storage block below...
            } catch (err) {
                console.warn("Supabase upload failed, falling back primarily to local:", err);
                // Important: we re-throw if it's completely breaking or if we want the user to know. 
                // But let's keep the offline-first experience by just logging it and relying on local storage.
            }
        }

        // FALLBACK / OFFLINE FIRST: Local Storage
        const local = getStoredStatusOS() as any[];
        const updated = [...local];
        formattedData.forEach(item => {
            const idx = updated.findIndex(u => u.os_numero === item.os_numero && u.lab_id === item.lab_id);
            if (idx >= 0) updated[idx] = { ...updated[idx], ...item };
            else updated.push(item);
        });
        saveStoredStatusOS(updated);
    },

    async getAll(labId: string) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        if (isSupabaseEnabled()) {
            try {
                // Background cleanup DISABLED to prevent data loss of pending items
                // supabase.from('status_os_hvi')
                //     .delete()
                //     .lt('created_at', twentyFourHoursAgo)
                //     .then(({ error }) => {
                //         if (error) console.warn("Background cleanup error (status_os):", error);
                //     });

                let allData: any[] = [];
                let page = 0;
                let pageSize = 1000;
                let hasMore = true;

                while (hasMore) {
                    // Removed .gte('created_at', twentyFourHoursAgo) to ensure all pending items are retrieved
                    const { data, error } = await supabase
                        .from('status_os_hvi')
                        .select('*')
                        .eq('lab_id', labId)
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) throw error;

                    if (data) {
                        allData = [...allData, ...data];
                        if (data.length < pageSize) hasMore = false;
                        else page++;
                    } else {
                        hasMore = false;
                    }

                    if (page > 50) break;
                }

                // Merge with any pending/unsaved local data
                const local = getStoredStatusOS() as any[];
                let mergedData = [...allData];

                local.forEach(localItem => {
                    const idx = mergedData.findIndex(u => u.os_numero === localItem.os_numero && u.lab_id === localItem.lab_id);
                    if (idx >= 0) {
                        mergedData[idx] = { ...mergedData[idx], ...localItem };
                    } else if (localItem.lab_id === labId) {
                        mergedData.push(localItem);
                    }
                });

                return mergedData as StatusOS[];
            } catch (err) {
                console.warn("Supabase getAll failed, falling back strictly to local:", err);
            }
        }
        // Local Filter
        const local = getStoredStatusOS();
        const cutoff = new Date(twentyFourHoursAgo).getTime();
        const filtered = local.filter(d => {
            const t = d.created_at ? new Date(d.created_at).getTime() : 0;
            // Assume legacy data without created_at is OLD and should correspond to cleanup policy unless we want to preserve them until overwritten. 
            // Logic: strict 24h policy.
            return t >= cutoff;
        });
        if (filtered.length !== local.length) saveStoredStatusOS(filtered);

        return filtered;
    },

    async getStats(labId: string) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        let allData: any[] = [];
        let page = 0;
        let pageSize = 1000;
        let hasMore = true;

        if (isSupabaseEnabled()) {
            try {
                while (hasMore) {
                    const { data, error } = await supabase
                        .from('status_os_hvi')
                        .select('status, data_recepcao, data_finalizacao, total_amostras')
                        .eq('lab_id', labId)
                        .gte('created_at', twentyFourHoursAgo)
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) throw error;

                    if (data) {
                        allData = [...allData, ...data];
                        if (data.length < pageSize) hasMore = false;
                        else page++;
                    } else {
                        hasMore = false;
                    }
                    if (page > 5000) break;
                }

                // Incorporate local stats as well to reflect immediately pending offline items
                const local = getStoredStatusOS();
                const cutoff = new Date(twentyFourHoursAgo).getTime();
                const offlineValid = local.filter(d => d.created_at && new Date(d.created_at).getTime() >= cutoff && d.lab_id === labId);

                // Merge unique OS
                offlineValid.forEach(item => {
                    if (!allData.find(d => d.os_numero === item.os_numero)) {
                        allData.push(item);
                    }
                });

            } catch (e) {
                console.warn("Stats fetch failed", e);
            }
        } else {
            // Local stats
            const local = getStoredStatusOS();
            const cutoff = new Date(twentyFourHoursAgo).getTime();
            allData = local.filter(d => d.created_at && new Date(d.created_at).getTime() >= cutoff);
        }

        const data = allData;
        const total = data.length;
        const faturados = data.filter(d => d.status?.toLowerCase().includes('faturado')).length;
        const emAberto = total - faturados;
        const totalAmostras = data.reduce((acc, curr) => acc + (curr.total_amostras || 0), 0);

        return { total, faturados, emAberto, totalAmostras };
    },

    async clearData(labId: string) {
        if (isSupabaseEnabled()) {
            try {
                const { error } = await supabase
                    .from('status_os_hvi')
                    .delete()
                    .eq('lab_id', labId);

                if (error) throw error;
            } catch (err) {
                console.warn("Supabase clear failed:", err);
            }
        }
        const local = getStoredStatusOS().filter(d => d.lab_id !== labId && d.labId !== labId);
        if (local.length === 0) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            saveStoredStatusOS(local);
        }
    }
};

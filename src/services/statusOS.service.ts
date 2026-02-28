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
    async uploadData(data: Partial<StatusOS>[], labId: string) {
        const now = new Date().toISOString();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // Formata os dados para o banco
        // Se labId for 'all', não permite upload pois requer um UUID real
        if (!labId || labId === 'all') {
            console.error("Tentativa de upload de Status OS com labId inválido:", labId);
            return false;
        }

        const formattedData = data.map(item => {
            let itemId = item.id;
            if (!itemId || !uuidRegex.test(itemId)) {
                itemId = crypto.randomUUID();
            }
            return {
                id: itemId,
                lab_id: labId,
                os_numero: item.os_numero || "",
                romaneio: item.romaneio || "",
                cliente: item.cliente || "",
                fazenda: item.fazenda || "",
                usina: item.usina || "",
                variedade: item.variedade || "",
                data_registro: item.data_registro || "",
                data_recepcao: item.data_recepcao || "",
                data_acondicionamento: item.data_acondicionamento || "",
                data_finalizacao: item.data_finalizacao || "",
                revisor: item.revisor || "",
                status: item.status || "",
                total_amostras: item.total_amostras || 0,
                peso_mala: item.peso_mala || 0,
                peso_medio: item.peso_medio || 0,
                horas: item.horas || 0,
                nota_fiscal: item.nota_fiscal || "",
                fatura: item.fatura || "",
                created_at: now
            };
        });

        if (isSupabaseEnabled()) {
            try {
                const BATCH_SIZE = 1000;
                for (let i = 0; i < formattedData.length; i += BATCH_SIZE) {
                    const chunk = formattedData.slice(i, i + BATCH_SIZE);
                    const { error } = await supabase
                        .from('status_os_hvi')
                        .upsert(chunk, { onConflict: 'os_numero,lab_id' });

                    if (error) throw error;
                }
                return true;
            } catch (err) {
                console.warn("Supabase upload failed, falling back to local:", err);
            }
        }

        const local = getStoredStatusOS();
        const updated = [...local];
        formattedData.forEach(item => {
            const idx = updated.findIndex(u => u.os_numero === item.os_numero && (u.lab_id === item.lab_id || labId === 'all'));
            if (idx >= 0) updated[idx] = { ...updated[idx], ...item };
            else updated.push(item as StatusOS);
        });
        saveStoredStatusOS(updated);
        return false;
    },

    async getAll(labId: string): Promise<StatusOS[]> {
        if (isSupabaseEnabled()) {
            try {
                let allData: StatusOS[] = [];
                let from = 0;
                const limit = 1000;
                let hasMore = true;

                while (hasMore) {
                    let query = supabase.from('status_os_hvi').select('*');
                    if (labId && labId !== 'all') {
                        query = query.eq('lab_id', labId);
                    }

                    const { data, error } = await query
                        .order('data_recepcao', { ascending: false })
                        .range(from, from + limit - 1);

                    if (error) throw error;

                    if (data && data.length > 0) {
                        allData = [...allData, ...data];
                        if (data.length < limit) {
                            hasMore = false;
                        } else {
                            from += limit;
                        }
                    } else {
                        hasMore = false;
                    }
                }

                // Sincroniza o cache local com os dados frescos da nuvem
                if (allData.length > 0) {
                    const local = getStoredStatusOS();
                    const otherLabsData = local.filter(d => d.lab_id !== labId);
                    saveStoredStatusOS([...otherLabsData, ...allData]);
                } else if (labId !== 'all') {
                    const otherLabsData = getStoredStatusOS().filter(d => d.lab_id !== labId);
                    saveStoredStatusOS(otherLabsData);
                }

                return allData;
            } catch (err) {
                console.warn("Supabase getAll failed, falling back to local:", err);
            }
        }

        const local = getStoredStatusOS();
        return labId === 'all' ? local : local.filter(d => d.lab_id === labId);
    },

    async getStats(labId: string) {
        const data = await this.getAll(labId);
        const total = data.length;
        const faturados = data.filter(d => d.status?.toLowerCase().includes('faturado')).length;
        const emAberto = total - faturados;
        const totalAmostras = data.reduce((acc, curr) => acc + (curr.total_amostras || 0), 0);

        return { total, faturados, emAberto, totalAmostras };
    },

    async clearData(labId: string) {
        if (!labId || labId === 'all') {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            const local = getStoredStatusOS().filter(d => d.lab_id !== labId);
            saveStoredStatusOS(local);
        }

        if (isSupabaseEnabled()) {
            try {
                let query = supabase.from('status_os_hvi').delete();
                if (labId !== 'all' && labId) {
                    query = query.eq('lab_id', labId);
                } else {
                    query = query.not('os_numero', 'is', null);
                }
                const { error } = await query;
                if (error) console.error("Erro deletando supabase statosOS", error);
            } catch (err) {
                console.warn("Supabase clear failed:", err);
            }
        }
    },

    getCached(labId: string): StatusOS[] {
        const local = getStoredStatusOS();
        if (labId === 'all') return local;
        return local.filter(d => d.lab_id === labId);
    }
};

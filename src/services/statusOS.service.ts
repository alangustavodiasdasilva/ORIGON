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
const CACHE_TS_KEY = 'fibertech_status_os_ts'; // timestamp da última busca ao Supabase
const CACHE_TTL_MS = 60_000; // 60 segundos de validade do cache

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
                // Chunking upload (batches of 1000)
                const BATCH_SIZE = 1000;
                for (let i = 0; i < formattedData.length; i += BATCH_SIZE) {
                    const chunk = formattedData.slice(i, i + BATCH_SIZE);
                    const { error } = await supabase
                        .from('status_os_hvi')
                        .upsert(chunk, { onConflict: 'os_numero,lab_id' });

                    if (error) {
                        // Fallback to older onConflict if lab_id is not part of it
                        const { error: fallbackError } = await supabase
                            .from('status_os_hvi')
                            .upsert(chunk, { onConflict: 'os_numero' });
                        if (fallbackError) throw fallbackError;
                    }
                }

                // SUCESSO NO SUPABASE: Atualizar o localStorage à imagem do Supabase
                // para evitar duplicação no próximo merge
                const local = getStoredStatusOS();
                const updated = [...local];
                formattedData.forEach(item => {
                    const idx = updated.findIndex(u => u.os_numero === item.os_numero && u.lab_id === item.lab_id);
                    if (idx >= 0) updated[idx] = { ...updated[idx], ...item };
                    else updated.push(item);
                });
                saveStoredStatusOS(updated);
                return; // Upload para Supabase concluído, não precisa do bloco offline
            } catch (err) {
                console.warn("Supabase upload failed, falling back primarily to local:", err);
            }
        }

        // FALLBACK OFFLINE: salvar apenas no localStorage
        const local = getStoredStatusOS();
        const updated = [...local];
        formattedData.forEach(item => {
            const idx = updated.findIndex(u => u.os_numero === item.os_numero && u.lab_id === item.lab_id);
            if (idx >= 0) updated[idx] = { ...updated[idx], ...item };
            else updated.push(item);
        });
        saveStoredStatusOS(updated);
    },

    async getAll(labId: string) {
        if (isSupabaseEnabled()) {
            // ── TTL: se dados foram buscados há menos de 60s, retorna cache local ────────
            try {
                const lastFetch = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);
                const isRecent = (Date.now() - lastFetch) < CACHE_TTL_MS;
                if (isRecent && getStoredStatusOS().length > 0) {
                    const local = getStoredStatusOS();
                    return (labId === 'all' ? local : local.filter(d => d.lab_id === labId)) as StatusOS[];
                }
            } catch { /* ignora falha de leitura do timestamp */ }

            try {
                const PAGE_SIZE = 5000; // Supabase suporta até 5000 por request

                // 1. Obtém o total de registros com uma query leve (count only)
                let countQuery = supabase
                    .from('status_os_hvi')
                    .select('*', { count: 'exact', head: true });
                if (labId !== 'all') countQuery = countQuery.eq('lab_id', labId);

                const { count, error: countError } = await countQuery;
                if (countError) throw countError;

                const total = count || 0;
                const totalPages = Math.ceil(total / PAGE_SIZE);

                // 2. Busca todas as páginas EM PARALELO com Promise.all
                const pageRequests = Array.from({ length: totalPages }, (_, i) => {
                    let q = supabase
                        .from('status_os_hvi')
                        .select('*')
                        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
                    if (labId !== 'all') q = q.eq('lab_id', labId);
                    return q;
                });

                const results = await Promise.all(pageRequests);

                let allData: StatusOS[] = [];
                for (const res of results) {
                    if (res.error) throw res.error;
                    if (res.data) allData = allData.concat(res.data);
                }

                // 3. Merge: Supabase é fonte de verdade.
                // Adiciona apenas itens offline do localStorage que não existem no Supabase.
                const local = getStoredStatusOS();
                const supabaseNums = new Set(allData.map((d: StatusOS) => `${d.os_numero}|${d.lab_id}`));
                local.forEach(localItem => {
                    const key = `${localItem.os_numero}|${localItem.lab_id}`;
                    const belongsToScope = labId === 'all' || localItem.lab_id === labId;
                    if (!supabaseNums.has(key) && belongsToScope) {
                        allData.push(localItem);
                    }
                });

                // 4. Atualiza localStorage como cache + registra timestamp
                if (allData.length > 0) {
                    saveStoredStatusOS(allData.slice(0, 10000)); // Cache dos 10k mais recentes
                    localStorage.setItem(CACHE_TS_KEY, String(Date.now())); // marca hora da busca
                }

                return allData as StatusOS[];
            } catch (err) {
                console.warn("Supabase getAll failed, falling back strictly to local:", err);
            }
        }
        // Fallback: dados do localStorage
        const local = getStoredStatusOS();
        const validLocal = local; // No more 24h cut-off for legacy data here based on user complaint

        return labId === 'all' ? validLocal : validLocal.filter(d => d.lab_id === labId);
    },

    async getStats(labId: string) {
        let allData: Partial<StatusOS>[] = [];

        if (isSupabaseEnabled()) {
            try {
                const PAGE_SIZE = 5000;
                let countQ = supabase
                    .from('status_os_hvi')
                    .select('status, data_recepcao, data_finalizacao, total_amostras, created_at, lab_id', { count: 'exact', head: true });
                if (labId !== 'all') countQ = countQ.eq('lab_id', labId);
                const { count } = await countQ;
                const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

                const reqs = Array.from({ length: totalPages }, (_, i) => {
                    let q = supabase
                        .from('status_os_hvi')
                        .select('status, data_recepcao, data_finalizacao, total_amostras, created_at, lab_id')
                        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
                    if (labId !== 'all') q = q.eq('lab_id', labId);
                    return q;
                });

                const results = await Promise.all(reqs);
                for (const res of results) {
                    if (res.data) allData = allData.concat(res.data);
                }

            } catch (e) {
                console.warn("Stats fetch failed", e);
            }

            // Merge itens offline pendentes
            const local = getStoredStatusOS();
            const offlineValid = local.filter(d => (labId === 'all' || d.lab_id === labId));
            offlineValid.forEach(item => {
                if (!allData.find(d => d.os_numero === item.os_numero)) {
                    allData.push(item);
                }
            });
        } else {
            const local = getStoredStatusOS();
            allData = local.filter(d => (labId === 'all' || d.lab_id === labId));
        }

        const data = allData;
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
            if (local.length === 0) {
                localStorage.removeItem(STORAGE_KEY);
            } else {
                saveStoredStatusOS(local);
            }
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

    /**
     * Retorna dados em cache (localStorage) filtrados por labId.
     * Usado para renderização imediata (stale-while-revalidate).
     */
    getCached(labId: string): StatusOS[] {
        const local = getStoredStatusOS();
        if (labId === 'all') return local;
        return local.filter(d => d.lab_id === labId);
    }
};

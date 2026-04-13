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
        // Removemos o limite de .slice(-5000) para permitir grandes volumes (50k+)
        // O limite agora será apenas o espaço físico do navegador (aprox 5MB-10MB)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("Storage local cheio ou erro ao salvar. Os dados serão mantidos apenas na nuvem:", e);
    }
};

export const statusOSService = {
    async uploadData(data: Partial<StatusOS>[], labId: string) {
        const now = new Date().toISOString();
        // Formata os dados para o banco
        // Se labId for 'all', não permite upload pois requer um UUID real
        if (!labId || labId === 'all') {
            console.error("Tentativa de upload de Status OS com labId inválido:", labId);
            return false;
        }

        if (isSupabaseEnabled()) {
            try {
                // Reduzido para 250 para evitar erros de payload e timeout com grandes volumes
                const BATCH_SIZE = 250;
                let totalSuccess = 0;

                console.log(`[StatusOSService] Upload robusto iniciado: ${data.length} registros (Batches de ${BATCH_SIZE})...`);

                for (let i = 0; i < data.length; i += BATCH_SIZE) {
                    const chunk = data.slice(i, i + BATCH_SIZE).map(item => ({ 
                        id: item.id || crypto.randomUUID(),
                        lab_id: labId,
                        os_numero: item.os_numero || "",
                        romaneio: item.romaneio || "",
                        cliente: item.cliente || "",
                        fazenda: item.fazenda || "",
                        usina: item.usina || "",
                        variedade: item.variedade || "",
                        data_registro: item.data_registro || null,
                        data_recepcao: item.data_recepcao || null,
                        data_acondicionamento: item.data_acondicionamento || null,
                        data_finalizacao: item.data_finalizacao || null,
                        revisor: item.revisor || "",
                        status: item.status || "",
                        total_amostras: Number(item.total_amostras || 0),
                        peso_mala: Number(item.peso_mala || 0),
                        peso_medio: Number(item.peso_medio || 0),
                        horas: Number(item.horas || 0),
                        nota_fiscal: item.nota_fiscal || "",
                        fatura: item.fatura || "",
                    }));
                    
                    const { error } = await supabase
                        .from('status_os_hvi')
                        .upsert(chunk, { 
                            onConflict: 'os_numero,lab_id',
                            ignoreDuplicates: false 
                        });

                    if (error) {
                        console.error(`[StatusOSService] Falha grave no lote ${i / BATCH_SIZE + 1}:`, error);
                        // Se falhou por causa do onConflict, o erro estaria aqui
                        throw new Error(`Erro no banco: ${error.message} (Cód: ${error.code})`);
                    }
                    
                    totalSuccess += chunk.length;
                    if (totalSuccess % 5000 === 0) {
                       console.log(`[StatusOSService] ✅ ${totalSuccess} registros enviados...`);
                    }
                }
                console.log(`[StatusOSService] Upload concluído com sucesso: ${totalSuccess} registros.`);
                return true;
            } catch (err: any) {
                console.error("Falha fatal na comunicação com o banco:", err);
                throw err;
            }
        }

        const local = getStoredStatusOS();
        const updated = [...local];
        data.forEach(item => {
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
                const limit = 1000; // Voltando para 1000 para sincronizar com o limite padrão do Supabase
                let hasMore = true;

                while (hasMore) {
                    let query = supabase.from('status_os_hvi').select('*');
                    if (labId && labId !== 'all') {
                        query = query.eq('lab_id', labId);
                    }

                    const { data, error } = await query
                        .order('data_recepcao', { ascending: false })
                        .order('os_numero', { ascending: false }) 
                        .range(from, from + limit - 1);

                    if (error) {
                        console.error("Erro na busca paginada:", error);
                        throw error;
                    }

                    if (data && data.length > 0) {
                        allData = [...allData, ...data];
                        
                        // SE veio exatamente o que pedimos (ou o limite do server), pode ter mais.
                        // SE veio menos que o limite, com certeza acabou.
                        if (data.length < limit) {
                            hasMore = false;
                        } else {
                            from += limit;
                            // Prevenção de loop infinito em caso de erro lógico ou dados corrompidos
                            if (from > 5000000) { 
                                console.warn("Limite de segurança de 5 milhões atingido.");
                                hasMore = false; 
                            }
                        }
                    } else {
                        hasMore = false;
                    }
                }

                // Limpa o cache local pois o Supabase é a verdadeira fonte oficial
                localStorage.removeItem(STORAGE_KEY);

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

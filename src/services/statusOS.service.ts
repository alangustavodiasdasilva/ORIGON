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
    created_at: string;
}

export const statusOSService = {
    async uploadData(data: any[], labId: string) {
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
            horas: item.horas, // Adicionado
            nota_fiscal: item.nota_fiscal,
            fatura: item.fatura
        }));

        // Chunking upload (batches of 1000)
        const BATCH_SIZE = 1000;
        for (let i = 0; i < formattedData.length; i += BATCH_SIZE) {
            const chunk = formattedData.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('status_os_hvi')
                .upsert(chunk, { onConflict: 'lab_id,os_numero' });

            if (error) throw error;
        }
    },

    async getAll(labId: string) {
        let allData: any[] = [];
        let page = 0;
        let pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('status_os_hvi')
                .select('*')
                .eq('lab_id', labId)
                // .order('data_recepcao', { ascending: false }) // Sorting can be expensive on large offsets, maybe remove if slow
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;

            if (data) {
                allData = [...allData, ...data];
                if (data.length < pageSize) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }

            // Safety break 
            if (page > 5000) break; // Max 5M rows
        }

        return allData as StatusOS[];
    },

    async getStats(labId: string) {
        let allData: any[] = [];
        let page = 0;
        let pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from('status_os_hvi')
                .select('status, data_recepcao, data_finalizacao, total_amostras')
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
            if (page > 5000) break;
        }

        const data = allData;
        const total = data.length;
        const faturados = data.filter(d => d.status?.toLowerCase().includes('faturado')).length;
        const emAberto = total - faturados;
        const totalAmostras = data.reduce((acc, curr) => acc + (curr.total_amostras || 0), 0);

        return { total, faturados, emAberto, totalAmostras };
    },

    async clearData(labId: string) {
        const { error } = await supabase
            .from('status_os_hvi')
            .delete()
            .eq('lab_id', labId);

        if (error) throw error;
    }
};

import { supabase } from '../lib/supabase';

export interface ProducaoData {
    lab_id: string;
    identificador_unico: string;
    data_producao: string;
    turno: string;
    produto: string;
    peso: number;
    metadata?: any;
}

export const producaoService = {
    async uploadData(data: ProducaoData[], _labId?: string) {
        if (data.length === 0) return;

        // Chunking upload (batches of 1000)
        const BATCH_SIZE = 1000;
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const chunk = data.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('operacao_producao')
                .upsert(chunk, {
                    onConflict: 'lab_id,identificador_unico',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error("Error uploading production data batch:", error);
                throw error;
            }
        }
    },

    async deleteAll(labId: string) {
        const { error } = await supabase
            .from('operacao_producao')
            .delete()
            .eq('lab_id', labId);

        if (error) throw error;
    }
};

import { supabase } from "@/lib/supabase";

// Lista mestre: cada Identificação (amostra física) tem uma lista ORDENADA de
// Etiquetas — a posição da etiqueta na lista É o "Dia" do round interlaboratorial
// (etiquetas[0] = Dia 1, etiquetas[1] = Dia 2...). Os valores-alvo valem pra
// essa identificação em qualquer dia/máquina.
export interface InterlabIdentificacao {
    id: string;
    labId: string;
    identificacao: string;
    etiquetas: string[];
    targetValues: Record<string, string>;
    createdBy: string | null;
    createdAt: string;
}

// Um arquivo gerado de verdade: uma Identificação, num Dia, numa Máquina, com
// o operador daquela máquina e a leitura computada (fixa).
export interface InterlabGeneration {
    id: string;
    labId: string;
    identificacaoId: string;
    dayIndex: number;
    machineId: string;
    operatorCode: string | null;
    etiqueta: string;
    repIndex: number;
    generatedTime: string;
    reading: Record<string, number>;
    filename: string;
    createdBy: string | null;
    createdAt: string;
}

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const mapIdentificacao = (row: any): InterlabIdentificacao => ({
    id: row.id,
    labId: row.lab_id,
    identificacao: row.identificacao,
    etiquetas: row.etiquetas || [],
    targetValues: row.target_values,
    createdBy: row.created_by,
    createdAt: row.created_at
});

const mapGeneration = (row: any): InterlabGeneration => ({
    id: row.id,
    labId: row.lab_id,
    identificacaoId: row.identificacao_id,
    dayIndex: row.day_index,
    machineId: row.machine_id,
    operatorCode: row.operator_code,
    etiqueta: row.etiqueta,
    repIndex: row.rep_index,
    generatedTime: row.generated_time,
    reading: row.reading,
    filename: row.filename,
    createdBy: row.created_by,
    createdAt: row.created_at
});

export const interlaboratorialService = {
    async listIdentificacoes(labId: string): Promise<InterlabIdentificacao[]> {
        if (!isSupabaseEnabled()) return [];
        const { data, error } = await supabase
            .from("interlab_identificacoes")
            .select("*")
            .eq("lab_id", labId)
            .order("created_at", { ascending: true });
        if (error || !data) return [];
        return data.map(mapIdentificacao);
    },

    async createIdentificacao(labId: string, identificacao: string, etiquetas: string[], targetValues: Record<string, string>, createdBy: string): Promise<InterlabIdentificacao> {
        const { data, error } = await supabase
            .from("interlab_identificacoes")
            .insert({ lab_id: labId, identificacao, etiquetas, target_values: targetValues, created_by: createdBy })
            .select("*")
            .single();
        if (error || !data) throw error || new Error("Falha ao criar identificação");
        return mapIdentificacao(data);
    },

    async updateIdentificacao(id: string, etiquetas: string[], targetValues: Record<string, string>): Promise<void> {
        const { error } = await supabase
            .from("interlab_identificacoes")
            .update({ etiquetas, target_values: targetValues, updated_at: new Date().toISOString() })
            .eq("id", id);
        if (error) throw error;
    },

    async deleteIdentificacao(id: string): Promise<void> {
        const { error } = await supabase.from("interlab_identificacoes").delete().eq("id", id);
        if (error) throw error;
    },

    async listGenerations(labId: string): Promise<InterlabGeneration[]> {
        if (!isSupabaseEnabled()) return [];
        const { data, error } = await supabase
            .from("interlab_generations")
            .select("*")
            .eq("lab_id", labId)
            .order("day_index", { ascending: true })
            .order("created_at", { ascending: true });
        if (error || !data) return [];
        return data.map(mapGeneration);
    },

    async saveGenerations(rows: Array<{
        labId: string; identificacaoId: string; dayIndex: number; machineId: string;
        operatorCode: string; etiqueta: string; repIndex: number; generatedTime: string;
        reading: Record<string, number>; filename: string; createdBy: string;
    }>): Promise<void> {
        const { error } = await supabase.from("interlab_generations").insert(rows.map(r => ({
            lab_id: r.labId,
            identificacao_id: r.identificacaoId,
            day_index: r.dayIndex,
            machine_id: r.machineId,
            operator_code: r.operatorCode,
            etiqueta: r.etiqueta,
            rep_index: r.repIndex,
            generated_time: r.generatedTime,
            reading: r.reading,
            filename: r.filename,
            created_by: r.createdBy
        })));
        if (error) throw error;
    },

    async deleteGeneration(id: string): Promise<void> {
        const { error } = await supabase.from("interlab_generations").delete().eq("id", id);
        if (error) throw error;
    },

    subscribe(labId: string, callback: () => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel(`interlab-${labId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "interlab_identificacoes", filter: `lab_id=eq.${labId}` }, callback)
            .on("postgres_changes", { event: "*", schema: "public", table: "interlab_generations", filter: `lab_id=eq.${labId}` }, callback)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }
};

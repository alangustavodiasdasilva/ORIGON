import { supabase } from "@/lib/supabase";

// Prefixo + sequência do nome dos arquivos gerados, configurável por laboratório
// (ex: Sorriso usa "R_X", Rondonópolis usa "RAX", cada um com sua própria
// numeração). A sequência é reservada atomicamente no banco (RPC
// reserve_lab_filename_sequence) — evita colisão quando vários analistas do
// mesmo laboratório geram arquivos ao mesmo tempo, e continua de onde parou
// independente de qual computador/analista está gerando.
export interface LabFilenameConfig {
    labId: string;
    prefix: string;
    nextSequence: number;
    sequenceDigits: number;
    updatedBy: string | null;
    updatedAt: string | null;
}

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const filenameConfigService = {
    async get(labId: string): Promise<LabFilenameConfig | null> {
        if (!isSupabaseEnabled()) return null;
        const { data, error } = await supabase.from("lab_filename_config").select("*").eq("lab_id", labId).maybeSingle();
        if (error || !data) return null;
        return {
            labId: data.lab_id,
            prefix: data.prefix,
            nextSequence: Number(data.next_sequence),
            sequenceDigits: data.sequence_digits,
            updatedBy: data.updated_by,
            updatedAt: data.updated_at
        };
    },

    async set(labId: string, prefix: string, nextSequence: number, sequenceDigits: number, updatedBy: string): Promise<void> {
        const { error } = await supabase
            .from("lab_filename_config")
            .upsert({
                lab_id: labId,
                prefix,
                next_sequence: nextSequence,
                sequence_digits: sequenceDigits,
                updated_by: updatedBy,
                updated_at: new Date().toISOString()
            }, { onConflict: "lab_id" });
        if (error) throw error;
    },

    // Reserva "count" números sequenciais de uma vez (uma geração pode criar
    // várias repetições/arquivos) e retorna o prefixo + primeiro número da
    // faixa reservada + largura de zero-padding a usar.
    async reserveSequence(labId: string, count: number): Promise<{ prefix: string; startSeq: number; digits: number } | null> {
        if (!isSupabaseEnabled()) return null;
        try {
            const { data, error } = await supabase.rpc("reserve_lab_filename_sequence", { p_lab_id: labId, p_count: count });
            if (error || !data || data.length === 0) return null;
            const row = data[0];
            return { prefix: row.prefix, startSeq: Number(row.start_seq), digits: row.sequence_digits };
        } catch {
            return null;
        }
    },

    subscribe(labId: string, callback: (config: LabFilenameConfig | null) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel(`lab-filename-config-${labId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "lab_filename_config", filter: `lab_id=eq.${labId}` },
                async () => { callback(await filenameConfigService.get(labId)); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }
};

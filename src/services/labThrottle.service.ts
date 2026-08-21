import { supabase } from "@/lib/supabase";

// Lentidão artificial por laboratório — controle exclusivo do Alan (Admin.tsx
// só mostra essa seção pro user.id dele). delay_ms é "tipo volume": 0 =
// desligado, e sobe em milissegundos de atraso real por requisição — todo
// mundo QUE NÃO é o Alan sente esse atraso nesse laboratório
// (src/lib/networkThrottle.ts injeta o atraso real nas requisições).
const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const labThrottleService = {
    async get(labId: string): Promise<number> {
        if (!isSupabaseEnabled() || !labId) return 0;
        const { data, error } = await supabase.from("lab_throttle").select("delay_ms").eq("lab_id", labId).maybeSingle();
        if (error || !data) return 0;
        return Number(data.delay_ms) || 0;
    },

    async listAll(): Promise<Record<string, number>> {
        if (!isSupabaseEnabled()) return {};
        const { data, error } = await supabase.from("lab_throttle").select("lab_id, delay_ms");
        if (error || !data) return {};
        const map: Record<string, number> = {};
        data.forEach((row: any) => { map[row.lab_id] = Number(row.delay_ms) || 0; });
        return map;
    },

    async set(labId: string, delayMs: number, updatedBy: string): Promise<void> {
        const { error } = await supabase.from("lab_throttle").upsert({
            lab_id: labId, delay_ms: Math.round(delayMs), updated_by: updatedBy, updated_at: new Date().toISOString()
        }, { onConflict: "lab_id" });
        if (error) throw error;
    },

    subscribe(labId: string, callback: (delayMs: number) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel(`lab-throttle-${labId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "lab_throttle", filter: `lab_id=eq.${labId}` },
                (payload: any) => { callback(Number(payload.new?.delay_ms) || 0); })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }
};

import { supabase } from "@/lib/supabase";

export interface SystemStatus {
    maintenanceMode: boolean;
    updatedBy: string | null;
    updatedAt: string | null;
}

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const systemStatusService = {
    async get(): Promise<SystemStatus> {
        if (!isSupabaseEnabled()) return { maintenanceMode: false, updatedBy: null, updatedAt: null };
        const { data, error } = await supabase
            .from("system_status")
            .select("*")
            .eq("id", true)
            .maybeSingle();
        if (error || !data) return { maintenanceMode: false, updatedBy: null, updatedAt: null };
        return { maintenanceMode: !!data.maintenance_mode, updatedBy: data.updated_by, updatedAt: data.updated_at };
    },

    async setMaintenanceMode(enabled: boolean, updatedBy: string): Promise<void> {
        const { error } = await supabase
            .from("system_status")
            .update({ maintenance_mode: enabled, updated_by: updatedBy, updated_at: new Date().toISOString() })
            .eq("id", true);
        if (error) throw error;
    },

    subscribe(callback: (status: SystemStatus) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel("system-status-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "system_status" },
                (payload) => {
                    const row = payload.new as any;
                    if (row) {
                        callback({ maintenanceMode: !!row.maintenance_mode, updatedBy: row.updated_by, updatedAt: row.updated_at });
                    }
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }
};

import { supabase } from "@/lib/supabase";

export interface SystemStatus {
    maintenanceMode: boolean;
    updatedBy: string | null;
    updatedAt: string | null;
}

export interface LabLockInfo {
    labId: string;
    updatedBy: string | null;
    updatedAt: string | null;
}

export interface UserLockInfo {
    userId: string;
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
    },

    // ── Travamento por laboratório ────────────────────────────────────────
    // Um laboratório "travado" é simplesmente uma linha presente nessa tabela.
    // Trava = insere a linha; destrava = apaga.

    async getLockedLabs(): Promise<LabLockInfo[]> {
        if (!isSupabaseEnabled()) return [];
        const { data, error } = await supabase.from("lab_lockdown").select("*");
        if (error || !data) return [];
        return data.map((row: any) => ({ labId: row.lab_id, updatedBy: row.updated_by, updatedAt: row.updated_at }));
    },

    async lockLab(labId: string, updatedBy: string): Promise<void> {
        const { error } = await supabase
            .from("lab_lockdown")
            .upsert({ lab_id: labId, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "lab_id" });
        if (error) throw error;
    },

    async unlockLab(labId: string): Promise<void> {
        const { error } = await supabase.from("lab_lockdown").delete().eq("lab_id", labId);
        if (error) throw error;
    },

    subscribeLabLockdown(callback: (locked: LabLockInfo[]) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel("lab-lockdown-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "lab_lockdown" },
                async () => {
                    // Qualquer mudança (insert/update/delete) — busca a lista inteira de novo,
                    // é a forma mais simples de manter tudo consistente com poucas linhas.
                    callback(await systemStatusService.getLockedLabs());
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    },

    // ── Travamento por usuário individual ───────────────────────────────────
    // Mesmo padrão do lab_lockdown: um usuário "travado" é simplesmente uma
    // linha presente nessa tabela. Trava = insere a linha; destrava = apaga.

    async getLockedUsers(): Promise<UserLockInfo[]> {
        if (!isSupabaseEnabled()) return [];
        const { data, error } = await supabase.from("user_lockdown").select("*");
        if (error || !data) return [];
        return data.map((row: any) => ({ userId: row.user_id, updatedBy: row.updated_by, updatedAt: row.updated_at }));
    },

    async lockUser(userId: string, updatedBy: string): Promise<void> {
        const { error } = await supabase
            .from("user_lockdown")
            .upsert({ user_id: userId, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (error) throw error;
    },

    async unlockUser(userId: string): Promise<void> {
        const { error } = await supabase.from("user_lockdown").delete().eq("user_id", userId);
        if (error) throw error;
    },

    subscribeUserLockdown(callback: (locked: UserLockInfo[]) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel("user-lockdown-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "user_lockdown" },
                async () => {
                    callback(await systemStatusService.getLockedUsers());
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }
};

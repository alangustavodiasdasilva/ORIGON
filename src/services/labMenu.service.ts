import { supabase } from "@/lib/supabase";
import { ALL_MENU_ITEM_KEYS, type MenuItemKey } from "@/lib/menuItems";

// Controle de quais abas do menu cada laboratório pode usar (Admin > Menu por
// Laboratório — só admin_global). Sem registro pra um lab = todas liberadas
// (default), pra não quebrar laboratório nenhum que nunca foi configurado.
const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const labMenuService = {
    async get(labId: string): Promise<MenuItemKey[]> {
        if (!isSupabaseEnabled() || !labId) return ALL_MENU_ITEM_KEYS;
        const { data, error } = await supabase.from("lab_menu_config").select("enabled_items").eq("lab_id", labId).maybeSingle();
        if (error || !data) return ALL_MENU_ITEM_KEYS;
        return Array.isArray(data.enabled_items) ? data.enabled_items : ALL_MENU_ITEM_KEYS;
    },

    async listAll(): Promise<Record<string, MenuItemKey[]>> {
        if (!isSupabaseEnabled()) return {};
        const { data, error } = await supabase.from("lab_menu_config").select("lab_id, enabled_items");
        if (error || !data) return {};
        const map: Record<string, MenuItemKey[]> = {};
        data.forEach((row: any) => { map[row.lab_id] = Array.isArray(row.enabled_items) ? row.enabled_items : ALL_MENU_ITEM_KEYS; });
        return map;
    },

    async set(labId: string, enabledItems: MenuItemKey[], updatedBy: string): Promise<void> {
        const { error } = await supabase.from("lab_menu_config").upsert({
            lab_id: labId, enabled_items: enabledItems, updated_by: updatedBy, updated_at: new Date().toISOString()
        }, { onConflict: "lab_id" });
        if (error) throw error;
    },

    subscribe(labId: string, callback: (enabledItems: MenuItemKey[]) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        // Nome de canal ÚNICO por assinatura (igual aos outros serviços). Com um
        // nome fixo, reassinar o mesmo lab reaproveitava um canal já inscrito e o
        // Supabase quebrava com "cannot add postgres_changes callbacks ... after
        // subscribe()", derrubando o app inteiro pela ErrorBoundary.
        const channel = supabase
            .channel(`lab-menu-config-${labId}-${Math.random().toString(36).slice(2, 9)}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "lab_menu_config", filter: `lab_id=eq.${labId}` },
                (payload: any) => { callback(Array.isArray(payload.new?.enabled_items) ? payload.new.enabled_items : ALL_MENU_ITEM_KEYS); })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }
};

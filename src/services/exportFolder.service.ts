import { supabase } from "@/lib/supabase";

// Guarda só o NOME da pasta configurada por laboratório, pra qualquer admin ver
// o que está configurado. O acesso de escrita de verdade (FileSystemDirectoryHandle)
// é local a cada computador — veja src/lib/folderHandleStore.ts.
export interface ExportFolderInfo {
    labId: string;
    folderName: string;
    updatedBy: string | null;
    updatedAt: string | null;
}

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const exportFolderService = {
    async list(): Promise<ExportFolderInfo[]> {
        if (!isSupabaseEnabled()) return [];
        const { data, error } = await supabase.from("lab_export_folder").select("*");
        if (error || !data) return [];
        return data.map((row: any) => ({
            labId: row.lab_id,
            folderName: row.folder_name,
            updatedBy: row.updated_by,
            updatedAt: row.updated_at
        }));
    },

    async get(labId: string): Promise<ExportFolderInfo | null> {
        if (!isSupabaseEnabled()) return null;
        const { data, error } = await supabase.from("lab_export_folder").select("*").eq("lab_id", labId).maybeSingle();
        if (error || !data) return null;
        return { labId: data.lab_id, folderName: data.folder_name, updatedBy: data.updated_by, updatedAt: data.updated_at };
    },

    async set(labId: string, folderName: string, updatedBy: string): Promise<void> {
        const { error } = await supabase
            .from("lab_export_folder")
            .upsert({ lab_id: labId, folder_name: folderName, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "lab_id" });
        if (error) throw error;
    },

    async remove(labId: string): Promise<void> {
        const { error } = await supabase.from("lab_export_folder").delete().eq("lab_id", labId);
        if (error) throw error;
    },

    subscribe(callback: (info: ExportFolderInfo[]) => void): () => void {
        if (!isSupabaseEnabled()) return () => {};
        const channel = supabase
            .channel("lab-export-folder-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "lab_export_folder" },
                async () => { callback(await exportFolderService.list()); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }
};

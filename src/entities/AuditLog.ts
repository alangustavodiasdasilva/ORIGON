import { supabase } from "@/lib/supabase";

export interface AuditLogEntry {
    id: string;
    table_name: string;
    record_id: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    old_data?: any;
    new_data?: any;
    user_name: string;
    created_at: string;
}

const LOGS_KEY = 'fibertech_audit_logs';

const isSupabaseEnabled = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!url && url !== 'YOUR_SUPABASE_URL' && !!key && key !== 'YOUR_SUPABASE_ANON_KEY';
};

const getStoredLogs = (): AuditLogEntry[] => {
    try {
        const data = localStorage.getItem(LOGS_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Error reading audit logs from storage", error);
        return [];
    }
};

const saveStoredLogs = (logs: AuditLogEntry[]) => {
    try {
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    } catch (error) {
        console.error("Error saving audit logs to storage", error);
    }
};

export const AuditLogService = {
    async logAction(
        tableName: string,
        recordId: string,
        action: 'CREATE' | 'UPDATE' | 'DELETE',
        oldData: any,
        newData: any,
        userName?: string
    ): Promise<void> {
        let finalUserName = userName;
        if (!finalUserName || finalUserName === 'Sistema') {
            try {
                const session = localStorage.getItem("fibertech_session");
                if (session) {
                    const parsedUser = JSON.parse(session);
                    if (parsedUser && parsedUser.nome) {
                        finalUserName = parsedUser.nome;
                    }
                }
            } catch(e) {}
            if (!finalUserName) finalUserName = 'Sistema';
        }

        const payload: Omit<AuditLogEntry, 'id'> = {
            table_name: tableName,
            record_id: recordId,
            action,
            old_data: oldData,
            new_data: newData,
            user_name: finalUserName,
            created_at: new Date().toISOString()
        };

        if (isSupabaseEnabled()) {
            try {
                const { error } = await supabase.from('audit_logs').insert([payload]);
                if (error) throw error;
                return;
            } catch (err) {
                console.warn("Supabase audit_logs missing or failed, saving locally", err);
            }
        }

        const logs = getStoredLogs();
        const newLog: AuditLogEntry = {
            ...payload,
            id: Math.random().toString(36).substr(2, 9)
        };
        logs.unshift(newLog); // prepend
        
        // Keep only last 1000 logs locally to avoid quota issues
        if (logs.length > 1000) logs.pop();
        
        saveStoredLogs(logs);
    },

    async listLogs(limit: number = 100): Promise<AuditLogEntry[]> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase
                    .from('audit_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (error) throw error;
                if (data) return data as AuditLogEntry[];
            } catch (err) {
                console.warn("Supabase audit_logs read failed", err);
            }
        }
        return getStoredLogs().slice(0, limit);
    },

    async listByRecord(tableName: string, recordId: string): Promise<AuditLogEntry[]> {
        if (isSupabaseEnabled()) {
            try {
                const { data, error } = await supabase
                    .from('audit_logs')
                    .select('*')
                    .eq('table_name', tableName)
                    .eq('record_id', recordId)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                if (data) return data as AuditLogEntry[];
            } catch (err) {
                // ignore
            }
        }
        const logs = getStoredLogs();
        return logs.filter(l => l.table_name === tableName && l.record_id === recordId);
    }
};

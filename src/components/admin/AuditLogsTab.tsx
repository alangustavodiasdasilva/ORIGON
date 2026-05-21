import { useState, useEffect } from "react";
import { AuditLogService, type AuditLogEntry } from "@/entities/AuditLog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/ToastContext";
import { Clock, Undo, Search, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";

function formatDetails(log: AuditLogEntry) {
    if (log.action === 'CREATE') {
        const name = log.new_data?.nome || log.new_data?.identificacao || log.new_data?.codigo || 'Registro';
        return `Criou: ${name}`;
    }
    if (log.action === 'DELETE') {
        const name = log.old_data?.nome || log.old_data?.identificacao || log.old_data?.codigo || 'Registro';
        return `Excluiu: ${name}`;
    }
    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
        const changed = [];
        for (const key in log.new_data) {
            if (key === 'updated_at' || key === 'created_at' || key === 'id') continue;
            const oldVal = log.old_data[key];
            const newVal = log.new_data[key];
            if (typeof oldVal !== 'object' && typeof newVal !== 'object' && oldVal !== newVal) {
                changed.push(`${key}: ${oldVal || 'vazio'} ➔ ${newVal || 'vazio'}`);
            }
        }
        if (changed.length > 0) {
            const result = changed.join(' | ');
            return result.length > 60 ? result.substring(0, 60) + '...' : result;
        }
        return 'Editou registro (dados internos)';
    }
    return '-';
}

export default function AuditLogsTab() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { addToast } = useToast();

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const data = await AuditLogService.listLogs(200);
            setLogs(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRevert = async (log: AuditLogEntry) => {
        if (!confirm(`Tem certeza que deseja reverter esta ação de ${log.action} em ${log.table_name}?`)) return;

        try {
            // Rollback logic depends on action
            let error = null;
            if (log.action === 'UPDATE') {
                if (!log.old_data) throw new Error("Sem dados antigos para restaurar.");
                const { error: err } = await supabase.from(log.table_name).update(log.old_data).eq('id', log.record_id);
                error = err;
            } else if (log.action === 'DELETE') {
                if (!log.old_data) throw new Error("Sem dados antigos para restaurar.");
                const { error: err } = await supabase.from(log.table_name).insert([log.old_data]);
                error = err;
            } else if (log.action === 'CREATE') {
                const { error: err } = await supabase.from(log.table_name).delete().eq('id', log.record_id);
                error = err;
            }

            if (error) throw error;
            
            // Log the revert action itself
            await AuditLogService.logAction(
                log.table_name,
                log.record_id,
                'UPDATE', // Or REVERT if we added it, but UPDATE works
                log.new_data,
                log.old_data,
                'SISTEMA (Reversão)'
            );

            addToast({ title: "Ação Revertida com Sucesso", type: "success" });
            loadLogs();
        } catch (err: any) {
            addToast({ title: "Erro na reversão", description: err.message || "Apenas em modo Nuvem completo", type: "error" });
        }
    };

    const filteredLogs = logs.filter(l => 
        l.table_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        l.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.record_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="border border-neutral-200 bg-white p-10 shadow-sm animate-fade-in">
            <div className="flex items-center justify-between border-b border-black pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5" />
                    <h3 className="text-xl font-serif uppercase">Histórico de Auditoria Global</h3>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar (tabela, usuário, ID)..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 h-10 border border-neutral-200 text-[10px] uppercase tracking-widest font-bold w-64 focus:outline-none focus:border-black"
                        />
                    </div>
                    <Button variant="outline" onClick={loadLogs} className="rounded-none h-10 text-[10px] uppercase">
                        <RefreshCcw className="h-4 w-4 mr-2" /> Atualizar
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Data/Hora</th>
                            <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Usuário</th>
                            <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Tabela</th>
                            <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Ação</th>
                            <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">Detalhes</th>
                            <th className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-neutral-500 text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="py-10 text-center text-xs font-mono uppercase text-neutral-400">Carregando logs...</td></tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr><td colSpan={6} className="py-10 text-center text-xs font-mono uppercase text-neutral-400">Nenhum registro encontrado.</td></tr>
                        ) : (
                            filteredLogs.map(log => (
                                <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                    <td className="py-3 px-4 text-xs font-mono">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                                    <td className="py-3 px-4 text-xs font-bold">{log.user_name}</td>
                                    <td className="py-3 px-4 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50/50">{log.table_name}</td>
                                    <td className="py-3 px-4">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 ${
                                            log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                                            log.action === 'UPDATE' ? 'bg-amber-100 text-amber-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-[11px] text-neutral-600 max-w-[200px] truncate" title={formatDetails(log)}>
                                        {formatDetails(log)}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => handleRevert(log)}
                                            className="h-7 text-[9px] uppercase tracking-widest border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                                            title="Desfazer e Restaurar Dados Antigos"
                                        >
                                            <Undo className="h-3 w-3 mr-1" /> Reverter
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

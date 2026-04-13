import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface HistoryRecord {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  user_name: string;
  created_at: string;
}

export function AuditTimeline({ tableName, recordId }: { tableName?: string, recordId?: string }) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let query = supabase
      .from('update_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (tableName) query = query.eq('table_name', tableName);
    if (recordId) query = query.eq('record_id', recordId);

    const fetchHistory = async () => {
      const { data, error } = await query;
      if (!error && data) {
        setHistory(data as HistoryRecord[]);
      }
      setLoading(false);
    };

    fetchHistory();

    // Inscreve no Realtime para adicionar novos na hora
    const channel = supabase.channel('history-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'update_history' }, (payload) => {
        const newRecord = payload.new as HistoryRecord;
        if (
          (!tableName || newRecord.table_name === tableName) &&
          (!recordId || newRecord.record_id === recordId)
        ) {
           setHistory(prev => [newRecord, ...prev]);
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, recordId]);

  if (loading) return <div className="animate-pulse h-10 bg-slate-100 rounded" />;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Linha do Tempo de Alterações
      </h3>
      
      <div className="space-y-4">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Nenhum registro encontrado.</p>
        ) : (
          <div className="relative border-l border-slate-200 ml-3 space-y-4">
            {history.map((record, index) => (
              <div key={record.id} className="pl-6 relative">
                {/* Timeline dot */}
                <div className={`absolute w-3 h-3 rounded-full -left-1.5 top-1.5 border-2 border-white
                  ${record.action === 'INSERT' ? 'bg-green-500' : 
                    record.action === 'UPDATE' ? 'bg-blue-500' : 'bg-red-500'}`} 
                />
                
                <div className="text-sm">
                  <span className="font-medium text-slate-900">{record.user_name || 'Sistema'}</span>{' '}
                  <span className="text-slate-500">
                    {record.action === 'INSERT' && 'criou um novo registro em'}
                    {record.action === 'UPDATE' && 'atualizou um registro em'}
                    {record.action === 'DELETE' && 'removeu um registro de'}
                  </span>{' '}
                  <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{record.table_name}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {new Date(record.created_at).toLocaleString('pt-BR')}  (ID: {record.record_id?.substring(0,8) || 'N/A'}..)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

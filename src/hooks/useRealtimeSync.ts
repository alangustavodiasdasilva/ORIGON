import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface SyncWarning {
  table: string;
  recordId: string;
  needsSync: boolean;
}

export function useRealtimeSync(tableToWatch: string) {
  const [syncWarnings, setSyncWarnings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let channel: RealtimeChannel;

    const setupRealtime = () => {
      channel = supabase
        .channel(`public:${tableToWatch}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: tableToWatch },
          (payload) => {
            // Outro usuário (ou processo) alterou essa linha.
            // Precisamos avisar a interface.
            const recordId = payload.new.id?.toString();
            if (recordId) {
              setSyncWarnings(prev => ({
                ...prev,
                [recordId]: true
              }));
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [tableToWatch]);

  const clearSyncWarning = (recordId: string) => {
    setSyncWarnings(prev => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
  };

  const hasWarning = (recordId: string) => !!syncWarnings[recordId];

  return {
    syncWarnings,
    hasWarning,
    clearSyncWarning
  };
}

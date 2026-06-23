import { useEffect, useState } from 'react';
import { realtimeService } from '@/services/RealtimeService';
import type { PresenceState } from '@/services/RealtimeService';

export function usePresence() {
  const [presences, setPresences] = useState<Record<string, PresenceState[]>>({});

  useEffect(() => {
    // Inscreve para atualizações de presença
    const unsubscribe = realtimeService.subscribeToPresence((state) => {
      setPresences(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Helpers
  const onlineUsers = Object.values(presences).map(p => p[0]).filter(Boolean);
  
  const getTypingUsersForRecord = (table: string, id: string) => {
    return onlineUsers.filter(u => 
      u.typing_on?.table === table && u.typing_on?.id === id
    );
  };

  const updateTypingStatus = async (userId: string, table: string | null, id: string | null) => {
     await realtimeService.updatePresence({
       user_id: userId,
       typing_on: table && id ? { table, id } : null
     });
  };

  return {
    presences,
    onlineUsers,
    getTypingUsersForRecord,
    updateTypingStatus
  };
}

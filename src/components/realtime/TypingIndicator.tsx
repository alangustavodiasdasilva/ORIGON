import React from 'react';
import { usePresence } from '@/hooks/usePresence';

interface TypingIndicatorProps {
  table: string;
  recordId: string;
}

export function TypingIndicator({ table, recordId }: TypingIndicatorProps) {
  const { getTypingUsersForRecord } = usePresence();
  
  const typingUsers = getTypingUsersForRecord(table, recordId);

  if (typingUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-orange-600 animate-pulse mt-1">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
      {typingUsers.length === 1 
        ? `${typingUsers[0].user_name} está editando...`
        : `${typingUsers.length} usuários estão editando...`
      }
    </div>
  );
}

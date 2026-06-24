import { usePresence } from '@/hooks/usePresence';

export function PresenceIndicators() {
  const { onlineUsers } = usePresence();

  if (!onlineUsers || onlineUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
      <span className="text-xs font-medium text-slate-500">Online agora:</span>
      <div className="flex -space-x-2 overflow-hidden">
        {onlineUsers.map((user, idx) => (
          <div
            key={idx}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white border-2 border-white text-xs font-bold relative"
            title={`${user.user_name} (${user.status})`}
          >
            {user.user_foto ? (
                <>
                <img 
                    src={user.user_foto} 
                    className="w-full h-full object-cover rounded-full" 
                    alt={user.user_name} 
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.querySelector('.fallback-initials');
                        if (fallback) fallback.classList.remove('hidden');
                    }}
                />
                <span className="fallback-initials hidden">
                    {user.user_name?.substring(0, 2).toUpperCase() || 'U'}
                </span>
                </>
            ) : (
                user.user_name?.substring(0, 2).toUpperCase() || 'U'
            )}
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full z-10"></span>
          </div>
        ))}
      </div>
    </div>
  );
}

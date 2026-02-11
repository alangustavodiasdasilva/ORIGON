
import { useState, useEffect } from 'react';
import { Bell, X, Check, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { NotificationService, type Notification } from '@/services/NotificationService';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export default function NotificationCenter() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        // Safe guard against null user inside effect, though component returns early if !user
        if (!user) return;

        const loadNotifications = async () => {
            try {
                const userNotifications = await NotificationService.getForUser(user.id);
                setNotifications(userNotifications);
                const count = await NotificationService.getUnreadCount(user.id);
                setUnreadCount(count);
            } catch (error) {
                console.error("Failed to load notifications", error);
            }
        };

        loadNotifications();

        // Subscribe to changes
        const unsubscribe = NotificationService.subscribe(() => {
            loadNotifications();
        });

        return () => {
            unsubscribe();
        };
    }, [user]);

    if (!user) return null;

    const handleMarkAsRead = (id: string) => {
        NotificationService.markAsRead(id);
    };

    const handleMarkAllAsRead = () => {
        NotificationService.markAllAsRead(user.id);
    };

    const handleDelete = (id: string) => {
        NotificationService.delete(id);
    };

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'success': return <CheckCircle className="h-5 w-5" />;
            case 'error': return <AlertCircle className="h-5 w-5" />;
            case 'warning': return <AlertCircle className="h-5 w-5" />;
            case 'info': return <Info className="h-5 w-5" />;
        }
    };

    const getTypeColor = (type: Notification['type']) => {
        switch (type) {
            case 'success': return 'text-green-600 bg-green-50 border-green-200';
            case 'error': return 'text-red-600 bg-red-50 border-red-200';
            case 'warning': return 'text-orange-600 bg-orange-50 border-orange-200';
            case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
        }
    };

    return (
        <div className="relative">
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 hover:bg-neutral-100 rounded-full transition-colors"
            >
                <Bell className="h-5 w-5 text-neutral-700" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Notification Panel */}
            {isOpen && (
                <>
                    {/* Overlay */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Panel */}
                    <div className="absolute right-0 top-12 z-50 w-96 max-h-[600px] bg-white border border-neutral-200 shadow-2xl animate-fade-in">
                        {/* Header */}
                        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
                            <div>
                                <h3 className="font-serif text-lg font-bold">Notificações</h3>
                                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                                    {unreadCount} não lidas
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={handleMarkAllAsRead}
                                        className="text-[9px] uppercase tracking-widest text-neutral-600 hover:text-black px-2 py-1 hover:bg-neutral-100 transition-colors"
                                    >
                                        <Check className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="text-neutral-600 hover:text-black"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-[500px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-neutral-400">
                                    <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                    <p className="text-sm">{t('notifications.no_notifications')}</p>
                                </div>
                            ) : (
                                notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={cn(
                                            "p-4 border-b border-neutral-100 hover:bg-neutral-50 transition-colors",
                                            !notification.read && "bg-blue-50/30"
                                        )}
                                    >
                                        <div className="flex gap-3">
                                            <div className={cn(
                                                "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
                                                getTypeColor(notification.type)
                                            )}>
                                                {getIcon(notification.type)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <h4 className="font-bold text-sm">{notification.title}</h4>
                                                    {!notification.read && (
                                                        <span className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                                                    )}
                                                </div>

                                                <p className="text-xs text-neutral-600 mb-2">
                                                    {notification.message}
                                                </p>

                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-neutral-400 font-mono">
                                                        {new Date(notification.timestamp).toLocaleString('pt-BR', {
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>

                                                    <div className="flex gap-2">
                                                        {!notification.read && (
                                                            <button
                                                                onClick={() => handleMarkAsRead(notification.id)}
                                                                className="text-[9px] uppercase tracking-widest text-blue-600 hover:text-blue-800 px-2 py-1"
                                                            >
                                                                Marcar como lida
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(notification.id)}
                                                            className="text-neutral-400 hover:text-red-600"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

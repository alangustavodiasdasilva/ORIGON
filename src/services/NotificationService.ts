/**
 * Notification Service
 * Manages system notifications and alerts
 */

import { supabase } from "@/lib/supabase";

export type NotificationType = 'info' | 'warning' | 'error' | 'success';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    userId: string;
    labId?: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
}

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export class NotificationService {
    private static STORAGE_KEY = 'notifications';
    private static listeners: Set<(notifications: Notification[]) => void> = new Set();

    /**
     * Create a new notification
     */
    static async create(
        userId: string,
        type: NotificationType,
        priority: NotificationPriority,
        title: string,
        message: string,
        options?: {
            labId?: string;
            actionUrl?: string;
            metadata?: Record<string, any>;
        }
    ): Promise<Notification> {
        const notification: Notification = {
            id: crypto.randomUUID(),
            type,
            priority,
            title,
            message,
            timestamp: new Date().toISOString(),
            read: false,
            userId,
            labId: options?.labId,
            actionUrl: options?.actionUrl,
            metadata: options?.metadata
        };

        if (isSupabaseEnabled()) {
            const { error } = await supabase.from('notificacoes').insert([notification]);
            if (error) console.error("Error creating notification:", error);
            // We can optimistic update or just fetch
            this.notifyListeners(); // Will trigger fetch
            return notification;
        }

        const notifications = this.getAllSync();
        notifications.unshift(notification);

        this.saveSync(notifications);
        this.notifyListeners();

        return notification;
    }

    /**
     * Get all notifications (async)
     */
    static async getAll(): Promise<Notification[]> {
        if (isSupabaseEnabled()) {
            const { data, error } = await supabase
                .from('notificacoes')
                .select('*')
                .order('timestamp', { ascending: false });

            if (error) {
                console.error("Error fetching notifications:", error);
                return [];
            }
            return data;
        }
        return this.getAllSync();
    }

    // Sync version for local storage compatibility
    private static getAllSync(): Notification[] {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Get notifications for a user
     */
    static async getForUser(userId: string, unreadOnly = false): Promise<Notification[]> {
        if (isSupabaseEnabled()) {
            let query = supabase
                .from('notificacoes')
                .select('*')
                .eq('userId', userId)
                .order('timestamp', { ascending: false });

            if (unreadOnly) {
                query = query.eq('read', false);
            }

            const { data, error } = await query;
            if (error) return [];
            return data;
        }

        const all = this.getAllSync();
        let filtered = all.filter(n => n.userId === userId);

        if (unreadOnly) {
            filtered = filtered.filter(n => !n.read);
        }

        return filtered;
    }

    /**
     * Get unread count for user
     */
    static async getUnreadCount(userId: string): Promise<number> {
        const notifs = await this.getForUser(userId, true);
        return notifs.length;
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId: string): Promise<void> {
        if (isSupabaseEnabled()) {
            await supabase.from('notificacoes').update({ read: true }).eq('id', notificationId);
            this.notifyListeners();
            return;
        }

        const notifications = this.getAllSync();
        const notification = notifications.find(n => n.id === notificationId);

        if (notification) {
            notification.read = true;
            this.saveSync(notifications);
            this.notifyListeners();
        }
    }

    /**
     * Mark all as read for user
     */
    static async markAllAsRead(userId: string): Promise<void> {
        if (isSupabaseEnabled()) {
            await supabase.from('notificacoes').update({ read: true }).eq('userId', userId);
            this.notifyListeners();
            return;
        }

        const notifications = this.getAllSync();
        notifications.forEach(n => {
            if (n.userId === userId) {
                n.read = true;
            }
        });

        this.saveSync(notifications);
        this.notifyListeners();
    }

    /**
     * Delete notification
     */
    static async delete(notificationId: string): Promise<void> {
        if (isSupabaseEnabled()) {
            await supabase.from('notificacoes').delete().eq('id', notificationId);
            this.notifyListeners();
            return;
        }

        const notifications = this.getAllSync().filter(n => n.id !== notificationId);
        this.saveSync(notifications);
        this.notifyListeners();
    }

    /**
     * Subscribe to notification changes
     * Note: In a real app we would use realtime subscription from supabase
     */
    static subscribe(callback: (notifications: Notification[]) => void): () => void {
        this.listeners.add(callback);
        // Initial fetch
        this.getAll().then(n => callback(n));

        // Simple polling for supabase updates for now if needed, or rely on manual triggers
        return () => this.listeners.delete(callback);
    }

    /**
     * Helper: Create quality document alert
     */
    static async createQualityAlert(userId: string, labId: string, labName: string, documentName: string): Promise<void> {
        await this.create(
            userId,
            'warning',
            'high',
            'Documento de Qualidade Pendente',
            `O documento "${documentName}" requer revisão no laboratório ${labName}`,
            { labId, actionUrl: '/quality' }
        );
    }

    /**
     * Helper: Create compliance alert
     */
    static async createComplianceAlert(userId: string, labId: string, message: string): Promise<void> {
        await this.create(
            userId,
            'error',
            'critical',
            'Não Conformidade Detectada',
            message,
            { labId, actionUrl: '/quality' }
        );
    }

    /**
     * Helper: Create success notification
     */
    static async createSuccessNotification(userId: string, title: string, message: string): Promise<void> {
        await this.create(userId, 'success', 'low', title, message);
    }

    // Private methods
    private static saveSync(notifications: Notification[]): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(notifications));
    }

    private static async notifyListeners(): Promise<void> {
        const notifications = await this.getAll();
        this.listeners.forEach(listener => listener(notifications));
    }
}

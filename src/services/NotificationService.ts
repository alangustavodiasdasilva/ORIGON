/**
 * Notification Service
 * Manages system notifications and alerts
 */

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

export class NotificationService {
    private static STORAGE_KEY = 'notifications';
    private static listeners: Set<(notifications: Notification[]) => void> = new Set();

    /**
     * Create a new notification
     */
    static create(
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
    ): Notification {
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

        const notifications = this.getAll();
        notifications.unshift(notification);

        this.save(notifications);
        this.notifyListeners();

        return notification;
    }

    /**
     * Get all notifications
     */
    static getAll(): Notification[] {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Get notifications for a user
     */
    static getForUser(userId: string, unreadOnly = false): Notification[] {
        const all = this.getAll();
        let filtered = all.filter(n => n.userId === userId);

        if (unreadOnly) {
            filtered = filtered.filter(n => !n.read);
        }

        return filtered;
    }

    /**
     * Get unread count for user
     */
    static getUnreadCount(userId: string): number {
        return this.getForUser(userId, true).length;
    }

    /**
     * Mark notification as read
     */
    static markAsRead(notificationId: string): void {
        const notifications = this.getAll();
        const notification = notifications.find(n => n.id === notificationId);

        if (notification) {
            notification.read = true;
            this.save(notifications);
            this.notifyListeners();
        }
    }

    /**
     * Mark all as read for user
     */
    static markAllAsRead(userId: string): void {
        const notifications = this.getAll();
        notifications.forEach(n => {
            if (n.userId === userId) {
                n.read = true;
            }
        });

        this.save(notifications);
        this.notifyListeners();
    }

    /**
     * Delete notification
     */
    static delete(notificationId: string): void {
        const notifications = this.getAll().filter(n => n.id !== notificationId);
        this.save(notifications);
        this.notifyListeners();
    }

    /**
     * Subscribe to notification changes
     */
    static subscribe(callback: (notifications: Notification[]) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Helper: Create quality document alert
     */
    static createQualityAlert(userId: string, labId: string, labName: string, documentName: string): void {
        this.create(
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
    static createComplianceAlert(userId: string, labId: string, message: string): void {
        this.create(
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
    static createSuccessNotification(userId: string, title: string, message: string): void {
        this.create(userId, 'success', 'low', title, message);
    }

    // Private methods
    private static save(notifications: Notification[]): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(notifications));
    }

    private static notifyListeners(): void {
        const notifications = this.getAll();
        this.listeners.forEach(listener => listener(notifications));
    }
}

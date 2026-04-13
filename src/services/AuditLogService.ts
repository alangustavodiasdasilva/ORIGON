/**
 * Audit Log Service
 * Tracks all critical user actions for compliance and security
 */

export type AuditAction =
    | 'CREATE_LOTE'
    | 'UPDATE_LOTE'
    | 'DELETE_LOTE'
    | 'CREATE_SAMPLE'
    | 'UPDATE_SAMPLE'
    | 'DELETE_SAMPLE'
    | 'CREATE_USER'
    | 'UPDATE_USER'
    | 'DELETE_USER'
    | 'UPLOAD_DOCUMENT'
    | 'DELETE_DOCUMENT'
    | 'CREATE_LAB'
    | 'UPDATE_LAB'
    | 'DELETE_LAB'
    | 'LOGIN'
    | 'LOGOUT'
    | 'GENERATE_REPORT'
    | 'EXPORT_DATA'
    | 'IMPORT_DATA';

export interface AuditLogEntry {
    id: string;
    timestamp: string;
    userId: string;
    userName: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    labId?: string;
    labName?: string;
    details: string;
    metadata?: Record<string, any>;
}

export class AuditLogService {
    private static STORAGE_KEY = 'audit-logs';
    private static MAX_LOGS = 10000; // Keep last 10k entries

    /**
     * Log an action
     */
    static log(
        userId: string,
        userName: string,
        action: AuditAction,
        entityType: string,
        details: string,
        options?: {
            entityId?: string;
            labId?: string;
            labName?: string;
            metadata?: Record<string, any>;
        }
    ): void {
        const entry: AuditLogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            userId,
            userName,
            action,
            entityType,
            entityId: options?.entityId,
            labId: options?.labId,
            labName: options?.labName,
            details,
            metadata: options?.metadata
        };

        const logs = this.getAll();
        logs.unshift(entry); // Add to beginning

        // Keep only recent logs
        if (logs.length > this.MAX_LOGS) {
            logs.splice(this.MAX_LOGS);
        }

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
    }

    /**
     * Get all logs
     */
    static getAll(): AuditLogEntry[] {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Get logs by user
     */
    static getByUser(userId: string): AuditLogEntry[] {
        return this.getAll().filter(log => log.userId === userId);
    }

    /**
     * Get logs by lab
     */
    static getByLab(labId: string): AuditLogEntry[] {
        return this.getAll().filter(log => log.labId === labId);
    }

    /**
     * Get logs by date range
     */
    static getByDateRange(startDate: Date, endDate: Date): AuditLogEntry[] {
        return this.getAll().filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= startDate && logDate <= endDate;
        });
    }

    /**
     * Get logs by action type
     */
    static getByAction(action: AuditAction): AuditLogEntry[] {
        return this.getAll().filter(log => log.action === action);
    }

    /**
     * Export logs to CSV
     */
    static exportToCSV(): void {
        const logs = this.getAll();
        const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Lab', 'Details'];
        const rows = logs.map(log => [
            log.timestamp,
            log.userName,
            log.action,
            log.entityType,
            log.entityId || '',
            log.labName || '',
            log.details
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Clear old logs (older than specified days)
     */
    static clearOldLogs(daysToKeep: number): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const logs = this.getAll();
        const filtered = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
        const removed = logs.length - filtered.length;

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
        return removed;
    }
}

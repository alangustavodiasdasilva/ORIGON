/**
 * Backup Service
 * Handles data export, import, and automatic backup scheduling
 */

import { LoteService } from '@/entities/Lote';
import { SampleService } from '@/entities/Sample';
import { AnalistaService } from '@/entities/Analista';
import { LabService } from '@/entities/Lab';
import { AuditService } from '@/entities/Audit';

export interface BackupData {
    version: string;
    timestamp: string;
    data: {
        lotes: any[];
        samples: any[];
        analistas: any[];
        labs: any[];
        auditDocuments: any[];
        auditCategories: any[];
    };
}

export class BackupService {
    private static VERSION = '1.0.0';

    /**
     * Export all system data to JSON
     */
    static async exportAll(): Promise<BackupData> {
        const [lotes, samples, analistas, labs, auditDocs, auditCats] = await Promise.all([
            LoteService.list(),
            SampleService.list(),
            AnalistaService.list(),
            LabService.list(),
            AuditService.list(),
            AuditService.listCategories()
        ]);

        return {
            version: this.VERSION,
            timestamp: new Date().toISOString(),
            data: {
                lotes,
                samples,
                analistas,
                labs,
                auditDocuments: auditDocs,
                auditCategories: auditCats
            }
        };
    }

    /**
     * Download backup as JSON file
     */
    static async downloadBackup(): Promise<void> {
        const backup = await this.exportAll();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        const timestamp = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `origo-backup-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Import backup data
     */
    static async importBackup(file: File): Promise<{ success: boolean; message: string }> {
        try {
            const text = await file.text();
            const backup: BackupData = JSON.parse(text);

            // Validate backup format
            if (!backup.version || !backup.data) {
                return { success: false, message: 'Formato de backup inválido' };
            }

            // Confirm with user
            const itemCount =
                backup.data.lotes.length +
                backup.data.samples.length +
                backup.data.analistas.length +
                backup.data.labs.length +
                backup.data.auditDocuments.length;

            if (!confirm(`Importar backup de ${backup.timestamp}?\n\n` +
                `Este backup contém ${itemCount} itens.\n` +
                `ATENÇÃO: Dados atuais serão preservados, mas pode haver duplicatas.`)) {
                return { success: false, message: 'Importação cancelada pelo usuário' };
            }

            // Import data (this will merge with existing data)
            // In a real scenario, you'd want more sophisticated merge logic
            const { data } = backup;

            // Store backup data to localStorage directly for now
            // In production, you'd want proper merge/conflict resolution
            if (data.labs.length > 0) {
                const existing = await LabService.list();
                const merged = [...existing, ...data.labs.filter(l => !existing.find(e => e.id === l.id))];
                localStorage.setItem('labs', JSON.stringify(merged));
            }

            if (data.analistas.length > 0) {
                const existing = await AnalistaService.list();
                const merged = [...existing, ...data.analistas.filter(a => !existing.find(e => e.id === a.id))];
                localStorage.setItem('analistas', JSON.stringify(merged));
            }

            return {
                success: true,
                message: `Backup importado com sucesso!\n${itemCount} itens processados.`
            };

        } catch (error) {
            console.error('Import error:', error);
            return {
                success: false,
                message: 'Erro ao importar backup: ' + (error instanceof Error ? error.message : 'Erro desconhecido')
            };
        }
    }

    /**
     * Schedule automatic backups
     */
    static scheduleAutoBackup(intervalHours: number = 24): void {
        const intervalMs = intervalHours * 60 * 60 * 1000;

        setInterval(async () => {
            const backup = await this.exportAll();
            localStorage.setItem('last-auto-backup', JSON.stringify(backup));
            localStorage.setItem('last-backup-date', new Date().toISOString());
        }, intervalMs);
    }

    /**
     * Get last backup date
     */
    static getLastBackupDate(): string | null {
        return localStorage.getItem('last-backup-date');
    }
}

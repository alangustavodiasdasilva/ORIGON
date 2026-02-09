/**
 * HVI File Generator Service
 * Generates HVI format files (Uster/Premier) for individual samples
 * Based on color average and machine model - Using Interlaboratorial format
 */

import type { Sample } from '@/entities/Sample';

interface Machine {
    id: string;
    machineId: string;
    serialNumber: string;
    model: 'USTER' | 'PREMIER';
    labId: string;
}

export interface HVIPreviewData {
    content: string;
    filename: string;
    machineModel: 'USTER' | 'PREMIER';
    generatedValues: {
        mic: number;
        len: number;
        unf: number;
        str: number;
        rd: number;
        b: number;
    };
}

export class HVIFileGeneratorService {

    /**
     * Get machine by HVI number
     */
    private static getMachineByHVI(hviNumber: string): Machine | null {
        try {
            const stored = localStorage.getItem('registered_machines');
            if (!stored) return null;

            const machines: Machine[] = JSON.parse(stored);
            return machines.find(m => m.machineId === hviNumber) || null;
        } catch (error) {
            console.error('Error loading machines:', error);
            return null;
        }
    }

    /**
     * Get target values for generation (prioritizes Sample values, then Color Average)
     */
    private static getSampleTargetValues(sample: Sample, allSamples: Sample[] = []): { mic: number; len: number; unf: number; str: number; rd: number; b: number } {
        // Return Color Average strictly (Interlaboratorial rule: use average for the color)
        return this.getColorAverage(sample.cor, allSamples);

        // Fallback to Color Average (Original Logic)
        return this.getColorAverage(sample.cor, allSamples);
    }

    /**
     * Get average values based on sample color (Fallback)
     */
    private static getColorAverage(color?: string, allSamples: Sample[] = []): { mic: number; len: number; unf: number; str: number; rd: number; b: number } {
        const defaultValues = { mic: 4.50, len: 29.0, unf: 80.0, str: 29.0, rd: 80.0, b: 11.0 };

        if (!color) return defaultValues;

        try {
            // First, calculate averages from samples
            const colorSamples = allSamples.filter(s => s.cor === color);

            let calculatedAverages = { ...defaultValues };

            if (colorSamples.length > 0) {
                if (colorSamples.length > 0) {
                    // Calculate averages from real data
                    const calculateAvg = (field: keyof Sample) => {
                        const values = colorSamples
                            .map(s => {
                                const val = s[field];
                                if (typeof val === 'number') return val;
                                if (typeof val === 'string') return parseFloat(val.replace(',', '.'));
                                return NaN;
                            })
                            .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

                        if (values.length === 0) return defaultValues[field as keyof typeof defaultValues];

                        const sum = values.reduce((acc, val) => acc + val, 0);
                        const avg = sum / values.length;
                        return avg;
                    };

                    calculatedAverages = {
                        mic: calculateAvg('mic'),
                        len: calculateAvg('len'),
                        unf: calculateAvg('unf'),
                        str: calculateAvg('str'),
                        rd: calculateAvg('rd'),
                        b: calculateAvg('b')
                    };
                }
            }

            // Now check for custom (manually edited) averages and merge
            const customAveragesStr = localStorage.getItem('custom_color_averages');
            if (customAveragesStr) {
                try {
                    const customAverages = JSON.parse(customAveragesStr);
                    if (customAverages[color]) {
                        const custom = customAverages[color];

                        // Merge: use custom if exists, otherwise use calculated
                        const result = {
                            mic: custom.mic ?? calculatedAverages.mic,
                            len: custom.len ?? calculatedAverages.len,
                            unf: custom.unf ?? calculatedAverages.unf,
                            str: custom.str ?? calculatedAverages.str,
                            rd: custom.rd ?? calculatedAverages.rd,
                            b: custom.b ?? calculatedAverages.b
                        };
                        return result;
                    }
                } catch (e) {
                    console.warn('Error parsing custom averages:', e);
                }
            }

            return calculatedAverages;
        } catch (error) {
            console.error('Error calculating color averages:', error);
            return defaultValues;
        }
    }

    /**
     * Generate random variation around a base value
     */
    private static randomVariation(base: number, variance: number, decimals: number): number {
        const variation = (Math.random() - 0.5) * 2 * variance;
        return parseFloat((base + variation).toFixed(decimals));
    }

    /**
     * Format date for filename
     */
    private static formatDateForFilename(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}${month}${day}_${hours}${minutes}`;
    }

    /**
     * Format number with padding (Uster format)
     */
    private static formatUster(value: number, decimals: number, width: number): string {
        const formatted = value.toFixed(decimals);
        return formatted.padStart(width, ' ');
    }

    /**
     * Generate USTER format file (Interlaboratorial format)
     */
    /**
     * Generate USTER format file (Interlaboratorial format)
     */
    private static generateUsterFormat(sample: Sample, allSamples: Sample[] = []): string {
        const averages = this.getSampleTargetValues(sample, allSamples);

        // Columns based on user provided sample:
        // "1279                                    " "etiqueta                                " "      " 3 0.27 030 29.72 82.2 10.4 31.4 06.4 4.07 0.85 79.8 09.7 000 000 07.5 "11-1" 23.4 49.1 128.5
        // Analysis:
        // 1. ID (padded with spaces, inside quotes)
        // 2. Label (padded, quotes)
        // 3. Spacing? "      "
        // 4. "3" (Maybe Machine ID or constant?) - User example has 3.
        // 5. Area (0.27)
        // 6. Count (030 - padded 3 digits)
        // 7. UHML (29.72)
        // 8. UI (82.2)
        // 9. SFI (10.4) - Wait, previous had different order. Let's map carefully.
        // 10. STR (31.4)
        // 11. ELG (06.4)
        // 12. MIC (4.07)
        // 13. MAT (0.85) - Maturity ratio?
        // 14. RD (79.8)
        // 15. +b (09.7)
        // 16. "000"
        // 17. "000"
        // 18. "07.5"
        // 19. "11-1" (Color Grade)
        // 20. "23.4" (Temp?)
        // 21. "48.8" (RH?)
        // 22. "128.5" (SCI?)

        // Pad with SPACE for strings in quotes
        const padS = (val: string, width: number) => `"${val.padEnd(width, ' ')}"`;

        // ID
        const field1 = padS((sample.amostra_id || '').substring(0, 40), 40);
        // Label
        const field2 = padS((sample.etiqueta || '').substring(0, 40), 40);
        // Empty field
        const field3 = `"      "`;

        const col4 = "3"; // Constant from example

        // Values with variations
        const area = (this.randomVariation(0.25, 0.05, 2)).toFixed(2); // e.g. 0.27
        const cnt = Math.round(this.randomVariation(30, 5, 0)).toString().padStart(3, '0'); // e.g. 030

        const uhml = this.randomVariation(averages.len, 0.60, 2).toFixed(2);
        const ui = this.randomVariation(averages.unf, 1.2, 1).toFixed(1);
        const sfi = this.randomVariation(10.0, 1.0, 1).toFixed(1).padStart(4, '0'); // e.g. 09.8 or 10.4
        const str = this.randomVariation(averages.str, 1.5, 1).toFixed(1);
        const elg = this.randomVariation(6.4, 0.6, 1).toFixed(1).padStart(4, '0'); // e.g. 06.4
        const mic = this.randomVariation(averages.mic, 0.12, 2).toFixed(2);
        const mat = this.randomVariation(0.85, 0.04, 2).toFixed(2); // e.g. 0.85

        const rd = this.randomVariation(averages.rd, 1.5, 1).toFixed(1);
        const plusB = this.randomVariation(averages.b, 0.8, 1).toFixed(1).padStart(4, '0'); // e.g. 09.7

        const zeros1 = "000";
        const zeros2 = "000";
        const val18 = "07.5"; // Unknown param

        const cg = `"11-1"`; // Color Grade

        const temp = this.randomVariation(23.5, 1.0, 1).toFixed(1); // e.g. 23.4
        const rh = this.randomVariation(49.0, 1.0, 1).toFixed(1); // e.g. 48.8
        const sci = this.randomVariation(128.0, 5.0, 1).toFixed(1); // e.g. 128.5 or 128.0

        return `${field1} ${field2} ${field3} ${col4} ${area} ${cnt} ${uhml} ${ui} ${sfi} ${str} ${elg} ${mic} ${mat} ${rd} ${plusB} ${zeros1} ${zeros2} ${val18} ${cg} ${temp} ${rh} ${sci}`;
    }

    /**
     * Generate PREMIER format file (Interlaboratorial format)
     * @unused Kept for reference, currently using generatePremierFormatMultiple
     */
    // private static generatePremierFormat(sample: Sample, allSamples: Sample[] = []): string {
    //     const averages = this.getColorAverage(sample.cor, allSamples);
    //
    //     // Date/Time formatting (Premier style)
    //     const now = new Date();
    //     const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
    //     const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
    //     const dateTimeStr = `${dateStr} ${timeStr}`;
    //     const dateTimeStrHeader = `${dateStr}${timeStr}`;
    //
    //     const header = [
    //         `"System Test Report"\t"PREMIER ART3 V3.2.13 "`,
    //         `${dateTimeStrHeader}`,
    //         `"Test ID"\t":"\t16229\t"Identifier"\t":"\t"${sample.id}"`,
    //         ``,
    //         ``,
    //         ``,
    //         ``,
    //         ``,
    //         `"Test Type"\t":"\t"USDA"`,
    //         `"Test Date & Time"\t":"\t${dateTimeStr}`,
    //         `"Remarks"\t":"\t"${sample.etiqueta || 'N/A'}"`,
    //         `\t\t"UHML"\t"ML"\t"UI"\t"Elg"\t"Str"\t"Mic"\t"Rd"\t"+b"\t"C.G."\t"SFI"\t"Lf.Grade"\t"Tr.Cnt"\t"Tr.Area"\t"MR"\t""`,
    //         `"Test No"\t"Sub ID"\t"(mm)"\t"(mm)"\t"(%)"\t"(%)"\t"(g/tex)"\t""\t""\t""\t""\t""\t""\t""\t"(%)"\t""\t""`,
    //         ``
    //     ];
    //
    //     // Generate single reading
    //     const fmt = (value: number, decimals: number) => value.toFixed(decimals);
    //
    //     const uhml = this.randomVariation(averages.len, 0.30, 2);
    //     const ml = this.randomVariation(averages.len * 0.95, 0.30, 2);
    //     const ui = this.randomVariation(averages.unf, 0.5, 1);
    //     const elg = this.randomVariation(7.2, 0.5, 1);
    //     const str = this.randomVariation(averages.str, 0.7, 1);
    //     const mic = this.randomVariation(averages.mic, 0.05, 2);
    //     const rd = this.randomVariation(averages.rd, 0.5, 1);
    //     const plusB = this.randomVariation(averages.b, 0.3, 1);
    //     const cg = '"31"';
    //     const sfi = this.randomVariation(8.5, 0.5, 1);
    //     const grd = '"21"';
    //     const cnt = Math.round(this.randomVariation(190, 15, 0));
    //     const area = this.randomVariation(155, 10, 2);
    //     const mat = this.randomVariation(85, 2, 2);
    //
    //     const dataLine = [
    //         1,
    //         `"${sample.etiqueta || 'SAMPLE'} "`,
    //         fmt(uhml, 2),
    //         fmt(ml, 2),
    //         fmt(ui, 1),
    //         fmt(elg, 1),
    //         fmt(str, 1),
    //         fmt(mic, 2),
    //         fmt(rd, 1),
    //         fmt(plusB, 1),
    //         cg,
    //         fmt(sfi, 1),
    //         grd,
    //         cnt,
    //         fmt(area, 2),
    //         fmt(mat, 2)
    //     ].join('\t');
    //
    //     return header.join('\n') + dataLine;
    // }

    /**
     * Generate PREMIER format file with multiple readings (Interlaboratorial format)
     */
    private static generatePremierFormatMultiple(sample: Sample, count: number, allSamples: Sample[] = []): string {
        const averages = this.getSampleTargetValues(sample, allSamples);

        // Date/Time formatting (Premier style)
        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const dateTimeStr = `${dateStr} ${timeStr}`;
        const dateTimeStrHeader = `${dateStr}${timeStr.replace(' ', '')}`;

        const header = [
            `"System Test Report"\t"PREMIER ART3 V3.2.13 "`,
            `${dateTimeStrHeader}`,
            `"Test ID"\t":"\t16229\t"Identifier"\t":"\t"${sample.id}"`,
            ``,
            ``,
            ``,
            ``,
            ``,
            `"Test Type"\t":"\t"USDA"`,
            `"Test Date & Time"\t":"\t${dateTimeStr}`,
            `"Remarks"\t":"\t"${sample.etiqueta || 'N/A'}"`,
            `\t\t"UHML"\t"ML"\t"UI"\t"Elg"\t"Str"\t"Mic"\t"Rd"\t"+b"\t"C.G."\t"SFI"\t"Lf.Grade"\t"Tr.Cnt"\t"Tr.Area"\t"MR"\t""`,
            `"Test No"\t"Sub ID"\t"(mm)"\t"(mm)"\t"(%)"\t"(%)"\t"(g/tex)"\t""\t""\t""\t""\t""\t""\t""\t"(%)"\t""\t""`,
            ``
        ];

        // Helper for formatting
        const fmt = (value: number, decimals: number) => value.toFixed(decimals);

        // Helper for statistics
        const calcMean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const calcSD = (arr: number[]) => {
            const mean = calcMean(arr);
            const squareDiffs = arr.map(v => Math.pow(v - mean, 2));
            const avgSquareDiff = calcMean(squareDiffs);
            return Math.sqrt(avgSquareDiff); // Population SD or Sample? Typically Sample (n-1) for small sets, but keeping simple.
            // Actually, for stats reports, Sample SD (n-1) is standard.
            // Let's use n-1.
            if (arr.length <= 1) return 0;
            const sumSqDiff = squareDiffs.reduce((a, b) => a + b, 0);
            return Math.sqrt(sumSqDiff / (arr.length - 1));
        };
        const calcCV = (mean: number, sd: number) => mean === 0 ? 0 : (sd / mean) * 100;
        const calcMin = (arr: number[]) => Math.min(...arr);
        const calcMax = (arr: number[]) => Math.max(...arr);
        const calcMedian = (arr: number[]) => {
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        // Data Generation
        const rows: any[] = [];
        const numerics: Record<string, number[]> = {
            uhml: [], ml: [], ui: [], elg: [], str: [], mic: [], rd: [], b: [], sfi: [], cnt: [], area: [], mat: []
        };

        for (let i = 0; i < count; i++) {
            // Updated ranges based on user example
            const uhml = this.randomVariation(averages.len, 0.60, 2);
            const ml = this.randomVariation(averages.len * 0.75, 0.60, 2); // Corrected ratio
            const ui = this.randomVariation(averages.unf, 1.2, 1);
            const elg = this.randomVariation(6.2, 0.6, 1); // Closer to example 6.2
            const str = this.randomVariation(averages.str, 1.5, 1);
            const mic = this.randomVariation(averages.mic, 0.12, 2);
            const rd = this.randomVariation(averages.rd, 1.5, 1);
            const plusB = this.randomVariation(averages.b, 0.8, 1);
            const cg = '"11-3"'; // Default from example
            const sfi = this.randomVariation(12.0, 1.0, 1); // Closer to example 11.9
            const grd = '"2"'; // Default from example
            const cnt = Math.round(this.randomVariation(20, 8, 0)); // Closer to example 18
            const area = this.randomVariation(0.30, 0.08, 2); // Closer to example 0.32
            const mat = this.randomVariation(0.85, 0.04, 2); // Closer to example 0.84

            // Store for stats
            numerics.uhml.push(uhml); numerics.ml.push(ml); numerics.ui.push(ui);
            numerics.elg.push(elg); numerics.str.push(str); numerics.mic.push(mic);
            numerics.rd.push(rd); numerics.b.push(plusB); numerics.sfi.push(sfi);
            numerics.cnt.push(cnt); numerics.area.push(area); numerics.mat.push(mat);

            rows.push([
                i + 1,
                `"${sample.etiqueta || 'SAMPLE'} "`,
                fmt(uhml, 2), fmt(ml, 2), fmt(ui, 1), fmt(elg, 1), fmt(str, 1), fmt(mic, 2),
                fmt(rd, 1), fmt(plusB, 1), cg, fmt(sfi, 1), grd, cnt, fmt(area, 2), fmt(mat, 2)
            ].join('\t'));
        }

        // Stats Calculation
        const keys = ['uhml', 'ml', 'ui', 'elg', 'str', 'mic', 'rd', 'b', 'sfi', 'cnt', 'area', 'mat'];
        const stats: Record<string, any> = {};

        keys.forEach(key => {
            const vals = numerics[key];
            const mean = calcMean(vals);
            const sd = calcSD(vals);
            stats[key] = {
                mean: mean,
                median: calcMedian(vals),
                sd: sd,
                cv: calcCV(mean, sd),
                min: calcMin(vals),
                max: calcMax(vals)
            };
        });

        // Formatting Helpers
        const fMean = (k: string, d: number) => fmt(stats[k].mean, d);
        const fMed = (k: string, d: number) => fmt(stats[k].median, d);
        const fSD = (k: string, d: number) => fmt(stats[k].sd, d); // SD usually same decimals or +1? User example: 0.24 (2 decimals) for UHML.
        const fCV = (k: string) => fmt(stats[k].cv, 2);
        const fMin = (k: string, d: number) => fmt(stats[k].min, d);
        const fMax = (k: string, d: number) => fmt(stats[k].max, d);

        // Stats Rows Construction
        const statsRows = [];
        statsRows.push(`" Statistics"`);

        // Avg Row: "Avg" "11-3" "2" ...
        statsRows.push([
            `"Avg"`, `"11-3"`, `"2"`,
            fMean('uhml', 2), fMean('ml', 2), fMean('ui', 1), fMean('elg', 1), fMean('str', 1), fMean('mic', 2),
            fMean('rd', 1), fMean('b', 1), fMean('sfi', 1), fMean('cnt', 0), fMean('area', 2), fMean('mat', 2)
        ].join('\t'));

        // Gap
        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``); // User example has multiple empty lines

        // Other Stats: "Label"\t\t\t...
        const prefix = (label: string) => `"${label}"\t\t\t`;

        statsRows.push(prefix("Median") + [
            fMed('uhml', 2), fMed('ml', 2), fMed('ui', 1), fMed('elg', 1), fMed('str', 1), fMed('mic', 2),
            fMed('rd', 1), fMed('b', 1), fMed('sfi', 1), fMed('cnt', 0), fMed('area', 2), fMed('mat', 2)
        ].join('\t'));

        statsRows.push(prefix("SD") + [
            fSD('uhml', 2), fSD('ml', 2), fSD('ui', 1), fSD('elg', 1), fSD('str', 1), fSD('mic', 2),
            fSD('rd', 1), fSD('b', 1), fSD('sfi', 2), fSD('cnt', 2), fSD('area', 2), fSD('mat', 2) // SD decimals from user example (often 2)
        ].join('\t'));

        statsRows.push(prefix("CV%") + [
            fCV('uhml'), fCV('ml'), fCV('ui'), fCV('elg'), fCV('str'), fCV('mic'),
            fCV('rd'), fCV('b'), fCV('sfi'), fCV('cnt'), fCV('area'), fCV('mat')
        ].join('\t'));

        statsRows.push(prefix("Min") + [
            fMin('uhml', 2), fMin('ml', 2), fMin('ui', 1), fMin('elg', 1), fMin('str', 1), fMin('mic', 2),
            fMin('rd', 1), fMin('b', 1), fMin('sfi', 1), fMin('cnt', 0), fMin('area', 2), fMin('mat', 2)
        ].join('\t'));

        statsRows.push(prefix("Max") + [
            fMax('uhml', 2), fMax('ml', 2), fMax('ui', 1), fMax('elg', 1), fMax('str', 1), fMax('mic', 2),
            fMax('rd', 1), fMax('b', 1), fMax('sfi', 1), fMax('cnt', 0), fMax('area', 2), fMax('mat', 2)
        ].join('\t'));

        statsRows.push(``);
        statsRows.push(``);
        statsRows.push(``);

        return header.join('\n') + rows.join('\n') + '\n\n' + statsRows.join('\n');
    }

    /**
     * Generate preview data for a sample (does NOT download)
     */
    static async generatePreviewForSample(
        sample: Sample,
        allSamples: Sample[] = []
    ): Promise<{ success: boolean; message?: string; data?: HVIPreviewData }> {
        try {
            // Check if sample has HVI number
            if (!sample.hvi) {
                return {
                    success: false,
                    message: 'Amostra não possui número HVI cadastrado'
                };
            }

            // Get machine info
            const machine = this.getMachineByHVI(sample.hvi);
            if (!machine) {
                return {
                    success: false,
                    message: `Máquina HVI ${sample.hvi} não encontrada no cadastro`
                };
            }

            // Get the averages (Sample values or Color Average)
            const averages = this.getSampleTargetValues(sample, allSamples);

            // For preview modal: show EXACT average values (no variation)
            const generatedValues = {
                mic: averages.mic,
                len: averages.len,
                unf: averages.unf,
                str: averages.str,
                rd: averages.rd,
                b: averages.b
            };

            // For file content: generate 6 readings with variation
            let content: string;
            let extension: string;

            if (machine.model === 'USTER') {
                // Generate 6 Uster format lines
                const lines = Array(6).fill(null).map(() => this.generateUsterFormat(sample, allSamples));
                content = lines.join('\n');
                extension = 'txt';
            } else {
                // Generate Premier format with 6 readings
                content = this.generatePremierFormatMultiple(sample, 6, allSamples);
                extension = 'txt';
            }

            // Create filename
            const timestamp = this.formatDateForFilename();
            const sampleLabel = sample.etiqueta?.replace(/[^a-zA-Z0-9]/g, '_') || sample.amostra_id;
            const filename = `HVI_${machine.model}_${sampleLabel}_${timestamp}.${extension}`;

            return {
                success: true,
                data: {
                    content,
                    filename,
                    machineModel: machine.model,
                    generatedValues
                }
            };

        } catch (error) {
            console.error('Error generating HVI preview:', error);
            return {
                success: false,
                message: 'Erro ao gerar prévia HVI: ' + (error instanceof Error ? error.message : 'Erro desconhecido')
            };
        }
    }

    /**
     * Generate and download HVI file for a sample
     */
    static async generateFileForSample(sample: Sample): Promise<{ success: boolean; message: string }> {
        const result = await this.generatePreviewForSample(sample);

        if (!result.success || !result.data) {
            return {
                success: false,
                message: result.message || "Falha na geração do arquivo"
            };
        }

        this.downloadHVIFile(result.data.content, result.data.filename);

        return {
            success: true,
            message: `Arquivo ${result.data.filename} gerado com sucesso.`
        };
    }

    /**
     * Download the HVI file content
     */
    static downloadHVIFile(content: string, filename: string): void {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

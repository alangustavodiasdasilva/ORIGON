/**
 * HVI File Generator Service
 * Generates HVI format files (Uster/Premier) for individual samples
 * Based on color average and machine model - Using Interlaboratorial format
 */

import type { Sample } from '@/entities/Sample';
import { MachineService, type Machine } from '@/entities/Machine';

export interface HVITolerancias {
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    b: number;
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

interface ColorAverage {
    mic: number;
    len: number;
    unf: number;
    str: number;
    rd: number;
    b: number;
    cg?: string;
    elg?: number;
    area?: number;
    count?: number;
    mat?: number;
    leaf?: number;
    sfi?: number;
    csp?: number;
    sci?: number;
}

export class HVIFileGeneratorService {

    /**
     * Get machine by HVI number
     */
    /**
     * Get machine by HVI number
     */
    private static async getMachineByHVI(hviNumber: string): Promise<Machine | null> {
        try {
            const machines = await MachineService.list();

            // Try exact match
            const exactMatch = machines.find(m => m.machineId === hviNumber);
            if (exactMatch) return exactMatch;

            // Try loose match (ignoring spaces, case)
            const looseMatch = machines.find(m =>
                m.machineId.trim().toUpperCase() === hviNumber.trim().toUpperCase()
            );
            return looseMatch || null;
        } catch (error) {
            console.error('Error loading machines:', error);
            return null;
        }
    }

    /**
     * ── Média Secundária ──────────────────────────────────────────────────────
     * Lê EXCLUSIVAMENTE o template vinculado à cor desta amostra.
     * Nunca mistura dados de outras cores nem usa dados calculados de amostras.
     */
    private static getSecondaryTemplate(color: string, loteId: string): ColorAverage | null {
        const STORAGE_PREFIX = loteId ? `lote_${loteId}_` : '';
        const raw = localStorage.getItem(`${STORAGE_PREFIX}custom_color_averages`);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            const tpl = parsed[color];
            if (!tpl || typeof tpl !== 'object') return null;

            // Garantia: todos os campos estruturais vêm SOMENTE deste template
            return {
                mic:   Number(tpl.mic)   || 0,
                len:   Number(tpl.len)   || 0,
                unf:   Number(tpl.unf)   || 0,
                str:   Number(tpl.str)   || 0,
                rd:    Number(tpl.rd)    || 0,
                b:     Number(tpl.b)     || 0,
                cg:    String(tpl.cg     ?? ''),
                elg:   Number(tpl.elg)   || 0,
                area:  Number(tpl.area)  || 0,
                count: Number(tpl.count) || 0,
                mat:   Number(tpl.mat)   || 0,
                leaf:  Number(tpl.leaf)  || 0,
                sfi:   Number(tpl.sfi)   || 0,
                csp:   Number(tpl.csp)   || 0,
                sci:   Number(tpl.sci)   || 0,
            };
        } catch {
            return null;
        }
    }

    /**
     * ── Fusão Primária + Secundária ───────────────────────────────────────────
     * Média Primária  → Mic, Len, Unf, Str, Rd, +b  (valores reais da amostra)
     * Média Secundária → Elg, Area, Count, Mat, CG, SFI, SCI, Leaf, CSP
     *                     (EXATAMENTE como lidos no print vinculado a esta cor)
     *
     * NENHUM dado é compartilhado entre cores.
     * NENHUM dado da Média Secundária de uma cor é usado em outra amostra.
     */
    private static getSampleTargetValues(sample: Sample, allSamples: Sample[] = []): ColorAverage {
        const color = sample.cor || "#3b82f6";
        const secondary = this.getSecondaryTemplate(color, sample.lote_id);

        // ── Médias Primárias (Referência da Cor) ──────────────────────────────
        // Filtra todas as amostras da mesma cor para calcular a média real
        const colorSamples = allSamples.filter(s => s.cor === color && typeof s.mic === 'number');
        const count = colorSamples.length || 1;

        const sum = colorSamples.reduce((acc, s) => ({
            mic: acc.mic + (Number(s.mic) || 0),
            len: acc.len + (Number(s.len) || 0),
            unf: acc.unf + (Number(s.unf) || 0),
            str: acc.str + (Number(s.str) || 0),
            rd:  acc.rd  + (Number(s.rd)  || 0),
            b:   acc.b   + (Number(s.b)   || 0)
        }), { mic: 0, len: 0, unf: 0, str: 0, rd: 0, b: 0 });

        // Média Primária da Cor
        const primaryAvg: ColorAverage = {
            mic: Number((sum.mic / count).toFixed(2)),
            len: Number((sum.len / count).toFixed(2)),
            unf: Number((sum.unf / count).toFixed(1)),
            str: Number((sum.str / count).toFixed(1)),
            rd:  Number((sum.rd  / count).toFixed(1)),
            b:   Number((sum.b   / count).toFixed(1))
        };

        // Fallback se não houver template secundário:
        const fallbackSecondary: Partial<ColorAverage> = {
            cg: '11-1', elg: 6.4, area: 0.25, count: 30, mat: 0.85, leaf: 2, sfi: 10.0, csp: 1600, sci: 125,
        };

        const base = secondary ?? fallbackSecondary;

        // Retorna a fusão: Primária (Média da Cor) + Secundária (Template do Print)
        return {
            ...primaryAvg,
            cg:    base.cg,
            elg:   base.elg,
            area:  base.area,
            count: base.count,
            mat:   base.mat,
            leaf:  base.leaf,
            sfi:   base.sfi,
            csp:   base.csp,
            sci:   base.sci,
        };
    }

    /**
     * @deprecated Substituído por getSecondaryTemplate + getSampleTargetValues.
     * Mantido apenas para compatibilidade com hasColorPrint.
     */
    private static getColorAverage(_color?: string, _allSamples: Sample[] = [], _contextKey?: string): ColorAverage {
        return { mic: 4.5, len: 29.0, unf: 80.0, str: 29.0, rd: 80.0, b: 11.0 };
    }
    
    /**
     * Check if a color has a linked print template
     */
    public static hasColorPrint(color?: string, contextKey?: string): boolean {
        if (!color) return false;
        const STORAGE_PREFIX = contextKey ? `lote_${contextKey}_` : '';
        const key = `${STORAGE_PREFIX}custom_color_averages`;
        const customAveragesStr = localStorage.getItem(key);
        if (!customAveragesStr) {
            console.log(`[hasColorPrint] MISS: Key "${key}" não encontrada no localStorage`);
            return false;
        }
        try {
            const customAverages = JSON.parse(customAveragesStr);
            const config = customAverages[color];
            const result = !!(config && typeof config === 'object' && 'selectedLine' in config);
            console.log(`[hasColorPrint] color="${color}", key="${key}", result=${result}, selectedLine=${config?.selectedLine}`);
            return result;
        } catch {
            return false;
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
     * Generate a set of readings that average exactly to the target
     */
    private static generateBalancedReadings(target: number, count: number, tolerance: number, decimals: number): number[] {
        if (count <= 0) return [];
        if (tolerance <= 0) return Array(count).fill(target);

        const factor = Math.pow(10, decimals);

        // ── Tentativas para encontrar um conjunto balanceado dentro do range exato ──
        let bestReadings: number[] = [];
        let bestRepeat = count;

        for (let attempt = 0; attempt < 120; attempt++) {
            // Gerar aleatoriamente dentro de ±tolerance
            const readings = Array(count).fill(0).map(() => {
                // Usa 100% do tolerance conforme solicitado pelo usuário
                const r = (Math.random() * 2 - 1) * tolerance;
                return Math.round((target + r) * factor) / factor;
            });


            // Balancear: ajustar diferença da média para o alvo
            const currentAvg = readings.reduce((a, b) => a + b, 0) / count;
            const drift = parseFloat((target - currentAvg).toFixed(decimals));

            // Distribuir o drift em incrementos mínimos pelos itens de forma aleatória
            if (drift !== 0) {
                const step = Math.sign(drift) * Math.pow(10, -decimals);
                let remaining = Math.abs(Math.round(drift * factor));
                const idxs = [...Array(count).keys()].sort(() => Math.random() - 0.5);
                let i = 0;
                while (remaining > 0) {
                    const idx = idxs[i % count];
                    const candidate = Math.round((readings[idx] + step) * factor) / factor;
                    // Só aplica se não sair do range
                    if (Math.abs(candidate - target) <= tolerance + 1e-9) {
                        readings[idx] = candidate;
                        remaining--;
                    }
                    i++;
                    if (i > count * 10) break; // evita loop infinito se range muito apertado
                }
            }

            // Hard-clamp: garante que nenhum valor violou o range
            for (let i = 0; i < readings.length; i++) {
                const min = Math.round((target - tolerance) * factor) / factor;
                const max = Math.round((target + tolerance) * factor) / factor;
                readings[i] = Math.max(min, Math.min(max, readings[i]));
            }

            // Verificar repetição (máx 2 vezes o mesmo valor)
            const occ: Record<number, number> = {};
            let maxRep = 0;
            readings.forEach(v => { occ[v] = (occ[v] || 0) + 1; if (occ[v] > maxRep) maxRep = occ[v]; });

            if (maxRep <= 2) return readings;

            if (maxRep < bestRepeat) {
                bestRepeat = maxRep;
                bestReadings = [...readings];
            }
        }

        return bestReadings.length > 0 ? bestReadings : Array(count).fill(target);
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
    // @ts-ignore
    private static formatUster(value: number, decimals: number, width: number): string {
        const formatted = value.toFixed(decimals);
        return formatted.padStart(width, ' ');
    }

    /**
     * Generate ONE line of USTER format using pre-calculated balanced values
     */
    private static generateUsterOneLine(sample: Sample, averages: ColorAverage): string {
        // Pad helper to match old machine fixed-width logic (40 chars inside quotes)
        const pad40 = (text: string) => `"${text.padEnd(40, ' ')}"`;
        const pad1 = () => `" "`;

        // 1. Mala (ex: "12")
        const field1 = pad40(sample.mala || '');
        // 2. Separator
        const field2 = pad1();
        // 3. Amostra ID / Etiqueta (ex: "1007...")
        const field3 = pad40(sample.amostra_id || '');
        // 4. Separator
        const field4 = pad1();

        // Valores técnicos do bloco de dados
        const leaf  = (averages.leaf || 3).toString().padStart(2);
        const area  = (averages.area || 0.25).toFixed(2).padStart(4);
        const count = (averages.count || 30).toString().padStart(3, '0');
        const uhml  = averages.len.toFixed(2).padStart(5);
        const ui    = averages.unf.toFixed(1).padStart(4);
        const sfi   = (averages.sfi || 10.0).toFixed(1).padStart(4);
        const str   = averages.str.toFixed(1).padStart(4);
        const elg   = (averages.elg || 6.4).toFixed(1).padStart(4, '0');
        const mic   = averages.mic.toFixed(2).padStart(4);
        const mat   = (averages.mat || 0.85).toFixed(2).padStart(4);
        const rd    = averages.rd.toFixed(1).padStart(4);
        const plusB = averages.b.toFixed(1).padStart(4, '0');
        
        const zeros = "000 000";
        const val18 = "7.3"; 
        
        const cg    = averages.cg ? `"${averages.cg}"` : `"11-1"`;
        const temp  = (23 + (Math.random() * 1.5)).toFixed(1).padStart(4);
        const rh    = (48 + (Math.random() * 2)).toFixed(1).padStart(4);
        
        // CORREÇÃO DOS NEGATIVOS: Se o SCI/CSP do template for 0, usa o padrão estável de máquina
        const sciVal = (averages.sci && averages.sci > 10) ? averages.sci : 125.0;
        const cspVal = (averages.csp && averages.csp > 100) ? averages.csp : 1600;
        
        const sci   = sciVal.toFixed(1).padStart(5);
        const csp   = Math.round(cspVal).toString().padStart(4);

        const dataPart = `" 3 ${area} ${count} ${uhml} ${ui} ${sfi} ${str} ${elg} ${mic} ${mat} ${rd} ${plusB} ${zeros} ${val18} ${cg} ${temp} ${rh} ${sci} ${csp}"`;

        return `${field1} ${field2} ${field3} ${field4} ${dataPart}`;
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
     * Generate PREMIER format file with multiple readings using pre-calculated balanced values
     */
    private static generatePremierFormatMultipleBalanced(
        sample: Sample, 
        count: number, 
        averages: ColorAverage, 
        balancedReadings: Record<string, number[]>
    ): string {

        // Date/Time formatting (Premier style)
        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
        // Include seconds for uniqueness
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        const dateTimeStr = `${dateStr} ${timeStr}`;
        const dateTimeStrHeader = `${dateStr}${timeStr.replace(/[: ]/g, '')}`;

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
            uhml: [], ml: [], ui: [], elg: [], str: [], mic: [], rd: [], b: [], sfi: [], cnt: [], area: [], mat: [], sci: [], csp: []
        };

        for (let i = 0; i < count; i++) {
            const uhml = balancedReadings.uhml[i];
            const ml = balancedReadings.ml[i]; 
            const ui = balancedReadings.ui[i];
            const elg = balancedReadings.elg[i];
            const str = balancedReadings.str[i];
            const mic = balancedReadings.mic[i];
            const rd = balancedReadings.rd[i];
            const plusB = balancedReadings.b[i];
            const cg = averages.cg ? `"${averages.cg}"` : (sample.cor === "#ef4444" ? '"31-3"' : '"11-3"'); 
            const sfi = balancedReadings.sfi[i]; 
            const grd = `"${averages.leaf || 2}"`; 
            const cnt = balancedReadings.count[i]; 
            const area = balancedReadings.area[i]; 
            const mat = balancedReadings.mat[i]; 
            const sci = balancedReadings.sci[i];
            const csp = balancedReadings.csp[i];

            // Store for stats
            numerics.uhml.push(uhml); numerics.ml.push(ml); numerics.ui.push(ui);
            numerics.elg.push(elg); numerics.str.push(str); numerics.mic.push(mic);
            numerics.rd.push(rd); numerics.b.push(plusB); numerics.sfi.push(sfi);
            numerics.cnt.push(cnt); numerics.area.push(area); numerics.mat.push(mat);
            numerics.sci.push(sci);
            numerics.csp.push(csp);

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
        const fSD = (k: string, d: number) => fmt(stats[k].sd, d);
        const fCV = (k: string) => fmt(stats[k].cv, 2);
        const fMin = (k: string, d: number) => fmt(stats[k].min, d);
        const fMax = (k: string, d: number) => fmt(stats[k].max, d);

        // Stats Rows Construction
        const statsRows = [];
        statsRows.push(`" Statistics"`);

        // Avg Row
        statsRows.push([
            `"Avg"`, 
            averages.cg ? `"${averages.cg}"` : (sample.cor === "#ef4444" ? '"31-3"' : '"11-3"'),
            `"${averages.leaf || 2}"`,
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
        statsRows.push(``);

        // Other Stats
        const prefix = (label: string) => `"${label}"\t\t\t`;

        statsRows.push(prefix("Median") + [
            fMed('uhml', 2), fMed('ml', 2), fMed('ui', 1), fMed('elg', 1), fMed('str', 1), fMed('mic', 2),
            fMed('rd', 1), fMed('b', 1), fMed('sfi', 1), fMed('cnt', 0), fMed('area', 2), fMed('mat', 2)
        ].join('\t'));

        statsRows.push(prefix("SD") + [
            fSD('uhml', 2), fSD('ml', 2), fSD('ui', 1), fSD('elg', 1), fSD('str', 1), fSD('mic', 2),
            fSD('rd', 1), fSD('b', 1), fSD('sfi', 2), fSD('cnt', 2), fSD('area', 2), fSD('mat', 2)
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
        allSamples: Sample[] = [],
        tolerancias?: HVITolerancias
    ): Promise<{ success: boolean; message?: string; data?: HVIPreviewData }> {
        try {
            // Check if color has linked print template (STRICT LOCK)
            if (!sample.cor || !this.hasColorPrint(sample.cor, sample.lote_id)) {
                const colorNames: Record<string, string> = {
                    "#3b82f6": "Azul",
                    "#ef4444": "Vermelho",
                    "#10b981": "Verde",
                    "#f59e0b": "Amarelo"
                };
                const colorLabel = colorNames[sample.cor || ""] || "não definida";
                return {
                    success: false,
                    message: `Amostra da cor ${colorLabel} não possui print vinculado. O arquivo TXT só pode ser gerado após configurar o print no painel 'Metas por Cor'.`
                };
            }

            // Check if sample has HVI number
            if (!sample.hvi) {
                return {
                    success: false,
                    message: 'Amostra não possui número HVI cadastrado'
                };
            }

            // Get machine info
            const machine = await this.getMachineByHVI(sample.hvi);
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

            // For file content: generate 6 readings with balanced variation
            const count = 6;
            const tols = tolerancias || { mic: 0.05, len: 0.25, unf: 0.5, str: 0.75, rd: 0.5, b: 0.25 };
            
            // Parâmetros primários: variação balanceada sobre o valor exato da amostra
            const micReadings  = this.generateBalancedReadings(averages.mic, count, tols.mic, 2);
            const lenReadings  = this.generateBalancedReadings(averages.len, count, tols.len, 2);
            const unfReadings  = this.generateBalancedReadings(averages.unf, count, tols.unf, 1);
            const strReadings  = this.generateBalancedReadings(averages.str, count, tols.str, 1);
            const rdReadings   = this.generateBalancedReadings(averages.rd,  count, tols.rd,  1);
            const bReadings    = this.generateBalancedReadings(averages.b,   count, tols.b,   1);

            // Parâmetros secundários: usar EXATAMENTE o valor do template (sem variação)
            // Apenas SFI e SCI permitem uma variação mínima que não distorce o significado
            const elg   = averages.elg  ?? 6.4;
            const area  = averages.area ?? 0.25;
            const cnt   = averages.count ?? 30;
            const mat   = averages.mat   ?? 0.85;
            const sfi   = averages.sfi   ?? 10.0;
            const sci   = averages.sci   ?? 125.0;
            const csp   = averages.csp   ?? 0;
            const leaf  = averages.leaf  ?? 2;

            // Gerar arrays com variação mínima em torno do valor exato do template
            const elgReadings  = this.generateBalancedReadings(elg,  count, 0.05, 1);
            const areaReadings = this.generateBalancedReadings(area, count, 0.01, 2);
            const cntReadings  = this.generateBalancedReadings(cnt,  count, 1,    0);
            const matReadings  = this.generateBalancedReadings(mat,  count, 0.005, 2);
            const sfiReadings  = this.generateBalancedReadings(sfi,  count, 0.1,  1);
            const sciReadings  = this.generateBalancedReadings(sci,  count, 0.5,  1);
            const cspReadings  = Array(count).fill(csp); // CSP: valor fixo do template
            const leafArr      = Array(count).fill(leaf);
            const mlReadings   = lenReadings.map(v => parseFloat((v * 0.75).toFixed(2)));

            console.log(`[HVI] Amostra ${sample.amostra_id} cor=${sample.cor}`);
            console.log(`[HVI] Primária: mic=${averages.mic} len=${averages.len} unf=${averages.unf} str=${averages.str} rd=${averages.rd} b=${averages.b}`);
            console.log(`[HVI] Secundária: cg=${averages.cg} elg=${elg} area=${area} count=${cnt} mat=${mat} sfi=${sfi} sci=${sci} leaf=${leaf}`);

            let content: string;
            let extension: string;

            if (machine.model === 'USTER') {
                const usterLines = [];
                for (let i = 0; i < count; i++) {
                    const rowAverages = {
                        ...averages,
                        mic: micReadings[i],
                        len: lenReadings[i],
                        unf: unfReadings[i],
                        str: strReadings[i],
                        rd:  rdReadings[i],
                        b:   bReadings[i],
                        elg:   elgReadings[i],
                        area:  areaReadings[i],
                        count: cntReadings[i],
                        mat:   matReadings[i],
                        sfi:   sfiReadings[i],
                        sci:   sciReadings[i],
                        csp:   cspReadings[i],
                        leaf:  leafArr[i],
                    };
                    usterLines.push(this.generateUsterOneLine(sample, rowAverages));
                }
                content = usterLines.join('\n');
                extension = 'txt';
            } else {
                content = this.generatePremierFormatMultipleBalanced(sample, count, averages, {
                    mic:   micReadings,
                    uhml:  lenReadings,
                    ml:    mlReadings,
                    ui:    unfReadings,
                    str:   strReadings,
                    rd:    rdReadings,
                    b:     bReadings,
                    elg:   elgReadings,
                    area:  areaReadings,
                    count: cntReadings,
                    mat:   matReadings,
                    sfi:   sfiReadings,
                    sci:   sciReadings,
                    csp:   cspReadings,
                });
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

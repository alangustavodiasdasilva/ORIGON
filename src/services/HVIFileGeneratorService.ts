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
    files?: Array<{ content: string; filename: string }>;
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
    rawRows?: any[];
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
                rawRows: Array.isArray(tpl.rawRows) ? tpl.rawRows : undefined,
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
            rawRows: base.rawRows,
        };
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

            // Verificar repetição (máx 2 vezes o mesmo valor, e max 1 par repetido)
            const occ: Record<number, number> = {};
            let maxRep = 0;
            let pairsCount = 0;
            readings.forEach(v => { 
                occ[v] = (occ[v] || 0) + 1; 
                if (occ[v] > maxRep) maxRep = occ[v]; 
                if (occ[v] === 2) pairsCount++;
            });

            if (maxRep <= 1 || (maxRep === 2 && pairsCount <= 1)) {
                return readings;
            }

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
        const pad40 = (text: string) => `"${text.substring(0, 40).padEnd(40, ' ')}"`;
        
        // 1. Mala / Número da Mala (ex: "20253554")
        const field1 = pad40(sample.mala || '');
        // 2. Etiqueta / Label (ex: "21")
        const field2 = pad40(sample.etiqueta || '');
        // 3. Bloco fixo de 6 espaços
        const field3 = `"      "`;
        
        const col4 = "3"; // Constante da máquina

        // Valores técnicos do bloco de dados (alinhados conforme o exemplo)
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
        
        // Valores estáveis para SCI e CSP
        const sciVal = (averages.sci && averages.sci > 10) ? averages.sci : 124.6;
        const cspVal = (averages.csp && averages.csp > 100) ? averages.csp : 1600;
        
        const sci   = sciVal.toFixed(1).padStart(5);
        const csp   = Math.round(cspVal).toString().padStart(4);

        // Montagem final exatamente como o exemplo:
        // "Mala" "ID" "      " 3 0.28 026 ... "CG" Temp RH SCI CSP
        return `${field1} ${field2} ${field3} ${col4} ${area} ${count} ${uhml} ${ui} ${sfi} ${str} ${elg} ${mic} ${mat} ${rd} ${plusB} ${zeros} ${val18} ${cg} ${temp} ${rh} ${sci} ${csp}`;
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
     * Helper to clean string to pure ASCII (no accents, no BOM)
     */
    private static cleanToASCII(str: string): string {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\x7F]/g, "");
    }

    /**
     * Helper to format date in DD-MMM-AA format (e.g. 24-OCT-25)
     */
    private static formatH1Date(dateInput?: string): string {
        let day = 24;
        let monthIdx = 9; // 0-indexed, so 9 is October
        let year = 25; // 2 digits

        if (dateInput) {
            const parts = dateInput.split(/[-/]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    // YYYY-MM-DD
                    day = parseInt(parts[2]) || 24;
                    monthIdx = (parseInt(parts[1]) || 10) - 1;
                    year = parseInt(parts[0].substring(2)) || 25;
                } else {
                    // DD/MM/YYYY
                    day = parseInt(parts[0]) || 24;
                    monthIdx = (parseInt(parts[1]) || 10) - 1;
                    year = parseInt(parts[2].substring(2)) || 25;
                }
            }
        } else {
            const d = new Date();
            day = d.getDate();
            monthIdx = d.getMonth();
            year = d.getFullYear() % 100;
        }

        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const mStr = months[monthIdx] || "OCT";
        
        return `${String(day).padStart(2, '0')}-${mStr}-${String(year).padStart(2, '0')}`;
    }

    /**
     * Gera um target de amostra variado deterministicamente dentro de uma fração da tolerância
     */
    private static getVariedSampleTarget(
        targetGeneral: number,
        tolerance: number,
        decimals: number,
        seedModifier: string
    ): number {
        if (tolerance <= 0) return targetGeneral;

        // Hash determinístico 32-bit exclusivo para a variação da média
        let hash = 0;
        const seedStr = `${seedModifier}_targetvar_${targetGeneral.toFixed(decimals)}_${tolerance.toFixed(decimals)}`;
        for (let i = 0; i < seedStr.length; i++) {
            hash = (hash << 5) - hash + seedStr.charCodeAt(i);
            hash |= 0;
        }

        let seed = Math.abs(hash) || 1;
        const rand = () => {
            seed ^= seed << 13;
            seed ^= seed >>> 17;
            seed ^= seed << 5;
            return (Math.abs(seed) % 1000000) / 1000000;
        };

        // Variação máxima da média: 40% da tolerância configurada
        const maxMeanVar = tolerance * 0.4;
        const variation = (rand() * 2 - 1) * maxMeanVar;
        
        return parseFloat((targetGeneral + variation).toFixed(decimals));
    }

    /**
     * Gera count leituras aleatórias dentro da tolerância cuja média é exatamente o alvo.
     * As primeiras count-1 são aleatórias dentro de [-maxVar, +maxVar].
     * A última é calculada para fechar a soma (e depois clampada à tolerância, reajustando a 1ª se necessário).
     * Usa seed determinística para que o mesmo lote gere os mesmos arquivos.
     */
    private static getBalancedReadings(target: number, maxVar: number, decimals: number, seedModifier: string, count: number = 6): number[] {
        // Gera um hash determinístico 32-bit a partir de seedModifier, target e maxVar
        let hash = 0;
        const seedStr = `${seedModifier}_${target.toFixed(decimals)}_${maxVar.toFixed(decimals)}`;
        for (let i = 0; i < seedStr.length; i++) {
            hash = (hash << 5) - hash + seedStr.charCodeAt(i);
            hash |= 0; // Converte para inteiro de 32 bits
        }

        let seed = Math.abs(hash) || 1;

        // XorShift32 PRNG (seguro e determinístico)
        const rand = () => {
            seed ^= seed << 13;
            seed ^= seed >>> 17;
            seed ^= seed << 5;
            return (Math.abs(seed) % 1000000) / 1000000;
        };

        const randInRange = () => (rand() * 2 - 1) * maxVar; // [-maxVar, +maxVar]

        // Gera count - 1 leituras aleatórias
        const r = Array(count - 1).fill(0).map(() => {
            const v = target + randInRange();
            return parseFloat(v.toFixed(decimals));
        });

        // A última leitura fecha a média
        const sumOfPrev = r.reduce((a, b) => a + b, 0);
        const targetSum = parseFloat((target * count).toFixed(decimals));
        let lastVal = parseFloat((targetSum - sumOfPrev).toFixed(decimals));

        // Se a última caiu fora da tolerância, clamp nela e ajusta a 1ª
        const lo = parseFloat((target - maxVar).toFixed(decimals));
        const hi = parseFloat((target + maxVar).toFixed(decimals));
        if (lastVal < lo || lastVal > hi) {
            lastVal = Math.max(lo, Math.min(hi, lastVal));
            // Recalcula a 1ª para compensar
            const sumOfOthers = r.slice(1).reduce((a, b) => a + b, 0) + lastVal;
            r[0] = parseFloat((targetSum - sumOfOthers).toFixed(decimals));
            r[0] = Math.max(lo, Math.min(hi, r[0]));
        }

        return [...r, lastVal];
    }

    /**
     * Formats one .H1 file with 7 mandatory lines
     */
    private static generateH1FileContent(
        sample: Sample,
        date: string,
        time: string,
        seq: number,
        repIndex: number,
        lineName: string,
        mic: number,
        uhml: number,
        ui: number,
        str: number,
        elg: number,
        sfi: number,
        len: number,
        count: number,
        sci: number,
        rd: number,
        plusB: number,
        grau: string,
        area: number,
        leaf: number,
        mat: number,
        csp: number
    ): string {
        // AMOSTRA: formato '{mala}#{repIndex}' — ex: '89801#01'
        const amostraBase = `${sample.mala || ''}#${String(repIndex).padStart(2, '0')}`;
        const amostraPad = amostraBase.substring(0, 40).padEnd(40, ' ');
        const etiquetaPad = (sample.etiqueta || '').substring(0, 40).padEnd(40, ' ');

        const seqStrStart = String(seq).padStart(2, '0');
        const seqStrEnd = String(seq + 1).padStart(2, '0');

        // ── Clamping de segurança para evitar erro -2 da máquina ─────────────
        const safeMic  = Math.max(3.5, Math.min(5.5, mic));
        const safeUi   = Math.max(79.0, Math.min(90.0, ui));
        const safeStr  = Math.max(20.0, Math.min(45.0, str));
        const safeElg  = Math.max(3.0, Math.min(10.0, elg));
        const safeSfi  = Math.max(5.0, Math.min(25.0, sfi));
        const safeRd   = Math.max(60.0, Math.min(95.0, rd));
        const safePlusB = Math.max(4.0, Math.min(20.0, plusB));
        const safeMat  = Math.max(0.75, Math.min(1.0, mat));
        // SCI: mínimo 80 e máximo 160 — abaixo de 80 o HVI gera erro -2
        const safeSci  = Math.max(80, Math.min(160, Math.round(sci)));
        // CSP: mínimo 100 — abaixo disso o HVI gera erro -2
        const safeCsp  = Math.max(100, Math.min(9999, Math.round(csp)));
        // LEAF: 1 a 8 (escala da máquina)
        const safeLeaf = Math.max(1, Math.min(8, Math.round(leaf)));
        // AREA: nunca negativa
        const safeArea = Math.max(0.01, area);
        // UHML e LEN: sempre positivos
        const safeUhml = Math.max(20.0, uhml);
        const safeLen  = Math.max(15.0, len);
        const safeCount = Math.max(1.0, count);

        const uhmlStr = safeUhml.toFixed(2);
        const uiStr = safeUi.toFixed(1);
        const strStr = safeStr.toFixed(1);
        const elgStr = safeElg.toFixed(1).padStart(4, ' ');
        const sfiStr = safeSfi.toFixed(1);
        const lenStr = safeLen.toFixed(1).padStart(5, ' ');
        const countStr = safeCount.toFixed(1).padStart(5, ' ');

        const micStr = safeMic.toFixed(2);
        const sciStr = String(safeSci).padStart(4, '0');

        const rdStr = safeRd.toFixed(1);
        const bStr = safePlusB.toFixed(1).padStart(4, ' ');
        const areaNStr = Math.round(safeArea * 100).toString().padStart(3, ' ');
        const areaStr = safeArea.toFixed(2);
        const leafStr = safeLeaf.toString();

        const matStr = safeMat.toFixed(2);
        const cspStr = safeCsp.toString();

        const lines = [
            `HVI1000@@05@${lineName}@${date}@${time}@${seqStrStart}@`,
            `HVI1000@L&S@02@${lineName}@${date}@${time}@${amostraPad}@${etiquetaPad}@${uhmlStr}@n@n@${uiStr}@n@n@${strStr}@n@n@${elgStr}@${sfiStr}@      @${lenStr}@${countStr}@25@`,
            `HVI1000@MIC@02@${lineName}@${date}@${time}@${amostraPad}@${etiquetaPad}@${micStr}@n@40@`,
            `HVI1000@SCI@02@${lineName}@${date}@${time}@${amostraPad}@${etiquetaPad}@${sciStr}@n@0000@@38@`,
            `HVI1000@C&T@02@${lineName}@${date}@${time}@${amostraPad}@${etiquetaPad}@n@${rdStr}@n@${bStr}@n@${grau}@n@n@${areaNStr}@${areaStr}@n@${leafStr}@n@10@`,
            `HVI1000@MAT@02@${lineName}@${date}@${time}@${amostraPad}@${etiquetaPad}@${matStr}@n@@@@${cspStr}@`,
            `HVI1000@@06@${lineName}@${date}@${time}@${seqStrEnd}@`
        ];

        const content = lines.join('\r\n') + '\r\n';
        return this.cleanToASCII(content);
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
                    message: `Amostra da cor ${colorLabel} não possui print vinculado. O arquivo só pode ser gerado após configurar o print no painel 'Metas por Cor'.`
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

            const count = 6;
            const tols = tolerancias || { mic: 0.10, len: 0.30, unf: 0.5, str: 0.5, rd: 0.5, b: 0.3 };
            const seedMod = sample.id || sample.amostra_id || "default";

            // ── Variação determinística das médias por amostra (máx 40% da tolerância) ──
            const sampleMic = this.getVariedSampleTarget(averages.mic, tols.mic, 2, seedMod);
            const sampleLen = this.getVariedSampleTarget(averages.len, tols.len, 2, seedMod);
            const sampleUnf = this.getVariedSampleTarget(averages.unf, tols.unf, 1, seedMod);
            const sampleStr = this.getVariedSampleTarget(averages.str, tols.str, 1, seedMod);
            const sampleRd  = this.getVariedSampleTarget(averages.rd,  tols.rd,  1, seedMod);
            const sampleB   = this.getVariedSampleTarget(averages.b,   tols.b,   1, seedMod);

            // For preview modal: show the actual varied averages generated in the HVI file
            const generatedValues = {
                mic: sampleMic,
                len: sampleLen,
                unf: sampleUnf,
                str: sampleStr,
                rd: sampleRd,
                b: sampleB
            };

            // ── Geração balanceada das 6 repetições respeitando a tolerância máxima global ──
            const micVarLimit = Math.max(0.01, tols.mic - Math.abs(sampleMic - averages.mic));
            const micReadings = this.getBalancedReadings(sampleMic, micVarLimit, 2, seedMod, count);

            const lenVarLimit = Math.max(0.01, tols.len - Math.abs(sampleLen - averages.len));
            const lenReadings = this.getBalancedReadings(sampleLen, lenVarLimit, 2, seedMod, count); // UHML

            const unfVarLimit = Math.max(0.1, tols.unf - Math.abs(sampleUnf - averages.unf));
            const unfReadings = this.getBalancedReadings(sampleUnf, unfVarLimit, 1, seedMod, count);  // UI

            const strVarLimit = Math.max(0.1, tols.str - Math.abs(sampleStr - averages.str));
            const strReadings = this.getBalancedReadings(sampleStr, strVarLimit, 1, seedMod, count);

            const rdVarLimit  = Math.max(0.1, tols.rd - Math.abs(sampleRd - averages.rd));
            const rdReadings  = this.getBalancedReadings(sampleRd, rdVarLimit,  1, seedMod, count);

            const bVarLimit   = Math.max(0.1, tols.b - Math.abs(sampleB - averages.b));
            const bReadings   = this.getBalancedReadings(sampleB, bVarLimit,   1, seedMod, count);

            const elg          = averages.elg ?? 6.4;
            const sampleElg    = this.getVariedSampleTarget(elg, 0.2, 1, seedMod);
            const elgVarLimit  = Math.max(0.1, 0.2 - Math.abs(sampleElg - elg));
            const elgReadings  = this.getBalancedReadings(sampleElg, elgVarLimit, 1, seedMod, count);

            const sfi          = averages.sfi ?? 10.0;
            const sampleSfi    = this.getVariedSampleTarget(sfi, 1.0, 1, seedMod);
            const sfiVarLimit  = Math.max(0.1, 1.0 - Math.abs(sampleSfi - sfi));
            const sfiReadings  = this.getBalancedReadings(sampleSfi, sfiVarLimit, 1, seedMod, count);

            // SCI: se o template retornou 0 (não preenchido), usa fallback de 120
            const sciRaw       = (averages.sci && averages.sci > 10) ? averages.sci : 120;
            const sci          = Math.max(80, Math.min(160, sciRaw));
            const sampleSci    = this.getVariedSampleTarget(sci, 3, 0, seedMod);
            const sciVarLimit  = Math.max(1, 3 - Math.abs(sampleSci - sci));
            const sciReadings  = this.getBalancedReadings(sampleSci, sciVarLimit, 0, seedMod, count);

            const mat          = Math.max(0.75, Math.min(1.0, averages.mat ?? 0.85));
            const sampleMat    = this.getVariedSampleTarget(mat, 0.01, 2, seedMod);
            const matVarLimit  = Math.max(0.001, 0.01 - Math.abs(sampleMat - mat));
            const matReadings  = this.getBalancedReadings(sampleMat, matVarLimit, 2, seedMod, count);

            // CSP: se o template retornou 0 (não preenchido), usa fallback de 115
            const cspRaw       = (averages.csp && averages.csp > 10) ? averages.csp : 115;
            const csp          = Math.max(100, Math.min(9999, cspRaw));
            const sampleCsp    = this.getVariedSampleTarget(csp, 3, 0, seedMod);
            const cspVarLimit  = Math.max(1, 3 - Math.abs(sampleCsp - csp));
            const cspReadings  = this.getBalancedReadings(sampleCsp, cspVarLimit, 0, seedMod, count);

            // LEAF: clampa entre 1 e 8
            const leaf         = Math.max(1, Math.min(8, averages.leaf ?? 2));
            const sampleLeaf   = this.getVariedSampleTarget(leaf, 1, 0, seedMod);
            const leafVarLimit = Math.max(0, 1 - Math.abs(sampleLeaf - leaf));
            const leafReadings = this.getBalancedReadings(sampleLeaf, leafVarLimit, 0, seedMod, count);

            const area         = Math.max(0.01, averages.area ?? 0.25);
            const sampleArea   = this.getVariedSampleTarget(area, 0.05, 2, seedMod);
            const areaVarLimit = Math.max(0.01, 0.05 - Math.abs(sampleArea - area));
            const areaReadings = this.getBalancedReadings(sampleArea, areaVarLimit, 2, seedMod, count);

            // cnt usado no fallback Premier
            const cnt          = averages.count ?? 30;

            // Date & time formatting
            const date = this.formatH1Date(sample.data_analise);
            const timeBase = sample.hora_analise || "09:00";
            const timeParts = timeBase.split(':');
            const hours = parseInt(timeParts[0]) || 9;
            const minutes = parseInt(timeParts[1]) || 0;
            const timeBaseFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

            // REP 4 time: +1 minute
            let rep4Min = minutes + 1;
            let rep4Hour = hours;
            if (rep4Min >= 60) {
                rep4Min = 0;
                rep4Hour = (rep4Hour + 1) % 24;
            }
            const timeRep4 = `${String(rep4Hour).padStart(2, '0')}:${String(rep4Min).padStart(2, '0')}`;

            // ── lineName derivado do número real da máquina ─────────────────────
            // machineId ex: 'HVI 01', 'HVI 5', 'HVI05' → extrai o número → 'Line5       '
            const machineNum = parseInt(machine.machineId.replace(/\D/g, ''), 10);
            const lineName = `Line${isNaN(machineNum) ? '5' : machineNum}`.padEnd(12, ' ');

            console.log(`[HVI] Amostra ${sample.amostra_id} cor=${sample.cor} modelo=${machine.model} linha=${lineName.trim()}`);

            let content: string;
            let filename: string;
            let files: Array<{ content: string; filename: string }> = [];

            if (machine.model === 'USTER') {
                const baseNum = parseInt(sample.amostra_id);
                const repContents: string[] = [];

                // ── Horários aleatórios por repetição (máx 5 min de diferença) ───
                // Seed determinística por amostra_id para que re-download gere iguais
                let tHash = 0;
                const tSeedStr = `${sample.id || sample.amostra_id || "time"}_time`;
                for (let i = 0; i < tSeedStr.length; i++) {
                    tHash = (tHash << 5) - tHash + tSeedStr.charCodeAt(i);
                    tHash |= 0;
                }
                let tSeed = Math.abs(tHash) || 1;
                const tRand = () => {
                    tSeed ^= tSeed << 13;
                    tSeed ^= tSeed >>> 17;
                    tSeed ^= tSeed << 5;
                    return (Math.abs(tSeed) % 1000000) / 1000000;
                };

                const offsets = [0];
                let currentOffset = 0;
                for (let j = 1; j < count; j++) {
                    currentOffset += Math.floor(tRand() * 2); // Adiciona 0 a 1 min para cada repetição
                    offsets.push(currentOffset);
                }

                for (let i = 0; i < count; i++) {
                    const repIndex = i + 1;
                    const offsetMin = offsets[i];
                    const repMinutes = minutes + offsetMin;
                    const repHour = (hours + Math.floor(repMinutes / 60)) % 24;
                    const repMin = repMinutes % 60;
                    const repTime = `${String(repHour).padStart(2, '0')}:${String(repMin).padStart(2, '0')}`;
                    const seqStart = repIndex * 2 - 1;

                    // Calculate on the fly for LEN and COUNT based on this rep's UHML
                    const repLen = parseFloat(((lenReadings[i] / 25.4) * 21).toFixed(1));
                    const repCount = parseFloat((repLen * 2.45 - 0.3).toFixed(1));

                    const repContent = this.generateH1FileContent(
                        sample,
                        date,
                        repTime,
                        seqStart,
                        repIndex,
                        lineName,          // <<< número real da máquina
                        micReadings[i],
                        lenReadings[i],
                        unfReadings[i],
                        strReadings[i],
                        elgReadings[i],
                        sfiReadings[i],
                        repLen,
                        repCount,
                        sciReadings[i],
                        rdReadings[i],
                        bReadings[i],
                        averages.cg || "31-3",
                        areaReadings[i],
                        leafReadings[i],
                        matReadings[i],
                        cspReadings[i]
                    );

                    let repFilename = "";
                    if (!isNaN(baseNum)) {
                        const fileNum = baseNum * count - count + repIndex;
                        repFilename = `RAX${String(fileNum).padStart(6, '0')}.H1`;
                    } else {
                        const sampleLabel = sample.etiqueta?.replace(/[^a-zA-Z0-9]/g, '_') || sample.amostra_id;
                        repFilename = `RAX${sampleLabel}_REP${repIndex}.H1`;
                    }

                    files.push({ content: repContent, filename: repFilename });
                    repContents.push(`=== ARQUIVO: ${repFilename} ===\n${repContent}`);
                }

                content = repContents.join('\n\n');
                filename = files[0].filename;
            } else {
                // PREMIER fallback logic
                const count6 = 6;
                const micReadings6  = this.generateBalancedReadings(averages.mic, count6, tols.mic, 2);
                const lenReadings6  = this.generateBalancedReadings(averages.len, count6, tols.len, 2);
                const unfReadings6  = this.generateBalancedReadings(averages.unf, count6, tols.unf, 1);
                const strReadings6  = this.generateBalancedReadings(averages.str, count6, tols.str, 1);
                const rdReadings6   = this.generateBalancedReadings(averages.rd,  count6, tols.rd,  1);
                const bReadings6    = this.generateBalancedReadings(averages.b,   count6, tols.b,   1);
                const elgReadings6  = Array(count6).fill(elg);
                const areaReadings6 = Array(count6).fill(area);
                const cntReadings6  = Array(count6).fill(cnt); // cnt definido acima
                const matReadings6  = Array(count6).fill(mat);
                const sfiReadings6  = Array(count6).fill(sfi);
                const sciReadings6  = Array(count6).fill(sci);
                const cspReadings6  = Array(count6).fill(csp);
                const mlReadings6   = lenReadings6.map(v => parseFloat((v * 0.75).toFixed(2)));

                content = this.generatePremierFormatMultipleBalanced(sample, count6, averages, {
                    mic:   micReadings6,
                    uhml:  lenReadings6,
                    ml:    mlReadings6,
                    ui:    unfReadings6,
                    str:   strReadings6,
                    rd:    rdReadings6,
                    b:     bReadings6,
                    elg:   elgReadings6,
                    area:  areaReadings6,
                    count: cntReadings6,
                    mat:   matReadings6,
                    sfi:   sfiReadings6,
                    sci:   sciReadings6,
                    csp:   cspReadings6,
                });
                
                const timestamp = this.formatDateForFilename();
                const sampleLabel = sample.etiqueta?.replace(/[^a-zA-Z0-9]/g, '_') || sample.amostra_id;
                filename = `HVI_PREMIER_${sampleLabel}_${timestamp}.txt`;
            }

            return {
                success: true,
                data: {
                    content,
                    filename,
                    machineModel: machine.model,
                    generatedValues,
                    files: files.length > 0 ? files : undefined
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

        this.downloadHVIFile(result.data.content, result.data.filename, result.data.files);

        return {
            success: true,
            message: `Arquivo ${result.data.filename} gerado com sucesso.`
        };
    }

    /**
     * Encodes a string to ASCII bytes, preserving CRLF exactly
     */
    private static toASCIIBytes(str: string): Uint8Array {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i) & 0x7F;
        }
        return bytes;
    }

    /**
     * Download the HVI file content
     */
    static downloadHVIFile(content: string, filename: string, files?: Array<{ content: string; filename: string }>): void {
        if (files && files.length > 0) {
            files.forEach(f => {
                // Usa bytes brutos para garantir CRLF (\r\n) no arquivo final
                const bytes = this.toASCIIBytes(f.content);
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = f.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        } else {
            const blob = new Blob([content], { type: 'text/plain;charset=ascii' });
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
}


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
    balancedReadings?: Record<string, number[]>;
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
    private static async getMachineByHVI(hviNumber: string, explicitlyPassedLabId?: string): Promise<Machine | null> {
        try {
            let machines: Machine[] = [];
            const sessionData = localStorage.getItem("fibertech_session");
            const selectedLabData = localStorage.getItem("fibertech_selected_lab");

            let labId = explicitlyPassedLabId || null;
            if (!labId) {
                if (selectedLabData && selectedLabData !== "[object Object]" && selectedLabData !== "undefined") {
                    try {
                        const parsed = JSON.parse(selectedLabData);
                        labId = parsed?.id || parsed;
                    } catch (e) {
                        labId = selectedLabData;
                    }
                }

                if (!labId && sessionData) {
                    try {
                        const user = JSON.parse(sessionData);
                        if (user.lab_id && user.acesso !== 'admin_global') {
                            labId = user.lab_id;
                        }
                    } catch (e) {}
                }
            }

            try {
                if (labId) {
                    machines = await MachineService.listByLab(labId);
                } else {
                    machines = await MachineService.list();
                }
            } catch (fetchError) {
                console.warn("Failed to fetch lab specific machines, falling back to all:", fetchError);
                machines = await MachineService.list();
            }

            const findMachine = (machineList: Machine[], hvi: string) => {
                const exactMatchId = machineList.find(m => String(m.id) === String(hvi));
                if (exactMatchId) return exactMatchId;

                const exactMatch = machineList.find(m => m.machineId === hvi);
                if (exactMatch) return exactMatch;

                const targetNum = hvi.replace(/\D/g, '');
                return machineList.find(m => {
                    if (m.machineId.trim().toUpperCase() === hvi.trim().toUpperCase()) return true;
                    if (targetNum && m.machineId.replace(/\D/g, '') === targetNum) return true;
                    return false;
                }) || null;
            };

            let found = findMachine(machines, hviNumber);

            // Se não encontrou no laboratório específico, procura em TODAS as máquinas (fallback seguro para admins)
            if (!found && labId) {
                const allMachines = await MachineService.list();
                found = findMachine(allMachines, hviNumber);
            }

            return found;
        } catch (error) {
            console.error('Error loading machines:', error);
            return null;
        }
    }

    /**
     * ── Média Secundária ──────────────────────────────────────────────────────
     * Lê EXCLUSIVAMENTE o template vinculado à cor desta amostra.
     * Nunca mistura dados de outras cores nem usa dados calculados de amostras.
     * Prioriza dados do banco (configuracoes_analise.color_templates) com fallback para localStorage.
     */
    private static getSecondaryTemplate(color: string, loteId: string, configuracoesAnalise?: Record<string, any>): ColorAverage | null {
        let parsed: any = null;

        // Priority 1: configuracoes_analise from DB
        if (configuracoesAnalise?.color_templates) {
            parsed = configuracoesAnalise.color_templates;
        }

        // Priority 2: localStorage fallback
        if (!parsed) {
            const STORAGE_PREFIX = loteId ? `lote_${loteId}_` : '';
            const raw = localStorage.getItem(`${STORAGE_PREFIX}custom_color_averages`);
            if (!raw) return null;
            try {
                parsed = JSON.parse(raw);
            } catch {
                return null;
            }
        }

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
    private static getSampleTargetValues(sample: Sample, allSamples: Sample[] = [], configuracoesAnalise?: Record<string, any>): ColorAverage {
        const color = sample.cor || "#3b82f6";
        const secondary = this.getSecondaryTemplate(color, sample.lote_id, configuracoesAnalise);

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

        // Load manual overrides if they exist
        let overrides: Record<string, string> = {};
        
        // Priorizar as overrides que vêm do banco via parâmetro
        if (configuracoesAnalise?.manual_overrides) {
            overrides = configuracoesAnalise.manual_overrides;
        } else {
            // Fallback para localStorage
            const STORAGE_PREFIX = sample.lote_id ? `lote_${sample.lote_id}_` : '';
            try {
                const raw = localStorage.getItem(`${STORAGE_PREFIX}manual_overrides`);
                if (raw) overrides = JSON.parse(raw);
            } catch {}
        }

        const parseOverride = (key: string, fallback: number) => {
            const val = overrides[`${color}-${key}`];
            if (val === undefined || val === '') return fallback;
            const parsed = parseFloat(String(val).replace(',', '.'));
            return isNaN(parsed) ? fallback : parsed;
        };

        // Média Primária da Cor
        const primaryAvg: ColorAverage = {
            mic: parseOverride('MIC', Number((sum.mic / count).toFixed(2))),
            len: parseOverride('LEN', Number((sum.len / count).toFixed(2))),
            unf: parseOverride('UNF', Number((sum.unf / count).toFixed(1))),
            str: parseOverride('STR', Number((sum.str / count).toFixed(1))),
            rd:  parseOverride('RD',  Number((sum.rd  / count).toFixed(1))),
            b:   parseOverride('+B',  Number((sum.b   / count).toFixed(1)))
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
     * Prioriza dados do banco (configuracoesAnalise) com fallback para localStorage.
     */
    public static hasColorPrint(color?: string, contextKey?: string, configuracoesAnalise?: Record<string, any>): boolean {
        if (!color) return false;

        // Priority 1: Check from DB config
        if (configuracoesAnalise?.color_templates) {
            const config = configuracoesAnalise.color_templates[color];
            const result = !!(config && typeof config === 'object' && 'selectedLine' in config);
            if (result) return true;
        }

        // Priority 2: localStorage fallback
        const STORAGE_PREFIX = contextKey ? `lote_${contextKey}_` : '';
        const key = `${STORAGE_PREFIX}custom_color_averages`;
        const customAveragesStr = localStorage.getItem(key);
        if (!customAveragesStr) {
            return false;
        }
        try {
            const customAverages = JSON.parse(customAveragesStr);
            const config = customAverages[color];
            return !!(config && typeof config === 'object' && 'selectedLine' in config);
        } catch {
            return false;
        }
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
     * @unused
     */
    /*
    private static formatUster(value: number, decimals: number, width: number): string {
        const formatted = value.toFixed(decimals);
        return formatted.padStart(width, ' ');
    }
    */

    /**
     * Generate ONE line of USTER format using pre-calculated balanced values
     * @unused
     */
    /*
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
    */




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

    private static generatePremierDatFormatLine(
        mala: string,
        etiqueta: string,
        uhml: number,
        ui: number,
        sfi: number,
        str: number,
        elg: number,
        mic: number,
        rd: number,
        b: number,
        cg: string,
        sci: number,
        leaf: number,
        trashCount: number,
        trashArea: number
    ): string {
        const padString = (str: string, len: number) => {
            return str.padEnd(len, ' ');
        };

        const safeNum = (val: number | undefined, decimals: number) => {
            if (val === undefined || isNaN(val)) return (0).toFixed(decimals);
            return val.toFixed(decimals);
        };

        const malaPadded = padString(mala, 40);
        const etiquetaPadded = padString(etiqueta, 40);

        return `"${malaPadded}" "${etiquetaPadded}" "0.00" 28.00 ${safeNum(leaf, 2)} ${Math.round(trashCount || 0)} ${safeNum(trashArea, 2)} ${safeNum(uhml, 2)} ${safeNum(ui, 1)} ${safeNum(sfi, 1)} ${safeNum(str, 1)} ${safeNum(elg, 1)} ${safeNum(mic, 2)} ${safeNum(rd, 1)} ${safeNum(b, 1)} "${cg}" ${safeNum(sci, 1)} 0.00`;
    }

    /**
     * Generate PREMIER format file with multiple readings using pre-calculated balanced values
     */
    private static generatePremierFormatMultipleBalanced(
        sample: Sample, 
        count: number, 
        averages: ColorAverage, 
        balancedReadings: Record<string, number[]>,
        customDate?: string,
        customTime?: string
    ): string {

        // Date/Time formatting (Premier style)
        const now = new Date();
        const dateStr = customDate || now.toLocaleDateString('pt-BR').replace(/\//g, '-');
        // Include seconds for uniqueness
        const timeStr = customTime || now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
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
    private static getBalancedReadings(target: number, maxVar: number, decimals: number, seedModifier: string, count: number = 6, fieldKey: string = ''): number[] {
        // Gera um hash determinístico 32-bit a partir de seedModifier, fieldKey, target e maxVar.
        // fieldKey é essencial: sem ele, dois campos diferentes com o mesmo alvo e a mesma
        // tolerância (ex: ELG e +B, que usam 0.2 por padrão) geram a MESMA sequência de
        // leituras, fazendo colunas distintas saírem com valores idênticos por coincidência.
        let hash = 0;
        const seedStr = `${seedModifier}_${fieldKey}_${target.toFixed(decimals)}_${maxVar.toFixed(decimals)}`;
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
    public static generateH1FileContent(
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
        const safeMala = (sample.mala || '').replace(/\./g, '');
        const amostraBase = `${safeMala}#${String(repIndex).padStart(2, '0')}`;
        const amostraPad = amostraBase.substring(0, 40).padEnd(40, ' ');
        const etiquetaPad = (sample.etiqueta || '').substring(0, 40).padEnd(40, ' ');

        const seqStrStart = String(seq).padStart(2, '0');
        const seqStrEnd = String(seq + 1).padStart(2, '0');

        // ── Valores sem trava restrita (respeitando o que foi digitado no Preview) ─────────────
        const safeMic  = mic;
        const safeUi   = ui;
        const safeStr  = str;
        const safeElg  = elg;
        const safeSfi  = sfi;
        const safeRd   = rd;
        const safePlusB = plusB;
        const safeMat  = mat;
        const safeSci  = Math.round(sci);
        const safeCsp  = Math.round(csp);
        const safeLeaf = Math.round(leaf);
        const safeArea = Math.max(0.01, area);
        const safeUhml = Math.max(0.01, uhml);
        const safeLen  = Math.max(0.01, len);
        const safeCount = Math.max(1.0, count);

        const uhmlStr = safeUhml.toFixed(2).padStart(5, ' ');
        const uiStr = safeUi.toFixed(1).padStart(4, ' ');
        const strStr = safeStr.toFixed(1).padStart(4, ' ');
        const elgStr = safeElg.toFixed(1).padStart(4, ' ');
        const sfiStr = safeSfi.toFixed(1).padStart(4, ' ');
        const lenStr = safeLen.toFixed(1).padStart(5, ' ');
        const countStr = safeCount.toFixed(1).padStart(5, ' ');

        const micStr = safeMic.toFixed(2).padStart(4, ' ');
        const sciStr = String(safeSci).padStart(4, '0');

        const rdStr = safeRd.toFixed(1).padStart(4, ' ');
        const bStr = safePlusB.toFixed(1).padStart(4, ' ');
        const areaNStr = Math.round(safeCount).toString().padStart(3, ' ');
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
        tolerancias: any = null,
        overrideReadings?: Record<string, number[]>,
        customEtiqueta?: string | string[],
        customDate?: string,
        customTime?: string,
        customHvi?: string,
        configuracoesAnalise?: Record<string, any>,
        repCount?: number,
        labId?: string
    ): Promise<{
        success: boolean; message?: string; data?: HVIPreviewData }> {
        try {
            // Check if color has linked print template (STRICT LOCK)
            if (!sample.cor || !this.hasColorPrint(sample.cor, sample.lote_id, configuracoesAnalise)) {
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

            const targetHvi = customHvi || sample.hvi;
            // Check if sample has HVI number
            if (!targetHvi) {
                return {
                    success: false,
                    message: 'Amostra não possui número HVI cadastrado ou selecionado'
                };
            }

            // Get machine info
            const machine = await this.getMachineByHVI(targetHvi, labId);
            if (!machine) {
                return {
                    success: false,
                    message: `Máquina HVI ${targetHvi} não encontrada no cadastro`
                };
            }

            // Get the averages (Sample values or Color Average)
            const averages = this.getSampleTargetValues(sample, allSamples, configuracoesAnalise);

            const count = repCount ?? 6;
            const tols = tolerancias || { mic: 0.10, len: 0.30, unf: 0.5, str: 0.5, rd: 0.5, b: 0.3 };
            const seedMod = sample.id || sample.amostra_id || "default";

            // ── Média do arquivo = Média configurada (sem desvio na média) ──
            // As leituras individuais variam dentro da tolerância, mas a média final é exata.
            const sampleMic = averages.mic;
            const sampleLen = averages.len;
            const sampleUnf = averages.unf;
            const sampleStr = averages.str;
            const sampleRd  = averages.rd;
            const sampleB   = averages.b;

            // For preview modal: show the actual averages used in the HVI file
            const generatedValues = {
                mic: sampleMic,
                len: sampleLen,
                unf: sampleUnf,
                str: sampleStr,
                rd: sampleRd,
                b: sampleB
            };

            // ── Geração balanceada ou Override ──
            const micReadings = overrideReadings?.mic?.length ? overrideReadings.mic : this.getBalancedReadings(sampleMic, Math.max(0.01, tols.mic), 2, seedMod, count, 'mic');
            const lenReadings = overrideReadings?.len?.length ? overrideReadings.len : this.getBalancedReadings(sampleLen, Math.max(0.01, tols.len), 2, seedMod, count, 'len');
            const unfReadings = overrideReadings?.unf?.length ? overrideReadings.unf : this.getBalancedReadings(sampleUnf, Math.max(0.1, tols.unf), 1, seedMod, count, 'unf');
            const strReadings = overrideReadings?.str?.length ? overrideReadings.str : this.getBalancedReadings(sampleStr, Math.max(0.1, tols.str), 1, seedMod, count, 'str');
            const rdReadings  = overrideReadings?.rd?.length  ? overrideReadings.rd  : this.getBalancedReadings(sampleRd, Math.max(0.1, tols.rd), 1, seedMod, count, 'rd');
            const bReadings   = overrideReadings?.b?.length   ? overrideReadings.b   : this.getBalancedReadings(sampleB, Math.max(0.1, tols.b), 1, seedMod, count, 'b');

            // ── Extração direta do template (rawRows) com LEVE DESVIO determinístico ──
            const hasRawRows = averages.rawRows && averages.rawRows.length >= count;
            const getRawReading = (key: string, fallback: number[], maxDev: number = 0.01, decimals: number = 2): number[] => {
                if (hasRawRows) {
                    let hash = 0;
                    const seedStr = `${seedMod}_rawvar_${key}`;
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

                    const result = averages.rawRows!.slice(0, count).map((row: any) => {
                        const valRaw = row[key];
                        if (valRaw === undefined || valRaw === null || valRaw === '') return fallback[0];
                        
                        const val = Number(valRaw);
                        if (isNaN(val) || val === 0) return fallback[0];
                        
                        if (maxDev > 0) {
                            const deviation = (rand() * 2 - 1) * maxDev;
                            return parseFloat((val + deviation).toFixed(decimals));
                        }
                        return val;
                    });

                    // Shuffle array deterministically
                    for (let i = result.length - 1; i > 0; i--) {
                        const j = Math.floor(rand() * (i + 1));
                        [result[i], result[j]] = [result[j], result[i]];
                    }

                    return result;
                }
                return fallback;
            };

            const elg          = averages.elg ?? 6.4;
            const fallbackElg  = this.getBalancedReadings(elg, 0.2, 1, seedMod, count, 'elg');
            const elgReadings  = overrideReadings?.elg?.length ? overrideReadings.elg : getRawReading('elg', fallbackElg, 0.1, 1);

            const sfi          = averages.sfi ?? 10.0;
            const fallbackSfi  = this.getBalancedReadings(sfi, 1.0, 1, seedMod, count, 'sfi');
            const sfiReadings  = overrideReadings?.sfi?.length ? overrideReadings.sfi : getRawReading('sfi', fallbackSfi, 0.2, 1);

            const sciRaw       = (averages.sci && averages.sci > 10) ? averages.sci : 120;
            const sci          = Math.max(80, Math.min(160, sciRaw));
            const fallbackSci  = this.getBalancedReadings(sci, 3, 0, seedMod, count, 'sci');
            const sciReadings  = overrideReadings?.sci?.length ? overrideReadings.sci : getRawReading('sci', fallbackSci, 1.0, 0);

            const mat          = Math.max(0.75, Math.min(1.0, averages.mat ?? 0.85));
            // Variação 0.04 = oscila entre ~0.81 e ~0.93 para alvo típico de 0.87
            const fallbackMat  = this.getBalancedReadings(mat, 0.04, 2, seedMod, count, 'mat');
            const matReadings  = overrideReadings?.mat?.length ? overrideReadings.mat : fallbackMat;

            const cspRaw       = (averages.csp && averages.csp > 10) ? averages.csp : 115;
            const csp          = Math.max(100, Math.min(9999, cspRaw));
            const fallbackCsp  = this.getBalancedReadings(csp, 3, 0, seedMod, count, 'csp');
            const cspReadings  = overrideReadings?.csp?.length ? overrideReadings.csp : getRawReading('csp', fallbackCsp, 1.0, 0);

            const leaf         = Math.max(1, Math.min(7, averages.leaf ?? 3));
            const fallbackLeaf = this.getBalancedReadings(leaf, 1, 0, seedMod, count, 'leaf');
            const leafReadings = overrideReadings?.leaf?.length ? overrideReadings.leaf : fallbackLeaf;

            const area         = Math.max(0.01, averages.area ?? 0.25);
            // Variação proporcional: 30% do valor (ex: area=0.33 → maxVar=0.099)
            const areaMaxVar   = Math.max(0.03, area * 0.30);
            const fallbackArea = this.getBalancedReadings(area, areaMaxVar, 2, seedMod, count, 'area');
            const areaReadings = overrideReadings?.area?.length ? overrideReadings.area : fallbackArea;

            const countVal     = Math.max(1, averages.count ?? 30);
            const fallbackCount= this.getBalancedReadings(countVal, 5, 0, seedMod, count, 'count');
            const countReadings= overrideReadings?.count?.length ? overrideReadings.count : fallbackCount;

            const balancedReadingsRecord = {
                mic: micReadings, len: lenReadings, unf: unfReadings, str: strReadings, 
                rd: rdReadings, b: bReadings, elg: elgReadings, sfi: sfiReadings, 
                sci: sciReadings, mat: matReadings, csp: cspReadings, leaf: leafReadings, 
                area: areaReadings, count: countReadings, cg: Array(count).fill(averages.cg)
            };


            // Date & time formatting
            const now = new Date();
            const date = this.formatH1Date(customDate); // Always format to DD-MMM-YY for USTER
            const hours = now.getHours();
            const minutes = now.getMinutes();

            // ── lineName derivado do número real da máquina ─────────────────────
            // machineId ex: 'HVI 01', 'HVI 5', 'HVI05' → extrai o número → 'Line5       '
            const machineNum = parseInt(customHvi || machine.machineId.replace(/\D/g, ''), 10);
            const lineName = `Line${isNaN(machineNum) ? '5' : machineNum}`.padEnd(12, ' ');

            console.log(`[HVI] Amostra ${sample.amostra_id} cor=${sample.cor} modelo=${machine.model} linha=${lineName.trim()}`);

            let content: string;
            let filename: string;
            const files: Array<{ content: string; filename: string }> = [];
            const isUster = machine.model?.toUpperCase() === 'USTER';

            if (isUster) {
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
                    currentOffset += (1 + Math.floor(tRand() * 2)); // Adiciona 1 a 2 min para cada repetição
                    offsets.push(currentOffset);
                }

                let startRep = 1;
                const storedRep = localStorage.getItem('hvi_global_rep_uster');
                startRep = storedRep && !isNaN(parseInt(storedRep, 10)) ? parseInt(storedRep, 10) + 1 : 1;
                localStorage.setItem('hvi_global_rep_uster', (startRep + count - 1).toString());

                for (let i = 0; i < count; i++) {
                    const localRep = i + 1;
                    const repIndex = startRep + i;
                    const offsetMin = offsets[i];
                    let baseHours = hours;
                    let baseMinutes = minutes;
                    if (customTime) {
                        const parts = customTime.split(':');
                        if (parts.length >= 2) {
                            baseHours = parseInt(parts[0], 10);
                            baseMinutes = parseInt(parts[1], 10);
                        }
                    }
                    const repMinutes = baseMinutes + offsetMin;
                    const repHour = (baseHours + Math.floor(repMinutes / 60)) % 24;
                    const repMin = repMinutes % 60;
                    const repTime = `${String(repHour).padStart(2, '0')}:${String(repMin).padStart(2, '0')}`;
                    const seqStart = repIndex * 2 - 1;

                    const repLen = parseFloat(((lenReadings[i] / 25.4) * 21).toFixed(1));

                    let rawEtiqueta = (Array.isArray(customEtiqueta) ? customEtiqueta[i] : customEtiqueta) || sample.etiqueta;
                    rawEtiqueta = rawEtiqueta?.replace(/\./g, '');
                    const effectiveSample = { ...sample, etiqueta: rawEtiqueta };

                    const repContent = this.generateH1FileContent(
                        effectiveSample,
                        date,
                        repTime,
                        localRep,
                        localRep,
                        lineName,
                        micReadings[i],
                        lenReadings[i],
                        unfReadings[i],
                        strReadings[i],
                        elgReadings[i],
                        sfiReadings[i],
                        repLen,
                        countReadings[i],
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
                        const fileNum = baseNum * count - count + localRep;
                        repFilename = `RAX${String(fileNum).padStart(6, '0')}.H1`;
                    } else {
                        const sampleLabelForName = rawEtiqueta?.replace(/[^a-zA-Z0-9]/g, '_') || sample.amostra_id;
                        repFilename = `RAX${sampleLabelForName}_REP${repIndex}.H1`;
                    }
                    
                    if (sample.lote_id === 'reanalise') {
                        const mNum = isNaN(machineNum) ? 1 : machineNum;
                        const safeMala = (sample.mala || 'REANALISE').replace(/[^a-zA-Z0-9]/g, '_');
                        // Apenas o nome do arquivo leva o prefixo U e a máquina.
                        repFilename = `U${mNum}_${safeMala}_REP${localRep}.H1`;
                    }

                    files.push({ content: repContent, filename: repFilename });
                    repContents.push(`=== ARQUIVO: ${repFilename} ===\n${repContent}`);
                }

                content = repContents.join('\n\n');
                filename = files[0].filename;
            } else {
                // PREMIER fallback logic
                const repContents: string[] = [];
                const timestamp = this.formatDateForFilename();

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
                    currentOffset += (1 + Math.floor(tRand() * 2)); // Adiciona 1 a 2 min para cada repetição
                    offsets.push(currentOffset);
                }

                let startRepPremier = 1;
                const storedRepPremier = localStorage.getItem('hvi_global_rep_premier');
                startRepPremier = storedRepPremier && !isNaN(parseInt(storedRepPremier, 10)) ? parseInt(storedRepPremier, 10) + 1 : 1;
                localStorage.setItem('hvi_global_rep_premier', (startRepPremier + count - 1).toString());

                const isReanalise = sample.lote_id === 'reanalise';
                
                if (isReanalise) {
                    const datLines: string[] = [];
                    for (let i = 0; i < 10; i++) {
                        datLines.push("");
                    }
                    for (let i = 0; i < count; i++) {
                        let rawEtiqueta = (Array.isArray(customEtiqueta) ? customEtiqueta[i] : customEtiqueta) || sample.etiqueta;
                        rawEtiqueta = rawEtiqueta?.replace(/\./g, '');
                        const mala = sample.mala || 'REANALISE';
                        const line = this.generatePremierDatFormatLine(
                            mala,
                            rawEtiqueta || '',
                            lenReadings[i],
                            unfReadings[i],
                            sfiReadings[i],
                            strReadings[i],
                            elgReadings[i],
                            micReadings[i],
                            rdReadings[i],
                            bReadings[i],
                            averages.cg || "31-2",
                            sciReadings[i],
                            leafReadings[i],
                            countReadings[i],
                            areaReadings[i]
                        );
                        datLines.push(line);
                    }
                    const mNum = isNaN(machineNum) ? 1 : machineNum;
                    const safeMala = (sample.mala || 'REANALISE').replace(/[^a-zA-Z0-9]/g, '_');
                    const repFilename = `M${mNum}_HVI_PREMIER_${safeMala}_REP${startRepPremier}_${timestamp}.dat`;
                    const fileContent = datLines.join('\n');
                    files.push({ content: fileContent, filename: repFilename });
                    content = fileContent;
                    filename = repFilename;
                } else {
                    for (let i = 0; i < count; i++) {
                        const repIndex = startRepPremier + i;
                        const dateStr = customDate || now.toLocaleDateString('pt-BR').replace(/\//g, '-');
                        
                        const offsetMin = offsets[i];
                        let baseHours = now.getHours();
                        let baseMinutes = now.getMinutes();
                        if (customTime) {
                            const parts = customTime.split(':');
                            if (parts.length >= 2) {
                                baseHours = parseInt(parts[0], 10);
                                baseMinutes = parseInt(parts[1], 10);
                            }
                        }
                        const repMinutes = baseMinutes + offsetMin;
                        const repHour = (baseHours + Math.floor(repMinutes / 60)) % 24;
                        const repMin = repMinutes % 60;
                        
                        let repTime = "";
                        if (customTime) {
                             repTime = `${String(repHour).padStart(2, '0')}:${String(repMin).padStart(2, '0')}`;
                        } else {
                             const fakeDate = new Date();
                             fakeDate.setHours(repHour, repMin, now.getSeconds());
                             repTime = fakeDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
                        }

                        // Only calculating repMl on the fly for PREMIER if needed, Uster uses real area and count
                        const repCount = countReadings[i];
                        const repArea = areaReadings[i];
                        const repMl = parseFloat((lenReadings[i] * 0.75).toFixed(2));

                        const singleReadings = {
                            mic:   [micReadings[i]],
                            uhml:  [lenReadings[i]],
                            ml:    [repMl],
                            ui:    [unfReadings[i]],
                            str:   [strReadings[i]],
                            rd:    [rdReadings[i]],
                            b:     [bReadings[i]],
                            elg:   [elgReadings[i]],
                            area:  [repArea],
                            count: [repCount],
                            mat:   [matReadings[i]],
                            sfi:   [sfiReadings[i]],
                            sci:   [sciReadings[i]],
                            csp:   [cspReadings[i]],
                        };

                        let rawEtiqueta = (Array.isArray(customEtiqueta) ? customEtiqueta[i] : customEtiqueta) || sample.etiqueta;
                        rawEtiqueta = rawEtiqueta?.replace(/\./g, '');
                        const effectiveSample = { ...sample, etiqueta: rawEtiqueta };

                        const repContent = this.generatePremierFormatMultipleBalanced(effectiveSample, 1, averages, singleReadings, dateStr, repTime);
                        const sampleLabelForName = rawEtiqueta?.replace(/[^a-zA-Z0-9]/g, '_') || sample.amostra_id;
                        let repFilename = `HVI_PREMIER_${sampleLabelForName}_REP${repIndex}_${timestamp}.txt`;

                        files.push({ content: repContent, filename: repFilename });
                        repContents.push(`=== ARQUIVO: ${repFilename} ===\n${repContent}`);
                    }

                    content = repContents.join('\n\n');
                    filename = files[0].filename;
                }
            }

                return {
                    success: true,
                    data: {
                        content,
                        filename,
                        machineModel: isUster ? 'USTER' : 'PREMIER',
                        generatedValues,
                        files: files.length > 0 ? files : undefined,
                        balancedReadings: balancedReadingsRecord
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
     * Download the HVI file content (Individual files)
     */
    static async downloadHVIFile(content: string, filename: string, files?: Array<{ content: string; filename: string }>): Promise<void> {
        if (files && files.length > 0) {
            // Fazer download individual sequencialmente com um pequeno delay de 150ms para evitar bloqueios do navegador
            for (const f of files) {
                const bytes = this.toASCIIBytes(f.content);
                const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = f.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        } else {
            // Arquivo único
            const bytes = this.toASCIIBytes(content);
            const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
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


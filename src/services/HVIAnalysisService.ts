
import { type Sample } from "@/entities/Sample";

export interface HVIAnalysisConfig {
    targetParams: string[];
    useOutliersInModel: boolean;
    machineGrouping: boolean;
    colorGrouping: boolean;
}

export interface ParameterStats {
    mean: number;
    stdDev: number;
    cv: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    iqr: number;
}

export interface OutlierInfo {
    sampleId: string;
    value: number;
    zScore: number;
    severity: 'NORMAL' | 'ALERTA' | 'CRITICO';
}

export interface PredictionResult {
    predictedNextValue: number;
    confidenceInterval: [number, number];
    probabilityWithinRange: number;
    mae: number;
    rmse: number;
    status: 'OK' | 'ALERTA' | 'CRITICO';
}

export interface ParameterAnalysis {
    param: string;
    displayName: string;
    stats: ParameterStats;
    outliers: OutlierInfo[];
    prediction: PredictionResult;
    distribution: { label: string, value: number, percent: number }[];
    trend: number[]; // Added for Trend Analysis chart
    discriminantScore: number;
    isDominant: boolean;
}

export interface CorrelationMatrix {
    [key: string]: { [key: string]: number };
}

export interface HVIAnalysisReport {
    timestamp: string;
    initialCount: number;
    cleanedCount: number;
    outlierCount: number;
    machine: string;
    groupType: 'MACHINE' | 'COLOR' | 'CONSOLIDATED';
    parameterAnalyses: ParameterAnalysis[];
    correlationMatrix: CorrelationMatrix;
    consolidated: {
        weightedMean: number;
        globalInterval: [number, number];
        globalProbability: number;
        status: 'OK' | 'ALERTA' | 'CRITICO';
    };
    validation: {
        maeGlobal: number;
        rmseGlobal: number;
        withinICPercentage: number;
        falseAlertRate: number;
        isValid: boolean;
    };
    logs: string[];
}

export class HVIAnalysisService {
    private static PARAMS = ['mic', 'len', 'unf', 'str', 'rd', 'b'];
    private static PARAM_NAMES: Record<string, string> = {
        mic: 'MIC',
        len: 'LEN(UHML)',
        unf: 'UNF',
        str: 'STR',
        rd: 'RD',
        b: '+B'
    };

    /**
     * Core Analysis Entry point. Returns all groups (Consolidated, Machine, and Color).
     */
    public static async analyze(samples: Sample[]): Promise<HVIAnalysisReport[]> {
        const results: HVIAnalysisReport[] = [];
        if (!samples || samples.length === 0) return [];

        // 1. GERAL (Consolidado)
        try {
            const report = this.processGroup('RELATÓRIO GERAL (CONSOLIDADO)', samples, {});
            report.groupType = 'CONSOLIDATED';
            results.push(report);
        } catch (e) {
            console.warn("Erro no consolidado", e);
        }

        // 2. POR MÁQUINA
        const machineGroups: { [key: string]: Sample[] } = {};
        samples.forEach(s => {
            const m = s.hvi || 'HVI_NÃO_IDENTIFICADA';
            if (!machineGroups[m]) machineGroups[m] = [];
            machineGroups[m].push(s);
        });

        // Process each machine if there are specifically multiple machines or it's identified
        if (Object.keys(machineGroups).length > 0) {
            for (const [m, s] of Object.entries(machineGroups)) {
                try {
                    const report = this.processGroup(`MÁQUINA: ${m}`, s, {});
                    report.groupType = 'MACHINE';
                    results.push(report);
                } catch (e) { }
            }
        }

        // 3. POR COR (Qualidade)
        const colorGroups: { [key: string]: Sample[] } = {};
        samples.forEach(s => {
            const c = s.cor || 'SEM_CLASSIFICAÇÃO';
            if (!colorGroups[c]) colorGroups[c] = [];
            colorGroups[c].push(s);
        });

        if (Object.keys(colorGroups).length > 0) {
            for (const [c, s] of Object.entries(colorGroups)) {
                try {
                    const report = this.processGroup(`QUALIDADE: ${c}`, s, {});
                    report.groupType = 'COLOR';
                    results.push(report);
                } catch (e) { }
            }
        }

        return results;
    }

    private static processGroup(groupName: string, samples: Sample[], _config: Partial<HVIAnalysisConfig>): HVIAnalysisReport {
        const logs: string[] = [];
        const initialCount = samples.length;

        // Clean and validate data (handling comma notation)
        const validSamples = samples.filter(s => this.isValid(s));
        const n = validSamples.length;
        logs.push(`Iniciando análise para ${groupName}. Amostras válidas: ${n}/${initialCount}`);

        if (n < 1) {
            throw new Error(`Dados insuficientes (n=${n}). Mínimo de 1 amostra necessária.`);
        }

        const analysesMap: Record<string, ParameterAnalysis> = {};
        const matrixData: number[][] = [];

        this.PARAMS.forEach(param => {
            // Filter samples that have THIS specific parameter
            const paramValues = validSamples
                .map(s => {
                    const val = (s as any)[param];
                    if (val === undefined || val === null || val === '') return null;
                    const num = parseFloat(val.toString().replace(',', '.'));
                    return isNaN(num) ? null : num;
                })
                .filter((v): v is number => v !== null);

            if (paramValues.length === 0) return; // Skip if no data for this param

            const stats = this.calculateStats(paramValues);
            const outliers = this.detectOutliers(validSamples, param, stats);
            const prediction = this.calculatePrediction(paramValues, stats);

            // Calculate Histogram / Distribution
            const distribution = this.calculateDistribution(paramValues);

            // Trend data (Sequence of values)
            const trend = paramValues;

            analysesMap[param] = {
                param,
                displayName: this.PARAM_NAMES[param],
                stats,
                outliers,
                prediction,
                distribution,
                trend,
                discriminantScore: 0,
                isDominant: false
            };
        });

        // Normalize matrix for PCA
        validSamples.forEach(s => {
            const row: number[] = this.PARAMS.map(p => {
                const val = parseFloat(((s as any)[p] || 0).toString().replace(',', '.'));
                const stats = analysesMap[p].stats;
                return (val - stats.mean) / (stats.stdDev || 1);
            });
            matrixData.push(row);
        });

        // PCA Calculation for Dominant Parameter
        const loadings = this.calculateFirstComponentLoadings(matrixData);
        const scores: number[] = [];
        this.PARAMS.forEach((param, i) => {
            const analysis = analysesMap[param];
            const loading = Math.abs(loadings[i]);
            // Higher score if it has high loading and stable CV
            analysis.discriminantScore = loading / (analysis.stats.cv / 100 || 0.001);
            scores.push(analysis.discriminantScore);
        });

        const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const cvs = this.PARAMS.map(p => analysesMap[p].stats.cv).sort((a, b) => a - b);
        const p50CV = cvs[Math.floor(cvs.length / 2)];

        let dominantParam: string | null = null;
        this.PARAMS.forEach(param => {
            const analysis = analysesMap[param];
            if (analysis.discriminantScore >= 1.25 * meanScore && analysis.stats.cv <= p50CV) {
                analysis.isDominant = true;
                dominantParam = param;
                logs.push(`Parâmetro Crítico/Dominante: ${analysis.displayName}`);
            }
        });

        // Calculate Weights
        const weights: Record<string, number> = {};
        if (dominantParam) {
            this.PARAMS.forEach(p => weights[p] = p === dominantParam ? 0.40 : (0.60 / (this.PARAMS.length - 1)));
        } else {
            this.PARAMS.forEach(p => weights[p] = 1 / this.PARAMS.length);
        }

        let weightedMeanSum = 0;
        let globalProbSum = 0;
        this.PARAMS.forEach(p => {
            weightedMeanSum += analysesMap[p].stats.mean * weights[p];
            globalProbSum += analysesMap[p].prediction.probabilityWithinRange * weights[p];
        });

        const validation = this.validateModel(validSamples, analysesMap, weights);

        return {
            timestamp: new Date().toISOString(),
            initialCount,
            cleanedCount: n,
            outlierCount: validSamples.filter(s => this.PARAMS.some(p => {
                const val = parseFloat(((s as any)[p] || 0).toString().replace(',', '.'));
                return Math.abs((val - analysesMap[p].stats.mean) / (analysesMap[p].stats.stdDev || 1)) > 2;
            })).length,
            machine: groupName,
            groupType: 'CONSOLIDATED',
            parameterAnalyses: Object.values(analysesMap),
            correlationMatrix: this.calculateCorrelationMatrix(validSamples),
            consolidated: {
                weightedMean: weightedMeanSum,
                globalInterval: [weightedMeanSum * 0.95, weightedMeanSum * 1.05],
                globalProbability: globalProbSum,
                status: globalProbSum >= 90 ? 'OK' : globalProbSum >= 70 ? 'ALERTA' : 'CRITICO'
            },
            validation,
            logs
        };
    }

    private static isValid(s: Sample): boolean {
        // A sample is valid if it has AT LEAST one numeric parameter
        return this.PARAMS.some(p => {
            const val = (s as any)[p];
            if (val === undefined || val === null || val === '') return false;
            return !isNaN(parseFloat(val.toString().replace(',', '.')));
        });
    }

    private static calculateStats(values: number[]): ParameterStats {
        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / (n - 1 || 1);
        const stdDev = Math.sqrt(variance);
        const sorted = [...values].sort((a, b) => a - b);
        return {
            mean, stdDev, cv: mean === 0 ? 0 : (stdDev / mean) * 100,
            min: sorted[0], max: sorted[n - 1],
            q1: sorted[Math.floor(n * 0.25)], q3: sorted[Math.floor(n * 0.75)],
            iqr: (sorted[Math.floor(n * 0.75)] || 0) - (sorted[Math.floor(n * 0.25)] || 0)
        };
    }

    private static detectOutliers(samples: Sample[], param: string, stats: ParameterStats): OutlierInfo[] {
        return samples.map(s => {
            const val = parseFloat(((s as any)[param] || 0).toString().replace(',', '.'));
            const z = stats.stdDev === 0 ? 0 : (val - stats.mean) / stats.stdDev;
            return { sampleId: s.id, value: val, zScore: z, severity: Math.abs(z) > 3 ? 'CRITICO' : Math.abs(z) > 2 ? 'ALERTA' : 'NORMAL' };
        });
    }

    private static calculatePrediction(values: number[], stats: ParameterStats): PredictionResult {
        const n = values.length;
        const margin = 1.96 * stats.stdDev;
        const ci: [number, number] = [stats.mean - margin, stats.mean + margin];
        const prob = (this.normalCDF(ci[1], stats.mean, stats.stdDev) - this.normalCDF(ci[0], stats.mean, stats.stdDev)) * 100;

        let mae = 0, rmseSq = 0;
        for (let i = 1; i < n; i++) {
            const err = Math.abs(values[i] - (values.slice(0, i).reduce((a, b) => a + b, 0) / i));
            mae += err; rmseSq += err * err;
        }

        return {
            predictedNextValue: stats.mean,
            confidenceInterval: ci,
            probabilityWithinRange: prob,
            mae: mae / (n - 1 || 1),
            rmse: Math.sqrt(rmseSq / (n - 1 || 1)),
            status: prob >= 90 ? 'OK' : prob >= 70 ? 'ALERTA' : 'CRITICO'
        };
    }

    private static normalCDF(x: number, mean: number, stdDev: number): number {
        if (stdDev <= 0) return x >= mean ? 1 : 0;
        const z = (x - mean) / stdDev;
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp(-z * z / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.330274))));
        return z >= 0 ? 1 - p : p;
    }

    private static calculateFirstComponentLoadings(matrix: number[][]): number[] {
        const m = matrix[0].length;
        const cov: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
            let sum = 0; for (let k = 0; k < matrix.length; k++) sum += matrix[k][i] * matrix[k][j];
            cov[i][j] = sum / (matrix.length - 1 || 1);
        }
        let b = Array(m).fill(0).map(() => Math.random());
        for (let iter = 0; iter < 10; iter++) {
            const nb = Array(m).fill(0);
            for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) nb[i] += cov[i][j] * b[j];
            const norm = Math.sqrt(nb.reduce((a, c) => a + c * c, 0)) || 1;
            b = nb.map(v => v / norm);
        }
        return b;
    }

    private static validateModel(samples: Sample[], analyses: Record<string, ParameterAnalysis>, weights: Record<string, number>) {
        let mae = 0, rmseSq = 0, within = 0, total = 0;
        this.PARAMS.forEach(p => {
            mae += analyses[p].prediction.mae * weights[p];
            rmseSq += Math.pow(analyses[p].prediction.rmse, 2) * weights[p];
            samples.forEach(s => {
                const v = parseFloat(((s as any)[p] || 0).toString().replace(',', '.'));
                if (v >= analyses[p].prediction.confidenceInterval[0] && v <= analyses[p].prediction.confidenceInterval[1]) within++;
                total++;
            });
        });
        const rmse = Math.sqrt(rmseSq);
        const avgSD = this.PARAMS.reduce((a, b) => a + analyses[b].stats.stdDev, 0) / this.PARAMS.length;
        return { maeGlobal: mae, rmseGlobal: rmse, withinICPercentage: (within / (total || 1)) * 100, falseAlertRate: 0, isValid: rmse <= (avgSD || 1) };
    }

    private static calculateCorrelationMatrix(samples: Sample[]): CorrelationMatrix {
        const matrix: CorrelationMatrix = {};
        this.PARAMS.forEach(p1 => {
            matrix[p1] = {};
            this.PARAMS.forEach(p2 => {
                const x = samples.map(s => parseFloat(((s as any)[p1] || 0).toString().replace(',', '.')));
                const y = samples.map(s => parseFloat(((s as any)[p2] || 0).toString().replace(',', '.')));
                matrix[p1][p2] = this.pearson(x, y);
            });
        });
        return matrix;
    }

    private static pearson(x: number[], y: number[]): number {
        const n = x.length;
        const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
        let num = 0, dx2 = 0, dy2 = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mx, dy = y[i] - my;
            num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
        }
        return Math.sqrt(dx2 * dy2) === 0 ? 0 : num / Math.sqrt(dx2 * dy2);
    }

    private static calculateDistribution(values: number[], buckets = 10): { label: string, value: number, percent: number }[] {
        if (!values.length) return [];
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const step = range / buckets;

        const counts = new Array(buckets).fill(0);
        values.forEach(v => {
            const idx = Math.min(Math.floor((v - min) / step), buckets - 1);
            counts[idx]++;
        });

        return counts.map((count, i) => ({
            label: (min + i * step).toFixed(2),
            value: count,
            percent: (count / values.length) * 100
        }));
    }
}

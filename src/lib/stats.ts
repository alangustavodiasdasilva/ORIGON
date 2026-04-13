export interface StatisticalMetrics {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
    outliers: string[]; // IDs of outlier samples
}

export function calculateStatistics(values: { id: string; val: number }[]): StatisticalMetrics {
    const numericValues = values.map(v => v.val);
    const count = numericValues.length;

    if (count === 0) {
        return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, count: 0, outliers: [] };
    }

    const sum = numericValues.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const sorted = [...numericValues].sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    const variance = numericValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    const min = sorted[0];
    const max = sorted[count - 1];

    // Outlier detection: > 1.5 standard deviations from mean
    const outliers = values
        .filter(v => Math.abs(v.val - mean) > 1.5 * stdDev && stdDev > 0)
        .map(v => v.id);

    return { mean, median, stdDev, min, max, count, outliers };
}

export function getQualityClassification(mic: number) {
    if (mic >= 3.8 && mic <= 4.9) return { label: 'Premium', color: '#10b981', status: 'success' };
    if ((mic >= 3.5 && mic < 3.8) || (mic > 4.9 && mic <= 5.2)) return { label: 'Regular', color: '#f59e0b', status: 'warning' };
    return { label: 'Fora de Padrão', color: '#ef4444', status: 'error' };
}

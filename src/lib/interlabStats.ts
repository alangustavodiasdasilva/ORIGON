// Estatística de consenso interlaboratorial (ISO 13528) — espelha exatamente
// as fórmulas da planilha "INTERLABORATORIAL_reutilizavel":
// valor designado = mediana das médias de cada lab; σ robusto = 1,4826×MAD;
// σ usado = meta (se preenchida) senão o robusto; z = (média_lab − designado)/σ.

export function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// MAD = mediana dos desvios absolutos em relação à mediana.
export function mad(values: number[]): number {
    if (values.length === 0) return 0;
    const med = median(values);
    return median(values.map(v => Math.abs(v - med)));
}

// Constante 1,4826 faz o MAD ser comparável ao desvio-padrão sob normalidade
// — é o fator padrão ISO 13528 para dispersão robusta a outliers.
export function robustSigma(values: number[]): number {
    return 1.4826 * mad(values);
}

export type ZStatus = 'ok' | 'alerta' | 'fora';

// |z|≤2 ok · 2–3 alerta · ≥3 fora — faixas padrão ISO 13528 de avaliação
// de desempenho em ensaios de proficiência.
export function classifyZ(z: number): ZStatus {
    const abs = Math.abs(z);
    if (abs >= 3) return 'fora';
    if (abs > 2) return 'alerta';
    return 'ok';
}

export interface LabAverage {
    labId: string;
    labName: string;
    avg: number;
    n: number;
}

export interface LabConsensusResult extends LabAverage {
    z: number | null;
    status: ZStatus | null;
}

export interface ConsensusResult {
    valorDesignado: number | null;
    sigmaRobusto: number;
    sigmaMeta: number | null;
    sigmaUsado: number | null;
    nLabsReportando: number;
    labs: LabConsensusResult[];
}

export function computeConsensus(labAverages: LabAverage[], sigmaMeta: number | null): ConsensusResult {
    const values = labAverages.map(l => l.avg);
    const valorDesignado = values.length > 0 ? median(values) : null;
    const sigmaRobusto = robustSigma(values);
    const sigmaUsado = sigmaMeta !== null ? sigmaMeta : (sigmaRobusto || null);

    const labs: LabConsensusResult[] = labAverages.map(l => {
        if (valorDesignado === null || sigmaUsado === null || sigmaUsado === 0) {
            return { ...l, z: null, status: null };
        }
        const z = (l.avg - valorDesignado) / sigmaUsado;
        return { ...l, z, status: classifyZ(z) };
    });

    return {
        valorDesignado,
        sigmaRobusto,
        sigmaMeta,
        sigmaUsado,
        nLabsReportando: labAverages.length,
        labs
    };
}

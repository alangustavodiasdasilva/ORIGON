
import { type Sample } from "@/entities/Sample";

export interface PatternGroup {
    id: string;
    label?: string;
    micAvg: number;
    lenAvg: number;
    unfAvg: number;
    strAvg: number;
    rdAvg: number;
    bAvg: number;
    count: number;
    sampleIds: string[];
    color: string | null;
    patternFeatures?: string[];
}

export class DeepSeekService {
    /**
     * Gera uma análise descritiva técnica baseada na hierarquia de parâmetros.
     */
    public static async analyzeSamples(samples: Sample[]): Promise<string> {
        if (!samples || samples.length === 0) return "Sem sinal de dados para processamento.";

        const groups = this.classifySamplesSmart(samples);
        const dominant = this.findDominantFactor(samples);

        let report = `[ SISTEMA DE INTELIGÊNCIA FIBERSCAN - RELATÓRIO TÉCNICO ]\n`;
        report += `===========================================================\n\n`;
        report += `EXAME HIERÁRQUICO DE ${samples.length} OBSERVAÇÕES\n\n`;

        if (groups.length > 0) {
            // Infer selected parameter from pattern features? Or just describe groups.
            report += `DIAGNÓSTICO: O grupo foi segmentado prioritariamente por padrões de similaridade estatística.\n\n`;

            groups.forEach((g, idx) => {
                const pct = ((g.count / samples.length) * 100).toFixed(1);
                report += `${idx + 1}. ${g.label?.toUpperCase()} (${pct}% do Lote)\n`;
                report += `   - CARACTERÍSTICA: ${g.patternFeatures?.join(" + ") || "Padrão de Referência"}\n`;
                report += `   - MÉTRICAS: MIC ${g.micAvg.toFixed(2)} | LEN ${g.lenAvg.toFixed(2)} | STR ${g.strAvg.toFixed(1)}\n\n`;
            });
        }

        report += `ANÁLISE DE VOLATILIDADE:\n`;
        report += `O parâmetro "${dominant.name}" apresenta a maior pressão de variabilidade (CV: ${dominant.cv.toFixed(2)}%).\n`;

        report += `\nCONCLUSÃO TÉCNICA:\n`;
        if (groups.length > 1) {
            report += `Lote com heterogeneidade identificada. A classificação seguiu a ordem de sensibilidade técnica (MIC > LEN > UI > STR). Foram isolados ${groups.length} núcleos de comportamento distinto.`;
        } else {
            report += `Lote com altíssima estabilidade. Não foram detectados desvios significativos em nenhum dos parâmetros na ordem de prioridade.`;
        }

        return report;
    }

    /**
     * Agrupa as amostras seguindo a hierarquia solicitada:
     * 1. MIC (se houver padrão conciso)
     * 2. LEN (UHML)
     * 3. UNF (UI)
     * 4. STR
     * 5. RD
     * 6. +B
     */
    public static classifySamplesSmart(samples: Sample[]): PatternGroup[] {
        if (!samples || samples.length === 0) return [];

        // 1. Parse de dados
        const data = samples.map(s => ({
            id: s.id,
            mic: parseFloat(s.mic?.toString().replace(',', '.') || '0'),
            len: parseFloat(s.len?.toString().replace(',', '.') || '0'),
            unf: parseFloat(s.unf?.toString().replace(',', '.') || '0'),
            str: parseFloat(s.str?.toString().replace(',', '.') || '0'),
            rd: parseFloat(s.rd?.toString().replace(',', '.') || '0'),
            b: parseFloat(s.b?.toString().replace(',', '.') || '0'),
        }));

        const hierarchy = [
            { key: 'mic', label: 'MICRONAIRE', cvThreshold: 1.2 },
            { key: 'len', label: 'COMPRIMENTO (LEN)', cvThreshold: 1.0 },
            { key: 'unf', label: 'UNIFORMIDADE (UNF)', cvThreshold: 0.8 },
            { key: 'str', label: 'RESISTÊNCIA (STR)', cvThreshold: 1.5 },
            { key: 'rd', label: 'REFLETÂNCIA (RD)', cvThreshold: 1.2 },
            { key: 'b', label: 'AMARELECIMENTO (+B)', cvThreshold: 2.5 },
        ];

        let selected = hierarchy[0];
        let finalMean = 0;
        let finalStd = 0;

        // 2. Encontrar o primeiro parâmetro com "padrão conciso" (CV acima do threshold)
        for (const p of hierarchy) {
            const vals = data.map(d => (d as any)[p.key]);
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
            const std = Math.sqrt(variance);
            const cv = (std / (mean || 1)) * 100;

            if (cv >= p.cvThreshold || p === hierarchy[hierarchy.length - 1]) {
                selected = p;
                finalMean = mean;
                finalStd = std;
                break;
            }
        }

        // 3. Agrupamento em 4 níveis baseado no parâmetro escolhido
        const groups: PatternGroup[] = [];
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']; // Azul, Verde, Amarelo, Vermelho

        const assignments: { [key: string]: number } = {};
        data.forEach(s => {
            const val = (s as any)[selected.key];
            // Dividir em 4 zonas baseadas no desvio padrão
            if (val >= finalMean + 0.5 * finalStd) assignments[s.id] = 0; // Top
            else if (val >= finalMean) assignments[s.id] = 1;             // Mid-High
            else if (val >= finalMean - 0.5 * finalStd) assignments[s.id] = 2; // Mid-Low
            else assignments[s.id] = 3;                                  // Bottom
        });

        // 4. Consolidação
        [0, 1, 2, 3].forEach(idx => {
            const clusterData = data.filter(d => assignments[d.id] === idx);
            if (clusterData.length === 0) return;

            const avg = (k: keyof typeof clusterData[0]) =>
                clusterData.reduce((a, b) => a + (b[k] as number), 0) / clusterData.length;

            // Gerar labels baseados no parâmetro escolhido
            let featureName = "";
            if (idx === 0) featureName = `${selected.label} Superior`;
            else if (idx === 1) featureName = `${selected.label} Acima da Média`;
            else if (idx === 2) featureName = `${selected.label} Abaixo da Média`;
            else featureName = `${selected.label} Inferior`;

            groups.push({
                id: `G${idx + 1}`,
                label: `GRUPO ${idx + 1}`,
                micAvg: avg('mic'),
                lenAvg: avg('len'),
                unfAvg: avg('unf'),
                strAvg: avg('str'),
                rdAvg: avg('rd'),
                bAvg: avg('b'),
                count: clusterData.length,
                sampleIds: clusterData.map(d => d.id),
                color: colors[idx],
                patternFeatures: [featureName, `Foco: ${selected.key.toUpperCase()}`]
            });
        });

        return groups;
    }

    private static findDominantFactor(samples: Sample[]) {
        const params = ['mic', 'len', 'str', 'rd'];
        const cvs = params.map(p => {
            const vals = samples.map(s => parseFloat((s as any)[p]?.toString().replace(',', '.') || '0'));
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
            const std = Math.sqrt(variance);
            return { name: p.toUpperCase(), cv: (std / (mean || 1)) * 100 };
        });
        return cvs.sort((a, b) => b.cv - a.cv)[0];
    }
}

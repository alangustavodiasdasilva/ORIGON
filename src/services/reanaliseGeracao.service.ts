import { supabase } from "@/lib/supabase";

// Registro (só pra relatório/histórico) de cada exportação feita na tela de
// Reanálise — que em si continua 100% efêmera (gera e baixa na hora, sem
// depender de nenhum lote). Ver GlobalReportTab.tsx, que junta isso com
// amostras/lotes numa visão só, marcando a origem de cada linha.
export interface ReanaliseGeracao {
    id: string;
    labId: string | null;
    analistaNome: string | null;
    analistaId: string | null;
    maquina: string | null;
    etiquetas: string | null;
    quantidade: number;
    os: string | null;
    codigoOperador: string | null;
    mic?: number | null;
    len?: number | null;
    unf?: number | null;
    str?: number | null;
    rd?: number | null;
    b?: number | null;
    dataAnalise: string | null;
    horaAnalise: string | null;
    createdAt: string;
}

const isSupabaseEnabled = () => !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

const fromRow = (r: any): ReanaliseGeracao => ({
    id: r.id,
    labId: r.lab_id,
    analistaNome: r.analista_nome,
    analistaId: r.analista_id,
    maquina: r.maquina,
    etiquetas: r.etiquetas,
    quantidade: r.quantidade,
    os: r.os,
    codigoOperador: r.codigo_operador,
    mic: r.mic, len: r.len, unf: r.unf, str: r.str, rd: r.rd, b: r.b,
    dataAnalise: r.data_analise,
    horaAnalise: r.hora_analise,
    createdAt: r.created_at
});

interface GeracaoEntryBase {
    labId?: string | null;
    analistaNome?: string | null;
    analistaId?: string | null;
    maquina?: string | null;
    os?: string | null;
    codigoOperador?: string | null;
    mic?: number; len?: number; unf?: number; str?: number; rd?: number; b?: number;
    dataAnalise?: string | null;
    horaAnalise?: string | null;
}

export const reanaliseGeracaoService = {
    // Uma linha por etiqueta (não uma linha por exportação com todas as
    // etiquetas juntas num texto só) — assim o relatório mostra cada etiqueta
    // na sua própria linha, igual ao fluxo de Lotes/Análise, em vez de
    // amontoar tudo numa célula só e cortar o resto.
    async createMany(base: GeracaoEntryBase, etiquetas: string[]): Promise<void> {
        if (!isSupabaseEnabled() || etiquetas.length === 0) return;
        const rows = etiquetas.map(etiqueta => ({
            lab_id: base.labId || null,
            analista_nome: base.analistaNome || null,
            analista_id: base.analistaId || null,
            maquina: base.maquina || null,
            etiquetas: etiqueta,
            quantidade: 1,
            os: base.os || null,
            codigo_operador: base.codigoOperador || null,
            mic: base.mic ?? null, len: base.len ?? null, unf: base.unf ?? null,
            str: base.str ?? null, rd: base.rd ?? null, b: base.b ?? null,
            data_analise: base.dataAnalise || null,
            hora_analise: base.horaAnalise || null
        }));
        const { error } = await supabase.from('reanalise_geracoes').insert(rows);
        // Falha em registrar o histórico não deve travar o download do arquivo —
        // só loga, o analista já tem o arquivo em mãos de qualquer forma.
        if (error) console.warn("[ReanaliseGeracao] Falha ao registrar histórico:", error.message);
    },

    async listAll(): Promise<ReanaliseGeracao[]> {
        if (!isSupabaseEnabled()) return [];
        const { data, error } = await supabase.from('reanalise_geracoes').select('*').order('created_at', { ascending: false });
        if (error || !data) return [];
        return data.map(fromRow);
    }
};

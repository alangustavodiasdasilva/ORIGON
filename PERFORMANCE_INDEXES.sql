-- ====================================================================
-- SCRIPT DE OTIMIZAÇÃO DE PERFORMANCE - ORIGON / FiberScan
-- Execute no SQL Editor do Supabase
-- ====================================================================

-- ----------------------------------------------------------------
-- 1. ÍNDICES NA TABELA status_os_hvi (tabela mais pesada: ~10k rows)
-- ----------------------------------------------------------------

-- Índice principal por lab_id + data (usado em TODOS os selects do sistema)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_status_os_lab_created
    ON status_os_hvi (lab_id, created_at DESC);

-- Índice por lab_id + status (usado nos KPIs de faturado/aberto)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_status_os_lab_status
    ON status_os_hvi (lab_id, status);

-- Índice por data_registro (usado em filtros de período)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_status_os_data_registro
    ON status_os_hvi (data_registro DESC);

-- Índice por data_finalizacao (gráficos de produção por dia)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_status_os_data_finalizacao
    ON status_os_hvi (data_finalizacao DESC);

-- ----------------------------------------------------------------
-- 2. ÍNDICES NA TABELA operacao_producao
-- ----------------------------------------------------------------

-- Índice principal por lab_id + data (listagem de produção)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_producao_lab_data
    ON operacao_producao (lab_id, data_producao DESC);

-- ----------------------------------------------------------------
-- 3. ÍNDICES NAS TABELAS DE CONFIGURAÇÃO
-- ----------------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analistas_email
    ON analistas (email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analistas_lab_id
    ON analistas (lab_id);

-- ----------------------------------------------------------------
-- 4. FUNÇÕES AGREGADAS NO SERVIDOR (evitam buscar todos os dados)
--    para calcular KPIs sem trazer linhas para o cliente
-- ----------------------------------------------------------------

-- Função: Estatísticas de Status OS por lab (total, faturado, amostras)
CREATE OR REPLACE FUNCTION get_status_os_stats(p_lab_id uuid DEFAULT NULL)
RETURNS TABLE(
    total_os         bigint,
    total_faturados  bigint,
    total_amostras   bigint,
    total_peso       numeric
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        COUNT(*)                                                           AS total_os,
        COUNT(*) FILTER (WHERE LOWER(status) LIKE '%faturado%')           AS total_faturados,
        COALESCE(SUM(total_amostras), 0)                                  AS total_amostras,
        COALESCE(SUM(peso_medio), 0)                                      AS total_peso
    FROM status_os_hvi
    WHERE (p_lab_id IS NULL OR lab_id = p_lab_id);
$$;

-- Função: Saldo de análise (OS sem data de finalização / em aberto)
CREATE OR REPLACE FUNCTION get_saldo_analise(p_lab_id uuid DEFAULT NULL)
RETURNS TABLE(
    em_aberto    bigint,
    finalizados  bigint
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        COUNT(*) FILTER (WHERE data_finalizacao IS NULL OR data_finalizacao = '')   AS em_aberto,
        COUNT(*) FILTER (WHERE data_finalizacao IS NOT NULL AND data_finalizacao <> '') AS finalizados
    FROM status_os_hvi
    WHERE (p_lab_id IS NULL OR lab_id = p_lab_id);
$$;

-- Função: Produção agrupada por dia
CREATE OR REPLACE FUNCTION get_producao_by_date(p_lab_id uuid DEFAULT NULL)
RETURNS TABLE(
    data_producao text,
    total_peso    numeric,
    total_linhas  bigint
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        data_producao,
        COALESCE(SUM(peso), 0)  AS total_peso,
        COUNT(*)                AS total_linhas
    FROM operacao_producao
    WHERE (p_lab_id IS NULL OR lab_id = p_lab_id)
    GROUP BY data_producao
    ORDER BY data_producao DESC;
$$;

-- ----------------------------------------------------------------
-- 5. GRANT DE EXECUÇÃO DAS FUNÇÕES PARA USUÁRIOS ANON/AUTH
-- ----------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_status_os_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_saldo_analise(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_producao_by_date(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------
-- 6. VERIFICAR ÍNDICES CRIADOS
-- ----------------------------------------------------------------
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) AS tamanho
FROM pg_indexes
WHERE tablename IN ('status_os_hvi', 'operacao_producao', 'analistas', 'laboratorios')
ORDER BY tablename, indexname;

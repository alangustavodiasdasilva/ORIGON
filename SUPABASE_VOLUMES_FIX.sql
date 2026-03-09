-- ====================================================================
-- SCRIPT DE AJUSTE DE INTEGRIDADE (VOLUME DE DADOS)
-- EXECUTE ESTE SCRIPT NO "SQL EDITOR" DO SEU PAINEL SUPABASE
-- ESTE SCRIPT PERMITE QUE O SISTEMA IMPORTE O.S.es QUE APARECEM EM 
-- MÚLTIPLAS LINHAS NA PLANILHA, EVITANDO PERDA DE AMOSTRAS.
-- ====================================================================

-- 1. Remove a restrição de "O.S. Única" que estava causando a perda de amostras
-- Se o sistema encontrar várias linhas para a mesma O.S. (ex: O.S. dividida),
-- ele agora somará todas em vez de manter uma só.
DROP INDEX IF EXISTS idx_status_os_unique;

-- 2. Recria o índice de busca mas permite duplicatas de número de O.S.
-- O índice agora é apenas para performance, não mais para restrição de unicidade.
CREATE INDEX IF NOT EXISTS idx_status_os_lookup ON status_os_hvi (lab_id, os_numero);

-- 3. Limpeza de possíveis dados órfãos se houver
-- (Opcional: Garante que não existam registros sem ID ou Lab)
DELETE FROM status_os_hvi WHERE lab_id IS NULL OR id IS NULL;

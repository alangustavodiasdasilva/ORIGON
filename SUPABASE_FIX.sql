-- ====================================================================
-- SCRIPT DE CORREÇÃO DO BANCO DE DADOS (SUPABASE)
-- EXECUTE ESTE SCRIPT NO "SQL EDITOR" DO SEU PAINEL SUPABASE
-- ====================================================================

-- 1. CORREÇÃO DA TABELA DE STATUS O.S. (MONITORAMENTO)
-- Adiciona a coluna lab_id se ela não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='status_os_hvi' AND column_name='lab_id') THEN
        ALTER TABLE status_os_hvi ADD COLUMN lab_id uuid REFERENCES laboratorios(id);
    END IF;
END $$;

-- Garante que o upsert funcione corretamente por número de O.S. e Lab
CREATE UNIQUE INDEX IF NOT EXISTS idx_status_os_unique ON status_os_hvi (os_numero, lab_id);

-- 2. CORREÇÃO DA TABELA DE VERIFICAÇÃO INTERNA
-- Garante que a tabela existe com a estrutura correta para sincronização
CREATE TABLE IF NOT EXISTS verificacao_interna (
    lab_id uuid REFERENCES laboratorios(id),
    date text NOT NULL,
    data_json jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (lab_id, date)
);

-- 3. CORREÇÃO DA TABELA DE NOTIFICAÇÕES (OPCIONAL MAS REMOVE ERROS NO CONSOLE)
-- Renomeia userid para user_id ou adiciona user_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notificacoes' AND column_name='user_id') THEN
        ALTER TABLE notificacoes ADD COLUMN user_id uuid;
    END IF;
END $$;

-- 4. HABILITAR RLS (SEGURANÇA) EM TODAS AS TABELAS PARA PERMITIR SINCRONIZAÇÃO
ALTER TABLE status_os_hvi ENABLE ROW LEVEL SECURITY;
ALTER TABLE verificacao_interna ENABLE ROW LEVEL SECURITY;
ALTER TABLE operacao_producao ENABLE ROW LEVEL SECURITY;

-- 5. CRIAR POLÍTICAS DE ACESSO (PERMITIR TUDO PARA USUÁRIOS LOGADOS POR ENQUANTO)
DROP POLICY IF EXISTS "Acesso Total Status OS" ON status_os_hvi;
CREATE POLICY "Acesso Total Status OS" ON status_os_hvi FOR ALL USING (true);

DROP POLICY IF EXISTS "Acesso Total Verificacao" ON verificacao_interna;
CREATE POLICY "Acesso Total Verificacao" ON verificacao_interna FOR ALL USING (true);

DROP POLICY IF EXISTS "Acesso Total Producao" ON operacao_producao;
CREATE POLICY "Acesso Total Producao" ON operacao_producao FOR ALL USING (true);

-- 6. GARANTIR QUE A TABELA DE OPERAÇÃO (QUE FUNCIONA BEM) TENHA O ÍNDICE CORRETO
-- Isso evita duplicações no dashboard de Operação
CREATE UNIQUE INDEX IF NOT EXISTS idx_producao_identificador ON operacao_producao (lab_id, identificador_unico);

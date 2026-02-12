-- SCRIPT DE CORREÇÃO DEFINITIVA DA TABELA DE DOCUMENTOS
-- ATENÇÃO: Este script irá APAGAR todos os documentos existentes para recriar a tabela corretamente.
-- Execute este script no "SQL Editor" do Supabase para garantir que o banco esteja compatível com o sistema.

DROP TABLE IF EXISTS auditoria_documentos;

CREATE TABLE auditoria_documentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT,
    file_name TEXT,        -- Nome do arquivo
    file_size NUMERIC,     -- Tamanho do arquivo
    file_type TEXT,        -- Tipo (PDF, Imagem, etc)
    category TEXT,         -- Categoria (Calibração, POPs, etc)
    analyst_name TEXT,     -- Nome do analista
    lab_id UUID,          -- ID do laboratório (pode ser nulo para admins globais)
    status TEXT DEFAULT 'verified',
    data TEXT,            -- Conteúdo do arquivo em Base64
    created_at TIMESTAMPTZ DEFAULT NOW(), -- Data de criação automática
    upload_date TIMESTAMPTZ DEFAULT NOW() -- Data de upload (redundante mas útil para compatibilidade)
);

-- Políticas de Segurança (Permitir tudo para facilitar o uso agora)
ALTER TABLE auditoria_documentos ENABLE ROW LEVEL SECURITY;

-- Política para leitura (todos podem ver)
CREATE POLICY "Leitura Publica" ON auditoria_documentos FOR SELECT USING (true);

-- Política para inserção (todos podem inserir)
CREATE POLICY "Insercao Publica" ON auditoria_documentos FOR INSERT WITH CHECK (true);

-- Política para exclusão
CREATE POLICY "Exclusao Publica" ON auditoria_documentos FOR DELETE USING (true);

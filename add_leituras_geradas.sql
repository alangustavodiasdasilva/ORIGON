-- Script para adicionar a coluna leituras_geradas na tabela de amostras
-- Essa coluna armazenará as 6 leituras de HVI geradas quando o usuário confirmar a geração do arquivo

ALTER TABLE public.amostras
ADD COLUMN IF NOT EXISTS leituras_geradas JSONB DEFAULT NULL;

-- ==============================================================================
-- Adiciona coluna configuracoes_analise na tabela lotes
-- Execute no SQL Editor do Supabase
-- ==============================================================================

ALTER TABLE public.lotes
ADD COLUMN IF NOT EXISTS configuracoes_analise JSONB DEFAULT '{}'::jsonb;

-- Adiciona comentário explicativo
COMMENT ON COLUMN public.lotes.configuracoes_analise IS 
'Armazena configurações de análise do lote: manual_overrides (médias primárias editadas), color_templates (médias secundárias/templates de cores), print_previews (imagens escaneadas), scanned_rows (linhas do print escaneado)';

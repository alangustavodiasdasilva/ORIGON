ALTER TABLE public.lotes
ADD COLUMN IF NOT EXISTS configuracoes_analise JSONB DEFAULT '{}'::jsonb;

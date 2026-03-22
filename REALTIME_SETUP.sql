-- ==============================================================================
-- SETUP: SUPABASE REALTIME & AUDITING
-- Execute este script no SQL Editor do seu dashboard do Supabase
-- ==============================================================================

-- 1. Tabela: update_history (Linha do Tempo Auditável)
-- Registra quem alterou, o que alterou (tabela e id), e quando.
CREATE TABLE IF NOT EXISTS public.update_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Se aplicável, senão apenas TEXT
    user_name TEXT, 
    changes JSONB, -- Opcional: registrar os deltas (o que mudou)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) - opcional, dependendo do design atual. 
-- Mas para auditoria, todos autenticados geralmente podem ler, só o sistema insere.
ALTER TABLE public.update_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all authenticated users" 
ON public.update_history FOR SELECT 
TO authenticated 
USING (true);

-- Política para permitir inserção pela API (se necessário via client)
CREATE POLICY "Enable insert for authenticated users" 
ON public.update_history FOR INSERT 
TO authenticated 
WITH CHECK (true);


-- 2. Tabela: user_notification_settings
-- Armazena as opções de notificação de cada usuário (visual, sonora, etc.)
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
    user_id TEXT PRIMARY KEY, -- Pode ser UUID dependendo de como está o sistema atual
    sound_enabled BOOLEAN DEFAULT true,
    visual_alerts_enabled BOOLEAN DEFAULT true,
    desktop_notifications_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings" 
ON public.user_notification_settings FOR SELECT 
USING (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub' OR user_id = auth.uid()::text);

CREATE POLICY "Users can construct/update their own settings" 
ON public.user_notification_settings FOR ALL
USING (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub' OR user_id = auth.uid()::text);


-- 3. Habilitando Realtime (Postgres Changes)
-- Adicionando tabelas existentes ao publication do supabase_realtime
-- * Nota: Modifique/Remova as tabelas que você não precisa acompanhar no Realtime (Postgres Changes)
BEGIN;
  -- Verifica se as publicações existem, senão as cria
  DO $$ 
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;

  -- Adicionando tabelas essenciais ao realtime
  ALTER PUBLICATION supabase_realtime ADD TABLE public.producao;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.status_os;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.update_history;
  
  -- Se você tiver outras tabelas que quer a Borda Vermelha (ex: checklists, relatorios), adicione-as acima
COMMIT;

-- FIM DA CONFIGURAÇÃO

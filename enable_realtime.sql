-- Enable Realtime for all tables
-- Run this in the Supabase SQL Editor

begin;
  -- Remove if already exists to avoid errors (optional, just ensuring clean state)
  drop publication if exists supabase_realtime;

  -- Create publication for realtime
  create publication supabase_realtime for table 
    maquinas, 
    lotes, 
    amostras, 
    chat_mensagens, 
    notificacoes;
commit;

-- Alternatively, if publication exists, add tables:
-- alter publication supabase_realtime add table maquinas, lotes, amostras, chat_mensagens, notificacoes;

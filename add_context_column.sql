-- Add current_lote_id column to analistas table if it doesn't exist
ALTER TABLE analistas 
ADD COLUMN IF NOT EXISTS current_lote_id UUID REFERENCES lotes(id);

-- Update RLS policies to allow users to update their own current_lote_id (usually covered by update 'own' policy)

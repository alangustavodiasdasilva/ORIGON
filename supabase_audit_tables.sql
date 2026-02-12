-- Create auditoria_categorias table
create table if not exists public.auditoria_categorias (
  id uuid not null primary key,
  name text not null,
  description text,
  lab_id uuid references public.laboratorios(id),
  created_at timestamptz default now()
);

-- Create auditoria_documentos table
create table if not exists public.auditoria_documentos (
  id uuid not null primary key,
  name text,
  file_name text,
  file_size numeric,
  file_type text,
  category text,
  analyst_name text,
  lab_id uuid references public.laboratorios(id),
  status text,
  data text, -- base64 content, might want to use storage buckets in production but this works for now
  upload_date timestamptz default now()
);

-- Enable RLS (Optional but recommended)
alter table public.auditoria_categorias enable row level security;
alter table public.auditoria_documentos enable row level security;

-- Create basic policies (adjust as needed for your auth model)
-- For now, allow public access or authenticated access to test
create policy "Enable all access for authenticated users" on public.auditoria_categorias
for all using (true) with check (true);

create policy "Enable all access for authenticated users" on public.auditoria_documentos
for all using (true) with check (true);

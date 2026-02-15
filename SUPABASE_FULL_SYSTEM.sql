-- 1. HABILITAR EXTENSÃO UUID
create extension if not exists "uuid-ossp";

-- 2. CRIAR TABELAS (Evita erro se já existirem)
create table if not exists laboratorios (
    id uuid primary key default uuid_generate_v4(),
    nome text not null,
    codigo text not null unique,
    cidade text,
    estado text,
    created_at timestamp with time zone default now()
);

create table if not exists analistas (
    id uuid primary key default uuid_generate_v4(),
    lab_id uuid references laboratorios(id) on delete set null,
    nome text not null,
    email text not null unique,
    senha text not null,
    cargo text,
    acesso text default 'padrao',
    foto text,
    last_active timestamp with time zone,
    created_at timestamp with time zone default now()
);

create table if not exists maquinas (
    id uuid primary key default uuid_generate_v4(),
    identificacao text not null,
    numero_serie text not null,
    modelo text,
    lab_id uuid references laboratorios(id) on delete cascade,
    created_at timestamp with time zone default now()
);

create table if not exists lotes (
    id uuid primary key default uuid_generate_v4(),
    lab_id uuid references laboratorios(id) on delete set null,
    nome text not null,
    descricao text,
    cidade text,
    status text default 'aberto',
    analista_responsavel text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists amostras (
    id uuid primary key default uuid_generate_v4(),
    lote_id uuid references lotes(id) on delete cascade,
    amostra_id text not null,
    hvi text,
    mic numeric,
    len numeric,
    unf numeric,
    str numeric,
    rd numeric,
    b numeric,
    mala text,
    etiqueta text,
    data_analise text,
    hora_analise text,
    cor text,
    historico_modificacoes jsonb default '[]'::jsonb,
    created_at timestamp with time zone default now()
);

create table if not exists auditoria_categorias (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text,
    created_at timestamp with time zone default now()
);

create table if not exists auditoria_documentos (
    id uuid primary key default uuid_generate_v4(),
    labId uuid references laboratorios(id) on delete set null,
    name text not null,
    fileName text not null,
    fileSize numeric,
    fileType text,
    data text,
    uploadDate timestamp with time zone default now(),
    category text,
    analystName text,
    status text default 'verified',
    created_at timestamp with time zone default now()
);

create table if not exists chat_mensagens (
    id uuid primary key default uuid_generate_v4(),
    text text not null,
    sender_id uuid references analistas(id),
    sender_name text,
    sender_foto text,
    timestamp timestamp with time zone default now(),
    created_at timestamp with time zone default now()
);

create table if not exists notificacoes (
    id uuid primary key default uuid_generate_v4(),
    type text,
    priority text,
    title text,
    message text,
    read boolean default false,
    userId uuid references analistas(id),
    labId uuid,
    actionUrl text,
    metadata jsonb,
    created_at timestamp with time zone default now()
);

-- 3. LIMPAR POLÍTICAS ANTIGAS (Seguro)
drop policy if exists "Public Access Labs" on laboratorios;
drop policy if exists "Public Access Analistas" on analistas;
drop policy if exists "Public Access Maquinas" on maquinas;
drop policy if exists "Public Access Lotes" on lotes;
drop policy if exists "Public Access Amostras" on amostras;
drop policy if exists "Public Access Audit Cats" on auditoria_categorias;
drop policy if exists "Public Access Audit Docs" on auditoria_documentos;
drop policy if exists "Public Access Chat" on chat_mensagens;
drop policy if exists "Public Access Notificacoes" on notificacoes;

-- 4. HABILITAR RLS
alter table laboratorios enable row level security;
alter table analistas enable row level security;
alter table maquinas enable row level security;
alter table lotes enable row level security;
alter table amostras enable row level security;
alter table auditoria_categorias enable row level security;
alter table auditoria_documentos enable row level security;
alter table chat_mensagens enable row level security;
alter table notificacoes enable row level security;

-- 5. CRIAR POLÍTICAS PERMISSIVAS
create policy "Public Access Labs" on laboratorios for all using (true);
create policy "Public Access Analistas" on analistas for all using (true);
create policy "Public Access Maquinas" on maquinas for all using (true);
create policy "Public Access Lotes" on lotes for all using (true);
create policy "Public Access Amostras" on amostras for all using (true);
create policy "Public Access Audit Cats" on auditoria_categorias for all using (true);
create policy "Public Access Audit Docs" on auditoria_documentos for all using (true);
create policy "Public Access Chat" on chat_mensagens for all using (true);
create policy "Public Access Notificacoes" on notificacoes for all using (true);

-- 6. AJUSTES FINAIS E CORREÇÕES (Safety Check)
ALTER TABLE analistas ADD COLUMN IF NOT EXISTS current_lote_id UUID REFERENCES lotes(id);

-- GARANTIR COLUNA LOCKED (Sua principal correção)
ALTER TABLE public.amostras ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

-- GARANTIR QUE CATEGORIAS POSSAM TER UM LABORATÓRIO (Importante para o código Audit.ts)
ALTER TABLE public.auditoria_categorias ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES laboratorios(id) ON DELETE SET NULL;

-- Criar a tabela de OPERAÇÃO se não existir
CREATE TABLE IF NOT EXISTS operacao_producao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_id UUID REFERENCES laboratorios(id) ON DELETE CASCADE,
    data_producao DATE NOT NULL,
    turno TEXT NOT NULL,
    identificador_unico TEXT NOT NULL, 
    produto TEXT,
    variedade TEXT,
    peso NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT operacao_unique_entry UNIQUE (lab_id, identificador_unico)
);

-- Habilitar RLS (Segurança)
ALTER TABLE operacao_producao ENABLE ROW LEVEL SECURITY;

-- Criar política de acesso total (para garantir que vai funcionar agora)
DROP POLICY IF EXISTS "Acesso Total Operacao" ON operacao_producao;
CREATE POLICY "Acesso Total Operacao" ON operacao_producao FOR ALL USING (true) WITH CHECK (true);

-- Notificar o Supabase para atualizar o cache de esquema
NOTIFY pgrst, 'reload schema';


-- ========================================================
-- Tabela status_os_hvi (NOVA - PARA O.S.)
-- ========================================================
create table if not exists status_os_hvi (
    id uuid primary key default uuid_generate_v4(),
    lab_id uuid references laboratorios(id) on delete set null,
    
    os_numero text not null,
    romaneio text,
    cliente text,
    fazenda text,
    usina text,
    variedade text,
    
    data_registro timestamp with time zone,
    data_recepcao timestamp with time zone,
    data_acondicionamento timestamp with time zone,
    data_finalizacao timestamp with time zone,
    
    revisor text,
    status text,
    
    total_amostras integer default 0,
    peso_mala numeric(10,3),
    peso_medio numeric(10,4),
    horas integer, -- Coluna IMPORTANTE
    
    nota_fiscal text,
    fatura text,
    
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    
    unique(lab_id, os_numero)
);

-- 2. Cria índices para performance
create index if not exists idx_status_os_numero on status_os_hvi(os_numero);
create index if not exists idx_status_os_cliente on status_os_hvi(cliente);
create index if not exists idx_status_os_revisor on status_os_hvi(revisor);

-- 3. Habilita segurança (RLS)
alter table status_os_hvi enable row level security;

drop policy if exists "Permitir leitura para todos autenticados" on status_os_hvi;
create policy "Permitir leitura para todos autenticados"
on status_os_hvi for select
to authenticated
using (true);

drop policy if exists "Permitir inserção/atualização para usuários autenticados" on status_os_hvi;
create policy "Permitir inserção/atualização para usuários autenticados"
on status_os_hvi for all
to authenticated
using (true)
with check (true);

-- 4. Garante que a coluna 'horas' exista (caso a tabela já existisse antes)
alter table status_os_hvi add column if not exists horas integer;


# Configuração do Supabase (Banco de Dados Compartilhado)

Para que todos os seus usuários vejam os mesmos dados, siga estes passos:

### 1. Criar Projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Crie um novo projeto (ex: `FiberScan-HVI`).
3. Defina uma senha para o banco de dados.

### 2. Configurar o Banco de Dados (SQL)
No painel do Supabase, vá em **SQL Editor** -> **New Query** e cole o script abaixo:

```sql
-- Habilitar UUIDs
create extension if not exists "uuid-ossp";

-- 1. Laboratórios
create table laboratorios (
    id uuid primary key default uuid_generate_v4(),
    nome text not null,
    codigo text not null unique,
    cidade text,
    estado text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 2. Analistas
create table analistas (
    id uuid primary key default uuid_generate_v4(),
    lab_id uuid references laboratorios(id) on delete set null,
    nome text not null,
    email text not null unique,
    senha text not null,
    cargo text,
    acesso text check (acesso in ('admin_global', 'admin_lab', 'user', 'quality_admin')),
    foto text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 3. Lotes
create table lotes (
    id uuid primary key default uuid_generate_v4(),
    lab_id uuid references laboratorios(id) on delete cascade,
    nome text not null,
    descricao text,
    cidade text,
    status text check (status in ('aberto', 'finalizado')) default 'aberto',
    analista_responsavel text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 4. Amostras
create table amostras (
    id uuid primary key default uuid_generate_v4(),
    lote_id uuid references lotes(id) on delete cascade,
    amostra_id text not null,
    hvi text,
    mic numeric(10,2),
    len numeric(10,2),
    unf numeric(10,2),
    str numeric(10,2),
    rd numeric(10,2),
    b numeric(10,2),
    mala text,
    etiqueta text,
    data_analise date,
    hora_analise time,
    cor text,
    historico_modificacoes jsonb default '[]'::jsonb,
    created_at timestamp with time zone default now()
);

-- 5. Auditoria (Categorias e Documentos)
create table auditoria_categorias (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text
);

create table auditoria_documentos (
    id uuid primary key default uuid_generate_v4(),
    category_id uuid references auditoria_categorias(id) on delete cascade,
    name text not null,
    file_name text not null,
    file_size bigint,
    file_type text,
    data text, 
    analyst_name text,
    status text default 'verified',
    upload_date timestamp with time zone default now()
);

-- Inserir categorias padrão
insert into auditoria_categorias (name, description) values
('Certificados de Calibração', 'Certificados HVI, balanças e equipamentos auxiliares.'),
('POPs (Procedimentos)', 'Instruções de trabalho e procedimentos operacionais padrão.'),
('Registros de Manutenção', 'Histórico de manutenções preventivas e corretivas.'),
('Treinamentos de Equipe', 'Evidências de capacitação e treinamentos técnicos.'),
('Relatórios de Interlaboratorial', 'Resultados e análises de participação em ensaios externos.');

-- 6. Criar Usuário Admin Inicial (Opcional, mas útil)
-- Você pode criar via interface ou via SQL se souber o lab_id
```

### 3. Configurar Variáveis de Ambiente
1. Crie um arquivo chamado `.env` na raiz do projeto.
2. Copie os valores de **Project Settings** -> **API** no Supabase:
   - `Project URL` -> `VITE_SUPABASE_URL`
   - `API Key (anon/public)` -> `VITE_SUPABASE_ANON_KEY`

Example:
```env
VITE_SUPABASE_URL=https://xyz123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Reiniciar o Sistema
Após configurar o `.env`, reinicie o terminal com `npm run dev`.

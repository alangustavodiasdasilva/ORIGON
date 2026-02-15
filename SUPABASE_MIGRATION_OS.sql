-- Tabela para histórico de Status O.S. (HVI)
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
    horas integer, -- Adicionado para métricas
    
    nota_fiscal text,
    fatura text,
    
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    
    -- Evitar duplicidade de O.S. para o mesmo laboratório
    unique(lab_id, os_numero)
);

-- Index para busca rápida
create index if not exists idx_status_os_numero on status_os_hvi(os_numero);
create index if not exists idx_status_os_cliente on status_os_hvi(cliente);
create index if not exists idx_status_os_revisor on status_os_hvi(revisor);

-- Políticas de Segurança (RLS)
alter table status_os_hvi enable row level security;

create policy "Permitir leitura para todos autenticados"
on status_os_hvi for select
to authenticated
using (true);

create policy "Permitir inserção/atualização para usuários autenticados"
on status_os_hvi for all
to authenticated
using (true)
with check (true);

-- Caso a tabela já exista (migração):
alter table status_os_hvi add column if not exists horas integer;

-- Cria tabela de historico de estoque com imutabilidade garantida.
create extension if not exists "pgcrypto";

create table if not exists public.historico_estoque (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  item_id bigint,
  change numeric not null,
  previous_quantity numeric,
  new_quantity numeric,
  reason text,
  performed_by uuid,
  component_name text,
  component_code text
);

create index if not exists historico_estoque_created_at_idx
  on public.historico_estoque (created_at desc);

create or replace function public.prevent_historico_estoque_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A tabela historico_estoque eh somente append. Atualizacoes e exclusoes nao sao permitidas.';
end;
$$;

drop trigger if exists historico_estoque_no_update on public.historico_estoque;
drop trigger if exists historico_estoque_no_delete on public.historico_estoque;

create trigger historico_estoque_no_update
  before update on public.historico_estoque
  for each row
  execute function public.prevent_historico_estoque_mutations();

create trigger historico_estoque_no_delete
  before delete on public.historico_estoque
  for each row
  execute function public.prevent_historico_estoque_mutations();

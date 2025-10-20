create extension if not exists "pgcrypto";

alter table public.itens
  add column if not exists preco_atual numeric,
  add column if not exists preco_ultimo numeric;

create table if not exists public.itens_precos_historico (
  id uuid primary key default gen_random_uuid(),
  item_id bigint not null references public.itens (id) on delete cascade,
  preco numeric not null,
  registrado_em timestamptz not null default timezone('utc', now()),
  observacao text
);

create index if not exists itens_precos_historico_item_idx
  on public.itens_precos_historico (item_id, registrado_em desc);

alter table public.itens_precos_historico enable row level security;

drop policy if exists itens_precos_select on public.itens_precos_historico;
drop policy if exists itens_precos_insert on public.itens_precos_historico;

create policy itens_precos_select
  on public.itens_precos_historico
  for select
  using (auth.role() = 'authenticated');

create policy itens_precos_insert
  on public.itens_precos_historico
  for insert
  with check (auth.role() = 'authenticated');

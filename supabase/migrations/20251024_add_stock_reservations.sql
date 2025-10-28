create table if not exists public.reservas_estoque (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itens (id) on delete cascade,
  projeto_id text not null,
  quantidade numeric not null check (quantidade > 0),
  status text not null default 'pendente' check (status in ('pendente', 'consumida', 'cancelada')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  consumido_em timestamptz,
  observacoes text
);

create index if not exists reservas_estoque_item_status_idx
  on public.reservas_estoque (item_id, status);

create index if not exists reservas_estoque_projeto_idx
  on public.reservas_estoque (projeto_id);

alter table if exists public.reservas_estoque enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reservas_estoque'
      and policyname = 'reservas_estoque_select_auth'
  ) then
    create policy reservas_estoque_select_auth
      on public.reservas_estoque
      for select
      using (auth.role() = 'authenticated');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reservas_estoque'
      and policyname = 'reservas_estoque_insert_auth'
  ) then
    create policy reservas_estoque_insert_auth
      on public.reservas_estoque
      for insert
      with check (auth.role() = 'authenticated');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reservas_estoque'
      and policyname = 'reservas_estoque_update_auth'
  ) then
    create policy reservas_estoque_update_auth
      on public.reservas_estoque
      for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reservas_estoque'
      and policyname = 'reservas_estoque_delete_auth'
  ) then
    create policy reservas_estoque_delete_auth
      on public.reservas_estoque
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

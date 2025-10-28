create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  nome text not null,
  contato text,
  email text,
  telefone text,
  observacoes text
);

create index if not exists fornecedores_nome_idx
  on public.fornecedores (nome);

alter table if exists public.fornecedores enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fornecedores'
      and policyname = 'fornecedores_select_auth'
  ) then
    create policy fornecedores_select_auth
      on public.fornecedores
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
      and tablename = 'fornecedores'
      and policyname = 'fornecedores_insert_auth'
  ) then
    create policy fornecedores_insert_auth
      on public.fornecedores
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
      and tablename = 'fornecedores'
      and policyname = 'fornecedores_update_auth'
  ) then
    create policy fornecedores_update_auth
      on public.fornecedores
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
      and tablename = 'fornecedores'
      and policyname = 'fornecedores_delete_auth'
  ) then
    create policy fornecedores_delete_auth
      on public.fornecedores
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

create table if not exists public.pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz,
  fornecedor_id uuid references public.fornecedores (id) on delete set null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviado', 'parcialmente_recebido', 'concluido')),
  observacoes text,
  total_estimado numeric,
  created_by uuid references auth.users (id)
);

create index if not exists pedidos_compra_fornecedor_idx
  on public.pedidos_compra (fornecedor_id);

create index if not exists pedidos_compra_status_idx
  on public.pedidos_compra (status);

alter table if exists public.pedidos_compra enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pedidos_compra'
      and policyname = 'pedidos_compra_select_auth'
  ) then
    create policy pedidos_compra_select_auth
      on public.pedidos_compra
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
      and tablename = 'pedidos_compra'
      and policyname = 'pedidos_compra_insert_auth'
  ) then
    create policy pedidos_compra_insert_auth
      on public.pedidos_compra
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
      and tablename = 'pedidos_compra'
      and policyname = 'pedidos_compra_update_auth'
  ) then
    create policy pedidos_compra_update_auth
      on public.pedidos_compra
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
      and tablename = 'pedidos_compra'
      and policyname = 'pedidos_compra_delete_auth'
  ) then
    create policy pedidos_compra_delete_auth
      on public.pedidos_compra
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

create table if not exists public.pedidos_compra_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_compra (id) on delete cascade,
  item_id uuid references public.itens (id) on delete set null,
  quantidade numeric not null check (quantidade > 0),
  preco_unitario numeric,
  lead_time_dias integer,
  observacoes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pedidos_compra_itens_pedido_idx
  on public.pedidos_compra_itens (pedido_id);

create index if not exists pedidos_compra_itens_item_idx
  on public.pedidos_compra_itens (item_id);

alter table if exists public.pedidos_compra_itens enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pedidos_compra_itens'
      and policyname = 'pedidos_compra_itens_select_auth'
  ) then
    create policy pedidos_compra_itens_select_auth
      on public.pedidos_compra_itens
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
      and tablename = 'pedidos_compra_itens'
      and policyname = 'pedidos_compra_itens_insert_auth'
  ) then
    create policy pedidos_compra_itens_insert_auth
      on public.pedidos_compra_itens
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
      and tablename = 'pedidos_compra_itens'
      and policyname = 'pedidos_compra_itens_update_auth'
  ) then
    create policy pedidos_compra_itens_update_auth
      on public.pedidos_compra_itens
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
      and tablename = 'pedidos_compra_itens'
      and policyname = 'pedidos_compra_itens_delete_auth'
  ) then
    create policy pedidos_compra_itens_delete_auth
      on public.pedidos_compra_itens
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

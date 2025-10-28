create table if not exists public.precos_itens (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.itens (id) on delete cascade,
  preco numeric not null check (preco > 0),
  moeda text not null default 'BRL',
  source text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists precos_itens_item_idx
  on public.precos_itens (item_id, created_at desc);

alter table if exists public.precos_itens enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'precos_itens'
      and policyname = 'precos_itens_select_auth'
  ) then
    create policy precos_itens_select_auth
      on public.precos_itens
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
      and tablename = 'precos_itens'
      and policyname = 'precos_itens_insert_auth'
  ) then
    create policy precos_itens_insert_auth
      on public.precos_itens
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
      and tablename = 'precos_itens'
      and policyname = 'precos_itens_update_auth'
  ) then
    create policy precos_itens_update_auth
      on public.precos_itens
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
      and tablename = 'precos_itens'
      and policyname = 'precos_itens_delete_auth'
  ) then
    create policy precos_itens_delete_auth
      on public.precos_itens
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

create table if not exists public.projetos_config (
  id text primary key,
  metadata jsonb not null default '{}'::jsonb,
  components jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists projetos_config_updated_idx
  on public.projetos_config (updated_at desc);

alter table if exists public.projetos_config enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projetos_config'
      and policyname = 'projetos_config_select_auth'
  ) then
    create policy projetos_config_select_auth
      on public.projetos_config
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
      and tablename = 'projetos_config'
      and policyname = 'projetos_config_upsert_auth'
  ) then
    create policy projetos_config_upsert_auth
      on public.projetos_config
      for insert, update
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
      and tablename = 'projetos_config'
      and policyname = 'projetos_config_delete_auth'
  ) then
    create policy projetos_config_delete_auth
      on public.projetos_config
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

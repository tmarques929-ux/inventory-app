create table if not exists public.projetos_revisoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id text not null references public.projetos_config (id) on delete cascade,
  revision integer not null,
  metadata jsonb not null default '{}'::jsonb,
  components jsonb not null default '[]'::jsonb,
  software_path text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists projetos_revisoes_project_revision_idx
  on public.projetos_revisoes (projeto_id, revision desc);

create index if not exists projetos_revisoes_created_idx
  on public.projetos_revisoes (created_at desc);

alter table if exists public.projetos_revisoes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projetos_revisoes'
      and policyname = 'projetos_revisoes_select_auth'
  ) then
    create policy projetos_revisoes_select_auth
      on public.projetos_revisoes
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
      and tablename = 'projetos_revisoes'
      and policyname = 'projetos_revisoes_insert_auth'
  ) then
    create policy projetos_revisoes_insert_auth
      on public.projetos_revisoes
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
      and tablename = 'projetos_revisoes'
      and policyname = 'projetos_revisoes_update_auth'
  ) then
    create policy projetos_revisoes_update_auth
      on public.projetos_revisoes
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
      and tablename = 'projetos_revisoes'
      and policyname = 'projetos_revisoes_delete_auth'
  ) then
    create policy projetos_revisoes_delete_auth
      on public.projetos_revisoes
      for delete
      using (auth.role() = 'authenticated');
  end if;
end
$$;

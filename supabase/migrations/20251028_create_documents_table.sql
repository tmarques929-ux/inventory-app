create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.documentos enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'documentos'
      and policyname = 'documentos_select_authenticated'
  ) then
    create policy documentos_select_authenticated
      on public.documentos
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'documentos'
      and policyname = 'documentos_insert_authenticated'
  ) then
    create policy documentos_insert_authenticated
      on public.documentos
      for insert
      with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'documentos'
      and policyname = 'documentos_delete_authenticated'
  ) then
    create policy documentos_delete_authenticated
      on public.documentos
      for delete
      using (auth.role() = 'authenticated');
  end if;
end;
$$;

create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  item_id uuid references public.itens (id) on delete cascade,
  regra jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  ultimo_disparo timestamptz,
  criado_em timestamptz not null default timezone('utc', now()),
  atualizado_em timestamptz not null default timezone('utc', now())
);

create index if not exists alertas_type_idx on public.alertas (tipo);
create index if not exists alertas_item_idx on public.alertas (item_id);
create index if not exists alertas_active_idx on public.alertas (ativo) where ativo = true;

create or replace function public.trigger_alertas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_alertas_updated_at on public.alertas;

create trigger set_alertas_updated_at
before update on public.alertas
for each row
execute function public.trigger_alertas_updated_at();

alter table public.alertas enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'alertas'
      and policyname = 'alertas_select_authenticated'
  ) then
    create policy alertas_select_authenticated
      on public.alertas
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'alertas'
      and policyname = 'alertas_modify_admin'
  ) then
    create policy alertas_modify_admin
      on public.alertas
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end;
$$;

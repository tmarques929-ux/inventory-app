-- Ensure ownership metadata and strict RLS policies on alertas table
-- to prevent cross-tenant access.

set check_function_bodies = off;

create or replace function public.set_row_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end;
$$;

alter table public.alertas
  add column if not exists owner_id uuid references auth.users (id);

create index if not exists alertas_owner_idx on public.alertas (owner_id);

do $$
declare
  fallback_owner uuid;
begin
  select id
    into fallback_owner
    from auth.users
    order by created_at asc
    limit 1;

  if fallback_owner is not null then
    update public.alertas
       set owner_id = fallback_owner
     where owner_id is null;
  end if;
end;
$$;

drop trigger if exists set_alert_owner on public.alertas;

create trigger set_alert_owner
  before insert on public.alertas
  for each row
  execute function public.set_row_owner_id();

alter table if exists public.alertas enable row level security;

drop policy if exists alertas_select_authenticated on public.alertas;
drop policy if exists alertas_modify_admin on public.alertas;

create policy alertas_select_owner
  on public.alertas
  for select
  using (owner_id = auth.uid());

create policy alertas_insert_owner
  on public.alertas
  for insert
  with check (owner_id = auth.uid());

create policy alertas_update_owner
  on public.alertas
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy alertas_delete_owner
  on public.alertas
  for delete
  using (owner_id = auth.uid());

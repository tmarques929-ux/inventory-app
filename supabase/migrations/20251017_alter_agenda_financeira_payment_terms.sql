create extension if not exists "pgcrypto";

alter table public.agenda_financeira
  add column if not exists grupo_id uuid,
  add column if not exists forma_pagamento text,
  add column if not exists parcelas_total integer,
  add column if not exists parcela_numero integer,
  add column if not exists data_emissao date,
  add column if not exists dias_apos_emissao integer,
  add column if not exists valor_parcela numeric,
  add column if not exists adiantamento_valor numeric,
  add column if not exists adiantamento_data date;

update public.agenda_financeira
set grupo_id = coalesce(grupo_id, gen_random_uuid()),
    parcelas_total = coalesce(parcelas_total, 1),
    parcela_numero = coalesce(parcela_numero, 1),
    valor_parcela = coalesce(valor_parcela, valor)
where true;

create index if not exists agenda_financeira_grupo_idx
  on public.agenda_financeira (grupo_id);

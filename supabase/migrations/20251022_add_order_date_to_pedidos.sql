alter table if exists public.pedidos
  add column if not exists data_pedido date;

alter table if exists public.pedidos
  add column if not exists valor_base numeric default 0;

alter table if exists public.pedidos
  add column if not exists ajuste_valor numeric default 0;

alter table if exists public.pedidos
  add column if not exists observacoes text;

alter table if exists public.pedidos
  add column if not exists nfe_url text;

alter table if exists public.pedidos
  add column if not exists fase text default 'em_processo';

alter table if exists public.agenda_financeira
  add column if not exists nota_compra_url text;

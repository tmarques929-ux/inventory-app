alter table public.itens
  add column if not exists lote_compra integer,
  add column if not exists moq integer;

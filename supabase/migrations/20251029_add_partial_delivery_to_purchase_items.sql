alter table public.pedidos_compra_itens
  add column if not exists quantidade_recebida numeric default 0;

update public.pedidos_compra_itens
set quantidade_recebida = coalesce(quantidade_recebida, 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_compra_itens_quantidade_recebida_check'
  ) then
    alter table public.pedidos_compra_itens
      add constraint pedidos_compra_itens_quantidade_recebida_check
      check (quantidade_recebida >= 0 and quantidade_recebida <= quantidade);
  end if;
end $$;

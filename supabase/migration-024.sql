-- migration-024: reserve product stock when sales/invoices are recorded.
-- Safe to run more than once after migration-023.sql.

create index if not exists invoice_items_product_stock on public.invoice_items (product_id);
create index if not exists gifts_supply_stock on public.gifts (supply_id);
create index if not exists losses_supply_stock on public.losses (supply_id);

create or replace view public.product_stock with (security_invoker = true) as
select
  p.id,
  p.company_id,
  p.name,
  p.unit,
  p.container_no,
  p.default_unit_price_gmd,
  p.net,
  coalesce((
    select sum(ii.quantity_sold)
    from public.invoice_items ii
    where ii.company_id = p.company_id and ii.product_id = p.id
  ), 0) as sold,
  coalesce((
    select sum(g.quantity)
    from public.gifts g
    join public.supplies s on s.id = g.supply_id and s.company_id = g.company_id
    where s.company_id = p.company_id and s.product_id = p.id
  ), 0) as gifted,
  coalesce((
    select sum(l.quantity)
    from public.losses l
    join public.supplies s on s.id = l.supply_id and s.company_id = l.company_id
    where s.company_id = p.company_id and s.product_id = p.id
  ), 0) as lost,
  p.net
    - coalesce((
      select sum(ii.quantity_sold)
      from public.invoice_items ii
      where ii.company_id = p.company_id and ii.product_id = p.id
    ), 0)
    - coalesce((
      select sum(g.quantity)
      from public.gifts g
      join public.supplies s on s.id = g.supply_id and s.company_id = g.company_id
      where s.company_id = p.company_id and s.product_id = p.id
    ), 0)
    - coalesce((
      select sum(l.quantity)
      from public.losses l
      join public.supplies s on s.id = l.supply_id and s.company_id = l.company_id
      where s.company_id = p.company_id and s.product_id = p.id
    ), 0) as available
from public.products p;

grant select on public.product_stock to authenticated;

create or replace function public.assert_product_sale_capacity(p_product uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_sold numeric;
  v_gifted numeric;
  v_lost numeric;
  v_committed numeric;
begin
  select * into v_product from public.products where id = p_product for update;
  if not found then raise exception 'Product not found'; end if;

  select coalesce(sum(quantity_sold), 0) into v_sold
  from public.invoice_items
  where company_id = v_product.company_id and product_id = v_product.id;

  select coalesce(sum(g.quantity), 0) into v_gifted
  from public.gifts g
  join public.supplies s on s.id = g.supply_id and s.company_id = g.company_id
  where s.company_id = v_product.company_id and s.product_id = v_product.id;

  select coalesce(sum(l.quantity), 0) into v_lost
  from public.losses l
  join public.supplies s on s.id = l.supply_id and s.company_id = l.company_id
  where s.company_id = v_product.company_id and s.product_id = v_product.id;

  v_committed := v_sold + v_gifted + v_lost;
  if v_committed > v_product.net then
    raise exception 'Not enough stock for %: % % already recorded, but only % % is available. Add more stock in Products.',
      v_product.name, v_committed, v_product.unit, v_product.net, v_product.unit;
  end if;
  return v_product.net - v_committed;
end $$;

revoke execute on function public.assert_product_sale_capacity(uuid) from public, anon, authenticated;

create or replace function public.lock_saleable_stock() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  lock table public.products in share row exclusive mode;
  return null;
end $$;

revoke execute on function public.lock_saleable_stock() from public, anon, authenticated;

create or replace function public.validate_invoice_item_stock() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.assert_product_sale_capacity(new.product_id);
  elsif old.product_id is distinct from new.product_id or new.quantity_sold > old.quantity_sold then
    perform public.assert_product_sale_capacity(new.product_id);
  end if;
  return new;
end $$;

revoke execute on function public.validate_invoice_item_stock() from public, anon, authenticated;

create or replace function public.validate_gift_loss_stock() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_product uuid;
begin
  if tg_op = 'INSERT' then
    select product_id into v_product from public.supplies where id = new.supply_id;
    if v_product is null then raise exception 'Supply not found'; end if;
    perform public.assert_product_sale_capacity(v_product);
  elsif old.supply_id is distinct from new.supply_id or new.quantity > old.quantity then
    select product_id into v_product from public.supplies where id = new.supply_id;
    if v_product is null then raise exception 'Supply not found'; end if;
    perform public.assert_product_sale_capacity(v_product);
  end if;
  return new;
end $$;

revoke execute on function public.validate_gift_loss_stock() from public, anon, authenticated;

create or replace function public.validate_product_stock_reduction() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.net < old.net then
    perform public.assert_product_sale_capacity(new.id);
  end if;
  return new;
end $$;

revoke execute on function public.validate_product_stock_reduction() from public, anon, authenticated;

drop trigger if exists invoice_items_stock_lock on public.invoice_items;
create trigger invoice_items_stock_lock
before insert or update or delete on public.invoice_items
for each statement execute function public.lock_saleable_stock();

drop trigger if exists invoice_items_stock_guard on public.invoice_items;
create trigger invoice_items_stock_guard
after insert or update on public.invoice_items
for each row execute function public.validate_invoice_item_stock();

drop trigger if exists gifts_stock_lock on public.gifts;
create trigger gifts_stock_lock
before insert or update or delete on public.gifts
for each statement execute function public.lock_saleable_stock();

drop trigger if exists gifts_stock_guard on public.gifts;
create trigger gifts_stock_guard
after insert or update of supply_id, quantity on public.gifts
for each row execute function public.validate_gift_loss_stock();

drop trigger if exists losses_stock_lock on public.losses;
create trigger losses_stock_lock
before insert or update or delete on public.losses
for each statement execute function public.lock_saleable_stock();

drop trigger if exists losses_stock_guard on public.losses;
create trigger losses_stock_guard
after insert or update of supply_id, quantity on public.losses
for each row execute function public.validate_gift_loss_stock();

drop trigger if exists products_stock_guard on public.products;
create trigger products_stock_guard
after update of total, damaged_offload, missing_before_offload on public.products
for each row execute function public.validate_product_stock_reduction();

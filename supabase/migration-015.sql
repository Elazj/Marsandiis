-- migration-015: allow an invoice/sales number to repeat for one customer per store.
-- Run in the Supabase SQL editor after migration-014.sql. Safe to run again.

create or replace function public.guard_supply_ref_customer()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  current_store uuid;
  normalized_ref text;
  normalized_customer text;
begin
  select store_id into current_store from public.supplies where id = new.supply_id;
  if current_store is null then return new; end if;

  normalized_ref := lower(regexp_replace(btrim(new.supply_ref), '\s+', ' ', 'g'));
  normalized_customer := lower(regexp_replace(btrim(new.customer), '\s+', ' ', 'g'));
  perform pg_advisory_xact_lock(hashtextextended(current_store::text || ':' || normalized_ref, 0));

  if exists (
    select 1
    from public.sheet_rows existing
    join public.supplies existing_supply on existing_supply.id = existing.supply_id
    where existing_supply.store_id = current_store
      and lower(regexp_replace(btrim(existing.supply_ref), '\s+', ' ', 'g')) = normalized_ref
      and lower(regexp_replace(btrim(existing.customer), '\s+', ' ', 'g')) <> normalized_customer
      and existing.id <> new.id
  ) then
    raise exception 'customer name does not match the sales or invoice.';
  end if;
  return new;
end $$;

drop trigger if exists rows_ref_customer_guard on public.sheet_rows;
create trigger rows_ref_customer_guard
  before insert or update of supply_id, supply_ref, customer on public.sheet_rows
  for each row execute function public.guard_supply_ref_customer();

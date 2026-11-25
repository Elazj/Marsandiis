-- migration-022: link store-manager supplies to admin-created invoice items.
-- Safe to run more than once after migration-021.sql.

alter table public.sheet_rows add column if not exists invoice_id uuid;
alter table public.sheet_rows add column if not exists invoice_item_id uuid;
alter table public.invoice_supply_updates add column if not exists change_kind text not null default 'supply';

alter table public.sheet_rows drop constraint if exists sheet_rows_invoice_pair_check;
alter table public.sheet_rows add constraint sheet_rows_invoice_pair_check
  check ((invoice_id is null and invoice_item_id is null) or (invoice_id is not null and invoice_item_id is not null));

alter table public.invoice_supply_updates drop constraint if exists invoice_supply_updates_change_kind_check;
alter table public.invoice_supply_updates add constraint invoice_supply_updates_change_kind_check
  check (change_kind in ('supply', 'reversal'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sheet_rows'::regclass and conname = 'sheet_rows_invoice_company_fk'
  ) then
    alter table public.sheet_rows add constraint sheet_rows_invoice_company_fk
      foreign key (company_id, invoice_id) references public.invoices (company_id, id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sheet_rows'::regclass and conname = 'sheet_rows_invoice_item_company_fk'
  ) then
    alter table public.sheet_rows add constraint sheet_rows_invoice_item_company_fk
      foreign key (company_id, invoice_item_id) references public.invoice_items (company_id, id) on delete set null;
  end if;
end $$;

create index if not exists sheet_rows_invoice on public.sheet_rows (invoice_id);
create index if not exists sheet_rows_invoice_item on public.sheet_rows (invoice_item_id);

create or replace function public.validate_sheet_row_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_supply public.supplies%rowtype;
  v_invoice public.invoices%rowtype;
  v_item public.invoice_items%rowtype;
  v_customer text;
begin
  if new.invoice_id is null and new.invoice_item_id is null then return new; end if;
  if new.invoice_id is null or new.invoice_item_id is null then
    raise exception 'A store supply must link to both an invoice and an invoice item';
  end if;

  select * into v_supply from public.supplies
    where id = new.supply_id and company_id = new.company_id;
  if not found then raise exception 'The supply is not assigned to this company'; end if;

  select * into v_invoice from public.invoices
    where id = new.invoice_id and company_id = new.company_id;
  if not found then raise exception 'Invoice not found'; end if;

  select * into v_item from public.invoice_items
    where id = new.invoice_item_id and invoice_id = new.invoice_id and company_id = new.company_id;
  if not found then raise exception 'Invoice item not found for this invoice'; end if;
  if v_item.product_id <> v_supply.product_id then
    raise exception 'The invoice item is for a different product';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_invoice.created_by and company_id = v_invoice.company_id and role = 'admin'
  ) then
    raise exception 'This invoice was not created by a company admin';
  end if;

  select name into v_customer from public.customers
    where id = v_invoice.customer_id and company_id = v_invoice.company_id;
  if v_customer is null then raise exception 'Invoice customer not found'; end if;
  new.customer := v_customer;
  new.supply_ref := v_invoice.invoice_no;
  return new;
end $$;

drop trigger if exists rows_invoice_guard on public.sheet_rows;
create trigger rows_invoice_guard
  before insert or update of invoice_id, invoice_item_id, supply_id, customer, supply_ref
  on public.sheet_rows for each row execute function public.validate_sheet_row_invoice();

create or replace function public.clear_sheet_row_invoice_links() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.sheet_rows
    set invoice_id = null, invoice_item_id = null
    where invoice_item_id = old.id;
  return old;
end $$;

drop trigger if exists invoice_items_clear_sheet_links on public.invoice_items;
create trigger invoice_items_clear_sheet_links
  before delete on public.invoice_items for each row execute function public.clear_sheet_row_invoice_links();

create or replace function public.sync_sheet_row_invoice_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.invoice_no is distinct from new.invoice_no or old.customer_id is distinct from new.customer_id then
    update public.sheet_rows
      set customer = c.name, supply_ref = new.invoice_no
      from public.customers c
      where sheet_rows.invoice_id = new.id and c.id = new.customer_id and c.company_id = new.company_id;
  end if;
  return new;
end $$;

drop trigger if exists invoices_sync_sheet_identity on public.invoices;
create trigger invoices_sync_sheet_identity
  after update of invoice_no, customer_id on public.invoices
  for each row execute function public.sync_sheet_row_invoice_identity();

-- Reconcile only exact legacy matches with no existing invoice supply total.
do $$
declare
  v_candidate record;
  v_row_ids uuid[] := '{}'::uuid[];
  v_row public.sheet_rows%rowtype;
  v_running numeric;
begin
  for v_candidate in
    select ii.id as item_id, ii.invoice_id, ii.quantity_sold, sum(sr.quantity) as total
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id and i.company_id = ii.company_id
    join public.customers c on c.id = i.customer_id and c.company_id = i.company_id
    join public.sheet_rows sr on sr.company_id = ii.company_id
      and sr.invoice_id is null and sr.invoice_item_id is null
      and lower(regexp_replace(btrim(sr.supply_ref), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(i.invoice_no), '\s+', ' ', 'g'))
      and lower(regexp_replace(btrim(sr.customer), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g'))
    join public.supplies s on s.id = sr.supply_id and s.company_id = ii.company_id
      and s.product_id = ii.product_id
    join public.profiles mp on mp.id = sr.entered_by and mp.company_id = ii.company_id
      and mp.role = 'manager' and mp.store_id = s.store_id
    join public.profiles ap on ap.id = i.created_by and ap.company_id = i.company_id and ap.role = 'admin'
    where ii.quantity_supplied = 0
    group by ii.id, ii.invoice_id, ii.quantity_sold
    having sum(sr.quantity) <= ii.quantity_sold
    order by ii.created_at, ii.id
  loop
    select array_agg(sr.id order by sr.created_at, sr.id) into v_row_ids
    from public.sheet_rows sr
    join public.supplies s on s.id = sr.supply_id and s.company_id = sr.company_id
      and s.product_id = (select product_id from public.invoice_items where id = v_candidate.item_id)
    join public.invoices i on i.id = v_candidate.invoice_id and i.company_id = sr.company_id
    join public.customers c on c.id = i.customer_id and c.company_id = i.company_id
    join public.profiles mp on mp.id = sr.entered_by and mp.company_id = sr.company_id
      and mp.role = 'manager' and mp.store_id = s.store_id
    where sr.company_id = i.company_id
      and sr.invoice_id is null and sr.invoice_item_id is null
      and lower(regexp_replace(btrim(sr.supply_ref), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(i.invoice_no), '\s+', ' ', 'g'))
      and lower(regexp_replace(btrim(sr.customer), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g'));

    update public.sheet_rows
      set invoice_id = v_candidate.invoice_id, invoice_item_id = v_candidate.item_id
      where id = any(v_row_ids);

    update public.invoice_items
      set quantity_supplied = v_candidate.total
      where id = v_candidate.item_id;

    v_running := 0;
    for v_row in select * from public.sheet_rows where id = any(v_row_ids) order by created_at, id loop
      v_running := v_running + v_row.quantity;
      insert into public.invoice_supply_updates
        (company_id, invoice_item_id, quantity, supplied_after, note, created_by, created_at, change_kind)
      values
        (v_row.company_id, v_row.invoice_item_id, v_row.quantity, v_running,
         'Linked existing store supply record', v_row.entered_by, v_row.created_at, 'supply');
    end loop;
  end loop;
end $$;

create or replace function public.list_manager_invoice_items(p_supply uuid)
returns table (
  invoice_id uuid,
  invoice_item_id uuid,
  invoice_no text,
  customer_name text,
  invoice_date date,
  product_id uuid,
  product_name text,
  unit text,
  quantity_sold numeric,
  quantity_supplied numeric,
  quantity_pending numeric,
  supply_status text,
  invoice_quantity_sold numeric,
  invoice_quantity_supplied numeric,
  invoice_quantity_pending numeric,
  invoice_status text,
  can_supply boolean
)
language sql stable security definer set search_path = public as $$
  select i.id, ii.id, i.invoice_no, c.name, i.invoice_date, ii.product_id,
         pr.name, pr.unit, ii.quantity_sold, ii.quantity_supplied, ii.quantity_pending,
         ii.supply_status, totals.quantity_sold, totals.quantity_supplied, totals.quantity_pending,
         case when totals.quantity_supplied = 0 then 'Pending'
              when totals.quantity_pending = 0 then 'Fully Supplied'
              else 'Partially Supplied' end,
         ii.quantity_pending > 0
  from public.supplies s
  join public.profiles me on me.id = auth.uid()
  join public.invoice_items ii on ii.company_id = s.company_id and ii.product_id = s.product_id
  join public.invoices i on i.id = ii.invoice_id and i.company_id = ii.company_id
  join public.customers c on c.id = i.customer_id and c.company_id = i.company_id
  join public.products pr on pr.id = ii.product_id and pr.company_id = ii.company_id
  join public.profiles creator on creator.id = i.created_by and creator.company_id = i.company_id and creator.role = 'admin'
  join (
    select invoice_id, sum(quantity_sold) as quantity_sold,
           sum(quantity_supplied) as quantity_supplied, sum(quantity_pending) as quantity_pending
    from public.invoice_items
    group by invoice_id
  ) totals on totals.invoice_id = i.id
  where s.id = p_supply
    and me.role = 'manager'
    and me.company_id = s.company_id
    and me.store_id = s.store_id
  order by i.invoice_date desc, i.invoice_no, ii.created_at, ii.id
$$;

create or replace function public.record_manager_supply(
  p_supply uuid,
  p_invoice uuid,
  p_item uuid,
  p_quantity numeric,
  p_client_id uuid,
  p_created_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cid uuid;
  manager_store uuid;
  v_supply public.supplies%rowtype;
  v_item public.invoice_items%rowtype;
  v_invoice_no text;
  v_customer text;
  v_store_name text;
  v_existing public.sheet_rows%rowtype;
  v_row_id uuid;
  v_remaining numeric;
  v_pending numeric;
  v_after numeric;
  v_status text;
  v_created_at timestamptz := coalesce(p_created_at, now());
begin
  if me is null then raise exception 'Sign in again before recording a supply'; end if;
  select p.company_id, p.store_id into cid, manager_store
    from public.profiles p where p.id = me and p.role = 'manager';
  if cid is null or manager_store is null then raise exception 'Only a store manager can record a supply'; end if;
  if p_client_id is null then raise exception 'A client id is required for an offline-safe supply'; end if;

  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':manager-supply:' || p_client_id::text, 0));
  select * into v_existing from public.sheet_rows
    where client_id = p_client_id and company_id = cid;
  if found then
    if v_existing.entered_by <> me or v_existing.supply_id <> p_supply or v_existing.quantity <> p_quantity then
      raise exception 'This offline entry conflicts with an existing supply record';
    end if;
    select quantity_supplied, quantity_pending, supply_status into v_after, v_pending, v_status
      from public.invoice_items where id = v_existing.invoice_item_id and company_id = cid;
    return jsonb_build_object(
      'sheet_row_id', v_existing.id,
      'invoice_id', v_existing.invoice_id,
      'invoice_item_id', v_existing.invoice_item_id,
      'quantity_supplied', v_after,
      'quantity_pending', v_pending,
      'supply_status', v_status,
      'customer_name', v_existing.customer,
      'invoice_no', v_existing.supply_ref,
      'already_recorded', true
    );
  end if;

  select * into v_supply from public.supplies
    where id = p_supply and company_id = cid and store_id = manager_store for update;
  if not found then raise exception 'This product is not assigned to your store'; end if;
  if v_supply.sheet_started_at is null then raise exception 'Create the product sheet before recording a supply'; end if;
  if p_quantity is null or not (p_quantity > 0 and p_quantity < 'Infinity'::numeric) then
    raise exception 'Enter a finite quantity above zero';
  end if;

  select ii.* into v_item
    from public.invoice_items ii
    where ii.id = p_item and ii.invoice_id = p_invoice and ii.company_id = cid
    for update;
  if not found then raise exception 'Invoice item not found'; end if;
  select i.invoice_no, c.name, st.name
    into v_invoice_no, v_customer, v_store_name
    from public.invoices i
    join public.customers c on c.id = i.customer_id and c.company_id = i.company_id
    join public.stores st on st.id = v_supply.store_id and st.company_id = cid
    where i.id = p_invoice and i.company_id = cid;
  if v_item.product_id <> v_supply.product_id then raise exception 'The invoice item is for a different product'; end if;
  if not exists (
    select 1 from public.invoices i
    join public.profiles creator on creator.id = i.created_by and creator.company_id = i.company_id and creator.role = 'admin'
    where i.id = p_invoice and i.company_id = cid
  ) then
    raise exception 'This invoice was not created by a company admin';
  end if;

  select remaining into v_remaining from public.supply_balance where supply_id = p_supply;
  v_remaining := greatest(coalesce(v_remaining, 0), 0);
  v_pending := v_item.quantity_sold - v_item.quantity_supplied;
  if p_quantity > v_remaining then raise exception 'Only % left in the store', v_remaining; end if;
  if p_quantity > v_pending then raise exception 'Only % left on invoice %', v_pending, v_invoice_no; end if;

  insert into public.sheet_rows
    (company_id, supply_id, invoice_id, invoice_item_id, customer, supply_ref, quantity, entered_by, created_at, client_id)
  values
    (cid, p_supply, p_invoice, p_item, v_customer, v_invoice_no, p_quantity, me, v_created_at, p_client_id)
  returning id into v_row_id;

  v_after := v_item.quantity_supplied + p_quantity;
  update public.invoice_items set quantity_supplied = v_after where id = p_item;
  v_status := case when v_after = 0 then 'Pending' when v_after >= v_item.quantity_sold then 'Fully Supplied' else 'Partially Supplied' end;

  insert into public.invoice_supply_updates
    (company_id, invoice_item_id, quantity, supplied_after, note, created_by, created_at, change_kind)
  values
    (cid, p_item, p_quantity, v_after, 'Store supply: ' || coalesce(v_store_name, 'store'), me, v_created_at, 'supply');

  return jsonb_build_object(
    'sheet_row_id', v_row_id,
    'invoice_id', p_invoice,
    'invoice_item_id', p_item,
    'quantity_supplied', v_after,
    'quantity_pending', v_item.quantity_sold - v_after,
    'supply_status', v_status,
    'customer_name', v_customer,
    'invoice_no', v_invoice_no,
    'already_recorded', false
  );
end $$;

create or replace function public.undo_manager_supply(p_row uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cid uuid;
  manager_store uuid;
  v_row public.sheet_rows%rowtype;
  v_item public.invoice_items%rowtype;
  v_invoice public.invoices%rowtype;
  v_after numeric;
begin
  if me is null then raise exception 'Sign in again before undoing a supply'; end if;
  select p.company_id, p.store_id into cid, manager_store
    from public.profiles p where p.id = me and p.role = 'manager';
  if cid is null or manager_store is null then raise exception 'Only a store manager can undo a supply'; end if;

  select sr.* into v_row
    from public.sheet_rows sr
    join public.supplies s on s.id = sr.supply_id and s.company_id = sr.company_id
    where sr.id = p_row and sr.company_id = cid and sr.entered_by = me and s.store_id = manager_store
    for update of sr;
  if not found then raise exception 'This supply record is no longer available to undo'; end if;

  if v_row.invoice_id is null and v_row.invoice_item_id is null then
    delete from public.sheet_rows where id = p_row;
    return jsonb_build_object('sheet_row_id', p_row, 'invoice_reversed', false);
  end if;
  if v_row.invoice_id is null or v_row.invoice_item_id is null then
    raise exception 'This supply record has an incomplete invoice link';
  end if;

  select * into v_item from public.invoice_items
    where id = v_row.invoice_item_id and invoice_id = v_row.invoice_id and company_id = cid for update;
  if not found then raise exception 'The linked invoice item is no longer available'; end if;
  select * into v_invoice from public.invoices where id = v_row.invoice_id and company_id = cid;
  if v_item.quantity_supplied < v_row.quantity then
    raise exception 'The invoice supplied total is already lower than this record';
  end if;

  v_after := v_item.quantity_supplied - v_row.quantity;
  update public.invoice_items set quantity_supplied = v_after where id = v_item.id;
  insert into public.invoice_supply_updates
    (company_id, invoice_item_id, quantity, supplied_after, note, created_by, change_kind)
  values
    (cid, v_item.id, v_row.quantity, v_after, 'Reversed store manager supply', me, 'reversal');
  delete from public.sheet_rows where id = p_row;

  return jsonb_build_object(
    'sheet_row_id', p_row,
    'invoice_reversed', true,
    'invoice_id', v_row.invoice_id,
    'invoice_item_id', v_row.invoice_item_id,
    'invoice_no', v_invoice.invoice_no,
    'quantity_supplied', v_after,
    'quantity_pending', v_item.quantity_sold - v_after
  );
end $$;

drop policy if exists rows_add on public.sheet_rows;
drop policy if exists rows_delete_own on public.sheet_rows;

revoke insert, delete on public.sheet_rows from authenticated;
revoke execute on function public.list_manager_invoice_items(uuid) from public, anon;
revoke execute on function public.record_manager_supply(uuid, uuid, uuid, numeric, uuid, timestamptz) from public, anon;
revoke execute on function public.undo_manager_supply(uuid) from public, anon;
grant execute on function public.list_manager_invoice_items(uuid) to authenticated;
grant execute on function public.record_manager_supply(uuid, uuid, uuid, numeric, uuid, timestamptz) to authenticated;
grant execute on function public.undo_manager_supply(uuid) to authenticated;

create or replace function public.restore_company_backup(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := my_company();
  me uuid := auth.uid();
  asg jsonb;
begin
  if not is_admin() or cid is null then raise exception 'Only an admin can restore a backup'; end if;
  if coalesce(p->>'format', '') <> 'stockroom-backup-1' then raise exception 'This file is not a Marsandiis backup'; end if;
  perform public.update_company_settings(null, p->'settings');

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'store', store_id)), '[]'::jsonb) into asg
    from public.profiles where company_id = cid and role = 'manager' and store_id is not null;

  delete from public.bank_deposits where company_id = cid;
  delete from public.salary_payments where company_id = cid;
  delete from public.misc_expenses where company_id = cid;
  delete from public.receipts where company_id = cid;
  delete from public.payments where company_id = cid;
  delete from public.invoice_supply_updates where company_id = cid;
  delete from public.invoice_items where company_id = cid;
  delete from public.invoices where company_id = cid;
  delete from public.customers where company_id = cid;
  delete from public.receipt_counters where company_id = cid;
  delete from public.activity_log where company_id = cid;
  delete from public.reports where company_id = cid;
  delete from public.gifts where company_id = cid;
  delete from public.losses where company_id = cid;
  delete from public.sheet_rows where company_id = cid;
  delete from public.supplies where company_id = cid;
  delete from public.products where company_id = cid;
  delete from public.stores where company_id = cid;

  insert into public.stores (id, company_id, name, location, manager_name, active, created_at)
    select x.id, cid, x.name, x.location, x.manager_name, coalesce(x.active, true), coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'stores', '[]'::jsonb))
      as x(id uuid, name text, location text, manager_name text, active boolean, created_at timestamptz);

  insert into public.products (id, company_id, name, container_no, unit, barcode, default_unit_price_gmd, total, damaged_offload, missing_before_offload, date_arrived, created_at)
    select x.id, cid, x.name, x.container_no, coalesce(x.unit, 'pieces'), x.barcode, coalesce(x.default_unit_price_gmd, 0),
           x.total, coalesce(x.damaged_offload, 0), coalesce(x.missing_before_offload, 0),
           coalesce(x.date_arrived, current_date), coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'products', '[]'::jsonb))
      as x(id uuid, name text, container_no text, unit text, barcode text, default_unit_price_gmd numeric,
           total numeric, damaged_offload numeric, missing_before_offload numeric, date_arrived date, created_at timestamptz);

  insert into public.customers (id, company_id, name, created_at)
    select x.id, cid, x.name, coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'customers', '[]'::jsonb)) as x(id uuid, name text, created_at timestamptz);

  insert into public.salary_payments (id, company_id, employee_id, employee_name, pay_period, amount, currency, paid_at, payment_method, payment_reference, note, client_id, created_by, created_at, voided_at, voided_by, void_reason)
    select x.id, cid, (select pr.id from public.profiles pr where pr.id = x.employee_id and pr.company_id = cid),
           x.employee_name, x.pay_period, x.amount, x.currency, coalesce(x.paid_at, now()), x.payment_method,
           x.payment_reference, x.note, coalesce(x.client_id, gen_random_uuid()),
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), x.voided_at,
           (select pr.id from public.profiles pr where pr.id = x.voided_by and pr.company_id = cid), x.void_reason
    from jsonb_to_recordset(coalesce(p->'salary_payments', '[]'::jsonb))
      as x(id uuid, employee_id uuid, employee_name text, pay_period date, amount numeric, currency text,
           paid_at timestamptz, payment_method text, payment_reference text, note text, client_id uuid,
           created_by uuid, created_at timestamptz, voided_at timestamptz, voided_by uuid, void_reason text);

  insert into public.misc_expenses (id, company_id, category, amount, currency, paid_at, payee, description, payment_method, reference, client_id, created_by, created_at, voided_at, voided_by, void_reason)
    select x.id, cid, x.category, x.amount, x.currency, coalesce(x.paid_at, now()), x.payee, x.description,
           x.payment_method, x.reference, coalesce(x.client_id, gen_random_uuid()),
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), x.voided_at,
           (select pr.id from public.profiles pr where pr.id = x.voided_by and pr.company_id = cid), x.void_reason
    from jsonb_to_recordset(coalesce(p->'misc_expenses', '[]'::jsonb))
      as x(id uuid, category text, amount numeric, currency text, paid_at timestamptz, payee text,
           description text, payment_method text, reference text, client_id uuid, created_by uuid,
           created_at timestamptz, voided_at timestamptz, voided_by uuid, void_reason text);

  insert into public.bank_deposits (id, company_id, bank_name, account_reference, amount, currency, deposited_at, reference, note, client_id, created_by, created_at, voided_at, voided_by, void_reason)
    select x.id, cid, x.bank_name, x.account_reference, x.amount, x.currency, coalesce(x.deposited_at, now()),
           x.reference, x.note, coalesce(x.client_id, gen_random_uuid()),
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), x.voided_at,
           (select pr.id from public.profiles pr where pr.id = x.voided_by and pr.company_id = cid), x.void_reason
    from jsonb_to_recordset(coalesce(p->'bank_deposits', '[]'::jsonb))
      as x(id uuid, bank_name text, account_reference text, amount numeric, currency text,
           deposited_at timestamptz, reference text, note text, client_id uuid, created_by uuid,
           created_at timestamptz, voided_at timestamptz, voided_by uuid, void_reason text);

  insert into public.invoices (id, company_id, invoice_no, customer_id, invoice_date, currency, exchange_rate, note, created_by, created_at)
    select x.id, cid, x.invoice_no, x.customer_id, coalesce(x.invoice_date, current_date), x.currency, x.exchange_rate, x.note,
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me), coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'invoices', '[]'::jsonb))
      as x(id uuid, invoice_no text, customer_id uuid, invoice_date date, currency text, exchange_rate numeric,
           note text, created_by uuid, created_at timestamptz);

  insert into public.invoice_items (id, company_id, invoice_id, product_id, quantity_sold, unit_price_gmd, quantity_supplied, created_at)
    select x.id, cid, x.invoice_id, x.product_id, x.quantity_sold, x.unit_price_gmd, coalesce(x.quantity_supplied, 0), coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'invoice_items', '[]'::jsonb))
      as x(id uuid, invoice_id uuid, product_id uuid, quantity_sold numeric, unit_price_gmd numeric,
           quantity_supplied numeric, created_at timestamptz);

  insert into public.payments (id, company_id, invoice_id, amount, method, paid_at, note, created_by, created_at)
    select x.id, cid, x.invoice_id, x.amount, x.method, coalesce(x.paid_at, now()), x.note,
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me),
           coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'payments', '[]'::jsonb))
      as x(id uuid, invoice_id uuid, amount numeric, method text, paid_at timestamptz, note text,
           created_by uuid, created_at timestamptz);

  insert into public.invoice_supply_updates (id, company_id, invoice_item_id, quantity, supplied_after, note, created_by, created_at, change_kind)
    select x.id, cid, x.invoice_item_id, x.quantity, x.supplied_after, x.note,
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), coalesce(x.change_kind, 'supply')
    from jsonb_to_recordset(coalesce(p->'invoice_supply_updates', '[]'::jsonb))
      as x(id uuid, invoice_item_id uuid, quantity numeric, supplied_after numeric, note text,
           created_by uuid, created_at timestamptz, change_kind text);

  insert into public.receipts (id, company_id, receipt_no, invoice_id, payment_id, kind, snapshot, issued_at, created_by)
    select x.id, cid, x.receipt_no, x.invoice_id, x.payment_id, x.kind, x.snapshot, coalesce(x.issued_at, now()),
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me)
    from jsonb_to_recordset(coalesce(p->'receipts', '[]'::jsonb))
      as x(id uuid, receipt_no text, invoice_id uuid, payment_id uuid, kind text, snapshot jsonb,
           issued_at timestamptz, created_by uuid);

  insert into public.receipt_counters (company_id, next_number)
    select cid, greatest(coalesce(max((regexp_replace(receipt_no, '\D', '', 'g'))::integer), 0) + 1, 1)
    from public.receipts where company_id = cid
    on conflict (company_id) do update set next_number = excluded.next_number;

  insert into public.supplies (id, company_id, product_id, store_id, quantity, sheet_started_by, sheet_started_at)
    select x.id, cid, x.product_id, x.store_id, x.quantity,
           (select pr.id from public.profiles pr where pr.id = x.sheet_started_by and pr.company_id = cid), x.sheet_started_at
    from jsonb_to_recordset(coalesce(p->'supplies', '[]'::jsonb))
      as x(id uuid, product_id uuid, store_id uuid, quantity numeric, sheet_started_by uuid, sheet_started_at timestamptz);

  insert into public.sheet_rows (id, company_id, supply_id, invoice_id, invoice_item_id, customer, supply_ref, quantity, entered_by, created_at, client_id)
    select x.id, cid, x.supply_id, x.invoice_id, x.invoice_item_id, x.customer, x.supply_ref, x.quantity,
           coalesce((select pr.id from public.profiles pr where pr.id = x.entered_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), x.client_id
    from jsonb_to_recordset(coalesce(p->'sheet_rows', '[]'::jsonb))
      as x(id uuid, supply_id uuid, invoice_id uuid, invoice_item_id uuid, customer text, supply_ref text,
           quantity numeric, entered_by uuid, created_at timestamptz, client_id uuid);

  insert into public.losses (id, company_id, supply_id, kind, quantity, note, entered_by, created_at, client_id)
    select x.id, cid, x.supply_id, x.kind, x.quantity, x.note,
           coalesce((select pr.id from public.profiles pr where pr.id = x.entered_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), x.client_id
    from jsonb_to_recordset(coalesce(p->'losses', '[]'::jsonb))
      as x(id uuid, supply_id uuid, kind text, quantity numeric, note text, entered_by uuid,
           created_at timestamptz, client_id uuid);

  insert into public.gifts (id, company_id, supply_id, recipient, quantity, note, entered_by, created_at, client_id)
    select x.id, cid, x.supply_id, x.recipient, x.quantity, x.note,
           coalesce((select pr.id from public.profiles pr where pr.id = x.entered_by and pr.company_id = cid), me),
           coalesce(x.created_at, now()), x.client_id
    from jsonb_to_recordset(coalesce(p->'gifts', '[]'::jsonb))
      as x(id uuid, supply_id uuid, recipient text, quantity numeric, note text, entered_by uuid,
           created_at timestamptz, client_id uuid);

  insert into public.reports (id, company_id, author, category, subject, message, resolved, created_at)
    select x.id, cid, coalesce((select pr.id from public.profiles pr where pr.id = x.author and pr.company_id = cid), me),
           x.category, x.subject, x.message, coalesce(x.resolved, false), coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'reports', '[]'::jsonb))
      as x(id uuid, author uuid, category text, subject text, message text, resolved boolean, created_at timestamptz);

  insert into public.activity_log (id, company_id, actor, message, created_at)
    select x.id, cid, coalesce((select pr.id from public.profiles pr where pr.id = x.actor and pr.company_id = cid), me),
           x.message, coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p->'activity_log', '[]'::jsonb))
      as x(id uuid, actor uuid, message text, created_at timestamptz);

  update public.profiles pr set store_id = a.store
    from jsonb_to_recordset(asg) as a(id uuid, store uuid)
    where pr.id = a.id and exists (select 1 from public.stores s where s.id = a.store and s.company_id = cid);
end $$;

notify pgrst, 'reload schema';

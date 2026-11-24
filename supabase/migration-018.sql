-- migration-018: admin sales, invoices, customers, payments, supply tracking and receipts.
-- Run ONCE in the Supabase SQL editor after migration-017.sql. Safe to run again.
-- Money is stored in GMD on invoice items. XOF invoices keep the GMD-to-CFA rate used at sale time.

alter table public.products add column if not exists default_unit_price_gmd numeric not null default 0;
alter table public.products drop constraint if exists products_default_price_nonneg;
alter table public.products add constraint products_default_price_nonneg check (default_unit_price_gmd >= 0 and default_unit_price_gmd < 'Infinity'::numeric);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass and conname = 'products_company_id_key'
  ) then
    alter table public.products add constraint products_company_id_key unique (company_id, id);
  end if;
end $$;
alter table public.profiles add column if not exists prefs jsonb not null default '{}'::jsonb;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  constraint customers_company_id_key unique (company_id, id)
);
create unique index if not exists customers_company_name_unique
  on public.customers (company_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies on delete cascade,
  invoice_no text not null check (char_length(btrim(invoice_no)) between 2 and 40),
  customer_id uuid not null,
  invoice_date date not null default current_date,
  currency text not null default 'GMD' check (currency in ('GMD','XOF')),
  exchange_rate numeric not null default 1 check (exchange_rate > 0 and exchange_rate < 'Infinity'::numeric),
  note text,
  created_by uuid not null default auth.uid() references public.profiles,
  created_at timestamptz not null default now(),
  constraint invoices_company_id_key unique (company_id, id),
  constraint invoices_gmd_rate check (currency <> 'GMD' or exchange_rate = 1),
  foreign key (company_id, customer_id) references public.customers (company_id, id)
);
create unique index if not exists invoices_company_no_unique
  on public.invoices (company_id, lower(btrim(invoice_no)));

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies on delete cascade,
  invoice_id uuid not null,
  product_id uuid not null,
  quantity_sold numeric not null check (quantity_sold > 0 and quantity_sold < 'Infinity'::numeric),
  unit_price_gmd numeric not null check (unit_price_gmd >= 0 and unit_price_gmd < 'Infinity'::numeric),
  quantity_supplied numeric not null default 0 check (quantity_supplied >= 0 and quantity_supplied < 'Infinity'::numeric),
  total_gmd numeric generated always as (quantity_sold * unit_price_gmd) stored,
  quantity_pending numeric generated always as (quantity_sold - quantity_supplied) stored,
  supply_status text generated always as (
    case when quantity_supplied = 0 then 'Pending'
         when quantity_supplied >= quantity_sold then 'Fully Supplied'
         else 'Partially Supplied' end
  ) stored,
  created_at timestamptz not null default now(),
  constraint invoice_items_supply_check check (quantity_supplied <= quantity_sold and total_gmd < 'Infinity'::numeric),
  constraint invoice_items_company_id_key unique (company_id, id),
  constraint invoice_items_invoice_product_unique unique (invoice_id, product_id),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id) on delete cascade,
  foreign key (company_id, product_id) references public.products (company_id, id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies on delete cascade,
  invoice_id uuid not null,
  amount numeric not null check (amount > 0 and amount < 'Infinity'::numeric),
  method text not null check (method in ('Cash','Wave','APS','NAFA')),
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid not null default auth.uid() references public.profiles,
  created_at timestamptz not null default now(),
  constraint payments_company_id_key unique (company_id, id),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id) on delete cascade
);

create table if not exists public.invoice_supply_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies on delete cascade,
  invoice_item_id uuid not null,
  quantity numeric not null check (quantity > 0 and quantity < 'Infinity'::numeric),
  supplied_after numeric not null check (supplied_after >= 0 and supplied_after < 'Infinity'::numeric),
  note text,
  created_by uuid not null default auth.uid() references public.profiles,
  created_at timestamptz not null default now(),
  foreign key (company_id, invoice_item_id) references public.invoice_items (company_id, id) on delete cascade
);

alter table public.invoices drop constraint if exists invoices_exchange_rate_check;
alter table public.invoices add constraint invoices_exchange_rate_check check (exchange_rate > 0 and exchange_rate < 'Infinity'::numeric);
alter table public.invoice_items drop constraint if exists invoice_items_quantity_sold_check;
alter table public.invoice_items add constraint invoice_items_quantity_sold_check check (quantity_sold > 0 and quantity_sold < 'Infinity'::numeric);
alter table public.invoice_items drop constraint if exists invoice_items_unit_price_gmd_check;
alter table public.invoice_items add constraint invoice_items_unit_price_gmd_check check (unit_price_gmd >= 0 and unit_price_gmd < 'Infinity'::numeric);
alter table public.invoice_items drop constraint if exists invoice_items_quantity_supplied_check;
alter table public.invoice_items add constraint invoice_items_quantity_supplied_check check (quantity_supplied >= 0 and quantity_supplied < 'Infinity'::numeric);
alter table public.invoice_items drop constraint if exists invoice_items_supply_check;
alter table public.invoice_items add constraint invoice_items_supply_check check (quantity_supplied <= quantity_sold and total_gmd < 'Infinity'::numeric);
alter table public.payments drop constraint if exists payments_amount_check;
alter table public.payments add constraint payments_amount_check check (amount > 0 and amount < 'Infinity'::numeric);
alter table public.invoice_supply_updates drop constraint if exists invoice_supply_updates_quantity_check;
alter table public.invoice_supply_updates add constraint invoice_supply_updates_quantity_check check (quantity > 0 and quantity < 'Infinity'::numeric);
alter table public.invoice_supply_updates drop constraint if exists invoice_supply_updates_supplied_after_check;
alter table public.invoice_supply_updates add constraint invoice_supply_updates_supplied_after_check check (supplied_after >= 0 and supplied_after < 'Infinity'::numeric);

create table if not exists public.receipt_counters (
  company_id uuid primary key references public.companies on delete cascade,
  next_number integer not null default 1 check (next_number >= 1)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies on delete cascade,
  receipt_no text not null check (char_length(receipt_no) between 3 and 40),
  invoice_id uuid not null,
  payment_id uuid,
  kind text not null check (kind in ('Invoice','Payment')),
  snapshot jsonb not null,
  issued_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles,
  constraint receipts_company_no_unique unique (company_id, receipt_no),
  constraint receipts_payment_unique unique (payment_id),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id) on delete cascade,
  foreign key (company_id, payment_id) references public.payments (company_id, id) on delete cascade
);

create index if not exists invoices_company_date on public.invoices (company_id, invoice_date desc);
create index if not exists invoices_customer on public.invoices (company_id, customer_id);
create index if not exists invoice_items_invoice on public.invoice_items (invoice_id);
create index if not exists payments_invoice on public.payments (invoice_id, paid_at);
create index if not exists supply_updates_item on public.invoice_supply_updates (invoice_item_id, created_at);
create index if not exists receipts_invoice on public.receipts (invoice_id, issued_at);
create unique index if not exists receipts_invoice_unique on public.receipts (invoice_id) where kind = 'Invoice';

create or replace view public.invoice_summary with (security_invoker = true) as
select i.*, c.name as customer_name,
  coalesce(sum(ii.total_gmd), 0) as total_gmd,
  coalesce(sum(ii.total_gmd), 0) * case when i.currency = 'XOF' then i.exchange_rate else 1 end as total_amount,
  coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) as amount_paid,
  greatest(
    coalesce(sum(ii.total_gmd), 0) * case when i.currency = 'XOF' then i.exchange_rate else 1 end
      - coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0),
    0
  ) as outstanding,
  case
    when coalesce(sum(ii.total_gmd), 0) * case when i.currency = 'XOF' then i.exchange_rate else 1 end = 0 then 'Paid'
    when coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) = 0 then 'Unpaid'
    when coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0)
      >= coalesce(sum(ii.total_gmd), 0) * case when i.currency = 'XOF' then i.exchange_rate else 1 end then 'Paid'
    else 'Partially Paid'
  end as payment_status,
  coalesce(sum(ii.quantity_sold), 0) as quantity_sold,
  coalesce(sum(ii.quantity_supplied), 0) as quantity_supplied,
  coalesce(sum(ii.quantity_pending), 0) as quantity_pending,
  case
    when coalesce(sum(ii.quantity_supplied), 0) = 0 then 'Pending'
    when coalesce(sum(ii.quantity_pending), 0) = 0 then 'Fully Supplied'
    else 'Partially Supplied'
  end as supply_status,
  count(ii.id) as item_count
from public.invoices i
join public.customers c on c.id = i.customer_id and c.company_id = i.company_id
left join public.invoice_items ii on ii.invoice_id = i.id and ii.company_id = i.company_id
group by i.id, c.name;

create or replace function public.issue_receipt(p_invoice uuid, p_payment uuid default null, p_kind text default 'Invoice')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  v_next integer;
  v_no text;
  v_id uuid;
  v_summary public.invoice_summary%rowtype;
  v_company public.companies%rowtype;
  v_payment public.payments%rowtype;
  v_items jsonb;
  v_snapshot jsonb;
  v_factor numeric;
begin
  select company_id into cid from public.invoices where id = p_invoice;
  if cid is null then raise exception 'Invoice not found'; end if;
  if not public.is_admin() or public.my_company() is null or cid <> public.my_company() then
    raise exception 'Only an admin can issue receipts for this company';
  end if;
  if p_kind not in ('Invoice','Payment') then raise exception 'Unknown receipt type'; end if;
  if p_kind = 'Payment' then
    select * into v_payment from public.payments where id = p_payment and invoice_id = p_invoice and company_id = cid;
    if not found then raise exception 'Payment not found for this invoice'; end if;
    select id into v_id from public.receipts where payment_id = p_payment;
    if found then return v_id; end if;
  else
    if p_payment is not null then raise exception 'An invoice receipt cannot be linked to a payment'; end if;
    select id into v_id from public.receipts where invoice_id = p_invoice and kind = 'Invoice';
    if found then return v_id; end if;
  end if;

  select * into v_summary from public.invoice_summary where id = p_invoice;
  select * into v_company from public.companies where id = cid;
  v_factor := case when v_summary.currency = 'XOF' then v_summary.exchange_rate else 1 end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'productId', x.product_id, 'productName', x.product_name,
    'quantity', x.quantity_sold, 'unitPrice', x.unit_price_gmd * v_factor,
    'total', x.total_gmd * v_factor
  ) order by x.created_at, x.id), '[]'::jsonb) into v_items
  from (
    select ii.*, pr.name as product_name
    from public.invoice_items ii
    join public.products pr on pr.id = ii.product_id and pr.company_id = ii.company_id
    where ii.invoice_id = p_invoice
  ) x;

  insert into public.receipt_counters (company_id, next_number) values (cid, 1)
    on conflict (company_id) do nothing;
  select next_number into v_next from public.receipt_counters where company_id = cid for update;
  v_no := 'RCPT-' || lpad(v_next::text, 6, '0');
  update public.receipt_counters set next_number = next_number + 1 where company_id = cid;

  v_snapshot := jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_company.name, 'logo', '/logo-icon.svg',
      'address', v_company.settings->>'businessAddress',
      'phone', v_company.settings->>'businessPhone',
      'email', v_company.settings->>'businessEmail',
      'footer', v_company.settings->>'receiptFooter'
    ),
    'receiptNo', v_no, 'kind', p_kind, 'issuedAt', now(),
    'invoice', jsonb_build_object(
      'id', v_summary.id, 'number', v_summary.invoice_no, 'customer', v_summary.customer_name,
      'date', v_summary.invoice_date, 'currency', v_summary.currency,
      'exchangeRate', v_summary.exchange_rate, 'totalAmount', v_summary.total_amount,
      'amountPaid', v_summary.amount_paid, 'outstanding', v_summary.outstanding,
      'paymentStatus', v_summary.payment_status,
      'paymentMethod', case when v_summary.amount_paid > 0 then (
        select string_agg(distinct pay.method, ', ' order by pay.method)
        from public.payments pay where pay.invoice_id = p_invoice and pay.company_id = cid
      ) else null end,
      'note', v_summary.note
    ),
    'items', v_items,
    'payment', case when p_kind = 'Payment' then jsonb_build_object(
      'id', v_payment.id, 'amount', v_payment.amount, 'method', v_payment.method,
      'paidAt', v_payment.paid_at, 'note', v_payment.note,
      'balanceAfter', v_summary.outstanding
    ) else null end
  );

  insert into public.receipts (company_id, receipt_no, invoice_id, payment_id, kind, snapshot, created_by)
    values (cid, v_no, p_invoice, p_payment, p_kind, v_snapshot, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_sales_invoice(
  p_invoice_no text,
  p_customer_name text,
  p_invoice_date date default current_date,
  p_currency text default 'GMD',
  p_items jsonb default '[]'::jsonb,
  p_initial_payment numeric default 0,
  p_payment_method text default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_no text;
  v_customer_name text;
  v_customer uuid;
  v_invoice uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_price numeric;
  v_total numeric := 0;
  v_currency text;
  v_rate numeric := 1;
  v_initial numeric;
  v_method text;
  v_payment uuid;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can create invoices'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the invoice';
  end if;
  v_no := upper(regexp_replace(btrim(coalesce(p_invoice_no, '')), '\s+', ' ', 'g'));
  if char_length(v_no) < 2 or char_length(v_no) > 40 then raise exception 'Enter an invoice number between 2 and 40 characters'; end if;
  v_customer_name := regexp_replace(btrim(coalesce(p_customer_name, '')), '\s+', ' ', 'g');
  if char_length(v_customer_name) < 2 or char_length(v_customer_name) > 120 then raise exception 'Enter a customer name between 2 and 120 characters'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'The invoice note can have at most 500 characters'; end if;
  v_currency := upper(btrim(coalesce(p_currency, 'GMD')));
  if v_currency not in ('GMD','XOF') then raise exception 'Choose GMD or XOF'; end if;
  if v_currency = 'XOF' then
    begin
      select (settings->>'gmdToXofRate')::numeric into v_rate from public.companies where id = cid;
    exception when others then
      v_rate := null;
    end;
    if v_rate is null or not (v_rate > 0 and v_rate < 'Infinity'::numeric) then
      raise exception 'Set the GMD-to-CFA exchange rate in General Settings before creating a CFA invoice';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':customer:' || lower(v_customer_name), 0));
  select id into v_customer from public.customers
    where company_id = cid and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(v_customer_name);
  if v_customer is null then
    insert into public.customers (company_id, name) values (cid, v_customer_name) returning id into v_customer;
  end if;

  insert into public.invoices (company_id, invoice_no, customer_id, invoice_date, currency, exchange_rate, note, created_by)
    values (cid, v_no, v_customer, coalesce(p_invoice_date, current_date), v_currency, v_rate, nullif(btrim(p_note), ''), me)
    returning id into v_invoice;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
      where id = (nullif(v_item->>'product_id', ''))::uuid and company_id = cid;
    if not found then raise exception 'One of the selected products does not belong to this company'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := coalesce((nullif(v_item->>'unit_price_gmd', ''))::numeric, v_product.default_unit_price_gmd);
    if v_qty is null or not (v_qty > 0 and v_qty < 'Infinity'::numeric) then raise exception 'Every product needs a finite quantity above zero'; end if;
    if v_price is null or not (v_price >= 0 and v_price < 'Infinity'::numeric) then raise exception 'Every product needs a finite unit price'; end if;
    if exists (select 1 from public.invoice_items where invoice_id = v_invoice and product_id = v_product.id) then
      raise exception 'A product can appear only once on an invoice';
    end if;
    insert into public.invoice_items (company_id, invoice_id, product_id, quantity_sold, unit_price_gmd)
      values (cid, v_invoice, v_product.id, v_qty, v_price);
    v_total := v_total + v_qty * v_price;
  end loop;
  v_total := v_total * case when v_currency = 'XOF' then v_rate else 1 end;

  v_initial := coalesce(p_initial_payment, 0);
  if not (v_initial >= 0 and v_initial < 'Infinity'::numeric) or v_initial > v_total then
    raise exception 'The initial payment must be finite and cannot exceed the invoice total';
  end if;
  if v_initial > 0 then
    v_method := upper(btrim(coalesce(p_payment_method, '')));
    if v_method not in ('CASH','WAVE','APS','NAFA') then raise exception 'Choose Cash, Wave, APS or NAFA for the payment'; end if;
    insert into public.payments (company_id, invoice_id, amount, method, created_by)
      values (cid, v_invoice, v_initial, case when v_method in ('APS', 'NAFA') then v_method else initcap(v_method) end, me) returning id into v_payment;
  end if;

  perform public.issue_receipt(v_invoice, null, 'Invoice');
  if v_payment is not null then
    perform public.issue_receipt(v_invoice, v_payment, 'Payment');
  end if;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Created invoice ' || v_no || ' for ' || v_customer_name || ' (' || v_currency || ')');
  return v_invoice;
end $$;

create or replace function public.record_invoice_payment(
  p_invoice uuid,
  p_amount numeric,
  p_method text,
  p_paid_at timestamptz default now(),
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_total numeric;
  v_paid numeric;
  v_method text;
  v_id uuid;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can record payments'; end if;
  select * into v_invoice from public.invoices where id = p_invoice and company_id = cid for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_amount is null or not (p_amount > 0 and p_amount < 'Infinity'::numeric) then raise exception 'Enter a finite payment amount above zero'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'The payment note can have at most 300 characters'; end if;
  v_method := upper(btrim(coalesce(p_method, '')));
  if v_method not in ('CASH','WAVE','APS','NAFA') then raise exception 'Choose Cash, Wave, APS or NAFA'; end if;
  select total_amount, amount_paid into v_total, v_paid from public.invoice_summary where id = p_invoice;
  if p_amount > greatest(v_total - v_paid, 0) then raise exception 'The payment exceeds the outstanding balance'; end if;
  insert into public.payments (company_id, invoice_id, amount, method, paid_at, note, created_by)
    values (cid, p_invoice, p_amount, case when v_method in ('APS', 'NAFA') then v_method else initcap(v_method) end, coalesce(p_paid_at, now()), nullif(btrim(p_note), ''), me)
    returning id into v_id;
  perform public.issue_receipt(p_invoice, v_id, 'Payment');
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Recorded ' || p_amount || ' ' || v_invoice.currency || ' payment on invoice ' || v_invoice.invoice_no);
  return v_id;
end $$;

create or replace function public.update_invoice_item_supply(
  p_item uuid,
  p_quantity numeric,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_item public.invoice_items%rowtype;
  v_invoice public.invoices%rowtype;
  v_after numeric;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can update supplied quantities'; end if;
  select * into v_item from public.invoice_items
    where id = p_item and company_id = cid for update;
  if not found then raise exception 'Invoice item not found'; end if;
  select * into v_invoice from public.invoices where id = v_item.invoice_id and company_id = cid;
  if p_quantity is null or not (p_quantity > 0 and p_quantity < 'Infinity'::numeric) then raise exception 'Enter a finite supplied quantity above zero'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'The supply note can have at most 300 characters'; end if;
  v_after := v_item.quantity_supplied + p_quantity;
  if v_after > v_item.quantity_sold then raise exception 'Supplied quantity cannot exceed the quantity sold'; end if;
  update public.invoice_items set quantity_supplied = v_after where id = p_item;
  insert into public.invoice_supply_updates (company_id, invoice_item_id, quantity, supplied_after, note, created_by)
    values (cid, p_item, p_quantity, v_after, nullif(btrim(p_note), ''), me);
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Updated supply on invoice ' || v_invoice.invoice_no || ': ' || v_after || ' supplied');
end $$;

create or replace function public.update_company_settings(p_name text default null, p_settings jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  nm text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
  v_rate numeric;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can change the company settings'; end if;
  if p_name is not null then
    if char_length(nm) < 2 then raise exception 'Enter the company or business name'; end if;
    begin
      update public.companies set name = nm where id = cid;
    exception when unique_violation then
      raise exception 'Account/company name already exists';
    end;
  end if;
  if p_settings is not null then
    if p_settings ? 'gmdToXofRate' then
      begin
        v_rate := nullif(btrim(p_settings->>'gmdToXofRate'), '')::numeric;
      exception when invalid_text_representation then
        raise exception 'Enter a valid GMD-to-CFA exchange rate';
      end;
      v_rate := coalesce(v_rate, 0);
      if not (v_rate >= 0 and v_rate < 'Infinity'::numeric) then
        raise exception 'Enter a finite GMD-to-CFA exchange rate above zero, or leave it blank';
      end if;
    end if;
    if coalesce(char_length(p_settings->>'businessAddress'), 0) > 200
      or coalesce(char_length(p_settings->>'businessPhone'), 0) > 40
      or coalesce(char_length(p_settings->>'businessEmail'), 0) > 120
      or coalesce(char_length(p_settings->>'receiptFooter'), 0) > 200 then
      raise exception 'One of the business details is too long';
    end if;
    update public.companies set settings = settings || p_settings where id = cid;
  end if;
end $$;

create or replace function public.reset_all_data(wipe_accounts boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.my_company();
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can reset the data'; end if;
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
  if wipe_accounts then delete from auth.users where id in (select id from public.profiles where company_id = cid and id <> auth.uid()); end if;
end $$;

create or replace function public.restore_company_backup(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  asg jsonb;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can restore a backup'; end if;
  if coalesce(p->>'format', '') <> 'stockroom-backup-1' then raise exception 'This file is not a Marsandiis backup'; end if;
  perform public.update_company_settings(null, p->'settings');

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'store', store_id)), '[]'::jsonb) into asg
    from public.profiles where company_id = cid and role = 'manager' and store_id is not null;

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
         coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me), coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(p->'payments', '[]'::jsonb))
    as x(id uuid, invoice_id uuid, amount numeric, method text, paid_at timestamptz, note text,
         created_by uuid, created_at timestamptz);

  insert into public.invoice_supply_updates (id, company_id, invoice_item_id, quantity, supplied_after, note, created_by, created_at)
  select x.id, cid, x.invoice_item_id, x.quantity, x.supplied_after, x.note,
         coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me), coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(p->'invoice_supply_updates', '[]'::jsonb))
    as x(id uuid, invoice_item_id uuid, quantity numeric, supplied_after numeric, note text,
         created_by uuid, created_at timestamptz);

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

  insert into public.sheet_rows (id, company_id, supply_id, customer, supply_ref, quantity, entered_by, created_at, client_id)
  select x.id, cid, x.supply_id, x.customer, x.supply_ref, x.quantity,
         coalesce((select pr.id from public.profiles pr where pr.id = x.entered_by and pr.company_id = cid), me),
         coalesce(x.created_at, now()), x.client_id
  from jsonb_to_recordset(coalesce(p->'sheet_rows', '[]'::jsonb))
    as x(id uuid, supply_id uuid, customer text, supply_ref text, quantity numeric, entered_by uuid,
         created_at timestamptz, client_id uuid);

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

alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.invoice_supply_updates enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_counters enable row level security;

drop policy if exists customers_admin_read on public.customers;
create policy customers_admin_read on public.customers for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));
drop policy if exists invoices_admin_read on public.invoices;
create policy invoices_admin_read on public.invoices for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));
drop policy if exists invoice_items_admin_read on public.invoice_items;
create policy invoice_items_admin_read on public.invoice_items for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));
drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));
drop policy if exists supply_updates_admin_read on public.invoice_supply_updates;
create policy supply_updates_admin_read on public.invoice_supply_updates for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));
drop policy if exists receipts_admin_read on public.receipts;
create policy receipts_admin_read on public.receipts for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));

revoke insert, update, delete on public.customers, public.invoices, public.invoice_items,
  public.payments, public.invoice_supply_updates, public.receipts, public.receipt_counters from authenticated;
grant select on public.customers, public.invoices, public.invoice_items, public.payments,
  public.invoice_supply_updates, public.receipts, public.invoice_summary to authenticated;
revoke execute on function public.issue_receipt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_sales_invoice(text, text, date, text, jsonb, numeric, text, text) to authenticated;
grant execute on function public.record_invoice_payment(uuid, numeric, text, timestamptz, text) to authenticated;
grant execute on function public.update_invoice_item_supply(uuid, numeric, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.customers, public.invoices, public.invoice_items,
    public.payments, public.invoice_supply_updates, public.receipts;
exception when duplicate_object then null;
end $$;

-- migration-021: admin bank deposits and deposit totals in finance reports.
-- Bank deposits are transfers into bank accounts, not new income or expenses.

create table if not exists public.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies(id) on delete cascade,
  bank_name text not null check (char_length(btrim(bank_name)) between 2 and 120),
  account_reference text check (account_reference is null or char_length(account_reference) <= 120),
  amount numeric(14,2) not null check (amount > 0 and amount < 'Infinity'::numeric),
  currency text not null default 'GMD' check (currency in ('GMD','XOF')),
  deposited_at timestamptz not null default now(),
  reference text check (reference is null or char_length(reference) <= 120),
  note text check (note is null or char_length(note) <= 500),
  client_id uuid not null default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  constraint bank_deposits_client_unique unique (company_id, client_id),
  constraint bank_deposits_void_fields check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and char_length(btrim(void_reason)) between 2 and 300)
  )
);

create index if not exists bank_deposits_company_date_idx on public.bank_deposits (company_id, deposited_at desc);
create index if not exists bank_deposits_bank_date_idx on public.bank_deposits (company_id, bank_name, deposited_at desc);

create or replace function public.record_bank_deposit(
  p_bank_name text,
  p_amount numeric,
  p_currency text,
  p_deposited_at timestamptz,
  p_account_reference text default null,
  p_reference text default null,
  p_note text default null,
  p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
  v_bank text;
  v_amount numeric;
  v_currency text;
  v_deposited_at timestamptz;
  v_account text;
  v_reference text;
  v_note text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can record bank deposits'; end if;
  if p_client_id is null then raise exception 'A bank deposit client ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':deposit-client:' || p_client_id::text, 0));
  select id into v_existing from public.bank_deposits where company_id = cid and client_id = p_client_id;
  if v_existing is not null then return v_existing; end if;

  v_bank := regexp_replace(btrim(coalesce(p_bank_name, '')), '\s+', ' ', 'g');
  if char_length(v_bank) < 2 or char_length(v_bank) > 120 then raise exception 'Enter a bank name between 2 and 120 characters'; end if;
  if p_amount is null or not (p_amount > 0 and p_amount < 'Infinity'::numeric) or p_amount <> round(p_amount, 2) then
    raise exception 'Deposit amount must be a finite positive amount with at most two decimal places';
  end if;
  v_amount := round(p_amount, 2);
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency not in ('GMD','XOF') then raise exception 'Choose GMD or XOF for the bank deposit'; end if;
  v_deposited_at := coalesce(p_deposited_at, now());
  v_account := nullif(btrim(coalesce(p_account_reference, '')), '');
  v_reference := nullif(btrim(coalesce(p_reference, '')), '');
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(coalesce(v_account, '')) > 120 then raise exception 'The bank account reference can have at most 120 characters'; end if;
  if char_length(coalesce(v_reference, '')) > 120 then raise exception 'The deposit reference can have at most 120 characters'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'The deposit note can have at most 500 characters'; end if;

  insert into public.bank_deposits (
    company_id, bank_name, account_reference, amount, currency, deposited_at,
    reference, note, client_id, created_by
  ) values (
    cid, v_bank, v_account, v_amount, v_currency, v_deposited_at,
    v_reference, v_note, p_client_id, me
  ) returning id into v_id;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Recorded bank deposit of ' || v_amount || ' ' || v_currency || ' to ' || v_bank);
  return v_id;
end $$;

create or replace function public.void_bank_deposit(p_deposit uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_row public.bank_deposits%rowtype;
  v_reason text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can void bank deposits'; end if;
  v_reason := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  if char_length(v_reason) < 2 or char_length(v_reason) > 300 then raise exception 'Enter a void reason between 2 and 300 characters'; end if;
  select * into v_row from public.bank_deposits where id = p_deposit and company_id = cid for update;
  if not found then raise exception 'Bank deposit not found'; end if;
  if v_row.voided_at is not null then raise exception 'This bank deposit is already voided'; end if;
  update public.bank_deposits set voided_at = now(), voided_by = me, void_reason = v_reason where id = p_deposit;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Voided bank deposit of ' || v_row.amount || ' ' || v_row.currency || ' to ' || v_row.bank_name || ': ' || v_reason);
end $$;

create or replace function public.get_finance_summary(p_from timestamptz, p_until timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  v_result jsonb;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can view finance totals'; end if;
  if p_from is null or p_until is null or p_until <= p_from then raise exception 'Choose a valid finance date range'; end if;

  with currencies(currency) as (values ('GMD'),('XOF')),
  received as (
    select i.currency, coalesce(sum(p.amount), 0) as amount, count(*)::bigint as count
    from public.payments p join public.invoices i on i.id = p.invoice_id and i.company_id = p.company_id
    where p.company_id = cid and p.paid_at >= p_from and p.paid_at < p_until
    group by i.currency
  ),
  salaries as (
    select currency, coalesce(sum(amount), 0) as amount, count(*)::bigint as count
    from public.salary_payments
    where company_id = cid and voided_at is null and paid_at >= p_from and paid_at < p_until
    group by currency
  ),
  expenses as (
    select currency, coalesce(sum(amount), 0) as amount, count(*)::bigint as count
    from public.misc_expenses
    where company_id = cid and voided_at is null and paid_at >= p_from and paid_at < p_until
    group by currency
  ),
  deposits as (
    select currency, coalesce(sum(amount), 0) as amount, count(*)::bigint as count
    from public.bank_deposits
    where company_id = cid and voided_at is null and deposited_at >= p_from and deposited_at < p_until
    group by currency
  ),
  category_totals as (
    select e.category, e.currency, coalesce(sum(e.amount), 0) as amount
    from public.misc_expenses e
    where e.company_id = cid and e.voided_at is null
      and e.paid_at >= p_from and e.paid_at < p_until
    group by e.category, e.currency
  ),
  days as (
    select generate_series(date_trunc('day', p_from), date_trunc('day', p_until - interval '1 microsecond'), interval '1 day')::date as day
  ),
  events as (
    select date_trunc('day', p.paid_at)::date as day, i.currency, 'received' as kind, p.amount
    from public.payments p join public.invoices i on i.id = p.invoice_id and i.company_id = p.company_id
    where p.company_id = cid and p.paid_at >= p_from and p.paid_at < p_until
    union all
    select date_trunc('day', paid_at)::date, currency, 'salary', amount
    from public.salary_payments
    where company_id = cid and voided_at is null and paid_at >= p_from and paid_at < p_until
    union all
    select date_trunc('day', paid_at)::date, currency, 'expense', amount
    from public.misc_expenses
    where company_id = cid and voided_at is null and paid_at >= p_from and paid_at < p_until
    union all
    select date_trunc('day', deposited_at)::date, currency, 'deposit', amount
    from public.bank_deposits
    where company_id = cid and voided_at is null and deposited_at >= p_from and deposited_at < p_until
  ),
  daily as (
    select d.day, c.currency,
      coalesce(sum(e.amount) filter (where e.kind = 'received'), 0) as received,
      coalesce(sum(e.amount) filter (where e.kind = 'salary'), 0) as salaries,
      coalesce(sum(e.amount) filter (where e.kind = 'expense'), 0) as expenses,
      coalesce(sum(e.amount) filter (where e.kind = 'deposit'), 0) as deposits
    from days d cross join currencies c
    left join events e on e.day = d.day and e.currency = c.currency
    group by d.day, c.currency
  )
  select jsonb_build_object(
    'from', p_from,
    'until', p_until,
    'currencies', coalesce((
      select jsonb_object_agg(c.currency, jsonb_build_object(
        'received', coalesce(r.amount, 0),
        'receivedCount', coalesce(r.count, 0),
        'salaries', coalesce(s.amount, 0),
        'salaryCount', coalesce(s.count, 0),
        'expenses', coalesce(e.amount, 0),
        'expenseCount', coalesce(e.count, 0),
        'deposits', coalesce(d.amount, 0),
        'depositCount', coalesce(d.count, 0),
        'totalOutgoing', coalesce(s.amount, 0) + coalesce(e.amount, 0),
        'netCashFlow', coalesce(r.amount, 0) - coalesce(s.amount, 0) - coalesce(e.amount, 0)
      ))
      from currencies c
      left join received r on r.currency = c.currency
      left join salaries s on s.currency = c.currency
      left join expenses e on e.currency = c.currency
      left join deposits d on d.currency = c.currency
    ), '{}'::jsonb),
    'expenseCategories', coalesce((
      select jsonb_agg(jsonb_build_object('category', x.category, 'currency', x.currency, 'amount', x.amount) order by x.category, x.currency)
      from category_totals x
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', x.day,
        'currency', x.currency,
        'received', x.received,
        'salaries', x.salaries,
        'expenses', x.expenses,
        'deposits', x.deposits,
        'netCashFlow', x.received - x.salaries - x.expenses
      ) order by x.day, x.currency)
      from daily x
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.reset_all_data(wipe_accounts boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid := public.my_company();
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can reset the data'; end if;
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

  insert into public.invoice_supply_updates (id, company_id, invoice_item_id, quantity, supplied_after, note, created_by, created_at)
    select x.id, cid, x.invoice_item_id, x.quantity, x.supplied_after, x.note,
           coalesce((select pr.id from public.profiles pr where pr.id = x.created_by and pr.company_id = cid), me),
           coalesce(x.created_at, now())
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

alter table public.bank_deposits enable row level security;
drop policy if exists bank_deposits_admin_read on public.bank_deposits;
create policy bank_deposits_admin_read on public.bank_deposits for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));

revoke insert, update, delete on public.bank_deposits from authenticated;
grant select on public.bank_deposits to authenticated;
revoke execute on function public.record_bank_deposit(text, numeric, text, timestamptz, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.void_bank_deposit(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_finance_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.record_bank_deposit(text, numeric, text, timestamptz, text, text, text, uuid) to authenticated;
grant execute on function public.void_bank_deposit(uuid, text) to authenticated;
grant execute on function public.get_finance_summary(timestamptz, timestamptz) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.bank_deposits;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

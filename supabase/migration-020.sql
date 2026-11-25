create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete set null,
  employee_name text not null check (char_length(btrim(employee_name)) between 2 and 120),
  pay_period date not null check (pay_period = date_trunc('month', pay_period)::date),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'GMD' check (currency in ('GMD','XOF')),
  paid_at timestamptz not null default now(),
  payment_method text not null check (payment_method in ('Cash','Wave','APS','NAFA')),
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 120),
  note text check (note is null or char_length(note) <= 500),
  client_id uuid not null default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  constraint salary_payments_client_unique unique (company_id, client_id),
  constraint salary_payments_void_fields check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and char_length(btrim(void_reason)) between 2 and 300)
  )
);

create table if not exists public.misc_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies(id) on delete cascade,
  category text not null check (category in ('rent','electricity','fuel','car_maintenance','other')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'GMD' check (currency in ('GMD','XOF')),
  paid_at timestamptz not null default now(),
  payee text check (payee is null or char_length(payee) <= 160),
  description text check (description is null or char_length(description) <= 500),
  payment_method text not null check (payment_method in ('Cash','Wave','APS','NAFA')),
  reference text check (reference is null or char_length(reference) <= 120),
  client_id uuid not null default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  constraint misc_expenses_client_unique unique (company_id, client_id),
  constraint misc_expenses_other_description check (category <> 'other' or char_length(btrim(coalesce(description, ''))) >= 2),
  constraint misc_expenses_void_fields check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and char_length(btrim(void_reason)) between 2 and 300)
  )
);

create index if not exists salary_payments_company_paid_idx on public.salary_payments (company_id, paid_at desc);
create index if not exists salary_payments_employee_period_idx on public.salary_payments (company_id, employee_id, pay_period desc);
create index if not exists misc_expenses_company_paid_idx on public.misc_expenses (company_id, paid_at desc);
create index if not exists misc_expenses_category_paid_idx on public.misc_expenses (company_id, category, paid_at desc);

create or replace function public.record_salary_payment(
  p_employee_id uuid,
  p_employee_name text,
  p_pay_period date,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_payment_method text,
  p_payment_reference text default null,
  p_note text default null,
  p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
  v_name text;
  v_period date;
  v_amount numeric;
  v_currency text;
  v_method text;
  v_paid_at timestamptz;
  v_reference text;
  v_note text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can record salary payments'; end if;
  if p_client_id is null then raise exception 'A salary payment client ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':salary-client:' || p_client_id::text, 0));
  select id into v_existing from public.salary_payments where company_id = cid and client_id = p_client_id;
  if v_existing is not null then return v_existing; end if;

  if p_employee_id is not null then
    select full_name into v_name from public.profiles where id = p_employee_id and company_id = cid;
    if not found then raise exception 'The selected employee does not belong to this company'; end if;
  else
    v_name := regexp_replace(btrim(coalesce(p_employee_name, '')), '\s+', ' ', 'g');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Enter an employee name between 2 and 120 characters'; end if;
  if p_pay_period is null then raise exception 'Choose a salary pay period'; end if;
  v_period := date_trunc('month', p_pay_period)::date;
  if p_amount is null or not (p_amount > 0 and p_amount < 'Infinity'::numeric) or p_amount <> round(p_amount, 2) then
    raise exception 'Salary amount must be a finite positive amount with at most two decimal places';
  end if;
  v_amount := round(p_amount, 2);
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency not in ('GMD','XOF') then raise exception 'Choose GMD or XOF for the salary payment'; end if;
  v_method := coalesce(p_payment_method, '');
  if v_method not in ('Cash','Wave','APS','NAFA') then raise exception 'Choose a valid salary payment method'; end if;
  v_paid_at := coalesce(p_paid_at, now());
  v_reference := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(coalesce(v_reference, '')) > 120 then raise exception 'The payment reference can have at most 120 characters'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'The salary note can have at most 500 characters'; end if;

  insert into public.salary_payments (company_id, employee_id, employee_name, pay_period, amount, currency, paid_at, payment_method, payment_reference, note, client_id, created_by)
    values (cid, p_employee_id, v_name, v_period, v_amount, v_currency, v_paid_at, v_method, v_reference, v_note, p_client_id, me)
    returning id into v_id;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Recorded salary of ' || v_amount || ' ' || v_currency || ' for ' || v_name || ' (' || to_char(v_period, 'Mon YYYY') || ')');
  return v_id;
end $$;

create or replace function public.void_salary_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_row public.salary_payments%rowtype;
  v_reason text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can void salary payments'; end if;
  v_reason := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  if char_length(v_reason) < 2 or char_length(v_reason) > 300 then raise exception 'Enter a void reason between 2 and 300 characters'; end if;
  select * into v_row from public.salary_payments where id = p_payment and company_id = cid for update;
  if not found then raise exception 'Salary payment not found'; end if;
  if v_row.voided_at is not null then raise exception 'This salary payment is already voided'; end if;
  update public.salary_payments set voided_at = now(), voided_by = me, void_reason = v_reason where id = p_payment;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Voided salary of ' || v_row.amount || ' ' || v_row.currency || ' for ' || v_row.employee_name || ': ' || v_reason);
end $$;

create or replace function public.record_misc_expense(
  p_category text,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_payment_method text,
  p_payee text default null,
  p_description text default null,
  p_reference text default null,
  p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
  v_category text;
  v_amount numeric;
  v_currency text;
  v_method text;
  v_paid_at timestamptz;
  v_payee text;
  v_description text;
  v_reference text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can record expenses'; end if;
  if p_client_id is null then raise exception 'An expense client ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':expense-client:' || p_client_id::text, 0));
  select id into v_existing from public.misc_expenses where company_id = cid and client_id = p_client_id;
  if v_existing is not null then return v_existing; end if;

  v_category := lower(btrim(coalesce(p_category, '')));
  if v_category not in ('rent','electricity','fuel','car_maintenance','other') then raise exception 'Choose a valid expense category'; end if;
  if p_amount is null or not (p_amount > 0 and p_amount < 'Infinity'::numeric) or p_amount <> round(p_amount, 2) then
    raise exception 'Expense amount must be a finite positive amount with at most two decimal places';
  end if;
  v_amount := round(p_amount, 2);
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency not in ('GMD','XOF') then raise exception 'Choose GMD or XOF for the expense'; end if;
  v_method := coalesce(p_payment_method, '');
  if v_method not in ('Cash','Wave','APS','NAFA') then raise exception 'Choose a valid expense payment method'; end if;
  v_paid_at := coalesce(p_paid_at, now());
  v_payee := nullif(btrim(coalesce(p_payee, '')), '');
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  v_reference := nullif(btrim(coalesce(p_reference, '')), '');
  if char_length(coalesce(v_payee, '')) > 160 then raise exception 'The payee can have at most 160 characters'; end if;
  if char_length(coalesce(v_description, '')) > 500 then raise exception 'The description can have at most 500 characters'; end if;
  if v_category = 'other' and char_length(coalesce(v_description, '')) < 2 then raise exception 'Describe the other expense before saving'; end if;
  if char_length(coalesce(v_reference, '')) > 120 then raise exception 'The reference can have at most 120 characters'; end if;

  insert into public.misc_expenses (company_id, category, amount, currency, paid_at, payee, description, payment_method, reference, client_id, created_by)
    values (cid, v_category, v_amount, v_currency, v_paid_at, v_payee, v_description, v_method, v_reference, p_client_id, me)
    returning id into v_id;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Recorded ' || v_category || ' expense of ' || v_amount || ' ' || v_currency || coalesce(' for ' || v_payee, ''));
  return v_id;
end $$;

create or replace function public.void_misc_expense(p_expense uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_row public.misc_expenses%rowtype;
  v_reason text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can void expenses'; end if;
  v_reason := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  if char_length(v_reason) < 2 or char_length(v_reason) > 300 then raise exception 'Enter a void reason between 2 and 300 characters'; end if;
  select * into v_row from public.misc_expenses where id = p_expense and company_id = cid for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_row.voided_at is not null then raise exception 'This expense is already voided'; end if;
  update public.misc_expenses set voided_at = now(), voided_by = me, void_reason = v_reason where id = p_expense;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Voided ' || v_row.category || ' expense of ' || v_row.amount || ' ' || v_row.currency || ': ' || v_reason);
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
  category_totals as (
    select e.category, c.currency, coalesce(sum(e.amount), 0) as amount
    from public.misc_expenses e cross join currencies c
    where e.company_id = cid and e.voided_at is null and e.currency = c.currency
      and e.paid_at >= p_from and e.paid_at < p_until
    group by e.category, c.currency
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
  ),
  daily as (
    select d.day, c.currency,
      coalesce(sum(e.amount) filter (where e.kind = 'received'), 0) as received,
      coalesce(sum(e.amount) filter (where e.kind = 'salary'), 0) as salaries,
      coalesce(sum(e.amount) filter (where e.kind = 'expense'), 0) as expenses
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
        'totalOutgoing', coalesce(s.amount, 0) + coalesce(e.amount, 0),
        'netCashFlow', coalesce(r.amount, 0) - coalesce(s.amount, 0) - coalesce(e.amount, 0)
      ))
      from currencies c
      left join received r on r.currency = c.currency
      left join salaries s on s.currency = c.currency
      left join expenses e on e.currency = c.currency
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

alter table public.salary_payments enable row level security;
alter table public.misc_expenses enable row level security;
drop policy if exists salary_payments_admin_read on public.salary_payments;
create policy salary_payments_admin_read on public.salary_payments for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));
drop policy if exists misc_expenses_admin_read on public.misc_expenses;
create policy misc_expenses_admin_read on public.misc_expenses for select to authenticated
  using ((select public.is_admin()) and company_id = (select public.my_company()));

revoke insert, update, delete on public.salary_payments, public.misc_expenses from authenticated;
grant select on public.salary_payments, public.misc_expenses to authenticated;
revoke execute on function public.record_salary_payment(uuid, text, date, numeric, text, timestamptz, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.void_salary_payment(uuid, text) from public, anon, authenticated;
revoke execute on function public.record_misc_expense(text, numeric, text, timestamptz, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.void_misc_expense(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_finance_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.record_salary_payment(uuid, text, date, numeric, text, timestamptz, text, text, text, uuid) to authenticated;
grant execute on function public.void_salary_payment(uuid, text) to authenticated;
grant execute on function public.record_misc_expense(text, numeric, text, timestamptz, text, text, text, text, uuid) to authenticated;
grant execute on function public.void_misc_expense(uuid, text) to authenticated;
grant execute on function public.get_finance_summary(timestamptz, timestamptz) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.salary_payments, public.misc_expenses;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

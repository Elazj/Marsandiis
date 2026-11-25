-- migration-023: cumulative cash-in-vault totals and editable payroll batches.

alter table public.salary_payments
  add column if not exists employee_count integer not null default 1
  check (employee_count between 1 and 100000);

create index if not exists salary_payments_company_active_date_idx
  on public.salary_payments (company_id, paid_at desc) where voided_at is null;

create or replace function public.record_payroll_batch(
  p_pay_period date,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_payment_method text,
  p_employee_count integer,
  p_payment_reference text default null,
  p_note text default null,
  p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
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

  if p_pay_period is null then raise exception 'Choose a salary pay period'; end if;
  v_period := date_trunc('month', p_pay_period)::date;
  if p_amount is null or not (p_amount > 0 and p_amount < 'Infinity'::numeric) or p_amount <> round(p_amount, 2) then
    raise exception 'Salary total must be a finite positive amount with at most two decimal places';
  end if;
  v_amount := round(p_amount, 2);
  if p_employee_count is null or p_employee_count not between 1 and 100000 then
    raise exception 'Enter the number of employees paid, between 1 and 100000';
  end if;
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency not in ('GMD','XOF') then raise exception 'Choose GMD or XOF for the salary payment'; end if;
  v_method := coalesce(p_payment_method, '');
  if v_method not in ('Cash','Wave','APS','NAFA') then raise exception 'Choose a valid salary payment method'; end if;
  v_paid_at := coalesce(p_paid_at, now());
  v_reference := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(coalesce(v_reference, '')) > 120 then raise exception 'The payment reference can have at most 120 characters'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'The salary note can have at most 500 characters'; end if;

  insert into public.salary_payments (
    company_id, employee_id, employee_name, employee_count, pay_period, amount,
    currency, paid_at, payment_method, payment_reference, note, client_id, created_by
  ) values (
    cid, null, 'Payroll batch', p_employee_count, v_period, v_amount,
    v_currency, v_paid_at, v_method, v_reference, v_note, p_client_id, me
  ) returning id into v_id;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Recorded salary total of ' || v_amount || ' ' || v_currency || ' for ' || p_employee_count || ' employees (' || to_char(v_period, 'Mon YYYY') || ')');
  return v_id;
end $$;

create or replace function public.edit_salary_payment(
  p_payment uuid,
  p_pay_period date,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_payment_method text,
  p_employee_count integer,
  p_payment_reference text default null,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_row public.salary_payments%rowtype;
  v_period date;
  v_amount numeric;
  v_currency text;
  v_method text;
  v_paid_at timestamptz;
  v_reference text;
  v_note text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can edit salary payments'; end if;
  select * into v_row from public.salary_payments where id = p_payment and company_id = cid for update;
  if not found then raise exception 'Salary payment not found'; end if;
  if v_row.voided_at is not null then raise exception 'A voided salary payment cannot be edited'; end if;
  if p_pay_period is null then raise exception 'Choose a salary pay period'; end if;
  v_period := date_trunc('month', p_pay_period)::date;
  if p_amount is null or not (p_amount > 0 and p_amount < 'Infinity'::numeric) or p_amount <> round(p_amount, 2) then
    raise exception 'Salary total must be a finite positive amount with at most two decimal places';
  end if;
  v_amount := round(p_amount, 2);
  if p_employee_count is null or p_employee_count not between 1 and 100000 then
    raise exception 'Enter the number of employees paid, between 1 and 100000';
  end if;
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency not in ('GMD','XOF') then raise exception 'Choose GMD or XOF for the salary payment'; end if;
  v_method := coalesce(p_payment_method, '');
  if v_method not in ('Cash','Wave','APS','NAFA') then raise exception 'Choose a valid salary payment method'; end if;
  v_paid_at := coalesce(p_paid_at, now());
  v_reference := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(coalesce(v_reference, '')) > 120 then raise exception 'The payment reference can have at most 120 characters'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'The salary note can have at most 500 characters'; end if;

  update public.salary_payments set
    employee_count = p_employee_count,
    pay_period = v_period,
    amount = v_amount,
    currency = v_currency,
    paid_at = v_paid_at,
    payment_method = v_method,
    payment_reference = v_reference,
    note = v_note
  where id = p_payment and company_id = cid and voided_at is null;
  if not found then raise exception 'Salary payment is no longer available for editing'; end if;
  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Edited salary payment: ' || v_amount || ' ' || v_currency || ' for ' || p_employee_count || ' employees (' || to_char(v_period, 'Mon YYYY') || ')');
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
    select currency, coalesce(sum(amount), 0) as amount, count(*)::bigint as count,
      coalesce(sum(employee_count), 0)::bigint as employee_count
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
  all_received as (
    select i.currency, coalesce(sum(p.amount), 0) as amount
    from public.payments p join public.invoices i on i.id = p.invoice_id and i.company_id = p.company_id
    where p.company_id = cid and p.paid_at < p_until
    group by i.currency
  ),
  all_salaries as (
    select currency, coalesce(sum(amount), 0) as amount
    from public.salary_payments
    where company_id = cid and voided_at is null and paid_at < p_until
    group by currency
  ),
  all_expenses as (
    select currency, coalesce(sum(amount), 0) as amount
    from public.misc_expenses
    where company_id = cid and voided_at is null and paid_at < p_until
    group by currency
  ),
  all_deposits as (
    select currency, coalesce(sum(amount), 0) as amount
    from public.bank_deposits
    where company_id = cid and voided_at is null and deposited_at < p_until
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
        'employeeCount', coalesce(s.employee_count, 0),
        'expenses', coalesce(e.amount, 0),
        'expenseCount', coalesce(e.count, 0),
        'deposits', coalesce(d.amount, 0),
        'depositCount', coalesce(d.count, 0),
        'totalOutgoing', coalesce(s.amount, 0) + coalesce(e.amount, 0),
        'netCashFlow', coalesce(r.amount, 0) - coalesce(s.amount, 0) - coalesce(e.amount, 0),
        'vaultOutgoing', coalesce(s.amount, 0) + coalesce(e.amount, 0) + coalesce(d.amount, 0),
        'receivedThroughEnd', coalesce(ar.amount, 0),
        'deductionsThroughEnd', coalesce(asl.amount, 0) + coalesce(ae.amount, 0) + coalesce(ad.amount, 0),
        'cashInVault', coalesce(ar.amount, 0) - coalesce(asl.amount, 0) - coalesce(ae.amount, 0) - coalesce(ad.amount, 0)
      ))
      from currencies c
      left join received r on r.currency = c.currency
      left join salaries s on s.currency = c.currency
      left join expenses e on e.currency = c.currency
      left join deposits d on d.currency = c.currency
      left join all_received ar on ar.currency = c.currency
      left join all_salaries asl on asl.currency = c.currency
      left join all_expenses ae on ae.currency = c.currency
      left join all_deposits ad on ad.currency = c.currency
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

do $$
begin
  if to_regprocedure('public.restore_company_backup_legacy(jsonb)') is null then
    alter function public.restore_company_backup(jsonb) rename to restore_company_backup_legacy;
  end if;
end $$;

create or replace function public.restore_company_backup(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can restore a backup'; end if;
  if coalesce(p->>'format', '') <> 'stockroom-backup-1' then raise exception 'This file is not a Marsandiis backup'; end if;
  perform public.restore_company_backup_legacy(p);
  update public.salary_payments s set employee_count = coalesce(nullif(x->>'employee_count', '')::integer, 1)
  from jsonb_array_elements(coalesce(p->'salary_payments', '[]'::jsonb)) as x
  where s.id = (x->>'id')::uuid and s.company_id = cid;
end $$;

revoke insert, update, delete on public.salary_payments from authenticated;
grant select on public.salary_payments to authenticated;
revoke execute on function public.record_payroll_batch(date, numeric, text, timestamptz, text, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.edit_salary_payment(uuid, date, numeric, text, timestamptz, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.get_finance_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.restore_company_backup(jsonb) from public, anon, authenticated;
revoke execute on function public.restore_company_backup_legacy(jsonb) from public, anon, authenticated;
grant execute on function public.restore_company_backup(jsonb) to authenticated;
grant execute on function public.record_payroll_batch(date, numeric, text, timestamptz, text, integer, text, text, uuid) to authenticated;
grant execute on function public.edit_salary_payment(uuid, date, numeric, text, timestamptz, text, integer, text, text) to authenticated;
grant execute on function public.get_finance_summary(timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';

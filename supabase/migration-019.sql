-- migration-019: invoice corrections/deletion and custom receipt branding.
-- Run ONCE in the Supabase SQL editor after migration-018.sql. Safe to run again.

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
      'name', v_company.name,
      'logo', case
        when v_company.settings->>'receiptLogoMode' = 'logo'
          and v_company.settings->>'receiptLogo' like 'data:image/jpeg;base64,%'
        then v_company.settings->>'receiptLogo' else null end,
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

create or replace function public.update_sales_invoice(
  p_invoice uuid,
  p_invoice_no text,
  p_customer_name text,
  p_invoice_date date,
  p_items jsonb,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_customer_name text;
  v_customer uuid;
  v_no text;
  v_item jsonb;
  v_row public.invoice_items%rowtype;
  v_item_id uuid;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_total numeric;
  v_paid numeric;
  v_products uuid[] := '{}'::uuid[];
  v_item_ids uuid[] := '{}'::uuid[];
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can edit invoices'; end if;
  select * into v_invoice from public.invoices where id = p_invoice and company_id = cid for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the invoice';
  end if;
  if p_invoice_date is null then raise exception 'Enter an invoice date'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'The invoice note can have at most 500 characters'; end if;

  v_no := upper(regexp_replace(btrim(coalesce(p_invoice_no, '')), '\s+', ' ', 'g'));
  if char_length(v_no) < 2 or char_length(v_no) > 40 then raise exception 'Enter an invoice number between 2 and 40 characters'; end if;
  v_customer_name := regexp_replace(btrim(coalesce(p_customer_name, '')), '\s+', ' ', 'g');
  if char_length(v_customer_name) < 2 or char_length(v_customer_name) > 120 then raise exception 'Enter a customer name between 2 and 120 characters'; end if;

  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':invoice:' || lower(v_no), 0));
  if exists (select 1 from public.invoices where company_id = cid and lower(btrim(invoice_no)) = lower(v_no) and id <> p_invoice) then
    raise exception 'That invoice number is already in use';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(cid::text || ':customer:' || lower(v_customer_name), 0));
  select id into v_customer from public.customers
    where company_id = cid and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(v_customer_name);
  if v_customer is null then
    insert into public.customers (company_id, name) values (cid, v_customer_name) returning id into v_customer;
  end if;

  for v_row in select * from public.invoice_items where invoice_id = p_invoice for update loop
    if not exists (
      select 1 from jsonb_array_elements(p_items) x
      where nullif(x->>'id', '')::uuid = v_row.id
    ) then
      if v_row.quantity_supplied > 0 then
        raise exception 'A product with recorded supply cannot be removed from the invoice';
      end if;
      delete from public.invoice_items where id = v_row.id;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_id := nullif(v_item->>'id', '')::uuid;
    v_product_id := (nullif(v_item->>'product_id', ''))::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    if v_product_id is null or not exists (select 1 from public.products where id = v_product_id and company_id = cid) then
      raise exception 'One of the selected products does not belong to this company';
    end if;
    if v_product_id = any(v_products) then raise exception 'A product can appear only once on an invoice'; end if;
    if v_item_id is not null and v_item_id = any(v_item_ids) then raise exception 'An invoice line can appear only once'; end if;
    v_products := array_append(v_products, v_product_id);
    if v_item_id is not null then v_item_ids := array_append(v_item_ids, v_item_id); end if;
    if v_qty is null or not (v_qty > 0 and v_qty < 'Infinity'::numeric) then
      raise exception 'Every product needs a finite quantity above zero';
    end if;

    if v_item_id is null then
      v_price := coalesce((nullif(v_item->>'unit_price_gmd', ''))::numeric,
        (select default_unit_price_gmd from public.products where id = v_product_id and company_id = cid));
      if v_price is null or not (v_price >= 0 and v_price < 'Infinity'::numeric) then
        raise exception 'Every product needs a finite unit price';
      end if;
      insert into public.invoice_items (company_id, invoice_id, product_id, quantity_sold, unit_price_gmd)
        values (cid, p_invoice, v_product_id, v_qty, v_price);
    else
      select * into v_row from public.invoice_items where id = v_item_id and invoice_id = p_invoice and company_id = cid for update;
      if not found then raise exception 'One of the invoice lines does not belong to this invoice'; end if;
      if v_row.product_id <> v_product_id and v_row.quantity_supplied > 0 then
        raise exception 'A supplied product cannot be changed to a different product';
      end if;
      if v_qty < v_row.quantity_supplied then raise exception 'Quantity sold cannot be less than quantity already supplied'; end if;
      v_price := coalesce(nullif(v_item->>'unit_price_gmd', '')::numeric, v_row.unit_price_gmd);
      if v_price is null or not (v_price >= 0 and v_price < 'Infinity'::numeric) then
        raise exception 'Every product needs a finite unit price';
      end if;
      update public.invoice_items
        set product_id = v_product_id, quantity_sold = v_qty, unit_price_gmd = v_price
        where id = v_item_id;
    end if;
  end loop;

  select coalesce(sum(total_gmd), 0) into v_total from public.invoice_items where invoice_id = p_invoice;
  v_total := v_total * case when v_invoice.currency = 'XOF' then v_invoice.exchange_rate else 1 end;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = p_invoice;
  if v_paid > v_total then raise exception 'The edited invoice total cannot be less than the amount already paid'; end if;

  update public.invoices
    set invoice_no = v_no, customer_id = v_customer, invoice_date = p_invoice_date,
        note = nullif(btrim(p_note), '')
    where id = p_invoice;

  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Edited invoice ' || v_no || ' for ' || v_customer_name || ' (' || v_invoice.currency || ')');
end $$;

create or replace function public.delete_sales_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.my_company();
  me uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_customer text;
begin
  if not public.is_admin() or cid is null then raise exception 'Only an admin can delete invoices'; end if;
  select * into v_invoice from public.invoices where id = p_invoice and company_id = cid for update;
  if not found then raise exception 'Invoice not found'; end if;
  select name into v_customer from public.customers where id = v_invoice.customer_id and company_id = cid;

  delete from public.receipts where invoice_id = p_invoice;
  delete from public.payments where invoice_id = p_invoice;
  delete from public.invoice_supply_updates where invoice_item_id in (
    select id from public.invoice_items where invoice_id = p_invoice
  );
  delete from public.invoice_items where invoice_id = p_invoice;
  delete from public.invoices where id = p_invoice;

  insert into public.activity_log (company_id, actor, message)
    values (cid, me, 'Deleted invoice ' || v_invoice.invoice_no || ' for ' || coalesce(v_customer, 'customer'));
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
    if jsonb_typeof(p_settings) <> 'object' then raise exception 'Invalid company settings'; end if;
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
    if p_settings ? 'receiptLogoMode' and p_settings->>'receiptLogoMode' not in ('logo','name') then
      raise exception 'Choose a company logo or company name only on receipts';
    end if;
    if p_settings ? 'receiptLogo' then
      if coalesce(p_settings->>'receiptLogo', '') <> ''
        and (p_settings->>'receiptLogo' not like 'data:image/jpeg;base64,%'
          or char_length(p_settings->>'receiptLogo') > 900000) then
        raise exception 'The receipt logo must be a prepared JPEG image no larger than 675 KB';
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

revoke execute on function public.issue_receipt(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.update_sales_invoice(uuid, text, text, date, jsonb, text) from public, anon;
revoke execute on function public.delete_sales_invoice(uuid) from public, anon;
grant execute on function public.update_sales_invoice(uuid, text, text, date, jsonb, text) to authenticated;
grant execute on function public.delete_sales_invoice(uuid) to authenticated;

notify pgrst, 'reload schema';

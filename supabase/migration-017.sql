-- migration-017: barcodes on products, for scan-verified stock-out at the store.
-- Run in the Supabase SQL editor after migration-016.sql. Safe to run again.

alter table public.products add column if not exists barcode text;

alter table public.products drop constraint if exists products_barcode_len;
alter table public.products add constraint products_barcode_len
  check (barcode is null or char_length(barcode) between 3 and 64);

-- One barcode identifies one product within a company.
create unique index if not exists products_barcode_unique
  on public.products (company_id, barcode) where barcode is not null;
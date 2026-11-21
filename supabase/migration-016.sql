-- migration-016: allow managers to undo their own supply records.
-- Run in the Supabase SQL editor after migration-015.sql. Safe to run again.

drop policy if exists rows_delete_own on public.sheet_rows;
create policy rows_delete_own on public.sheet_rows
  for delete to authenticated
  using (
    entered_by = auth.uid()
    and company_id = (select public.my_company())
    and exists (
      select 1 from public.supplies s
      where s.id = supply_id and s.store_id = (select public.my_store())
    )
  );

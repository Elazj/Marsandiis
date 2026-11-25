# Marsandiis: Next.js + Supabase

Multi-store, multi-company stock management, styled with Tailwind CSS v4. Admin and store manager roles, email sign-up with confirmation, Google sign-in,
live dashboards with Recharts, customer supply sheets with CSV download, gifts, reports, settings, dark/light theme.
Many companies can use one deployment: each company has one admin and its own separate data.

## Set up (new Supabase project)
1. Create a project at supabase.com.
2. SQL editor: paste all of `supabase/schema.sql` and run it, then run `migration-017.sql` through `migration-024.sql` in new query tabs, in order.
   Already ran an older schema? Run `migration-002.sql` through `migration-024.sql` (each once, only if not yet run, in that order) in new query tabs.
   `migration-007.sql` adds companies, per-company data separation, "date arrived" and gifts. Your existing data moves into one company called "My company"
   (rename it with the one-line `update` shown at the top of that file). Do not run `migration-002`, `003` or `004` again after 007.
   `migration-008.sql` fixes recursive row-security checks when adding a product to a store.
   `migration-009.sql` repairs existing manager profiles that are missing their company link.
   `migration-011.sql` adds the settings functions, including the admin-only company-name edit in General Settings. Run it on existing databases before using those settings.
   If `migration-011.sql` was already run before company-name editing was available, run `migration-012.sql` to install or refresh that function.
   `migration-013.sql` adds profile pictures, per-user Storage permissions, and keeps profile emails in sync after confirmed auth email changes.
   `migration-014.sql` enables cache-safe profile picture replacements. Run it on existing databases before changing a profile picture.
   `migration-015.sql` lets a store reuse an invoice/sales number only with the same customer name.
   `migration-016.sql` lets managers undo their own supply records.
   `migration-017.sql` adds product barcodes; `migration-018.sql` adds sales, invoices, payments, supply tracking and receipts; `migration-019.sql` adds invoice corrections/deletion and custom receipt branding; `migration-020.sql` adds salary payments, miscellaneous expenses and dashboard cash-flow totals; `migration-021.sql` adds bank-deposit history and deposit totals without treating transfers as income or expenses; `migration-022.sql` links manager supplies to admin-created sales/invoice items, enforces server-side stock and invoice limits, and adds atomic undo/reversal history; `migration-023.sql` adds cumulative cash-in-vault totals and editable payroll batches with employee counts; `migration-024.sql` reserves product stock on invoice creation and prevents sales, gifts or losses from exceeding product totals.
   Every admin tab shows "permission denied"? Run `repair.sql` once, then reload. (On an older database run `repair.sql` first, then `migration-007.sql`.)
3. Authentication > Providers: keep **Email** on and turn on **Confirm email**. Optional: turn on **Google**.
4. Authentication > Policies: minimum password length 8, require lower case, upper case, digits and symbols.
5. Authentication > URL configuration: set the Site URL and add redirect URLs
   `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback`.
6. Copy `.env.example` to `.env.local` and add the project URL and anon (publishable) key. No quotes, no spaces.
   For the admin **Team** page also add `SUPABASE_SERVICE_ROLE_KEY` (Project Settings > API Keys > service_role, or the secret key). It is SERVER ONLY: never put NEXT_PUBLIC in front of it, never commit it, and add it in Vercel too.
7. `npm install` then `npm run dev` and open http://localhost:3000.

## Styling (Tailwind CSS v4)
- Tailwind is set up through `postcss.config.mjs` and `app/globals.css` (`@import "tailwindcss"`).
- Colors are theme variables in `globals.css` (`bg-panel`, `text-mute`, `border-line`, `bg-acc` ...). Dark and light mode only change those variables, so no `dark:` classes are needed.
- Shared class sets (buttons, panels, chips) live in `lib/tw.ts`. Plain HTML elements (form fields, labels, table cells, dialogs) get their base look in `globals.css`.
- Side bar breakpoint: below 1024px the menu becomes a side bar that opens and closes.

## Deploy to Vercel
Push to GitHub, import the repo in Vercel, add the same two environment variables (all environments),
deploy, then add your Vercel address to the Supabase redirect URLs. Redeploy after changing any variable.

## "Failed to fetch" on login or sign up
The browser cannot reach Supabase. The login page shows a red notice that says which of these it is:
- the Supabase project is paused (free projects pause after a week of no use): open the dashboard and Restore it
- `NEXT_PUBLIC_SUPABASE_URL` is wrong, or has quotes or spaces around it
- the key is wrong (copy the anon or publishable key again)
- an ad blocker or firewall blocks supabase.co
- the Vercel variables were changed but the site was not redeployed

## Using it
- Companies: signing up always creates an **admin** account and a **company**. The sign-up form asks for the company or business name, which must be unused
  (otherwise it shows "Account/company name already exists"; capital letters and extra spaces are ignored). A company has exactly one admin. The company name is shown
  on the admin and manager dashboards and in the side bar. Store managers cannot sign up themselves: the admin creates their accounts on the Team page, and they belong to the admin's company.
- Data separation: every store, product, supply, entry, gift, report and account belongs to one company, and the database (row level security) only lets people see their own company's data.
- Admins can update their sign-in email from Account & Profile (email confirmation may be required) and rename the company in Admin Settings > General. Every user can upload their own profile picture from Account & Profile.
  "Reset all data" in Settings clears only the admin's own company.
- Admin: Dashboard, Stores, Team (create manager accounts, set passwords, assign stores, disable or delete), Products (each product records its **date arrived**), Sales / Invoices, Finances (salary payments, rent, cash power, fuel, car maintenance, other expenses and bank deposits), Supplies, Forecast, Reports, Settings (profile, theme, password, sign out, reset all data).
- Finance: new salary records are payroll batches containing the total paid, number of employees, pay period, payment date, currency and method. Admins can edit any active salary record; voided records stay in history but cannot be edited and are excluded from totals. Older per-employee salary records and backups remain supported with an employee count of one. Bank deposits record the bank, optional account and deposit references, date, currency and note. **Cash in hand / vault** is all customer cash received through the selected end date minus all active salary payments, miscellaneous expenses and bank deposits, including older records. Selected-period operating cash flow stays separate: net cash flow excludes deposits because they are transfers, while vault deductions include them. GMD and XOF are always kept separate.
- Sales / invoices: use a sales number for a cash sale paid in full, or an invoice number when the customer will repay later. Payment and supply status are independent. Admins see supplied and pending quantities per product and for the whole invoice. The invoice form shows live stock available for each product and the quantity left after the proposed sale. Saving an invoice reserves its sold quantity immediately; editing or deleting it recalculates availability. A product cannot be sold once its total stock is committed, and gifts or damaged/missing losses also reduce saleable stock. Add more total stock by editing the product in Products.
- Store manager (up to 3 accounts per store): Dashboard, Daily entry (sheets with supplies, **gifts**, damaged or missing; CSV download, offline queue), Scan out, Forecast, Reports, Settings. Managers type the admin-created sales/invoice number manually; only an exact verified match can be recorded, and supplied/pending progress appears on the sheet and CSV.
- Gifts: a manager records gifted products on the sheet (who it was given to, quantity, optional note). A gift is taken off the stock left in the store, shows on the sheet, the CSV, the admin Supplies page and the dashboards, and counts as use in the forecast.
- Offline entry: a manager who already opened Daily entry while online can record supplies with no connection. They stay in the browser and sync in order when the network returns. Store stock and invoice-pending quantities are checked again before each sync. If another entry used the stock or invoice quantity, the bar asks the manager to record the remaining amount or discard; retries cannot insert the same supply twice. Run `supabase/migration-006.sql` and `migration-022.sql` once.
- Forecast: each product’s daily use (supplied + damaged + missing) is projected with a 7-day moving average and exponential smoothing. The Forecast page scores both on held-out days (MAE, RMSE, sMAPE) and suggests a reorder date 7 days before the predicted stock-out.
- Sign out and the theme toggle are inside Settings, at the bottom of the menu.

## Notes
- Anyone can sign up as the admin of a new company (that is how a company starts). To restrict this, change `handle_new_user()` in `schema.sql` / `migration-007.sql`.
- Manager accounts are linked to a store only by the server (the admin Team page uses `SUPABASE_SERVICE_ROLE_KEY`), so nobody can join another company's store from the browser.
- A person who signs in with Google and has no account from an admin sees a message asking them to get an account from their admin.
- Managers can undo their own supply records; undo restores store stock and subtracts the quantity from the linked invoice item. Admins can delete stores, products and supplies.

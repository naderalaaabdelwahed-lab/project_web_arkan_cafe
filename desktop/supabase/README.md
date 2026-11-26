# Egsoft Desktop database

## Runtime data layers
- Supabase is the shared cloud database (project `elbantrhzbpojhmwodbl`).
- SQLite is the desktop offline cache at `arkan-local.sqlite` in Electron's user-data directory. Do not rename this file; existing installations may contain live orders.
- The Express service binds to `127.0.0.1:4317`; renderer code must call this local API and must never contain a Supabase service-role key.

## Supabase schema foundation
The cloud project currently contains the existing POS tables plus additive feature tables:
- POS: `categories`, `products`, `restaurant_tables`, `orders`, `order_items`, `payments`
- Operations: `reservations`, `business_days`, `cash_transactions`, `audit_logs`, `printers`, `preparation_screens`, `preparation_screen_categories`
- Inventory: `inventory_units`, `inventory_suppliers`, `inventory_items`, `inventory_movements`, `inventory_recipes`, `inventory_recipe_items`, `inventory_purchases`, `inventory_purchase_items`
- HR: `hr_employees`, `hr_shifts`, `hr_employee_shift_assignments`, `hr_attendance`, `hr_leave_balances`, `hr_payroll_adjustments`, `hr_payroll_runs`, `hr_payroll_items`, `hr_kiosk_devices`, `hr_employee_face_profiles`

The additive feature foundation was applied directly to the connected Supabase project on 2026-11-26. The live schema was verified through Supabase database tools. The dashboard-applied migration SQL has not yet been reconstructed as a checked-in, replayable migration; do not treat this document as a migration script.

## Security / production gate
- RLS is enabled across the public tables.
- Face-profile biometric data is service-role-only; do not grant renderer access.
- Staff roles, login, scoped RLS policies, and audit attribution must be completed before production. Broad authenticated policies are temporary scaffolding and are not an acceptable production authorization model.
- Never commit Supabase secret/service-role keys. Configure secrets only on the trusted local server or future internal server.

## Current desktop implementation
The admin workspace currently supports local dashboard summaries, menu category CRUD, product CRUD, and local sales listing. Other cloud feature tables are schema foundations; their full desktop workflows and offline synchronization are not yet complete.
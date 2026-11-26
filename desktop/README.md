# ARKAN POS Desktop

Windows desktop foundation for the offline-first ARKAN restaurant POS.

## Requirements

- Windows 10 or Windows 11, 64-bit
- Node.js 20.19+ (Node.js 22 LTS recommended)
- npm

## Run locally

From this directory:

```powershell
npm install
npm start
```

Create a Windows installer:

```powershell
npm run dist
```

The app starts an embedded local Express service on `127.0.0.1:4317` and stores its SQLite database under Electron's per-user application data directory.

## Current desktop modules

- Electron desktop shell with context isolation and Node integration disabled
- Local Express API and Socket.IO event server
- SQLite database and initial local schema
- Redesigned Arabic cashier screen inspired by the existing ARKAN POS layout: category chips, searchable product cards, order cart, dine-in/takeaway/delivery, customer fields and payment method
- First-run demo menu with TEST-labelled pastries, pasta, main dishes and drinks; these are sample-only prices and are replaced by a later menu import
- Local order creation in a single SQLite transaction
- Retryable order outbox: orders and line items synchronize to Supabase after sign-in / connectivity recovery
- Supabase Auth sign-in for the administration workspace
- Cloud-backed administration for menu categories/products, reservations, business days, cash transactions, suppliers, inventory items/units/movements/purchases/recipes, printers, preparation screens, employees, shifts, attendance, leave balances and payroll runs
- Cloud-backed sales list and kitchen status updates, with SQLite cache for offline access
- Separate kitchen display window; open it with **Ctrl+K**
- Kitchen screen polls local orders and updates preparation status while offline
- Local health endpoint: `GET /api/health`

## Menu import API

The POS reads the local menu from `GET /api/menu`. Import a complete menu snapshot using `PUT /api/menu/import` with JSON in this shape:

```json
{
  "categories": [
    { "id": "category-id", "name": "Main dishes", "sort_order": 1 }
  ],
  "items": [
    {
      "id": "product-id",
      "category_id": "category-id",
      "name": "Example meal",
      "description": "",
      "price": 125,
      "is_available": true
    }
  ]
}
```

Prices in the import payload are Egyptian pounds; they are stored locally as integer piastres to avoid floating-point money calculations. The import replaces the local menu snapshot in one transaction.

## Local API endpoints

- `GET /api/health`
- `GET /api/menu`
- `PUT /api/menu/import`
- `GET /api/orders`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET /api/admin/summary`
- `GET /api/admin/menu`
- `GET /api/admin/records/:module`
- `POST/PATCH/DELETE /api/admin/records/:module/:id`
- `POST /api/auth/login` and `POST /api/auth/logout`

## Configuration and remaining production setup

1. Copy `.env.example` to `.env`.
2. The provided `.env.example` already contains the project's public publishable key; no service-role secret is used. Never put a service-role/secret key in this desktop app.
3. Create a user in Supabase Authentication → Users.
4. In the Supabase SQL Editor, grant that user the desktop administrator claim (replace the email):

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"egsoft_role":"admin"}'::jsonb
WHERE email = 'admin@example.com';
```

5. Sign in to administration with that account.
6. Keep the app on the `offline-desktop` branch while testing.

The desktop app binds its API to `127.0.0.1` only. A separate internal/LAN server still requires device pairing, request authentication, and firewall configuration before enabling network access. USB/network printer drivers and full per-role permissions still require deployment-specific setup. HR face-profile data is not exposed to the desktop client.

The local service currently binds to loopback only. The kitchen window works on the POS computer. LAN access will be enabled after device pairing and request authentication are implemented, so unauthenticated order APIs are not exposed on the restaurant network.

The existing public website and production Supabase project are not changed by this desktop app. All work remains on the `offline-desktop` branch.

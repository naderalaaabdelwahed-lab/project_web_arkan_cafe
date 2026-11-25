# ARKAN Offline Desktop — Architecture & Delivery Plan

## Safety boundary
This work lives on the `offline-desktop` branch. The existing `main` branch, public website, and production Supabase schema are not changed by this plan. Do not run migrations against production as part of desktop development.

## Product goal
Keep in-store POS, kitchen screens, and receipt/kitchen printing operational when the restaurant's internet connection is unavailable. The public customer website remains online and unchanged. Supabase remains the cloud destination for synchronization when connectivity returns.

## Proposed topology
- **Local host PC (Windows):** always-on local application server and SQLite database. Prefer wired Ethernet and a UPS for the host and router.
- **POS Desktop client:** Electron application on the cashier PC. It talks to the local host over the restaurant LAN.
- **Kitchen display:** browser/PWA or Electron client on a kitchen screen; receives order events from the local host over Socket.IO.
- **Print agent:** runs on the local host or designated cashier PC and prints through installed Windows printer drivers.
- **Cloud sync worker:** outbox-based background sync to Supabase when internet is reachable. It must never block local order creation or printing.

## Printing support
- **USB printers:** install the manufacturer's Windows driver on the PC physically connected to the printer; print through the Windows spooler using the selected printer queue.
- **LAN printers:** prefer a Windows printer queue installed by IP address (commonly TCP 9100 for supported ESC/POS devices). Raw TCP printing is a device-specific fallback, not assumed for every printer.
- Printer routing is configurable per station: cashier receipt, kitchen hot line, pastry, drinks, etc.
- Every print job gets a stable ID and status (queued, printing, printed, failed); retries must not create duplicate orders.
- The printer model, command language (ESC/POS or vendor-specific), paper width, and driver determine the final implementation.

## Offline data rules
1. Local host is authoritative for in-store transactions while offline.
2. Create UUIDs on the local host; never use cloud-generated numeric IDs as local primary keys.
3. Persist orders and line items in one local database transaction.
4. Write a sync-outbox record in the same transaction as each business change.
5. Send idempotency keys to cloud sync; retries must be safe.
6. Do not overwrite newer local work with stale cloud data. Define field-level conflict rules before enabling two-way sync.
7. Keep a local audit trail for voids, discounts, cash movements, and shift close.

## Existing website integration
The existing Next.js site directly calls Supabase for auth, permissions, orders, menu, and settings. The offline client must not simply load those pages and claim offline support. The desktop POS needs a local data/API adapter and a locally cached menu/configuration. The public website and its current WhatsApp checkout path remain separate and unchanged.

## Delivery phases
### Phase 1 — hardware and local-host foundation
- Confirm host PC Windows version and printer models.
- Implement local database schema, local API, health status, and printer discovery/test page.
- Keep LAN access behind local authentication; do not expose an unauthenticated write API.

### Phase 2 — POS MVP
- Local login/PIN and role permissions.
- Product/category cache.
- Create/update/void order, totals, payment method, receipt printing.
- Persist and recover pending orders after app restart.

### Phase 3 — kitchen
- Realtime order board over LAN.
- Station-based routing and status changes.
- Kitchen ticket printing.

### Phase 4 — cloud sync
- Outbox worker, idempotent cloud endpoints, retry/backoff, sync dashboard.
- Verify reconnect/retry behavior without duplicating orders.

### Phase 5 — deployment
- Windows installer, auto-start local host, backup/restore, logs, health monitoring, UPS guidance.
- Test on every explicitly supported Windows release and printer model.

## Compatibility statement
The first supported target should be Windows 10 and 11. "All Windows versions" cannot be promised: current Electron/Node releases do not support every legacy Windows version. Any Windows 7/8.1 requirement needs a separate compatibility decision and hardware test before selecting runtimes.

## Acceptance tests
- Disconnect WAN internet while keeping LAN/router powered: POS can create and retrieve orders.
- Kitchen screen receives a new order within the LAN without cloud access.
- USB and LAN printers each print a test receipt and kitchen ticket.
- Restart POS and local host: committed orders and queued print jobs recover.
- Restore internet: pending sync completes exactly once in the cloud.
- Kill the cloud connection during order creation: local order and print still succeed.
- Unauthorized LAN client cannot read or mutate restaurant data.

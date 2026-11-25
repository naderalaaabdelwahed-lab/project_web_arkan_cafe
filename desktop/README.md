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

The initial shell starts an embedded local Express service on `127.0.0.1:4317` and creates a persistent SQLite database under Electron's per-user application data directory.

## Current milestone

- Electron desktop shell with context isolation and Node integration disabled
- Embedded local HTTP service and Socket.IO server
- SQLite database initialization and first schema
- Local health check screen

## Not implemented yet

- POS order-entry interface and order workflow
- Kitchen display and LAN device pairing
- Employee authentication and permissions
- Menu import from the existing ARKAN/Supabase data
- Outbox worker and Supabase synchronization
- USB and network printer adapters

The local service currently binds to loopback only. LAN access will be enabled after device pairing and request authentication are implemented. This prevents exposing unauthenticated order APIs on the restaurant network.

The existing public website and production Supabase project are not changed by this desktop app.

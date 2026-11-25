# ARKAN Offline Desktop

This folder is reserved for the offline-first Windows application. It is intentionally separate from the existing Next.js website.

## Initial target
- Windows 10/11
- Electron desktop POS
- Local host service + local database
- LAN-connected kitchen screens
- USB and LAN printer queues
- Supabase synchronization only when internet is available

## Current status
Architecture and safety boundary are documented in [the implementation plan](../docs/offline-desktop-architecture.md). No production website code or Supabase database has been changed.

The first executable milestone will be a local-host service and hardware diagnostic screen. POS order workflows will be added only after the existing menu/order data contract and printer models are confirmed.

# ARKAN Cafe & Restaurant

Next.js 16 application for ARKAN Cafe & Restaurant.

## Requirements

- Node.js 22 LTS
- npm
- Supabase project credentials

## Run locally

1. Clone the repository and switch to the active development branch:

   ```bash
   git clone -b fix/project-audit-nov-2026 https://github.com/naderalaaabdelwahed-lab/project_web_arkan_cafe.git
   cd project_web_arkan_cafe
   ```

2. Create your local environment file:

   **Windows PowerShell**
   ```powershell
   Copy-Item .env.example .env.local
   ```

   **macOS / Linux**
   ```bash
   cp .env.example .env.local
   ```

3. Fill in the values from Supabase Dashboard → Project Settings → API:

   - Project URL
   - Publishable key
   - Secret/service-role key (server-side only)

4. Install and run:

   ```bash
   npm ci
   npm run dev
   ```

5. Open http://localhost:3000.

## Human Resources (HR)

- The employee attendance page is the HR home at `/hr`. Employees choose check-in or check-out and enter their personal six-digit attendance code; no system/admin account is required.
- HR managers create each employee's attendance code from HR → Employees. Codes are unique, stored as salted scrypt hashes, and never returned to the browser in plaintext.
- Attendance-code accounts are separate from administrator and system employee accounts. The code grants attendance actions only; it does not grant admin, inventory, or HR management access.
- HR managers use their existing administrator login and open `/hr/manage`. Employee files, shifts, attendance review, and payroll remain manager-only.
- Attendance timestamps use Cairo time. Overnight check-outs are associated with the original shift date.
- Duplicate check-ins are rejected, and check-out is unavailable unless the employee has an open attendance record. Previous unclosed records remain available for manager correction.
- The attendance endpoint applies per-process attempt throttling. For a multi-instance production deployment, use a shared rate-limit store/gateway as an additional control.
- Managers can assign flexible and overnight shifts, review absences, correct attendance timestamps, and manage payroll. Confirm payroll policy assumptions with the restaurant before using payroll for actual payment.

## Validation

```bash
npm run lint
npm run build
```

## Security

- Never commit `.env.local` or any real Supabase secret.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code or variables prefixed with `NEXT_PUBLIC_`.
- Use a manager account already authorized in `admin_users` for the admin area.
- The current pull request is still a draft; do not treat this branch as a production deployment.

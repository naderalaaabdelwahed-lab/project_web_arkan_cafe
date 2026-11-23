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

- The employee HR portal is available at `/hr`; each employee receives a dedicated username and password created by an HR administrator.
- Employees open `/hr/attendance` to check in, check out, and view only their own attendance history.
- HR employee accounts are isolated from system administrator and system employee accounts. They cannot sign in to the admin application, access inventory permissions, or manage HR.
- HR manager accounts use the existing administrator login and open `/hr/manage` from the admin navigation. Employee files, shifts, attendance review, and payroll are manager-only.
- Employee passwords are managed by Supabase Auth. The application stores only the HR username and Auth user ID mapping, never a plaintext password.
- The server records attendance timestamps in Cairo time and associates overnight check-outs with the original shift date.
- The former standalone `/attendance/kiosk` page, kiosk API, device activation workflow, and PIN attendance flow have been removed from the active app.
- Duplicate check-ins are rejected. Check-out is unavailable unless the employee has an open attendance record. Previous unclosed records remain available for manager correction.
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

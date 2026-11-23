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

## Validation

```bash
npm run lint
npm run build
```

## HR and attendance notes

- HR employees are separate from website/Auth employee accounts.
- Attendance kiosk currently uses employee PINs. The camera preview is not face recognition and does not perform liveness detection.
- Pending absences are generated automatically by a Supabase Cron job every 15 minutes. The job uses Cairo local time and supports overnight shifts.
- Payroll formulas currently use a 30-day salary basis and a 26-day lateness divisor. Confirm these rules, overtime rates, and leave policy with the restaurant before using payroll for actual payment.

## Security

- Never commit `.env.local` or any real Supabase secret.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code or variables prefixed with `NEXT_PUBLIC_`.
- Use a manager account already authorized in `admin_users` for the admin area.
- The current pull request is still a draft; do not treat this branch as a production deployment.

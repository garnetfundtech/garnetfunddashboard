## Garnet Fund Dashboard

Private portfolio and research dashboard for the University of South Carolina Garnet Fund.

### Current Scope

- Premium dark UI shell with garnet accent (`#8e0604`)
- Home dashboard with placeholder AUM, beta, chart, and holdings table
- Invite-only auth flow (university email login) and role-aware access (`developer`, `admin`, `analyst`)
- Research and Resources workflows with PDF upload, in-app viewing, and per-file download toggles
- Admin control center for invites, role updates, file permission review, and audit trail
- Feature-flagged Schwab OAuth/token/sync routes
- Supabase schema + RLS + linter hardening applied to connected Garnet project

### Tech Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- Recharts + Lucide icons
- shadcn/ui (base-nova)

### Run Locally

1. Copy environment template:
```bash
cp .env.example .env.local
```

2. Fill in values in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENABLE_SCHWAB_SYNC`
- `SCHWAB_CLIENT_ID`
- `SCHWAB_CLIENT_SECRET`
- `SCHWAB_REDIRECT_URI`

3. Start the app:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

### Routes

- `/home` Dashboard
- `/research` Research archive
- `/resources` Resources library
- `/admin` Admin workspace
- `/login` Login page
- `/api/health` Health check
- `/api/schwab/auth-url` Feature-flagged Schwab auth URL
- `/api/schwab/callback` Schwab OAuth callback exchange
- `/api/schwab/refresh` Schwab refresh-token flow
- `/api/schwab/sync` Background sync orchestration endpoint

### Database Baseline

SQL migrations are in `supabase/migrations/`, applied in filename order. The
`APPLY_*.sql` files in that directory are paste-ready combinations of a run of
migrations, for applying through the Supabase SQL editor rather than the CLI.

Access model: the risk tables are reachable only through the service role in
server code (`createAdminClient()`). They have row-level security enabled and
no policy, so the publishable key cannot read or write them — see
`0023_risk_table_lockdown.sql`. Who may *write* is enforced a layer up, in
`requireRiskManager()`, which can check a profile role as §6 requires.

### Deployment

- Production URL: [https://garnetfunddashboard-gules.vercel.app](https://garnetfunddashboard-gules.vercel.app)
- Health check: [/api/health](https://garnetfunddashboard-gules.vercel.app/api/health)
- Which commit is serving, and which integrations have credentials in that
  environment: [/api/version](https://garnetfunddashboard-gules.vercel.app/api/version)
- `.vercelignore` is configured to avoid uploading local `.env` files.

### Environment Variables

Set in Vercel, not in the repo. `/api/version` reports which of these the
running deployment can actually see, as booleans, so a key set in the wrong
place is visible from outside.

Vercel resolves these at build time, so adding one does not affect the
deployment already serving — redeploy, then confirm on `/api/version` that the
boolean has flipped. A variable that stays `false` after a redeploy is set on
the wrong environment or under a different name, not merely stale.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access. Every risk table is reachable only through this. |
| `SCHWAB_CLIENT_ID` / `SCHWAB_CLIENT_SECRET` | Positions, orders and quotes. |
| `FMP_API_KEY` | 3-month T-bill benchmark. |
| `FRED_API_KEY` | Macro release calendar (§5.4 catalysts). |
| `CRON_SECRET` | Required by the daily cron routes; they return 401 without it. |
| `SMTP_USER` / `SMTP_APP_PASSWORD` | Gmail app password for breach alerts. |
| `RISK_ALERT_EMAIL` | Where §4.4 routes alerts when a role has no address. |
| `RISK_EMAIL_ALWAYS` | Copied on every alert, whatever the tier. |
| `RISK_EMAIL_FROM` | From address, when it differs from `SMTP_USER`. |

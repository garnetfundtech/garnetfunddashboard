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

SQL migrations are in:

`supabase/migrations/0001_initial.sql`  
`supabase/migrations/0002_governance_and_schwab.sql`  
`supabase/migrations/0003_policy_and_index_hardening.sql`  
`supabase/migrations/0004_rls_initplan_tuning.sql`

### Deployment

- Production URL: [https://garnetfunddashboard.vercel.app](https://garnetfunddashboard.vercel.app)
- Health check: [https://garnetfunddashboard.vercel.app/api/health](https://garnetfunddashboard.vercel.app/api/health)
- `.vercelignore` is configured to avoid uploading local `.env` files.

### Remaining External Inputs

- Set `SUPABASE_SERVICE_ROLE_KEY` in Vercel envs.
- Add Schwab credentials and set `ENABLE_SCHWAB_SYNC=true` when ready.
- Seed first `developer` account via invite so admin controls are available immediately.

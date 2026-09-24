# MaintenanceBuddy

HVAC maintenance tracking for condo buildings — admin web dashboard and technician mobile app.

## Stack

- **Admin web**: Next.js, Tailwind CSS, shadcn/ui
- **Mobile**: Expo (React Native)
- **Backend**: Supabase (hosted Postgres, Auth, Storage, Realtime)
- **Monorepo**: Turborepo + pnpm

## Getting Started (Hosted Supabase)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Apply database schema

In your [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**, run the migration files in [`supabase/migrations/`](supabase/migrations/) in filename order, then optionally [`supabase/seed.sql`](supabase/seed.sql) for a demo building.

Alternatively, if you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 3. Configure Auth redirect URLs

In Supabase Dashboard → **Authentication** → **URL Configuration**, add:

| Setting | Value |
|---------|-------|
| Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/**`, `http://localhost:3000/auth/callback`, `http://localhost:3000/invite/complete`, `exp://**` |

### 4. Set environment variables

Copy the example env files and fill in your project credentials from **Project Settings → API**:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
cp .env.example .env
```

| Variable | Where |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` — Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` — anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/web/.env.local` **and** root `.env` — service_role key (server-only: Team invites + seed; never commit) |
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env` — same Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `apps/mobile/.env` — same anon key |
| `SUPABASE_URL` | root `.env` — same Project URL (seed script) |

### 5. Seed demo users (optional)

Ensure root `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then:

```bash
ALLOW_SEED=1 pnpm seed
```

This creates a demo organization, admin and technician accounts, and a sample maintenance job. **Never run seed against production** — demo passwords are weak and `ALLOW_SEED=1` is required deliberately.

### 6. Start the apps

```bash
pnpm --filter web dev       # http://localhost:3000
pnpm --filter mobile start  # Expo dev server
```

### Organizations and team invites

1. An owner creates an account at `/signup` (organization name + email/password) and becomes the org admin.
2. From **Team** in the dashboard, invite technicians by email (requires `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local`).
3. **Copy the accept link** shown after invite (or use **Copy link** on a pending invite) and send it to the technician. Opening that URL hits `/auth/confirm` → `/invite/complete` (set password).
4. Technician sets a password, then signs in on the mobile app.

> Do not rely on Supabase’s default invite email for this flow. Server-side invites + the default PKCE email link break when opened on another device, and generating a copyable link invalidates that email token. Always share the **accept link** from the Team page.

#### Optional: Invite email template (Supabase Dashboard)

If you later want Supabase to email invites, update **Authentication → Email Templates → Invite user** to use `TokenHash` (and do not also regenerate a second link for the same invite):

```html
<h2>You've been invited</h2>
<p>You've been invited to create a technician account on MaintenanceBuddy.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/invite/complete"
    >Accept invitation</a
  >
</p>
```

Also add these Redirect URLs: `http://localhost:3000/auth/confirm`, `http://localhost:3000/invite/complete`.


### Demo accounts (after seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@maintenancebuddy.com | password123 |
| Technician | tech@maintenancebuddy.com | password123 |

## Production deploy

### Phase 1 — Web portal (Vercel + clean DB)

1. **Database** — Apply migrations through `20250828000023_r2_visit_photos_purge.sql`. Wipe demo data before go-live (keep schema). Do not run `ALLOW_SEED=1 pnpm seed` on production.
2. **Vercel** — Prefer claiming a temporary deploy or importing the GitHub repo (monorepo root; `vercel.json` at repo root runs `pnpm --filter web build`). Env vars (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for invites / admin APIs)
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (visit photos)
   - `CRON_SECRET` (protects daily photo purge cron)
3. Deploy — default `https://<project>.vercel.app` URL (no custom domain required). CLI from repo root: `npx vercel deploy` (after `vercel login`), or `npx vercel deploy --temporary` for a short-lived anonymous preview you can [claim](https://vercel.com/docs/cli/deploy#temporary).
4. **Auth URLs** — In Supabase → Authentication → URL Configuration (replace with your real Vercel host):
   - Site URL: `https://YOUR-APP.vercel.app`
   - Redirect URLs: `https://YOUR-APP.vercel.app/**`, `…/auth/callback`, `…/auth/confirm`, `…/invite/complete`
5. **Smoke test** — Open `/signup`, create your org, add a building, schedule a maintenance, download a PDF.

### Cloudflare R2 (visit photos)

1. Create a private R2 bucket (e.g. `visit-photos`).
2. Create an R2 API token with Object Read & Write on that bucket.
3. Set the R2 env vars on Vercel and in `apps/web/.env.local`.
4. Mobile needs `EXPO_PUBLIC_API_URL` pointing at the web origin (presigned upload/download).

Organization logos still use Supabase Storage (`organization-logos`).

### Later — Mobile (EAS internal)

- Set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_API_URL`
- EAS Build → TestFlight (iOS) + internal APK (Android); no public store listing required for closed beta

### Photo retention

Visit photos live in **Cloudflare R2**. After a maintenance has stayed **completed for 3 months** (`completed_at`), a daily Vercel Cron (`/api/cron/purge-visit-photos`, 04:00 UTC) deletes matching R2 objects and `visit_photos` rows. Deficiencies and visit records are kept. Reopening a completed job clears `completed_at` and resets the retention clock. Mobile compresses captures (max edge 1600px, JPEG ~0.7) before upload.

## Project Structure

```
apps/web/          Next.js admin dashboard
apps/mobile/       Expo technician app
packages/shared/   Shared types and Zod schemas
packages/supabase/ Supabase client helpers
supabase/          Migrations and seed scripts
```

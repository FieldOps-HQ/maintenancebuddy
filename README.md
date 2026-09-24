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
3. Share the **Copy link** accept URL with the technician (or use the email once the Invite template below is updated).
4. Technician opens the link, sets a password on `/invite/complete`, then signs in on the mobile app.

#### Required: Invite email template (Supabase Dashboard)

Default invite emails use a PKCE `?code=` redirect that cannot be completed from another device. Update **Authentication → Email Templates → Invite user** so the button uses `TokenHash`:

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

1. **Database** — Apply all migrations through `20250828000022_fix_rls_helper_performance.sql` (`supabase db push` or SQL Editor in filename order). Enable the **pg_cron** extension in Dashboard → Database → Extensions if the purge job does not schedule automatically.
2. **Auth URLs** — Set Site URL to your production web origin. Add redirect URLs for `https://YOUR_DOMAIN/**`, `/auth/callback`, `/auth/confirm`, `/invite/complete`, and mobile schemes as needed. Update the Invite email template to use `TokenHash` (same HTML as above, with production Site URL).
3. **Web (e.g. Vercel)** — Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-only). Deploy `apps/web`.
4. **Mobile (EAS / store builds)** — Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Build with EAS; do not ship Expo Go for production technicians.
5. **Do not seed production** — Skip `ALLOW_SEED=1 pnpm seed` on live projects.
6. **Smoke test** — Signup → invite tech → create maintenance → complete a suite (online + one offline sync) → download PDF with org logo → confirm completed jobs are locked for technicians.

### Photo retention

Visit photos for a maintenance are deleted automatically once that maintenance has remained **completed for 3 months** (`completed_at`). A daily `pg_cron` job (`purge-expired-visit-photos`, 04:00 UTC) removes matching `visit-photos` storage objects and `visit_photos` rows. Deficiencies and visit records are kept. Reopening a completed job clears `completed_at` and resets the retention clock.

## Project Structure

```
apps/web/          Next.js admin dashboard
apps/mobile/       Expo technician app
packages/shared/   Shared types and Zod schemas
packages/supabase/ Supabase client helpers
supabase/          Migrations and seed scripts
```

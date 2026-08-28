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

In your [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**, run these files in order:

1. [`supabase/migrations/20250828000001_initial_schema.sql`](supabase/migrations/20250828000001_initial_schema.sql) — tables, RLS, triggers, storage bucket
2. [`supabase/migrations/20250828000002_grant_roles.sql`](supabase/migrations/20250828000002_grant_roles.sql) — table grants (required if "Automatically expose new tables" is disabled)
3. [`supabase/migrations/20250828000003_fix_storage_policies.sql`](supabase/migrations/20250828000003_fix_storage_policies.sql) — fix photo upload permissions for technicians
4. [`supabase/migrations/20250828000004_storage_grants_and_policies.sql`](supabase/migrations/20250828000004_storage_grants_and_policies.sql) — **required for photo uploads** — storage grants + policies
5. [`supabase/seed.sql`](supabase/seed.sql) — demo building with 48 suites (optional)

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
| Redirect URLs | `http://localhost:3000/**`, `exp://**` |

### 4. Set environment variables

Copy the example env files and fill in your project credentials from **Project Settings → API**:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
cp .env.example .env
```

| Variable | Where to find it |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / public key |
| `EXPO_PUBLIC_SUPABASE_URL` | Same Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (seed script only, never commit) |

### 5. Seed demo users (optional)

Ensure root `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then:

```bash
pnpm seed
```

This creates admin and technician accounts plus a sample maintenance job.

### 6. Start the apps

```bash
pnpm --filter web dev       # http://localhost:3000
pnpm --filter mobile start  # Expo dev server
```

### Demo accounts (after seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@maintenancebuddy.com | password123 |
| Technician | tech@maintenancebuddy.com | password123 |

## Project Structure

```
apps/web/          Next.js admin dashboard
apps/mobile/       Expo technician app
packages/shared/   Shared types and Zod schemas
packages/supabase/ Supabase client helpers
supabase/          Migrations and seed scripts
```

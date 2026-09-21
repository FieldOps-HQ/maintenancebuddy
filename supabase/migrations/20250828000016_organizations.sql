-- Multi-tenant organizations, invites, and org-scoped RLS
-- Idempotent: safe to re-run if a previous attempt partially applied.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'invite_status' and n.nspname = 'public'
  ) then
    create type public.invite_status as enum ('pending', 'accepted', 'revoked');
  end if;
end
$$;

-- If a partial run left an incomplete invites table, rebuild it
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'organization_invites'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_invites'
      and column_name = 'status'
  ) then
    drop table public.organization_invites cascade;
  end if;
end
$$;

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text,
  invited_by uuid references public.profiles(id) on delete set null,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now()
);

create unique index if not exists organization_invites_pending_email_idx
  on public.organization_invites (organization_id, lower(email))
  where status = 'pending';

create index if not exists idx_organization_invites_org
  on public.organization_invites(organization_id);

-- Backfill demo org for existing rows
insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Organization')
on conflict (id) do nothing;

alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.buildings
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.filter_sizes
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.profiles
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

update public.buildings
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

update public.filter_sizes
set organization_id = '00000000-0000-0000-0000-000000000001'
where organization_id is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'organization_id' and is_nullable = 'YES'
  ) then
    alter table public.profiles alter column organization_id set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'buildings'
      and column_name = 'organization_id' and is_nullable = 'YES'
  ) then
    alter table public.buildings alter column organization_id set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'filter_sizes'
      and column_name = 'organization_id' and is_nullable = 'YES'
  ) then
    alter table public.filter_sizes alter column organization_id set not null;
  end if;
end
$$;

create index if not exists idx_profiles_organization on public.profiles(organization_id);
create index if not exists idx_buildings_organization on public.buildings(organization_id);
create index if not exists idx_filter_sizes_organization on public.filter_sizes(organization_id);

-- Unique filter sizes per organization
alter table public.filter_sizes
  drop constraint if exists filter_sizes_length_in_width_in_thickness_in_key;

drop index if exists public.idx_filter_sizes_dimensions;

create unique index if not exists idx_filter_sizes_org_dimensions
  on public.filter_sizes (organization_id, length_in, width_in, thickness_in);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid());
$$;

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Keep is_admin() as alias for existing policy names / storage policies
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_org_admin();
$$;

create or replace function public.building_in_current_org(p_building_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.buildings b
    where b.id = p_building_id
      and b.organization_id = (select public.current_organization_id())
  );
$$;

create or replace function public.maintenance_in_current_org(p_maintenance_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenances m
    join public.buildings b on b.id = m.building_id
    where m.id = p_maintenance_id
      and b.organization_id = (select public.current_organization_id())
  );
$$;

create or replace function public.set_organization_id_from_profile()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_organization_id();
  end if;
  return new;
end;
$$;

drop trigger if exists buildings_set_organization on public.buildings;
create trigger buildings_set_organization
  before insert on public.buildings
  for each row execute function public.set_organization_id_from_profile();

drop trigger if exists filter_sizes_set_organization on public.filter_sizes;
create trigger filter_sizes_set_organization
  before insert on public.filter_sizes
  for each row execute function public.set_organization_id_from_profile();

-- Seed default filter sizes for a new organization
create or replace function public.seed_default_filter_sizes(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.filter_sizes (organization_id, length_in, width_in, thickness_in)
  values
    (p_organization_id, 16, 25, 1),
    (p_organization_id, 20, 20, 1),
    (p_organization_id, 20, 25, 1),
    (p_organization_id, 16, 20, 1),
    (p_organization_id, 14, 25, 1)
  on conflict (organization_id, length_in, width_in, thickness_in) do nothing;
end;
$$;

revoke all on function public.seed_default_filter_sizes(uuid) from public;
grant execute on function public.seed_default_filter_sizes(uuid) to service_role;

-- Auto-create profile (+ org for owners) on signup.
-- Owner signup: organization_name in user_metadata creates a new org as admin.
-- Service-role createUser (seed/invites): app_metadata.organization_id + role (trusted).
-- Technician email invite: pending organization_invites row for this email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_name text;
  v_role public.user_role;
  v_full_name text;
  v_invite_name text;
begin
  v_full_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    split_part(new.email, '@', 1)
  );
  v_org_name := nullif(trim(coalesce(new.raw_user_meta_data->>'organization_name', '')), '');

  -- Trusted path: only service_role can set app_metadata
  if nullif(new.raw_app_meta_data->>'organization_id', '') is not null then
    v_org_id := (new.raw_app_meta_data->>'organization_id')::uuid;
    v_role := coalesce(
      (new.raw_app_meta_data->>'role')::public.user_role,
      'technician'
    );
    if not exists (select 1 from public.organizations where id = v_org_id) then
      raise exception 'Invalid organization for signup';
    end if;

    insert into public.profiles (id, email, full_name, role, organization_id)
    values (new.id, new.email, v_full_name, v_role, v_org_id);
    return new;
  end if;

  select oi.organization_id, oi.full_name
  into v_org_id, v_invite_name
  from public.organization_invites oi
  where lower(oi.email) = lower(new.email)
    and oi.status = 'pending'
  order by oi.created_at desc
  limit 1;

  if v_invite_name is not null and nullif(trim(v_invite_name), '') is not null then
    v_full_name := trim(v_invite_name);
  end if;

  if v_org_name is not null then
    v_role := 'admin';
    insert into public.organizations (name)
    values (v_org_name)
    returning id into v_org_id;
    perform public.seed_default_filter_sizes(v_org_id);
  elsif v_org_id is not null then
    v_role := 'technician';
  else
    raise exception 'Signup requires an organization (create one or accept an invite)';
  end if;

  insert into public.profiles (id, email, full_name, role, organization_id)
  values (new.id, new.email, v_full_name, v_role, v_org_id);

  -- Invite rows stay pending until the user completes the invite link (auth callback).

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: organizations & invites
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_invites enable row level security;

drop policy if exists "Members can read own organization" on public.organizations;
create policy "Members can read own organization" on public.organizations
  for select to authenticated
  using (id = (select public.current_organization_id()));

drop policy if exists "Org admins manage invites" on public.organization_invites;
create policy "Org admins manage invites" on public.organization_invites
  for all to authenticated
  using (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  )
  with check (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  );

-- ---------------------------------------------------------------------------
-- RLS: profiles (org-scoped)
-- ---------------------------------------------------------------------------

drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Admins can read org profiles" on public.profiles;
drop policy if exists "Admins can update org profiles" on public.profiles;

create policy "Admins can read org profiles" on public.profiles
  for select to authenticated
  using (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  );

create policy "Admins can update org profiles" on public.profiles
  for update to authenticated
  using (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  )
  with check (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  );

-- ---------------------------------------------------------------------------
-- RLS: buildings & filter_sizes (org-scoped)
-- ---------------------------------------------------------------------------

drop policy if exists "Admins full access buildings" on public.buildings;
create policy "Admins full access buildings" on public.buildings
  for all to authenticated
  using (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  )
  with check (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  );

drop policy if exists "Admins full access filter_sizes" on public.filter_sizes;
drop policy if exists "Authenticated read filter_sizes" on public.filter_sizes;
drop policy if exists "Org members read filter_sizes" on public.filter_sizes;

create policy "Admins full access filter_sizes" on public.filter_sizes
  for all to authenticated
  using (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  )
  with check (
    (select public.is_org_admin())
    and organization_id = (select public.current_organization_id())
  );

create policy "Org members read filter_sizes" on public.filter_sizes
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

-- ---------------------------------------------------------------------------
-- RLS: child tables — admin access limited to current org
-- ---------------------------------------------------------------------------

drop policy if exists "Admins full access contacts" on public.building_contacts;
create policy "Admins full access contacts" on public.building_contacts
  for all to authenticated
  using (
    (select public.is_org_admin())
    and (select public.building_in_current_org(building_id))
  )
  with check (
    (select public.is_org_admin())
    and (select public.building_in_current_org(building_id))
  );

drop policy if exists "Admins full access suites" on public.suites;
create policy "Admins full access suites" on public.suites
  for all to authenticated
  using (
    (select public.is_org_admin())
    and (select public.building_in_current_org(building_id))
  )
  with check (
    (select public.is_org_admin())
    and (select public.building_in_current_org(building_id))
  );

drop policy if exists "Admins full access maintenances" on public.maintenances;
create policy "Admins full access maintenances" on public.maintenances
  for all to authenticated
  using (
    (select public.is_org_admin())
    and (select public.building_in_current_org(building_id))
  )
  with check (
    (select public.is_org_admin())
    and (select public.building_in_current_org(building_id))
  );

drop policy if exists "Admins full access assignments" on public.maintenance_assignments;
create policy "Admins full access assignments" on public.maintenance_assignments
  for all to authenticated
  using (
    (select public.is_org_admin())
    and (select public.maintenance_in_current_org(maintenance_id))
  )
  with check (
    (select public.is_org_admin())
    and (select public.maintenance_in_current_org(maintenance_id))
  );

drop policy if exists "Admins full access suite_visits" on public.suite_visits;
create policy "Admins full access suite_visits" on public.suite_visits
  for all to authenticated
  using (
    (select public.is_org_admin())
    and (select public.maintenance_in_current_org(maintenance_id))
  )
  with check (
    (select public.is_org_admin())
    and (select public.maintenance_in_current_org(maintenance_id))
  );

drop policy if exists "Admins full access deficiencies" on public.deficiencies;
create policy "Admins full access deficiencies" on public.deficiencies
  for all to authenticated
  using (
    (select public.is_org_admin())
    and exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = deficiencies.hvac_unit_visit_id
        and (select public.maintenance_in_current_org(sv.maintenance_id))
    )
  )
  with check (
    (select public.is_org_admin())
    and exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = deficiencies.hvac_unit_visit_id
        and (select public.maintenance_in_current_org(sv.maintenance_id))
    )
  );

drop policy if exists "Admins full access visit_photos" on public.visit_photos;
create policy "Admins full access visit_photos" on public.visit_photos
  for all to authenticated
  using (
    (select public.is_org_admin())
    and exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = visit_photos.hvac_unit_visit_id
        and (select public.maintenance_in_current_org(sv.maintenance_id))
    )
  )
  with check (
    (select public.is_org_admin())
    and exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = visit_photos.hvac_unit_visit_id
        and (select public.maintenance_in_current_org(sv.maintenance_id))
    )
  );

drop policy if exists "Admins full access hvac_units" on public.hvac_units;
create policy "Admins full access hvac_units" on public.hvac_units
  for all to authenticated
  using (
    (select public.is_org_admin())
    and exists (
      select 1 from public.suites s
      where s.id = hvac_units.suite_id
        and (select public.building_in_current_org(s.building_id))
    )
  )
  with check (
    (select public.is_org_admin())
    and exists (
      select 1 from public.suites s
      where s.id = hvac_units.suite_id
        and (select public.building_in_current_org(s.building_id))
    )
  );

drop policy if exists "Admins full access hvac_unit_visits" on public.hvac_unit_visits;
create policy "Admins full access hvac_unit_visits" on public.hvac_unit_visits
  for all to authenticated
  using (
    (select public.is_org_admin())
    and exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.maintenance_in_current_org(sv.maintenance_id))
    )
  )
  with check (
    (select public.is_org_admin())
    and exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.maintenance_in_current_org(sv.maintenance_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_invites to authenticated;
grant all on public.organizations to service_role;
grant all on public.organization_invites to service_role;

grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_org_admin() to authenticated;
grant execute on function public.building_in_current_org(uuid) to authenticated;
grant execute on function public.maintenance_in_current_org(uuid) to authenticated;

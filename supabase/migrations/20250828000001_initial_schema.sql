-- MaintenanceBuddy initial schema

-- Enums
create type public.user_role as enum ('admin', 'technician');
create type public.maintenance_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
create type public.suite_visit_status as enum ('pending', 'completed', 'blocked_unit', 'no_access', 'skipped', 'in_progress');
create type public.deficiency_category as enum ('not_cleaned', 'filter_not_changed', 'not_operating', 'other');

-- Profiles (linked to auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'technician',
  created_at timestamptz not null default now()
);

-- Buildings
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  street_number text not null,
  street text not null,
  city text not null,
  postal_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Building contacts
create table public.building_contacts (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- Suites
create table public.suites (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  suite_number text not null,
  floor text,
  filter_size text,
  filter_quantity integer not null default 1,
  hvac_location_notes text,
  created_at timestamptz not null default now(),
  unique (building_id, suite_number)
);

-- Maintenances
create table public.maintenances (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status public.maintenance_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Maintenance assignments
create table public.maintenance_assignments (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.maintenances(id) on delete cascade,
  technician_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (maintenance_id, technician_id)
);

-- Suite visits
create table public.suite_visits (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.maintenances(id) on delete cascade,
  suite_id uuid not null references public.suites(id) on delete cascade,
  status public.suite_visit_status not null default 'pending',
  cleaned boolean,
  filter_changed boolean,
  operating_normally boolean,
  visited_at timestamptz,
  visited_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maintenance_id, suite_id)
);

-- Deficiencies
create table public.deficiencies (
  id uuid primary key default gen_random_uuid(),
  suite_visit_id uuid not null references public.suite_visits(id) on delete cascade,
  category public.deficiency_category not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- Visit photos
create table public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  suite_visit_id uuid not null references public.suite_visits(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_suites_building on public.suites(building_id);
create index idx_maintenances_building on public.maintenances(building_id);
create index idx_maintenances_status on public.maintenances(status);
create unique index idx_one_active_maintenance_per_building
  on public.maintenances (building_id)
  where status in ('scheduled', 'in_progress');
create index idx_suite_visits_maintenance on public.suite_visits(maintenance_id);
create index idx_suite_visits_status on public.suite_visits(status);
create index idx_maintenance_assignments_technician on public.maintenance_assignments(technician_id);
create index idx_deficiencies_visit on public.deficiencies(suite_visit_id);

-- Filter summary view
create view public.maintenance_filter_summary
with (security_invoker = true) as
select
  sv.maintenance_id,
  s.filter_size,
  sum(s.filter_quantity)::integer as total_quantity
from public.suite_visits sv
join public.suites s on s.id = sv.suite_id
where s.filter_size is not null and s.filter_size != ''
group by sv.maintenance_id, s.filter_size;

-- Helper functions
create or replace function public.is_admin()
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

create or replace function public.is_assigned_technician(p_maintenance_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.maintenance_assignments
    where maintenance_id = p_maintenance_id
      and technician_id = (select auth.uid())
  );
$$;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'technician')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger buildings_updated_at before update on public.buildings
  for each row execute function public.set_updated_at();

create trigger maintenances_updated_at before update on public.maintenances
  for each row execute function public.set_updated_at();

create trigger suite_visits_updated_at before update on public.suite_visits
  for each row execute function public.set_updated_at();

-- Auto-create suite visits when maintenance is created
create or replace function public.create_suite_visits_for_maintenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.suite_visits (maintenance_id, suite_id, status)
  select new.id, s.id, 'pending'
  from public.suites s
  where s.building_id = new.building_id;
  return new;
end;
$$;

create trigger on_maintenance_created
  after insert on public.maintenances
  for each row execute function public.create_suite_visits_for_maintenance();

-- Auto-create suite visits when a suite is added to a building with active maintenances
create or replace function public.add_suite_visits_for_new_suite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.suite_visits (maintenance_id, suite_id, status)
  select m.id, new.id, 'pending'
  from public.maintenances m
  where m.building_id = new.building_id
    and m.status in ('scheduled', 'in_progress')
  on conflict (maintenance_id, suite_id) do nothing;

  return new;
end;
$$;

create trigger on_suite_added
  after insert on public.suites
  for each row execute function public.add_suite_visits_for_new_suite();

-- Update maintenance status based on suite visits
create or replace function public.update_maintenance_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maintenance_id uuid;
  v_total integer;
  v_done integer;
begin
  v_maintenance_id := coalesce(new.maintenance_id, old.maintenance_id);

  select count(*) into v_total
  from public.suite_visits where maintenance_id = v_maintenance_id;

  select count(*) into v_done
  from public.suite_visits
  where maintenance_id = v_maintenance_id
    and status in ('completed', 'blocked_unit', 'no_access', 'skipped');

  if v_done = v_total and v_total > 0 then
    update public.maintenances set status = 'completed' where id = v_maintenance_id;
  elsif v_done > 0 then
    update public.maintenances set status = 'in_progress' where id = v_maintenance_id and status = 'scheduled';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger on_suite_visit_changed
  after insert or update on public.suite_visits
  for each row execute function public.update_maintenance_status();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.building_contacts enable row level security;
alter table public.suites enable row level security;
alter table public.maintenances enable row level security;
alter table public.maintenance_assignments enable row level security;
alter table public.suite_visits enable row level security;
alter table public.deficiencies enable row level security;
alter table public.visit_photos enable row level security;

-- Profiles policies
create policy "Users can read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "Admins can read all profiles" on public.profiles
  for select to authenticated using ((select public.is_admin()));

create policy "Admins can update profiles" on public.profiles
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Buildings policies
create policy "Admins full access buildings" on public.buildings
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians read assigned buildings" on public.buildings
  for select to authenticated using (
    exists (
      select 1 from public.maintenances m
      join public.maintenance_assignments ma on ma.maintenance_id = m.id
      where m.building_id = buildings.id and ma.technician_id = (select auth.uid())
    )
  );

-- Building contacts policies
create policy "Admins full access contacts" on public.building_contacts
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians read assigned building contacts" on public.building_contacts
  for select to authenticated using (
    exists (
      select 1 from public.maintenances m
      join public.maintenance_assignments ma on ma.maintenance_id = m.id
      where m.building_id = building_contacts.building_id and ma.technician_id = (select auth.uid())
    )
  );

-- Suites policies
create policy "Admins full access suites" on public.suites
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians read assigned suites" on public.suites
  for select to authenticated using (
    exists (
      select 1 from public.maintenances m
      join public.maintenance_assignments ma on ma.maintenance_id = m.id
      where m.building_id = suites.building_id and ma.technician_id = (select auth.uid())
    )
  );

create policy "Technicians add suites on active assigned buildings" on public.suites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.maintenances m
      join public.maintenance_assignments ma on ma.maintenance_id = m.id
      where m.building_id = suites.building_id
        and ma.technician_id = (select auth.uid())
        and m.status in ('scheduled', 'in_progress')
    )
  );

-- Maintenances policies
create policy "Admins full access maintenances" on public.maintenances
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians read assigned maintenances" on public.maintenances
  for select to authenticated using ((select public.is_assigned_technician(id)));

-- Maintenance assignments policies
create policy "Admins full access assignments" on public.maintenance_assignments
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians read own assignments" on public.maintenance_assignments
  for select to authenticated using (technician_id = (select auth.uid()));

-- Suite visits policies
create policy "Admins full access suite_visits" on public.suite_visits
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians read assigned suite_visits" on public.suite_visits
  for select to authenticated using ((select public.is_assigned_technician(maintenance_id)));

create policy "Technicians update assigned suite_visits" on public.suite_visits
  for update to authenticated
  using ((select public.is_assigned_technician(maintenance_id)))
  with check ((select public.is_assigned_technician(maintenance_id)));

-- Deficiencies policies
create policy "Admins full access deficiencies" on public.deficiencies
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians manage deficiencies on assigned visits" on public.deficiencies
  for all to authenticated using (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = deficiencies.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  ) with check (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = deficiencies.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  );

-- Visit photos policies
create policy "Admins full access visit_photos" on public.visit_photos
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Technicians manage photos on assigned visits" on public.visit_photos
  for all to authenticated using (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = visit_photos.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  ) with check (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = visit_photos.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  );

-- Storage bucket for visit photos
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false);

create policy "Admins can read visit photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos' and (select public.is_admin())
  );

create policy "Technicians can upload visit photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-photos'
    and (select public.is_admin() or exists (
      select 1 from public.suite_visits sv
      join public.maintenance_assignments ma on ma.maintenance_id = sv.maintenance_id
      where sv.id::text = (storage.foldername(name))[2]
        and ma.technician_id = (select auth.uid())
    ))
  );

create policy "Technicians can read own visit photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos'
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.maintenance_assignments ma
        where ma.technician_id = (select auth.uid())
          and ma.maintenance_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "Technicians can update visit photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'visit-photos'
    and (select public.is_admin() or exists (
      select 1 from public.maintenance_assignments ma
      where ma.technician_id = (select auth.uid())
        and ma.maintenance_id::text = (storage.foldername(name))[1]
    ))
  ) with check (bucket_id = 'visit-photos');

-- Grant access to authenticated role
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.maintenance_filter_summary to authenticated;

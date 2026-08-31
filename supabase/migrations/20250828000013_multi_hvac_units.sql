-- Multi-HVAC unit tracking: hvac_units + hvac_unit_visits
-- Idempotent: safe to re-run if a previous attempt stopped partway through.

-- HVAC units (per suite)
create table if not exists public.hvac_units (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.suites(id) on delete cascade,
  name text not null,
  location_notes text,
  filter_size text,
  filter_quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (suite_id, name)
);

-- Per-unit maintenance visits (child of suite_visits)
create table if not exists public.hvac_unit_visits (
  id uuid primary key default gen_random_uuid(),
  suite_visit_id uuid not null references public.suite_visits(id) on delete cascade,
  hvac_unit_id uuid not null references public.hvac_units(id) on delete cascade,
  status public.suite_visit_status not null default 'pending',
  cleaned boolean,
  filter_changed boolean,
  operating_normally boolean,
  visited_at timestamptz,
  visited_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (suite_visit_id, hvac_unit_id)
);

-- Repair hvac_units if an older/partial table exists with missing columns
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'hvac_units'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'label'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'name'
    ) then
      alter table public.hvac_units rename column label to name;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'name'
    ) then
      alter table public.hvac_units add column name text;
      update public.hvac_units set name = 'Main unit' where name is null;
      alter table public.hvac_units alter column name set not null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'location_notes'
    ) then
      alter table public.hvac_units add column location_notes text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'filter_size'
    ) then
      alter table public.hvac_units add column filter_size text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'filter_quantity'
    ) then
      alter table public.hvac_units add column filter_quantity integer not null default 1;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'sort_order'
    ) then
      alter table public.hvac_units add column sort_order integer not null default 0;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_units' and column_name = 'created_at'
    ) then
      alter table public.hvac_units add column created_at timestamptz not null default now();
    end if;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.hvac_units'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) like '%suite_id%name%'
    ) then
      delete from public.hvac_units a
      using public.hvac_units b
      where a.suite_id = b.suite_id
        and a.name = b.name
        and a.id > b.id;

      begin
        alter table public.hvac_units add constraint hvac_units_suite_id_name_key unique (suite_id, name);
      exception
        when duplicate_object then null;
      end;
    end if;
  end if;
end;
$$;

-- Repair hvac_unit_visits if an older/partial table exists with missing columns
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'hvac_unit_visits'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'status'
    ) then
      alter table public.hvac_unit_visits
        add column status public.suite_visit_status not null default 'pending';
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'cleaned'
    ) then
      alter table public.hvac_unit_visits add column cleaned boolean;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'filter_changed'
    ) then
      alter table public.hvac_unit_visits add column filter_changed boolean;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'operating_normally'
    ) then
      alter table public.hvac_unit_visits add column operating_normally boolean;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'visited_at'
    ) then
      alter table public.hvac_unit_visits add column visited_at timestamptz;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'visited_by'
    ) then
      alter table public.hvac_unit_visits add column visited_by uuid references public.profiles(id);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'notes'
    ) then
      alter table public.hvac_unit_visits add column notes text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'created_at'
    ) then
      alter table public.hvac_unit_visits add column created_at timestamptz not null default now();
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'hvac_unit_visits' and column_name = 'updated_at'
    ) then
      alter table public.hvac_unit_visits add column updated_at timestamptz not null default now();
    end if;
  end if;
end;
$$;

-- Normalize status column: older attempts used hvac_unit_visit_status
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hvac_unit_visits'
      and column_name = 'status'
      and udt_name = 'hvac_unit_visit_status'
  ) then
    alter table public.hvac_unit_visits alter column status drop default;
    alter table public.hvac_unit_visits
      alter column status type public.suite_visit_status
      using (
        case status::text
          when 'pending' then 'pending'
          when 'in_progress' then 'in_progress'
          when 'completed' then 'completed'
          when 'blocked_unit' then 'pending'
          when 'no_access' then 'pending'
          when 'skipped' then 'pending'
          when 'blocked' then 'pending'
          else 'pending'
        end
      )::public.suite_visit_status;
    alter table public.hvac_unit_visits
      alter column status set default 'pending'::public.suite_visit_status;
  end if;
end;
$$;

create index if not exists idx_hvac_units_suite on public.hvac_units(suite_id);
create index if not exists idx_hvac_unit_visits_suite_visit on public.hvac_unit_visits(suite_visit_id);
create index if not exists idx_hvac_unit_visits_unit on public.hvac_unit_visits(hvac_unit_id);
create index if not exists idx_hvac_unit_visits_status on public.hvac_unit_visits(status);

drop trigger if exists hvac_unit_visits_updated_at on public.hvac_unit_visits;
create trigger hvac_unit_visits_updated_at before update on public.hvac_unit_visits
  for each row execute function public.set_updated_at();

-- Backfill: one "Main unit" per existing suite
insert into public.hvac_units (suite_id, name, location_notes, filter_size, filter_quantity, sort_order)
select
  s.id,
  'Main unit',
  s.hvac_location_notes,
  s.filter_size,
  coalesce(s.filter_quantity, 1),
  0
from public.suites s
on conflict (suite_id, name) do nothing;

-- Backfill unit visits from existing suite visits (only while legacy columns still exist)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suite_visits'
      and column_name = 'cleaned'
  ) then
    insert into public.hvac_unit_visits (
      suite_visit_id,
      hvac_unit_id,
      status,
      cleaned,
      filter_changed,
      operating_normally,
      visited_at,
      visited_by
    )
    select
      sv.id,
      hu.id,
      case
        when sv.status in ('no_access', 'blocked_unit', 'skipped') then 'pending'::public.suite_visit_status
        when sv.status = 'completed' then 'completed'::public.suite_visit_status
        when sv.status = 'in_progress' then 'in_progress'::public.suite_visit_status
        else 'pending'::public.suite_visit_status
      end,
      sv.cleaned,
      sv.filter_changed,
      sv.operating_normally,
      sv.visited_at,
      sv.visited_by
    from public.suite_visits sv
    join public.hvac_units hu on hu.suite_id = sv.suite_id and hu.name = 'Main unit'
    on conflict (suite_visit_id, hvac_unit_id) do nothing;
  else
    insert into public.hvac_unit_visits (suite_visit_id, hvac_unit_id, status)
    select sv.id, hu.id, 'pending'::public.suite_visit_status
    from public.suite_visits sv
    join public.hvac_units hu on hu.suite_id = sv.suite_id and hu.name = 'Main unit'
    on conflict (suite_visit_id, hvac_unit_id) do nothing;
  end if;
end;
$$;

-- Drop legacy RLS policies that reference suite_visit_id (recreated below using hvac_unit_visit_id)
drop policy if exists "Technicians manage deficiencies on assigned visits" on public.deficiencies;
drop policy if exists "Technicians manage photos on assigned visits" on public.visit_photos;

-- Repoint deficiencies to hvac_unit_visits
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deficiencies'
      and column_name = 'hvac_unit_visit_id'
  ) then
    alter table public.deficiencies
      add column hvac_unit_visit_id uuid references public.hvac_unit_visits(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deficiencies'
      and column_name = 'suite_visit_id'
  ) then
    update public.deficiencies d
    set hvac_unit_visit_id = huv.id
    from public.hvac_unit_visits huv
    join public.hvac_units hu on hu.id = huv.hvac_unit_id
    where d.hvac_unit_visit_id is null
      and huv.suite_visit_id = d.suite_visit_id
      and hu.name = 'Main unit';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deficiencies'
      and column_name = 'hvac_unit_visit_id'
  ) then
    alter table public.deficiencies alter column hvac_unit_visit_id set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deficiencies'
      and column_name = 'suite_visit_id'
  ) then
    drop index if exists idx_deficiencies_visit;
    alter table public.deficiencies drop column suite_visit_id;
  end if;
end;
$$;

create index if not exists idx_deficiencies_unit_visit on public.deficiencies(hvac_unit_visit_id);

-- Repoint visit photos to hvac_unit_visits
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_photos'
      and column_name = 'hvac_unit_visit_id'
  ) then
    alter table public.visit_photos
      add column hvac_unit_visit_id uuid references public.hvac_unit_visits(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_photos'
      and column_name = 'suite_visit_id'
  ) then
    update public.visit_photos vp
    set hvac_unit_visit_id = huv.id
    from public.hvac_unit_visits huv
    join public.hvac_units hu on hu.id = huv.hvac_unit_id
    where vp.hvac_unit_visit_id is null
      and huv.suite_visit_id = vp.suite_visit_id
      and hu.name = 'Main unit';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_photos'
      and column_name = 'hvac_unit_visit_id'
  ) then
    alter table public.visit_photos alter column hvac_unit_visit_id set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_photos'
      and column_name = 'suite_visit_id'
  ) then
    alter table public.visit_photos drop column suite_visit_id;
  end if;
end;
$$;

-- Slim down suite_visits (answers live on unit visits)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suite_visits'
      and column_name = 'cleaned'
  ) then
    alter table public.suite_visits
      drop column cleaned,
      drop column filter_changed,
      drop column operating_normally,
      drop column visited_by;
  end if;
end;
$$;

-- Default HVAC unit when a suite is created
create or replace function public.create_default_hvac_unit_for_suite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hvac_units (suite_id, name, location_notes, filter_size, filter_quantity, sort_order)
  values (
    new.id,
    'Main unit',
    new.hvac_location_notes,
    new.filter_size,
    coalesce(new.filter_quantity, 1),
    0
  )
  on conflict (suite_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists on_suite_created_default_unit on public.suites;
create trigger on_suite_created_default_unit
  after insert on public.suites
  for each row execute function public.create_default_hvac_unit_for_suite();

-- Create unit visits when a suite visit is created
create or replace function public.create_hvac_unit_visits_for_suite_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hvac_unit_visits (suite_visit_id, hvac_unit_id, status)
  select new.id, hu.id, 'pending'::public.suite_visit_status
  from public.hvac_units hu
  where hu.suite_id = new.suite_id
  on conflict (suite_visit_id, hvac_unit_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_suite_visit_created on public.suite_visits;
create trigger on_suite_visit_created
  after insert on public.suite_visits
  for each row execute function public.create_hvac_unit_visits_for_suite_visit();

-- Create unit visits when a new HVAC unit is added mid-maintenance
create or replace function public.add_hvac_unit_visits_for_new_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hvac_unit_visits (suite_visit_id, hvac_unit_id, status)
  select sv.id, new.id, 'pending'::public.suite_visit_status
  from public.suite_visits sv
  join public.maintenances m on m.id = sv.maintenance_id
  where sv.suite_id = new.suite_id
    and m.status in ('scheduled', 'in_progress')
  on conflict (suite_visit_id, hvac_unit_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_hvac_unit_added on public.hvac_units;
create trigger on_hvac_unit_added
  after insert on public.hvac_units
  for each row execute function public.add_hvac_unit_visits_for_new_unit();

-- Roll up suite visit status from unit visits
create or replace function public.rollup_suite_visit_status(p_suite_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status public.suite_visit_status;
  v_total integer;
  v_completed integer;
  v_started integer;
  v_new_status public.suite_visit_status;
begin
  select status into v_current_status
  from public.suite_visits
  where id = p_suite_visit_id;

  if v_current_status in ('no_access', 'blocked_unit', 'skipped') then
    return;
  end if;

  select count(*) into v_total
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id;

  if v_total = 0 then
    return;
  end if;

  select count(*) into v_completed
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id and status = 'completed';

  select count(*) into v_started
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id and status in ('in_progress', 'completed');

  if v_completed = v_total then
    v_new_status := 'completed';
  elsif v_started > 0 then
    v_new_status := 'in_progress';
  else
    v_new_status := 'pending';
  end if;

  update public.suite_visits
  set
    status = v_new_status,
    visited_at = case when v_new_status = 'completed' then coalesce(visited_at, now()) else visited_at end
  where id = p_suite_visit_id
    and status not in ('no_access', 'blocked_unit', 'skipped');
end;
$$;

create or replace function public.on_hvac_unit_visit_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rollup_suite_visit_status(coalesce(new.suite_visit_id, old.suite_visit_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_hvac_unit_visit_changed on public.hvac_unit_visits;
create trigger on_hvac_unit_visit_changed
  after insert or update on public.hvac_unit_visits
  for each row execute function public.on_hvac_unit_visit_changed();

-- Update filter summary to use per-unit filter data
drop view if exists public.maintenance_filter_summary;

create view public.maintenance_filter_summary
with (security_invoker = true) as
select
  sv.maintenance_id,
  hu.filter_size,
  sum(hu.filter_quantity)::integer as total_quantity
from public.suite_visits sv
join public.hvac_units hu on hu.suite_id = sv.suite_id
where hu.filter_size is not null and hu.filter_size != ''
group by sv.maintenance_id, hu.filter_size;

-- RLS
alter table public.hvac_units enable row level security;
alter table public.hvac_unit_visits enable row level security;

drop policy if exists "Admins full access hvac_units" on public.hvac_units;
create policy "Admins full access hvac_units" on public.hvac_units
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Technicians read assigned hvac_units" on public.hvac_units;
create policy "Technicians read assigned hvac_units" on public.hvac_units
  for select to authenticated using (
    exists (
      select 1 from public.suites s
      join public.maintenances m on m.building_id = s.building_id
      join public.maintenance_assignments ma on ma.maintenance_id = m.id
      where s.id = hvac_units.suite_id and ma.technician_id = (select auth.uid())
    )
  );

drop policy if exists "Technicians add hvac_units on active assigned suites" on public.hvac_units;
create policy "Technicians add hvac_units on active assigned suites" on public.hvac_units
  for insert to authenticated
  with check (
    exists (
      select 1 from public.suites s
      join public.maintenances m on m.building_id = s.building_id
      join public.maintenance_assignments ma on ma.maintenance_id = m.id
      where s.id = hvac_units.suite_id
        and ma.technician_id = (select auth.uid())
        and m.status in ('scheduled', 'in_progress')
    )
  );

drop policy if exists "Admins full access hvac_unit_visits" on public.hvac_unit_visits;
create policy "Admins full access hvac_unit_visits" on public.hvac_unit_visits
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Technicians read assigned hvac_unit_visits" on public.hvac_unit_visits;
create policy "Technicians read assigned hvac_unit_visits" on public.hvac_unit_visits
  for select to authenticated using (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  );

drop policy if exists "Technicians update assigned hvac_unit_visits" on public.hvac_unit_visits;
create policy "Technicians update assigned hvac_unit_visits" on public.hvac_unit_visits
  for update to authenticated
  using (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  )
  with check (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  );

-- Update deficiencies policies for hvac_unit_visit_id
drop policy if exists "Technicians manage deficiencies on assigned visits" on public.deficiencies;

create policy "Technicians manage deficiencies on assigned visits" on public.deficiencies
  for all to authenticated using (
    exists (
      select 1 from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = deficiencies.hvac_unit_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  ) with check (
    exists (
      select 1 from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = deficiencies.hvac_unit_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  );

-- Update visit_photos policies for hvac_unit_visit_id
drop policy if exists "Technicians manage photos on assigned visits" on public.visit_photos;

create policy "Technicians manage photos on assigned visits" on public.visit_photos
  for all to authenticated using (
    exists (
      select 1 from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = visit_photos.hvac_unit_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  ) with check (
    exists (
      select 1 from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = visit_photos.hvac_unit_visit_id
        and (select public.is_assigned_technician(sv.maintenance_id))
    )
  );

-- Storage upload policy supports {maintenance_id}/{suite_id}/... paths (3 or 4 segments)
drop policy if exists "Technicians can upload visit photos" on storage.objects;

create policy "Technicians can upload visit photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-photos'
    and (
      (select public.is_admin())
      or exists (
        select 1 from public.suite_visits sv
        join public.maintenance_assignments ma on ma.maintenance_id = sv.maintenance_id
        where sv.maintenance_id::text = (storage.foldername(name))[1]
          and sv.suite_id::text = (storage.foldername(name))[2]
          and ma.technician_id = (select auth.uid())
      )
    )
  );

grant select, insert, update, delete on public.hvac_units to authenticated;
grant select, insert, update, delete on public.hvac_unit_visits to authenticated;
grant select, insert, update, delete on public.hvac_units to service_role;
grant select, insert, update, delete on public.hvac_unit_visits to service_role;

-- Remove legacy enum if a partial migration created it
drop type if exists public.hvac_unit_visit_status;

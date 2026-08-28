-- Allow technicians to add missing suites on-site during active maintenances

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

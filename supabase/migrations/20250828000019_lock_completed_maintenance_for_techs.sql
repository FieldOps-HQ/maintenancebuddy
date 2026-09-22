-- Lock technician writes when a maintenance is completed (or cancelled).
-- Admins retain full access via existing org-admin policies.

create or replace function public.technician_can_edit_maintenance(p_maintenance_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenances m
    join public.maintenance_assignments ma on ma.maintenance_id = m.id
    where m.id = p_maintenance_id
      and ma.technician_id = (select auth.uid())
      and m.status in ('scheduled', 'in_progress')
  );
$$;

grant execute on function public.technician_can_edit_maintenance(uuid) to authenticated;

-- Suite visits
drop policy if exists "Technicians update assigned suite_visits" on public.suite_visits;
create policy "Technicians update assigned suite_visits" on public.suite_visits
  for update to authenticated
  using ((select public.technician_can_edit_maintenance(maintenance_id)))
  with check ((select public.technician_can_edit_maintenance(maintenance_id)));

-- HVAC unit visits
drop policy if exists "Technicians update assigned hvac_unit_visits" on public.hvac_unit_visits;
create policy "Technicians update assigned hvac_unit_visits" on public.hvac_unit_visits
  for update to authenticated
  using (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.technician_can_edit_maintenance(sv.maintenance_id))
    )
  )
  with check (
    exists (
      select 1 from public.suite_visits sv
      where sv.id = hvac_unit_visits.suite_visit_id
        and (select public.technician_can_edit_maintenance(sv.maintenance_id))
    )
  );

-- Deficiencies
drop policy if exists "Technicians manage deficiencies on assigned visits" on public.deficiencies;
create policy "Technicians manage deficiencies on assigned visits" on public.deficiencies
  for all to authenticated
  using (
    exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = deficiencies.hvac_unit_visit_id
        and (select public.technician_can_edit_maintenance(sv.maintenance_id))
    )
  )
  with check (
    exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = deficiencies.hvac_unit_visit_id
        and (select public.technician_can_edit_maintenance(sv.maintenance_id))
    )
  );

-- Visit photos (table)
drop policy if exists "Technicians manage photos on assigned visits" on public.visit_photos;
create policy "Technicians manage photos on assigned visits" on public.visit_photos
  for all to authenticated
  using (
    exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = visit_photos.hvac_unit_visit_id
        and (select public.technician_can_edit_maintenance(sv.maintenance_id))
    )
  )
  with check (
    exists (
      select 1
      from public.hvac_unit_visits huv
      join public.suite_visits sv on sv.id = huv.suite_visit_id
      where huv.id = visit_photos.hvac_unit_visit_id
        and (select public.technician_can_edit_maintenance(sv.maintenance_id))
    )
  );

-- Storage: upload / update / delete only while maintenance is editable
drop policy if exists "Technicians can upload visit photos" on storage.objects;
create policy "Technicians can upload visit photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visit-photos'
    and (select public.technician_can_edit_maintenance(
      nullif((storage.foldername(name))[1], '')::uuid
    ))
  );

drop policy if exists "Technicians can update visit photos" on storage.objects;
create policy "Technicians can update visit photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'visit-photos'
    and (select public.technician_can_edit_maintenance(
      nullif((storage.foldername(name))[1], '')::uuid
    ))
  )
  with check (bucket_id = 'visit-photos');

drop policy if exists "Technicians can delete visit photos" on storage.objects;
create policy "Technicians can delete visit photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'visit-photos'
    and (select public.technician_can_edit_maintenance(
      nullif((storage.foldername(name))[1], '')::uuid
    ))
  );

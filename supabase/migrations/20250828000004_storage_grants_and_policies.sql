-- Full storage setup for visit-photos (fixes uploads when auto-expose tables is disabled)

-- Ensure bucket exists
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;

-- Schema-level grants (required when Data API auto-expose is off)
grant usage on schema storage to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;

-- Replace all visit-photos policies with simpler, correct rules
-- Upload path: {maintenance_id}/{suite_id}/{filename}.jpg

drop policy if exists "Admins can read visit photos" on storage.objects;
drop policy if exists "Technicians can upload visit photos" on storage.objects;
drop policy if exists "Technicians can read own visit photos" on storage.objects;
drop policy if exists "Technicians can update visit photos" on storage.objects;

create policy "Admins can read visit photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos' and (select public.is_admin())
  );

create policy "Technicians can read assigned visit photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-photos'
    and exists (
      select 1 from public.maintenance_assignments ma
      where ma.technician_id = (select auth.uid())
        and ma.maintenance_id::text = (storage.foldername(name))[1]
    )
  );

create policy "Technicians can upload visit photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-photos'
    and exists (
      select 1 from public.maintenance_assignments ma
      where ma.technician_id = (select auth.uid())
        and ma.maintenance_id::text = (storage.foldername(name))[1]
    )
  );

create policy "Technicians can update visit photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'visit-photos'
    and exists (
      select 1 from public.maintenance_assignments ma
      where ma.technician_id = (select auth.uid())
        and ma.maintenance_id::text = (storage.foldername(name))[1]
    )
  ) with check (bucket_id = 'visit-photos');

create policy "Technicians can delete visit photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'visit-photos'
    and exists (
      select 1 from public.maintenance_assignments ma
      where ma.technician_id = (select auth.uid())
        and ma.maintenance_id::text = (storage.foldername(name))[1]
    )
  );

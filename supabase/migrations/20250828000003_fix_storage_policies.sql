-- Fix storage path policy: upload path is {maintenance_id}/{suite_id}/{file}.jpg
-- Previous policy incorrectly compared folder[2] to suite_visit.id

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

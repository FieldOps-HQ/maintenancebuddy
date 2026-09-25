-- Move visit-photo purge off Supabase Storage.
-- R2 objects are deleted by GET /api/cron/purge-visit-photos.
-- Unschedule the pg_cron job that called purge_expired_visit_photos against storage.objects.

create or replace function public.purge_expired_visit_photos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No-op: retention is handled by /api/cron/purge-visit-photos + R2.
  -- Kept so any leftover schedules fail soft instead of deleting the wrong storage backend.
  return jsonb_build_object(
    'deleted_photos', 0,
    'deleted_storage_objects', 0,
    'deprecated', true,
    'message', 'Use GET /api/cron/purge-visit-photos'
  );
end;
$$;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'purge-expired-visit-photos'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
exception
  when undefined_table then
    raise notice 'pg_cron cron.job not available; nothing to unschedule';
  when others then
    raise notice 'Could not unschedule purge-expired-visit-photos: %', sqlerrm;
end;
$$;

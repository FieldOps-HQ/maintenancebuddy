-- Track when a maintenance became completed, then purge visit photos
-- after it has stayed completed for 3 months (storage cost retention).

-- ---------------------------------------------------------------------------
-- completed_at on maintenances
-- ---------------------------------------------------------------------------

alter table public.maintenances
  add column if not exists completed_at timestamptz;

create index if not exists idx_maintenances_status_completed_at
  on public.maintenances (status, completed_at);

create or replace function public.set_maintenance_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      -- Only stamp when entering completed; keep original clock while still completed.
      if new.completed_at is null then
        new.completed_at := now();
      end if;
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists maintenances_set_completed_at on public.maintenances;
create trigger maintenances_set_completed_at
  before insert or update of status, completed_at on public.maintenances
  for each row execute function public.set_maintenance_completed_at();

-- Best-effort backfill for already-completed jobs
update public.maintenances
set completed_at = coalesce(updated_at, created_at)
where status = 'completed'
  and completed_at is null;

-- ---------------------------------------------------------------------------
-- Purge expired visit photos (storage + rows)
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_visit_photos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_ids uuid[];
  v_paths text[];
  v_deleted_storage integer := 0;
  v_deleted_photos integer := 0;
begin
  select
    coalesce(array_agg(vp.id), '{}'),
    coalesce(array_agg(vp.storage_path), '{}')
  into v_photo_ids, v_paths
  from public.visit_photos vp
  join public.hvac_unit_visits huv on huv.id = vp.hvac_unit_visit_id
  join public.suite_visits sv on sv.id = huv.suite_visit_id
  join public.maintenances m on m.id = sv.maintenance_id
  where m.status = 'completed'
    and m.completed_at is not null
    and m.completed_at <= (now() - interval '3 months');

  if cardinality(v_paths) > 0 then
    delete from storage.objects
    where bucket_id = 'visit-photos'
      and name = any (v_paths);
    get diagnostics v_deleted_storage = row_count;
  end if;

  if cardinality(v_photo_ids) > 0 then
    delete from public.visit_photos
    where id = any (v_photo_ids);
    get diagnostics v_deleted_photos = row_count;
  end if;

  return jsonb_build_object(
    'deleted_photos', v_deleted_photos,
    'deleted_storage_objects', v_deleted_storage
  );
end;
$$;

revoke all on function public.purge_expired_visit_photos() from public;
revoke all on function public.purge_expired_visit_photos() from anon;
revoke all on function public.purge_expired_visit_photos() from authenticated;
grant execute on function public.purge_expired_visit_photos() to service_role;

-- Daily at 04:00 UTC (enable pg_cron in Dashboard → Database → Extensions if needed)
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'purge-expired-visit-photos'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(
    'purge-expired-visit-photos',
    '0 4 * * *',
    $cron$select public.purge_expired_visit_photos()$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron cron.job not available; enable the pg_cron extension and schedule purge-expired-visit-photos manually';
  when others then
    raise notice 'Could not schedule purge-expired-visit-photos: %', sqlerrm;
end;
$$;

-- Unit/suite visit statuses: pending | completed | no_access | blocked_unit only.
-- Stop using in_progress / skipped for visits (maintenance jobs still use in_progress).

update public.hvac_unit_visits
set status = 'pending'
where status in ('in_progress', 'skipped');

update public.suite_visits
set status = 'pending'
where status in ('in_progress', 'skipped');

-- Keep enum values for history, but only allow the four active statuses.
alter table public.hvac_unit_visits
  drop constraint if exists hvac_unit_visits_status_allowed;
alter table public.hvac_unit_visits
  add constraint hvac_unit_visits_status_allowed
  check (status in ('pending', 'completed', 'blocked_unit', 'no_access'));

alter table public.suite_visits
  drop constraint if exists suite_visits_status_allowed;
alter table public.suite_visits
  add constraint suite_visits_status_allowed
  check (status in ('pending', 'completed', 'blocked_unit', 'no_access'));

create or replace function public.rollup_suite_visit_status(p_suite_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_done integer;
  v_new_status public.suite_visit_status;
  v_all_blocked boolean;
  v_all_no_access boolean;
  v_all_completed boolean;
begin
  select count(*) into v_total
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id;

  if v_total = 0 then
    return;
  end if;

  select count(*) into v_done
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id
    and status in ('completed', 'blocked_unit', 'no_access');

  -- Partially complete suites stay pending (no in_progress visit status).
  if v_done < v_total then
    v_new_status := 'pending';
  else
    select not exists (
      select 1 from public.hvac_unit_visits
      where suite_visit_id = p_suite_visit_id and status <> 'blocked_unit'
    ) into v_all_blocked;

    select not exists (
      select 1 from public.hvac_unit_visits
      where suite_visit_id = p_suite_visit_id and status not in ('no_access', 'blocked_unit')
    )
    and exists (
      select 1 from public.hvac_unit_visits
      where suite_visit_id = p_suite_visit_id and status = 'no_access'
    ) into v_all_no_access;

    select not exists (
      select 1 from public.hvac_unit_visits
      where suite_visit_id = p_suite_visit_id and status <> 'completed'
    ) into v_all_completed;

    if v_all_blocked then
      v_new_status := 'blocked_unit';
    elsif v_all_no_access then
      v_new_status := 'no_access';
    elsif v_all_completed then
      v_new_status := 'completed';
    elsif exists (
      select 1 from public.hvac_unit_visits
      where suite_visit_id = p_suite_visit_id and status = 'blocked_unit'
    ) then
      v_new_status := 'blocked_unit';
    elsif exists (
      select 1 from public.hvac_unit_visits
      where suite_visit_id = p_suite_visit_id and status = 'no_access'
    ) then
      v_new_status := 'no_access';
    else
      v_new_status := 'completed';
    end if;
  end if;

  update public.suite_visits
  set
    status = v_new_status,
    visited_at = case when v_new_status = 'completed' then coalesce(visited_at, now()) else visited_at end
  where id = p_suite_visit_id;
end;
$$;

-- Recompute suite statuses after backfill.
do $$
declare
  v_suite_visit_id uuid;
begin
  for v_suite_visit_id in select id from public.suite_visits loop
    perform public.rollup_suite_visit_status(v_suite_visit_id);
  end loop;
end;
$$;

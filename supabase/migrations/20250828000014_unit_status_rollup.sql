-- Unit visits: terminal statuses (completed, blocked, no access, skipped) count as done for suite rollup

create or replace function public.rollup_suite_visit_status(p_suite_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status public.suite_visit_status;
  v_total integer;
  v_done integer;
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

  select count(*) into v_done
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id
    and status in ('completed', 'blocked_unit', 'no_access', 'skipped');

  select count(*) into v_started
  from public.hvac_unit_visits
  where suite_visit_id = p_suite_visit_id
    and status in ('in_progress', 'completed', 'blocked_unit', 'no_access', 'skipped');

  if v_done = v_total then
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

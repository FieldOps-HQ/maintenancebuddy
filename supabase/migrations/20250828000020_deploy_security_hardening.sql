-- Deploy security hardening:
-- 1) Authorize rollup_suite_visit_status for org members only; revoke public execute
-- 2) Scope admin visit-photos storage reads to current org
-- 3) Bind storage UPDATE WITH CHECK to editable maintenance path
-- 4) Bind assignment WITH CHECK so technicians must be in the same org

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
  v_maintenance_id uuid;
  v_uid uuid := auth.uid();
begin
  -- Authenticated RPC callers must be org admin or assigned tech.
  -- Null uid is only reachable by elevated DB roles after EXECUTE is revoked from PUBLIC/anon.
  if v_uid is not null then
    select sv.maintenance_id
      into v_maintenance_id
    from public.suite_visits sv
    where sv.id = p_suite_visit_id;

    if v_maintenance_id is null then
      return;
    end if;

    if not exists (
      select 1
      from public.maintenances m
      join public.buildings b on b.id = m.building_id
      join public.profiles p on p.id = v_uid
      where m.id = v_maintenance_id
        and b.organization_id = p.organization_id
        and (
          p.role = 'admin'
          or exists (
            select 1
            from public.maintenance_assignments ma
            where ma.maintenance_id = m.id
              and ma.technician_id = v_uid
          )
        )
    ) then
      raise exception 'Access denied';
    end if;
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
    and status in ('completed', 'blocked_unit', 'no_access');

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

revoke all on function public.rollup_suite_visit_status(uuid) from public;
revoke all on function public.rollup_suite_visit_status(uuid) from anon;
grant execute on function public.rollup_suite_visit_status(uuid) to authenticated;
grant execute on function public.rollup_suite_visit_status(uuid) to service_role;

-- Org-scoped admin photo reads
drop policy if exists "Admins can read visit photos" on storage.objects;
create policy "Admins can read visit photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visit-photos'
    and (select public.is_org_admin())
    and exists (
      select 1
      from public.maintenances m
      join public.buildings b on b.id = m.building_id
      where m.id::text = (storage.foldername(name))[1]
        and b.organization_id = (select public.current_organization_id())
    )
  );

-- Prevent path escape on storage update
drop policy if exists "Technicians can update visit photos" on storage.objects;
create policy "Technicians can update visit photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'visit-photos'
    and (select public.technician_can_edit_maintenance(
      nullif((storage.foldername(name))[1], '')::uuid
    ))
  )
  with check (
    bucket_id = 'visit-photos'
    and (select public.technician_can_edit_maintenance(
      nullif((storage.foldername(name))[1], '')::uuid
    ))
  );

-- Assignments: technician must belong to the same org as the maintenance
drop policy if exists "Admins full access assignments" on public.maintenance_assignments;
create policy "Admins full access assignments" on public.maintenance_assignments
  for all to authenticated
  using (
    (select public.is_org_admin())
    and (select public.maintenance_in_current_org(maintenance_id))
  )
  with check (
    (select public.is_org_admin())
    and (select public.maintenance_in_current_org(maintenance_id))
    and exists (
      select 1
      from public.profiles p
      where p.id = technician_id
        and p.organization_id = (select public.current_organization_id())
    )
  );

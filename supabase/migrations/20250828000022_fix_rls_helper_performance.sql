-- Fix RLS helper performance: SECURITY INVOKER helpers re-check profiles/buildings
-- under RLS for every row, causing statement timeouts on buildings/maintenances lists.

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid());
$$;

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_admin();
$$;

create or replace function public.building_in_current_org(p_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.buildings b
    where b.id = p_building_id
      and b.organization_id = (select public.current_organization_id())
  );
$$;

create or replace function public.maintenance_in_current_org(p_maintenance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenances m
    join public.buildings b on b.id = m.building_id
    where m.id = p_maintenance_id
      and b.organization_id = (select public.current_organization_id())
  );
$$;

-- Callable by authenticated policies; not needed by anon
revoke all on function public.current_organization_id() from public;
revoke all on function public.current_organization_id() from anon;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_organization_id() to service_role;

revoke all on function public.is_org_admin() from public;
revoke all on function public.is_org_admin() from anon;
grant execute on function public.is_org_admin() to authenticated;
grant execute on function public.is_org_admin() to service_role;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

revoke all on function public.building_in_current_org(uuid) from public;
revoke all on function public.building_in_current_org(uuid) from anon;
grant execute on function public.building_in_current_org(uuid) to authenticated;
grant execute on function public.building_in_current_org(uuid) to service_role;

revoke all on function public.maintenance_in_current_org(uuid) from public;
revoke all on function public.maintenance_in_current_org(uuid) from anon;
grant execute on function public.maintenance_in_current_org(uuid) to authenticated;
grant execute on function public.maintenance_in_current_org(uuid) to service_role;

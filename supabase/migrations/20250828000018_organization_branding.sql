-- Organization branding: company logo path + admin update RLS + logo storage

alter table public.organizations
  add column if not exists logo_path text;

drop policy if exists "Org admins can update own organization" on public.organizations;
create policy "Org admins can update own organization" on public.organizations
  for update to authenticated
  using (
    id = (select public.current_organization_id())
    and (select public.is_org_admin())
  )
  with check (
    id = (select public.current_organization_id())
    and (select public.is_org_admin())
  );

-- Private bucket for company logos: {organization_id}/logo.{ext}
insert into storage.buckets (id, name, public)
values ('organization-logos', 'organization-logos', false)
on conflict (id) do nothing;

drop policy if exists "Org admins can read organization logos" on storage.objects;
drop policy if exists "Org admins can upload organization logos" on storage.objects;
drop policy if exists "Org admins can update organization logos" on storage.objects;
drop policy if exists "Org admins can delete organization logos" on storage.objects;

create policy "Org admins can read organization logos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'organization-logos'
    and (select public.is_org_admin())
    and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  );

create policy "Org admins can upload organization logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'organization-logos'
    and (select public.is_org_admin())
    and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  );

create policy "Org admins can update organization logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'organization-logos'
    and (select public.is_org_admin())
    and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  )
  with check (
    bucket_id = 'organization-logos'
    and (select public.is_org_admin())
    and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  );

create policy "Org admins can delete organization logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'organization-logos'
    and (select public.is_org_admin())
    and (storage.foldername(name))[1] = (select public.current_organization_id())::text
  );

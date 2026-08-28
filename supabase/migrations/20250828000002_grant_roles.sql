-- Grant service_role access (required when "Automatically expose new tables" is disabled)
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on public.maintenance_filter_summary to service_role;

-- Ensure authenticated role retains access
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.maintenance_filter_summary to authenticated;

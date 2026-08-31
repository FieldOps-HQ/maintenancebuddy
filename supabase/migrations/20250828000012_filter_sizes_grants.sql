-- filter_sizes was created after initial schema grants; grant table access explicitly

grant select, insert, update, delete on public.filter_sizes to authenticated;
grant all on public.filter_sizes to service_role;

notify pgrst, 'reload schema';

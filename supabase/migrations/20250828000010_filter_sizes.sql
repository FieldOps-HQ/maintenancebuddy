-- Global filter size catalog for admin-managed dropdowns

create table public.filter_sizes (
  id uuid primary key default gen_random_uuid(),
  length_in numeric(6, 2) not null,
  width_in numeric(6, 2) not null,
  thickness_in numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  unique (length_in, width_in, thickness_in)
);

insert into public.filter_sizes (length_in, width_in, thickness_in) values
  (16, 25, 1),
  (20, 20, 1),
  (20, 25, 1),
  (16, 20, 1),
  (14, 25, 1)
on conflict (length_in, width_in, thickness_in) do nothing;

-- Import any sizes already used on suites (e.g. 16x25x1)
insert into public.filter_sizes (length_in, width_in, thickness_in)
select
  split_part(filter_size, 'x', 1)::numeric,
  split_part(filter_size, 'x', 2)::numeric,
  split_part(filter_size, 'x', 3)::numeric
from public.suites
where filter_size ~ '^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$'
on conflict (length_in, width_in, thickness_in) do nothing;

alter table public.filter_sizes enable row level security;

create policy "Admins full access filter_sizes" on public.filter_sizes
  for all to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Authenticated read filter_sizes" on public.filter_sizes
  for select to authenticated using (true);

grant select, insert, update, delete on public.filter_sizes to authenticated;
grant all on public.filter_sizes to service_role;

-- Upgrade label-based filter_sizes (old 000010) to L × W × thickness columns

do $migrate$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'filter_sizes'
      and column_name = 'label'
  ) then
    alter table public.filter_sizes
      add column if not exists length_in numeric(6, 2),
      add column if not exists width_in numeric(6, 2),
      add column if not exists thickness_in numeric(6, 2);

    update public.filter_sizes
    set
      length_in = split_part(label, 'x', 1)::numeric,
      width_in = split_part(label, 'x', 2)::numeric,
      thickness_in = split_part(label, 'x', 3)::numeric
    where label ~ '^\d+(\.\d+)?x\d+(\.\d+)?x\d+(\.\d+)?$';

    delete from public.filter_sizes
    where length_in is null or width_in is null or thickness_in is null;

    alter table public.filter_sizes
      alter column length_in set not null,
      alter column width_in set not null,
      alter column thickness_in set not null;

    alter table public.filter_sizes drop column label;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'filter_sizes'
        and column_name = 'sort_order'
    ) then
      alter table public.filter_sizes drop column sort_order;
    end if;

    drop index if exists public.idx_filter_sizes_sort;
  end if;
end $migrate$;

create unique index if not exists idx_filter_sizes_dimensions
  on public.filter_sizes(length_in, width_in, thickness_in);

insert into public.filter_sizes (length_in, width_in, thickness_in) values
  (16, 25, 1),
  (20, 20, 1),
  (20, 25, 1),
  (16, 20, 1),
  (14, 25, 1)
on conflict (length_in, width_in, thickness_in) do nothing;

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';

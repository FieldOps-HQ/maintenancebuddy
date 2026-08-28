-- Restructure building address fields

alter table public.buildings
  add column if not exists street_number text,
  add column if not exists street text,
  add column if not exists postal_code text;

-- Migrate existing address column if present
update public.buildings
set
  street_number = coalesce(
    nullif(street_number, ''),
    nullif(split_part(address, ' ', 1), ''),
    '—'
  ),
  street = coalesce(
    nullif(street, ''),
    nullif(trim(substring(address from position(' ' in address) + 1)), ''),
    address
  ),
  postal_code = coalesce(nullif(postal_code, ''), 'TBD')
where address is not null;

update public.buildings
set
  street_number = coalesce(nullif(street_number, ''), '—'),
  street = coalesce(nullif(street, ''), '—'),
  postal_code = coalesce(nullif(postal_code, ''), 'TBD')
where street is null or street_number is null or postal_code is null;

alter table public.buildings
  alter column street_number set not null,
  alter column street set not null,
  alter column postal_code set not null;

alter table public.buildings drop column if exists address;
alter table public.buildings drop column if exists notes;

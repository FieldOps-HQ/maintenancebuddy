-- Seed demo data

-- Create demo users via auth (handled in seed script via supabase auth admin API)
-- This seed inserts data that depends on known user IDs from the seed script

-- Demo building
insert into public.buildings (id, name, street_number, street, city, postal_code)
values (
  '11111111-1111-1111-1111-111111111111',
  'Harbour View Condos',
  '100',
  'Lakeshore Blvd',
  'Toronto',
  'M5J 2T4'
);

insert into public.building_contacts (building_id, name, role, phone, email)
values
  ('11111111-1111-1111-1111-111111111111', 'Sarah Chen', 'Property Manager', '416-555-0100', 'sarah@harbourview.ca'),
  ('11111111-1111-1111-1111-111111111111', 'Mike Torres', 'Superintendent', '416-555-0101', 'mike@harbourview.ca');

-- Generate 48 suites (floors 2-7, 8 suites per floor)
insert into public.suites (building_id, suite_number, floor, filter_size, filter_quantity)
select
  '11111111-1111-1111-1111-111111111111',
  (floor_num * 100 + suite_num)::text,
  floor_num::text,
  case when suite_num <= 4 then '16x25x1' else '20x20x1' end,
  1
from generate_series(2, 7) as floor_num
cross join generate_series(1, 8) as suite_num;

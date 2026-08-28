-- Only one scheduled or in-progress maintenance per building at a time

create unique index idx_one_active_maintenance_per_building
  on public.maintenances (building_id)
  where status in ('scheduled', 'in_progress');

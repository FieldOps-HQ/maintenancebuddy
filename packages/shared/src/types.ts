export type UserRole = "admin" | "technician";

export type InviteStatus = "pending" | "accepted" | "revoked";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface OrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  invited_by: string | null;
  status: InviteStatus;
  created_at: string;
}

export type MaintenanceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type SuiteVisitStatus =
  | "pending"
  | "completed"
  | "blocked_unit"
  | "no_access"
  | "skipped"
  | "in_progress";

export type DeficiencyCategory =
  | "not_cleaned"
  | "filter_not_changed"
  | "not_operating"
  | "other";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_id: string;
  created_at: string;
}

export interface Building {
  id: string;
  organization_id: string;
  name: string;
  street_number: string;
  street: string;
  city: string;
  postal_code: string;
  created_at: string;
  updated_at: string;
}

export interface BuildingContact {
  id: string;
  building_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export interface FilterSize {
  id: string;
  organization_id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
  created_at: string;
}

export interface Suite {
  id: string;
  building_id: string;
  suite_number: string;
  floor: string | null;
  filter_size: string | null;
  filter_quantity: number;
  hvac_location_notes: string | null;
  created_at: string;
}

export interface HvacUnit {
  id: string;
  suite_id: string;
  name: string;
  location_notes: string | null;
  filter_size: string | null;
  filter_quantity: number;
  sort_order: number;
  created_at: string;
}

export interface Maintenance {
  id: string;
  building_id: string;
  start_date: string;
  end_date: string;
  status: MaintenanceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceAssignment {
  id: string;
  maintenance_id: string;
  technician_id: string;
  created_at: string;
}

export interface SuiteVisit {
  id: string;
  maintenance_id: string;
  suite_id: string;
  status: SuiteVisitStatus;
  visited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HvacUnitVisit {
  id: string;
  suite_visit_id: string;
  hvac_unit_id: string;
  status: SuiteVisitStatus;
  cleaned: boolean | null;
  filter_changed: boolean | null;
  operating_normally: boolean | null;
  visited_at: string | null;
  visited_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deficiency {
  id: string;
  hvac_unit_visit_id: string;
  category: DeficiencyCategory;
  description: string;
  created_at: string;
}

export interface VisitPhoto {
  id: string;
  hvac_unit_visit_id: string;
  storage_path: string;
  created_at: string;
}

export interface SuiteVisitWithSuite extends SuiteVisit {
  suite: Suite;
}

export interface HvacUnitVisitWithUnit extends HvacUnitVisit {
  hvac_unit: HvacUnit;
}

export interface SuiteVisitWithUnits extends SuiteVisitWithSuite {
  hvac_unit_visits: HvacUnitVisitWithUnit[];
}

export interface MaintenanceWithDetails extends Maintenance {
  building: Building;
  assignments: (MaintenanceAssignment & { technician: Profile })[];
  suite_visits: SuiteVisitWithUnits[];
}

export interface FilterSummary {
  filter_size: string;
  total_quantity: number;
}

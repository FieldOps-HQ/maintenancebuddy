import { getSuiteVisitRollupStatus, type SuiteVisitStatus } from "@maintenancebuddy/shared";
import type {
  SuiteVisitDetailData,
  UnitVisitDetailData,
} from "@/components/maintenances/suite-visit-detail-dialog";

export const UNIT_VISIT_SELECT = `
  id,
  status,
  cleaned,
  filter_changed,
  operating_normally,
  visited_at,
  notes,
  hvac_unit:hvac_units(name, filter_size, filter_quantity),
  deficiencies:deficiencies!deficiencies_hvac_unit_visit_id_fkey(id, category, description),
  visit_photos:visit_photos!visit_photos_hvac_unit_visit_id_fkey(id, storage_path)
`;

export const SUITE_VISIT_SELECT = `
  id,
  visited_at,
  suite:suites(suite_number, floor),
  hvac_unit_visits(${UNIT_VISIT_SELECT})
`;

export function mapSuiteVisitRow(v: {
  id: string;
  visited_at: string | null;
  suite: {
    suite_number: string;
    floor: string | null;
  } | null;
  hvac_unit_visits?: {
    id: string;
    status: string;
    cleaned: boolean | null;
    filter_changed: boolean | null;
    operating_normally: boolean | null;
    visited_at: string | null;
    notes: string | null;
    hvac_unit: {
      name: string;
      filter_size: string | null;
      filter_quantity: number | null;
    } | null;
    deficiencies?: { id: string; category: string; description: string }[];
    visit_photos?: { id: string; storage_path: string }[];
  }[];
}): SuiteVisitDetailData {
  const unitVisits: UnitVisitDetailData[] = (v.hvac_unit_visits ?? []).map((uv) => ({
    id: uv.id,
    status: uv.status as SuiteVisitStatus,
    cleaned: uv.cleaned,
    filter_changed: uv.filter_changed,
    operating_normally: uv.operating_normally,
    visited_at: uv.visited_at,
    notes: uv.notes,
    unit_name: uv.hvac_unit?.name ?? "Unit",
    filter_size: uv.hvac_unit?.filter_size ?? null,
    filter_quantity: uv.hvac_unit?.filter_quantity ?? null,
    deficiencies: uv.deficiencies ?? [],
    photos: uv.visit_photos ?? [],
  }));

  return {
    id: v.id,
    status: getSuiteVisitRollupStatus(unitVisits),
    suite_number: v.suite?.suite_number ?? "",
    floor: v.suite?.floor ?? null,
    visited_at: v.visited_at,
    unit_visits: unitVisits,
  };
}

export function buildUnitVisitStatusUpdates(
  status: SuiteVisitStatus,
  notes: string | null,
  resetWizardFields = false
) {
  const wizardFields = {
    cleaned: null as boolean | null,
    filter_changed: null as boolean | null,
    operating_normally: null as boolean | null,
    visited_by: null as string | null,
  };

  if (status === "blocked_unit" || status === "no_access") {
    return {
      status,
      notes,
      visited_at: new Date().toISOString(),
      ...wizardFields,
    };
  }

  if (status === "pending") {
    return {
      status,
      notes: null,
      visited_at: null,
      ...wizardFields,
    };
  }

  if (resetWizardFields) {
    return {
      status,
      notes: null,
      visited_at: new Date().toISOString(),
      ...wizardFields,
    };
  }

  return {
    status,
    notes: null,
    visited_at: new Date().toISOString(),
  };
}

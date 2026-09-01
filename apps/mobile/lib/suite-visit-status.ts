import type { SupabaseClient } from "@supabase/supabase-js";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";

type AccessStatus = Extract<SuiteVisitStatus, "no_access" | "blocked_unit">;

export function buildUnitAccessStatusUpdates(status: AccessStatus, note: string) {
  return {
    status,
    notes: note,
    visited_at: new Date().toISOString(),
    cleaned: null,
    filter_changed: null,
    operating_normally: null,
  };
}

export async function applyAllUnitsAccessStatus(
  supabase: SupabaseClient,
  suiteVisitId: string,
  status: AccessStatus,
  note: string
) {
  const unitUpdates = buildUnitAccessStatusUpdates(status, note);

  const { error } = await supabase
    .from("hvac_unit_visits")
    .update(unitUpdates)
    .eq("suite_visit_id", suiteVisitId);

  if (error) {
    throw error;
  }
}

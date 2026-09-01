import type { SupabaseClient } from "@supabase/supabase-js";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";

export function isLeavingCompletedStatus(
  previousStatus: SuiteVisitStatus,
  nextStatus: SuiteVisitStatus
): boolean {
  return previousStatus === "completed" && nextStatus !== "completed";
}

export async function resetSuiteVisitCompletionData(
  supabase: SupabaseClient,
  unitVisits: { id: string; photos: { storage_path: string }[] }[]
) {
  const unitVisitIds = unitVisits.map((unitVisit) => unitVisit.id);
  if (unitVisitIds.length === 0) return;

  const storagePaths = [
    ...new Set(unitVisits.flatMap((unitVisit) => unitVisit.photos.map((photo) => photo.storage_path))),
  ];

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from("visit-photos").remove(storagePaths);
    if (storageError) {
      throw new Error(`Failed to delete photos: ${storageError.message}`);
    }
  }

  const { error: photosError } = await supabase
    .from("visit_photos")
    .delete()
    .in("hvac_unit_visit_id", unitVisitIds);

  if (photosError) {
    throw new Error(`Failed to delete photo records: ${photosError.message}`);
  }

  const { error: deficienciesError } = await supabase
    .from("deficiencies")
    .delete()
    .in("hvac_unit_visit_id", unitVisitIds);

  if (deficienciesError) {
    throw new Error(`Failed to delete deficiencies: ${deficienciesError.message}`);
  }
}

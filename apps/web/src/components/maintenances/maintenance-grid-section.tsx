import { createClient } from "@/lib/supabase/server";
import {
  mapSuiteVisitGridRows,
  SUITE_VISIT_GRID_SELECT,
} from "@/lib/suite-visit-mapper";
import { MaintenanceProgress } from "@/components/maintenances/maintenance-progress";

export async function MaintenanceGridSection({
  maintenanceId,
  buildingId,
}: {
  maintenanceId: string;
  buildingId: string;
}) {
  const supabase = await createClient();

  const [{ data: suiteVisits, error: visitsError }, { data: suites, error: suitesError }] =
    await Promise.all([
      supabase
        .from("suite_visits")
        .select(SUITE_VISIT_GRID_SELECT)
        .eq("maintenance_id", maintenanceId),
      supabase
        .from("suites")
        .select("id, suite_number, floor")
        .eq("building_id", buildingId),
    ]);

  if (visitsError) throw new Error(visitsError.message);
  if (suitesError) throw new Error(suitesError.message);

  const suitesById = new Map(
    (suites ?? []).map((suite) => [
      suite.id,
      { suite_number: suite.suite_number, floor: suite.floor },
    ])
  );
  const visits = mapSuiteVisitGridRows(suiteVisits ?? [], suitesById);
  const done = visits.filter((v) =>
    ["completed", "blocked_unit", "no_access"].includes(v.status)
  ).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {done}/{visits.length} suites complete
      </p>
      <MaintenanceProgress maintenanceId={maintenanceId} buildingId={buildingId} initialVisits={visits} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_MAINTENANCE_STATUSES } from "@maintenancebuddy/shared";
import { collectVisitIssues } from "@/lib/visit-issues";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaintenanceProgress } from "@/components/maintenances/maintenance-progress";
import { DownloadReportButton } from "@/components/maintenances/download-report-button";
import { MaintenanceHeader } from "@/components/maintenances/maintenance-actions";
import { VisitIssuesCard } from "@/components/maintenances/visit-issues-card";
import type { SuiteVisitDetailData } from "@/components/maintenances/suite-visit-detail-dialog";
import { mapSuiteVisitRow } from "@/lib/suite-visit-mapper";

const UNIT_VISIT_SELECT = `
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

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: maintenance }, { data: technicians }, { data: activeMaintenances }] =
    await Promise.all([
      supabase
        .from("maintenances")
        .select(`
          *,
          building:buildings(*),
          assignments:maintenance_assignments(technician_id, technician:profiles(full_name, email)),
          suite_visits(
            *,
            suite:suites(*),
            hvac_unit_visits(${UNIT_VISIT_SELECT})
          )
        `)
        .eq("id", id)
        .single(),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("role", "technician")
        .order("full_name"),
      supabase
        .from("maintenances")
        .select("id, building_id")
        .in("status", ACTIVE_MAINTENANCE_STATUSES),
    ]);

  if (!maintenance) notFound();

  const visits = maintenance.suite_visits ?? [];
  const total = visits.length;
  const done = visits.filter((v) =>
    ["completed", "blocked_unit", "no_access"].includes(v.status)
  ).length;
  const visitIssues = collectVisitIssues(visits);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <MaintenanceHeader
            maintenance={{
              id: maintenance.id,
              building_id: maintenance.building_id,
              start_date: maintenance.start_date,
              end_date: maintenance.end_date,
              status: maintenance.status,
              notes: maintenance.notes,
            }}
            buildingName={maintenance.building?.name ?? "Maintenance"}
            technicians={technicians ?? []}
            assignedTechnicianIds={
              maintenance.assignments?.map((a) => a.technician_id).filter(Boolean) ?? []
            }
            activeMaintenances={activeMaintenances ?? []}
          />
          <p className="text-sm text-slate-500">
            {done}/{total} suites complete
          </p>
        </div>
        <DownloadReportButton maintenanceId={id} />
      </div>

      <MaintenanceProgress
        maintenanceId={id}
        initialVisits={visits.map(mapSuiteVisitRow)}
      />

      {(maintenance.assignments?.length ?? 0) > 0 || visitIssues.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {(maintenance.assignments?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assigned Technicians</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {maintenance.assignments?.map((a) => (
                  <div key={a.technician?.email} className="text-sm">
                    <p className="font-medium">{a.technician?.full_name}</p>
                    <p className="text-slate-500">{a.technician?.email}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {visitIssues.length > 0 && <VisitIssuesCard issues={visitIssues} />}
        </div>
      ) : null}
    </div>
  );
}

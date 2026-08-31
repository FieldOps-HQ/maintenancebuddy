import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_MAINTENANCE_STATUSES } from "@maintenancebuddy/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaintenanceProgress } from "@/components/maintenances/maintenance-progress";
import { DownloadReportButton } from "@/components/maintenances/download-report-button";
import { MaintenanceHeader } from "@/components/maintenances/maintenance-actions";
import type { SuiteVisitDetailData } from "@/components/maintenances/suite-visit-detail-dialog";

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

function mapInitialVisit(v: {
  id: string;
  status: string;
  visited_at: string | null;
  notes: string | null;
  suite: { suite_number: string; floor: string | null } | null;
  hvac_unit_visits?: {
    id: string;
    status: string;
    cleaned: boolean | null;
    filter_changed: boolean | null;
    operating_normally: boolean | null;
    visited_at: string | null;
    notes: string | null;
    hvac_unit: { name: string; filter_size: string | null; filter_quantity: number | null } | null;
    deficiencies?: { id: string; category: string; description: string }[];
    visit_photos?: { id: string; storage_path: string }[];
  }[];
}): SuiteVisitDetailData {
  return {
    id: v.id,
    status: v.status as SuiteVisitDetailData["status"],
    suite_number: v.suite?.suite_number ?? "",
    floor: v.suite?.floor ?? null,
    visited_at: v.visited_at,
    notes: v.notes,
    unit_visits: (v.hvac_unit_visits ?? []).map((uv) => ({
      id: uv.id,
      status: uv.status as SuiteVisitDetailData["status"],
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
    })),
  };
}

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

  const { data: filterSummary } = await supabase
    .from("maintenance_filter_summary")
    .select("*")
    .eq("maintenance_id", id);

  const visits = maintenance.suite_visits ?? [];
  const total = visits.length;
  const completed = visits.filter((v) => v.status === "completed").length;
  const blocked = visits.filter((v) => v.status === "blocked_unit").length;
  const noAccess = visits.filter((v) => v.status === "no_access").length;
  const pending = visits.filter((v) => v.status === "pending").length;
  const deficiencies = visits.flatMap((v) =>
    (v.hvac_unit_visits ?? []).flatMap((uv) => uv.deficiencies ?? [])
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
        <DownloadReportButton maintenanceId={id} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Completed", value: completed, color: "text-green-600" },
          { label: "Pending", value: pending, color: "text-zinc-600" },
          { label: "No Access", value: noAccess, color: "text-yellow-600" },
          { label: "Blocked", value: blocked, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MaintenanceProgress
            maintenanceId={id}
            initialVisits={visits.map(mapInitialVisit)}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assigned Technicians</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {maintenance.assignments?.map((a) => (
                <div key={a.technician?.email} className="text-sm">
                  <p className="font-medium">{a.technician?.full_name}</p>
                  <p className="text-zinc-500">{a.technician?.email}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filter Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              {!filterSummary?.length ? (
                <p className="text-sm text-zinc-500">No filter data</p>
              ) : (
                <div className="space-y-2">
                  {filterSummary.map((f) => (
                    <div key={f.filter_size} className="flex justify-between text-sm">
                      <span>{f.filter_size}</span>
                      <span className="font-medium">{f.total_quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {deficiencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deficiencies ({deficiencies.length})</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 space-y-2 overflow-auto">
                {visits
                  .filter((v) => (v.hvac_unit_visits ?? []).some((uv) => uv.deficiencies?.length))
                  .map((v) => (
                    <div key={v.id} className="rounded-lg border border-zinc-100 p-2 text-sm">
                      <p className="font-medium">Suite {v.suite?.suite_number}</p>
                      {(v.hvac_unit_visits ?? []).flatMap((uv) =>
                        (uv.deficiencies ?? []).map((d) => (
                          <p key={d.id} className="text-zinc-600">
                            {uv.hvac_unit?.name}: {d.description}
                          </p>
                        ))
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress: {completed + blocked + noAccess} / {total} suites</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${total ? ((completed + blocked + noAccess) / total) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

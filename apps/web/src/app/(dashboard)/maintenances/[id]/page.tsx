import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DownloadReportButton } from "@/components/maintenances/download-report-button";
import { MaintenanceHeader } from "@/components/maintenances/maintenance-actions";
import { MaintenanceSidePanels } from "@/components/maintenances/maintenance-side-panels";
import { MaintenanceGridSection } from "@/components/maintenances/maintenance-grid-section";

function GridSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 h-5 w-24 rounded bg-slate-200" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
          {Array.from({ length: 24 }).map((_, index) => (
            <div key={index} className="h-12 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: maintenance, error: maintenanceError } = await supabase
    .from("maintenances")
    .select(`
      id,
      building_id,
      start_date,
      end_date,
      status,
      notes,
      building:buildings(name),
      assignments:maintenance_assignments(technician_id, technician:profiles(full_name, email))
    `)
    .eq("id", id)
    .single();

  if (maintenanceError && maintenanceError.code !== "PGRST116") {
    throw new Error(maintenanceError.message);
  }

  if (!maintenance) notFound();

  return (
    <div className="space-y-6">
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
          assignedTechnicianIds={
            maintenance.assignments?.map((a) => a.technician_id).filter(Boolean) ?? []
          }
        />
        <DownloadReportButton maintenanceId={id} />
      </div>

      <Suspense fallback={<GridSkeleton />}>
        <MaintenanceGridSection maintenanceId={id} buildingId={maintenance.building_id} />
      </Suspense>

      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        }
      >
        <MaintenanceSidePanels
          maintenanceId={id}
          assignments={maintenance.assignments ?? []}
        />
      </Suspense>
    </div>
  );
}

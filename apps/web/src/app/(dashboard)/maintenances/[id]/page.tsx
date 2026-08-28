import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaintenanceProgress } from "@/components/maintenances/maintenance-progress";
import { DownloadReportButton } from "@/components/maintenances/download-report-button";

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: maintenance } = await supabase
    .from("maintenances")
    .select(`
      *,
      building:buildings(*),
      assignments:maintenance_assignments(technician:profiles(full_name, email)),
      suite_visits(*, suite:suites(*), deficiencies(*), visit_photos(*))
    `)
    .eq("id", id)
    .single();

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
  const deficiencies = visits.flatMap((v) => v.deficiencies ?? []);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{maintenance.building?.name}</h1>
          <p className="text-zinc-500">
            {formatDate(maintenance.start_date)} – {formatDate(maintenance.end_date)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={maintenance.status === "completed" ? "success" : "warning"}>
              {maintenance.status.replace("_", " ")}
            </Badge>
            {maintenance.notes && (
              <span className="text-sm text-zinc-500">{maintenance.notes}</span>
            )}
          </div>
        </div>
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
            initialVisits={visits.map((v) => ({
              id: v.id,
              status: v.status,
              suite_number: v.suite?.suite_number ?? "",
              floor: v.suite?.floor ?? null,
              filter_size: v.suite?.filter_size ?? null,
              filter_quantity: v.suite?.filter_quantity ?? null,
              cleaned: v.cleaned,
              filter_changed: v.filter_changed,
              operating_normally: v.operating_normally,
              visited_at: v.visited_at,
              notes: v.notes,
              deficiencies: v.deficiencies ?? [],
              photos: v.visit_photos ?? [],
            }))}
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
                  .filter((v) => v.deficiencies?.length)
                  .map((v) => (
                    <div key={v.id} className="rounded-lg border border-zinc-100 p-2 text-sm">
                      <p className="font-medium">Suite {v.suite?.suite_number}</p>
                      {v.deficiencies?.map((d) => (
                        <p key={d.id} className="text-zinc-600">{d.description}</p>
                      ))}
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

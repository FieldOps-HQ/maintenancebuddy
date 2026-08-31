import Link from "next/link";
import {
  getMaintenanceTiming,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_TIMING_LABELS,
  type MaintenanceStatus,
  type MaintenanceTiming,
} from "@maintenancebuddy/shared";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BuildingMaintenance {
  id: string;
  start_date: string;
  end_date: string;
  status: MaintenanceStatus;
  suite_visits?: { status: string }[];
}

const statusVariant: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

const timingOrder: MaintenanceTiming[] = ["current", "future", "previous"];

function MaintenanceRow({ maintenance }: { maintenance: BuildingMaintenance }) {
  const total = maintenance.suite_visits?.length ?? 0;
  const done =
    maintenance.suite_visits?.filter((v) =>
      ["completed", "blocked_unit", "no_access", "skipped"].includes(v.status)
    ).length ?? 0;

  return (
    <Link href={`/maintenances/${maintenance.id}`}>
      <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:shadow-sm">
        <div>
          <p className="font-medium text-slate-900">
            {formatDate(maintenance.start_date)} – {formatDate(maintenance.end_date)}
          </p>
          <p className="text-sm text-slate-500">
            {done}/{total} suites complete
          </p>
        </div>
        <Badge variant={statusVariant[maintenance.status] ?? "secondary"}>
          {MAINTENANCE_STATUS_LABELS[maintenance.status]}
        </Badge>
      </div>
    </Link>
  );
}

export function BuildingMaintenances({ maintenances }: { maintenances: BuildingMaintenance[] }) {
  const grouped = timingOrder.reduce(
    (acc, timing) => {
      acc[timing] = maintenances.filter((m) => getMaintenanceTiming(m) === timing);
      return acc;
    },
    {} as Record<MaintenanceTiming, BuildingMaintenance[]>
  );

  grouped.current.sort((a, b) => a.start_date.localeCompare(b.start_date));
  grouped.future.sort((a, b) => a.start_date.localeCompare(b.start_date));
  grouped.previous.sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenances ({maintenances.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {maintenances.length === 0 ? (
          <p className="text-sm text-slate-500">No maintenances scheduled for this building yet.</p>
        ) : (
          timingOrder.map((timing) => {
            const items = grouped[timing];
            if (!items.length) return null;

            return (
              <div key={timing} className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  {MAINTENANCE_TIMING_LABELS[timing]} ({items.length})
                </h3>
                <div className="space-y-2">
                  {items.map((maintenance) => (
                    <MaintenanceRow key={maintenance.id} maintenance={maintenance} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

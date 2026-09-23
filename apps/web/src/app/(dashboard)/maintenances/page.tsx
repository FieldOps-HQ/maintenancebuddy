import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/lib/utils";
import { ChevronRight, Plus } from "lucide-react";

const statusVariant: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

const DONE_STATUSES = new Set(["completed", "blocked_unit", "no_access"]);

export default async function MaintenancesPage() {
  const supabase = await createClient();
  const { data: maintenances } = await supabase
    .from("maintenances")
    .select("id, start_date, end_date, status, building:buildings(name)")
    .order("start_date", { ascending: false });

  const maintenanceIds = (maintenances ?? []).map((m) => m.id);
  const progressByMaintenance = new Map<string, { total: number; done: number }>();

  if (maintenanceIds.length > 0) {
    const { data: visitStatuses } = await supabase
      .from("suite_visits")
      .select("maintenance_id, status")
      .in("maintenance_id", maintenanceIds);

    for (const visit of visitStatuses ?? []) {
      const current = progressByMaintenance.get(visit.maintenance_id) ?? { total: 0, done: 0 };
      current.total += 1;
      if (DONE_STATUSES.has(visit.status)) current.done += 1;
      progressByMaintenance.set(visit.maintenance_id, current);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenances"
        description="Schedule and track building maintenance jobs"
        actions={
          <Link href="/maintenances/new">
            <Button>
              <Plus className="h-4 w-4" />
              Schedule maintenance
            </Button>
          </Link>
        }
      />

      <Card className="overflow-hidden">
        {!maintenances?.length ? (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No maintenances scheduled yet.
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Building</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenances.map((m) => {
                const progress = progressByMaintenance.get(m.id) ?? { total: 0, done: 0 };
                const pct =
                  progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

                return (
                  <TableRow key={m.id} className="group">
                    <TableCell>
                      <Link
                        href={`/maintenances/${m.id}`}
                        className="font-medium text-foreground group-hover:text-teal-800"
                      >
                        {m.building?.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(m.start_date)} – {formatDate(m.end_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[120px] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-teal-600 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {progress.done}/{progress.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[m.status] ?? "secondary"}>
                        {m.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/maintenances/${m.id}`}>
                        <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-teal-600" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

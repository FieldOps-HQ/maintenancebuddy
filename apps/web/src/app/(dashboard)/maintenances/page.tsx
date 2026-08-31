import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/lib/utils";
import { ChevronRight, Plus } from "lucide-react";

const statusVariant: Record<string, "secondary" | "warning" | "success" | "destructive"> = {
  scheduled: "secondary",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

export default async function MaintenancesPage() {
  const supabase = await createClient();
  const { data: maintenances } = await supabase
    .from("maintenances")
    .select("*, building:buildings(name), suite_visits(status)")
    .order("start_date", { ascending: false });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Maintenances"
        description="Schedule and track building maintenance jobs"
        actions={
          <Link href="/maintenances/new">
            <Button>
              <Plus className="h-4 w-4" />
              Schedule Maintenance
            </Button>
          </Link>
        }
      />

      <div className="space-y-3">
        {!maintenances?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              No maintenances scheduled yet.
            </CardContent>
          </Card>
        ) : (
          maintenances.map((m) => {
            const total = m.suite_visits?.length ?? 0;
            const done = m.suite_visits?.filter((v) =>
              ["completed", "blocked_unit", "no_access", "skipped"].includes(v.status)
            ).length ?? 0;

            return (
              <Link key={m.id} href={`/maintenances/${m.id}`}>
                <Card className="group transition-all hover:-translate-y-0.5 hover:border-sky-200/60 hover:shadow-md">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold text-slate-900 group-hover:text-sky-700">{m.building?.name}</p>
                      <p className="text-sm text-slate-500">
                        {formatDate(m.start_date)} – {formatDate(m.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm text-slate-500">
                        {done}/{total} suites
                      </p>
                      <Badge variant={statusVariant[m.status] ?? "secondary"}>
                        {m.status.replace("_", " ")}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-sky-500" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

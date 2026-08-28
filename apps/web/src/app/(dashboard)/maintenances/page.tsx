import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maintenances</h1>
          <p className="text-zinc-500">Schedule and track building maintenance jobs</p>
        </div>
        <Link href="/maintenances/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Schedule Maintenance
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {!maintenances?.length ? (
          <Card>
            <CardContent className="py-8 text-center text-zinc-500">
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
                <Card className="transition-colors hover:bg-zinc-50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold">{m.building?.name}</p>
                      <p className="text-sm text-zinc-500">
                        {formatDate(m.start_date)} – {formatDate(m.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm text-zinc-500">
                        {done}/{total} suites
                      </p>
                      <Badge variant={statusVariant[m.status] ?? "secondary"}>
                        {m.status.replace("_", " ")}
                      </Badge>
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

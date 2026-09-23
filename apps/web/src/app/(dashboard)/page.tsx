import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/lib/utils";
import { Building2, Calendar, ArrowRight } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: buildingCount }, { count: activeCount }, { data: recentMaintenances }] =
    await Promise.all([
      supabase.from("buildings").select("*", { count: "exact", head: true }),
      supabase
        .from("maintenances")
        .select("*", { count: "exact", head: true })
        .in("status", ["scheduled", "in_progress"]),
      supabase
        .from("maintenances")
        .select("*, building:buildings(name)")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const stats = [
    {
      label: "Buildings",
      value: buildingCount ?? 0,
      icon: Building2,
      hint: "Active properties",
      tone: "text-teal-700 bg-teal-50",
    },
    {
      label: "Active jobs",
      value: activeCount ?? 0,
      icon: Calendar,
      hint: "Scheduled or in progress",
      tone: "text-amber-700 bg-amber-50",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your HVAC maintenance operations"
        actions={
          <Link href="/maintenances/new">
            <Button>Schedule maintenance</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map(({ label, value, icon: Icon, hint, tone }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between py-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-foreground">
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-md ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <div>
            <CardTitle>Recent maintenances</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Latest jobs across your buildings</p>
          </div>
          <Link
            href="/maintenances"
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {!recentMaintenances?.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No maintenances yet. Schedule your first one.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recentMaintenances.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/maintenances/${m.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{m.building?.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatDate(m.start_date)} – {formatDate(m.end_date)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        m.status === "completed"
                          ? "success"
                          : m.status === "in_progress"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {m.status.replace("_", " ")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/buildings">
          <Button variant="outline">Manage buildings</Button>
        </Link>
        <Link href="/maintenances">
          <Button variant="outline">View maintenances</Button>
        </Link>
        <Link href="/team">
          <Button variant="outline">Invite technicians</Button>
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Building2, Calendar, CheckCircle2, Clock } from "lucide-react";

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
        .limit(5),
    ]);

  const stats = [
    { label: "Buildings", value: buildingCount ?? 0, icon: Building2 },
    { label: "Active Maintenances", value: activeCount ?? 0, icon: Calendar },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-zinc-500">Overview of your HVAC maintenance operations</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">{label}</CardTitle>
              <Icon className="h-4 w-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Maintenances</CardTitle>
          <Link href="/maintenances/new">
            <Button size="sm">Schedule Maintenance</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {!recentMaintenances?.length ? (
            <p className="text-sm text-zinc-500">No maintenances yet. Schedule your first one.</p>
          ) : (
            <div className="space-y-3">
              {recentMaintenances.map((m) => (
                <Link
                  key={m.id}
                  href={`/maintenances/${m.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 p-4 hover:bg-zinc-50"
                >
                  <div>
                    <p className="font-medium">{m.building?.name}</p>
                    <p className="text-sm text-zinc-500">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/buildings"><Button variant="outline">Manage Buildings</Button></Link>
            <Link href="/maintenances"><Button variant="outline">View Maintenances</Button></Link>
            <Link href="/maintenances/new"><Button variant="outline">Schedule New</Button></Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" /> Getting Started
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600 space-y-2">
            <p>1. Add a building and import suites</p>
            <p>2. Schedule a maintenance and assign technicians</p>
            <p>3. Track progress live as techs update suites on mobile</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

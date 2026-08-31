import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
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
    { label: "Buildings", value: buildingCount ?? 0, icon: Building2, color: "bg-sky-50 text-sky-600" },
    { label: "Active Maintenances", value: activeCount ?? 0, icon: Calendar, color: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Overview of your HVAC maintenance operations"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{value}</div>
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
            <p className="text-sm text-slate-500">No maintenances yet. Schedule your first one.</p>
          ) : (
            <div className="space-y-2">
              {recentMaintenances.map((m) => (
                <Link
                  key={m.id}
                  href={`/maintenances/${m.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-4 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{m.building?.name}</p>
                    <p className="text-sm text-slate-500">
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
              <Clock className="h-4 w-4 text-sky-600" /> Quick Actions
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
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Getting Started
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>1. Add a building and import suites</p>
            <p>2. Schedule a maintenance and assign technicians</p>
            <p>3. Track progress live as techs update suites on mobile</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

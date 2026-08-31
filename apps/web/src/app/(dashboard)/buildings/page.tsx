import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBuildingAddress } from "@maintenancebuddy/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ChevronRight, Plus } from "lucide-react";
import { BuildingForm } from "@/components/buildings/building-form";

export default async function BuildingsPage() {
  const supabase = await createClient();
  const { data: buildings } = await supabase
    .from("buildings")
    .select("*")
    .order("name");

  const buildingsWithCounts = await Promise.all(
    (buildings ?? []).map(async (building) => {
      const [{ count: suiteCount }, { count: contactCount }] = await Promise.all([
        supabase.from("suites").select("*", { count: "exact", head: true }).eq("building_id", building.id),
        supabase.from("building_contacts").select("*", { count: "exact", head: true }).eq("building_id", building.id),
      ]);
      return { ...building, suiteCount: suiteCount ?? 0, contactCount: contactCount ?? 0 };
    })
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Buildings"
        description="Manage buildings, suites, and contacts"
      />

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-4 w-4 text-sky-600" /> Add Building
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BuildingForm />
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {!buildings?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-slate-500">No buildings yet. Add your first building.</p>
              </CardContent>
            </Card>
          ) : (
            buildingsWithCounts.map((building) => (
              <Link key={building.id} href={`/buildings/${building.id}`}>
                <Card className="group transition-all hover:-translate-y-0.5 hover:border-sky-200/60 hover:shadow-md">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold text-slate-900 group-hover:text-sky-700">{building.name}</p>
                      <p className="text-sm text-slate-500">
                        {formatBuildingAddress(building)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-slate-500">
                        <p>{building.suiteCount} suites</p>
                        <p>{building.contactCount} contacts</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 transition-colors group-hover:text-sky-500" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

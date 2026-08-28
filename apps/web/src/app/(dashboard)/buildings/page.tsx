import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Buildings</h1>
          <p className="text-zinc-500">Manage buildings, suites, and contacts</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-4 w-4" /> Add Building
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BuildingForm />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!buildings?.length ? (
            <Card>
              <CardContent className="py-8 text-center text-zinc-500">
                No buildings yet. Add your first building.
              </CardContent>
            </Card>
          ) : (
            buildingsWithCounts.map((building) => (
              <Link key={building.id} href={`/buildings/${building.id}`}>
                <Card className="transition-colors hover:bg-zinc-50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-semibold">{building.name}</p>
                      <p className="text-sm text-zinc-500">
                        {building.address}, {building.city}
                      </p>
                    </div>
                    <div className="text-right text-sm text-zinc-500">
                      <p>{building.suiteCount} suites</p>
                      <p>{building.contactCount} contacts</p>
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

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBuildingAddress } from "@maintenancebuddy/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { ChevronRight, Plus } from "lucide-react";
import { BuildingForm } from "@/components/buildings/building-form";

type CountEmbed = { count: number }[] | null;

function readCount(value: CountEmbed): number {
  return value?.[0]?.count ?? 0;
}

export default async function BuildingsPage() {
  const supabase = await createClient();
  const { data: buildings } = await supabase
    .from("buildings")
    .select("*, suites(count), building_contacts(count)")
    .order("name");

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
            buildings.map((building) => {
              const suiteCount = readCount(building.suites as CountEmbed);
              const contactCount = readCount(building.building_contacts as CountEmbed);

              return (
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
                          <p>{suiteCount} suites</p>
                          <p>{contactCount} contacts</p>
                        </div>
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
    </div>
  );
}

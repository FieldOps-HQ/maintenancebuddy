import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatBuildingAddress } from "@maintenancebuddy/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { ChevronRight, Plus } from "lucide-react";
import { BuildingForm } from "@/components/buildings/building-form";

export default async function BuildingsPage() {
  const supabase = await createClient();
  const { data: buildings, error } = await supabase
    .from("buildings")
    .select("id, name, street_number, street, city, postal_code")
    .order("name");

  const buildingIds = (buildings ?? []).map((b) => b.id);
  const suiteCountByBuilding = new Map<string, number>();
  const contactCountByBuilding = new Map<string, number>();

  if (buildingIds.length > 0) {
    const [{ data: suites }, { data: contacts }] = await Promise.all([
      supabase.from("suites").select("building_id").in("building_id", buildingIds),
      supabase.from("building_contacts").select("building_id").in("building_id", buildingIds),
    ]);

    for (const row of suites ?? []) {
      suiteCountByBuilding.set(
        row.building_id,
        (suiteCountByBuilding.get(row.building_id) ?? 0) + 1
      );
    }
    for (const row of contacts ?? []) {
      contactCountByBuilding.set(
        row.building_id,
        (contactCountByBuilding.get(row.building_id) ?? 0) + 1
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buildings"
        description="Manage buildings, suites, and contacts"
      />

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-red-600">
            Could not load buildings: {error.message}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-teal-700" /> Add building
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BuildingForm />
          </CardContent>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          {!buildings?.length ? (
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No buildings yet. Add your first building.
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Building</TableHead>
                  <TableHead>Suites</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildings.map((building) => {
                  const suiteCount = suiteCountByBuilding.get(building.id) ?? 0;
                  const contactCount = contactCountByBuilding.get(building.id) ?? 0;

                  return (
                    <TableRow key={building.id} className="group">
                      <TableCell>
                        <Link href={`/buildings/${building.id}`} className="block">
                          <p className="font-medium text-foreground group-hover:text-teal-800">
                            {building.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBuildingAddress(building)}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{suiteCount}</TableCell>
                      <TableCell className="font-mono text-sm">{contactCount}</TableCell>
                      <TableCell>
                        <Link href={`/buildings/${building.id}`}>
                          <ChevronRight className="h-4 w-4 text-zinc-300 transition-colors group-hover:text-teal-600" />
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
    </div>
  );
}

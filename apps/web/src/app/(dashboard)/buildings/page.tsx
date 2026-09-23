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
    <div className="space-y-6">
      <PageHeader
        title="Buildings"
        description="Manage buildings, suites, and contacts"
      />

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
                  const suiteCount = readCount(building.suites as CountEmbed);
                  const contactCount = readCount(building.building_contacts as CountEmbed);

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

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactForm } from "@/components/buildings/contact-form";
import { SuiteForm, SuiteRow } from "@/components/buildings/suite-form";
import { CsvImport } from "@/components/buildings/csv-import";
import { BuildingHeader } from "@/components/buildings/building-form";
import { BuildingMaintenances } from "@/components/buildings/building-maintenances";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("*")
    .eq("id", id)
    .single();

  if (!building) notFound();

  const [{ data: suites }, { data: contacts }, { data: maintenances }, { data: filterSizes }] =
    await Promise.all([
    supabase.from("suites").select("*, hvac_units(*)").eq("building_id", id).order("suite_number"),
    supabase.from("building_contacts").select("*").eq("building_id", id).order("name"),
    supabase
      .from("maintenances")
      .select("id, start_date, end_date, status, suite_visits(status)")
      .eq("building_id", id)
      .order("start_date", { ascending: false }),
    supabase.from("filter_sizes").select("id, length_in, width_in, thickness_in").order("length_in").order("width_in").order("thickness_in"),
  ]);

  return (
    <div className="space-y-8">
      <BuildingHeader building={building} />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <SuiteForm buildingId={id} filterSizes={filterSizes ?? []} />
          <CsvImport buildingId={id} />

          <Card>
            <CardHeader>
              <CardTitle>Suites ({suites?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <div className="max-h-96 overflow-auto px-2">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Suite</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Filter</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suites?.map((suite) => (
                      <SuiteRow
                        key={suite.id}
                        suite={suite}
                        filterSizes={filterSizes ?? []}
                        hvacUnits={(suite.hvac_units ?? []).sort(
                          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
                        )}
                      />
                    ))}
                  </TableBody>
                </Table>
                {!suites?.length && (
                  <p className="px-6 py-8 text-center text-sm text-slate-500">
                    No suites yet. Add suites using the form above.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contacts ({contacts?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ContactForm buildingId={id} />
            <div className="space-y-3">
              {contacts?.map((contact) => (
                <div key={contact.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200">
                  <p className="font-medium text-slate-900">{contact.name}</p>
                  {contact.role && <p className="text-sm text-slate-500">{contact.role}</p>}
                  <div className="mt-1 text-sm text-slate-600">
                    {contact.phone && <p>{contact.phone}</p>}
                    {contact.email && <p>{contact.email}</p>}
                  </div>
                </div>
              ))}
              {!contacts?.length && (
                <p className="text-sm text-slate-500">No contacts yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <BuildingMaintenances maintenances={maintenances ?? []} />
    </div>
  );
}

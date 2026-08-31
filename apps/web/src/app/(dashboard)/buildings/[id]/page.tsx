import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactForm } from "@/components/buildings/contact-form";
import { SuiteForm } from "@/components/buildings/suite-form";
import { CsvImport } from "@/components/buildings/csv-import";
import { BuildingHeader } from "@/components/buildings/building-form";
import { BuildingMaintenances } from "@/components/buildings/building-maintenances";
import { Badge } from "@/components/ui/badge";

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
    supabase.from("suites").select("*").eq("building_id", id).order("suite_number"),
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
        <Card>
          <CardHeader>
            <CardTitle>Suites ({suites?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SuiteForm buildingId={id} filterSizes={filterSizes ?? []} />
            <CsvImport buildingId={id} />
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-500">
                    <th className="pb-2 pr-4">Suite</th>
                    <th className="pb-2 pr-4">Floor</th>
                    <th className="pb-2">Filter</th>
                  </tr>
                </thead>
                <tbody>
                  {suites?.map((suite) => (
                    <tr key={suite.id} className="border-b border-zinc-50">
                      <td className="py-2 pr-4 font-medium">{suite.suite_number}</td>
                      <td className="py-2 pr-4">{suite.floor ?? "—"}</td>
                      <td className="py-2">
                        {suite.filter_size ? (
                          <Badge variant="secondary">
                            {suite.filter_quantity}x {suite.filter_size}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts ({contacts?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ContactForm buildingId={id} />
            <div className="space-y-3">
              {contacts?.map((contact) => (
                <div key={contact.id} className="rounded-lg border border-zinc-100 p-3">
                  <p className="font-medium">{contact.name}</p>
                  {contact.role && <p className="text-sm text-zinc-500">{contact.role}</p>}
                  <div className="mt-1 text-sm text-zinc-600">
                    {contact.phone && <p>{contact.phone}</p>}
                    {contact.email && <p>{contact.email}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <BuildingMaintenances maintenances={maintenances ?? []} />
    </div>
  );
}

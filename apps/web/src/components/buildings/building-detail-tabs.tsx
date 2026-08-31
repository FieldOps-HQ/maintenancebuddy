"use client";

import type { Suite, HvacUnit } from "@maintenancebuddy/shared";
import type { MaintenanceStatus } from "@maintenancebuddy/shared";
import { ContactForm } from "@/components/buildings/contact-form";
import { SuiteForm, SuiteRow } from "@/components/buildings/suite-form";
import { CsvImport } from "@/components/buildings/csv-import";
import { BuildingMaintenances } from "@/components/buildings/building-maintenances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FilterSizeOption = {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
};

type BuildingContact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

type BuildingMaintenance = {
  id: string;
  start_date: string;
  end_date: string;
  status: MaintenanceStatus;
  suite_visits?: { status: string }[];
};

type SuiteWithUnits = Suite & { hvac_units?: HvacUnit[] };

export function BuildingDetailTabs({
  buildingId,
  filterSizes,
  suites,
  contacts,
  maintenances,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
  suites: SuiteWithUnits[];
  contacts: BuildingContact[];
  maintenances: BuildingMaintenance[];
}) {
  return (
    <Tabs defaultValue="suites">
      <TabsList>
        <TabsTrigger value="suites">Suites ({suites.length})</TabsTrigger>
        <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
        <TabsTrigger value="maintenances">Maintenances ({maintenances.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="suites">
        <SuiteForm buildingId={buildingId} filterSizes={filterSizes} />
        <CsvImport buildingId={buildingId} />

        <Card>
          <CardHeader>
            <CardTitle>All Suites ({suites.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="max-h-[32rem] overflow-auto px-2">
              {suites.length > 0 ? (
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
                    {suites.map((suite) => (
                      <SuiteRow
                        key={suite.id}
                        suite={suite}
                        filterSizes={filterSizes}
                        hvacUnits={(suite.hvac_units ?? []).sort(
                          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
                        )}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-6 py-8 text-center text-sm text-slate-500">
                  No suites yet. Add suites using the form above.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="contacts">
        <Card>
          <CardHeader>
            <CardTitle>Contacts ({contacts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ContactForm buildingId={buildingId} />
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-slate-200"
                >
                  <p className="font-medium text-slate-900">{contact.name}</p>
                  {contact.role && <p className="text-sm text-slate-500">{contact.role}</p>}
                  <div className="mt-1 text-sm text-slate-600">
                    {contact.phone && <p>{contact.phone}</p>}
                    {contact.email && <p>{contact.email}</p>}
                  </div>
                </div>
              ))}
              {contacts.length === 0 && (
                <p className="text-sm text-slate-500">No contacts yet. Add one above.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="maintenances">
        <BuildingMaintenances maintenances={maintenances} />
      </TabsContent>
    </Tabs>
  );
}

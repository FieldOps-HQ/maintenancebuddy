"use client";

import type { Building, Suite, HvacUnit } from "@maintenancebuddy/shared";
import type { MaintenanceStatus } from "@maintenancebuddy/shared";
import { BuildingHeader } from "@/components/buildings/building-form";
import { ContactForm } from "@/components/buildings/contact-form";
import { SuitesSpreadsheet } from "@/components/buildings/suite-form";
import { BuildingMaintenances } from "@/components/buildings/building-maintenances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  building,
  buildingId,
  filterSizes,
  suites,
  contacts,
  maintenances,
}: {
  building: Building;
  buildingId: string;
  filterSizes: FilterSizeOption[];
  suites: SuiteWithUnits[];
  contacts: BuildingContact[];
  maintenances: BuildingMaintenance[];
}) {
  return (
    <Tabs defaultValue="suites" className="flex min-h-0 flex-1 flex-col gap-0 space-y-0">
      <div className="sticky top-0 z-20 shrink-0 space-y-4 bg-background pb-4">
        <BuildingHeader building={building} />
        <TabsList>
          <TabsTrigger value="suites">Suites ({suites.length})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
          <TabsTrigger value="maintenances">Maintenances ({maintenances.length})</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="suites" className="mt-4 flex min-h-0 flex-1 flex-col">
        <SuitesSpreadsheet
          buildingId={buildingId}
          filterSizes={filterSizes}
          suites={suites}
        />
      </TabsContent>

      <TabsContent value="contacts" className="mt-4 min-h-0 flex-1 overflow-y-auto">
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

      <TabsContent value="maintenances" className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <BuildingMaintenances maintenances={maintenances} />
      </TabsContent>
    </Tabs>
  );
}

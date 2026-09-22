import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuildingDetailTabs } from "@/components/buildings/building-detail-tabs";
import { BuildingHeader } from "@/components/buildings/building-form";
import type { HvacUnit, Suite } from "@maintenancebuddy/shared";

type SuiteWithUnits = Suite & { hvac_units?: HvacUnit[] };

async function loadBuildingSuites(buildingId: string): Promise<SuiteWithUnits[]> {
  const supabase = await createClient();

  const { data: suites, error: suitesError } = await supabase
    .from("suites")
    .select(
      "id, building_id, suite_number, floor, filter_size, filter_quantity, hvac_location_notes, created_at"
    )
    .eq("building_id", buildingId)
    .order("suite_number");

  if (suitesError) throw new Error(suitesError.message);
  if (!suites?.length) return [];

  const suiteIds = suites.map((suite) => suite.id);
  const chunkSize = 150;
  const unitChunks = await Promise.all(
    Array.from({ length: Math.ceil(suiteIds.length / chunkSize) }, (_, index) => {
      const chunk = suiteIds.slice(index * chunkSize, (index + 1) * chunkSize);
      return supabase
        .from("hvac_units")
        .select("id, suite_id, name, location_notes, filter_size, filter_quantity, sort_order, created_at")
        .in("suite_id", chunk)
        .order("sort_order");
    })
  );

  const units: HvacUnit[] = [];
  for (const chunk of unitChunks) {
    if (chunk.error) throw new Error(chunk.error.message);
    units.push(...((chunk.data ?? []) as HvacUnit[]));
  }

  const unitsBySuite = new Map<string, HvacUnit[]>();
  for (const unit of units) {
    const list = unitsBySuite.get(unit.suite_id) ?? [];
    list.push(unit);
    unitsBySuite.set(unit.suite_id, list);
  }

  return suites.map((suite) => ({
    ...(suite as Suite),
    hvac_units: unitsBySuite.get(suite.id) ?? [],
  }));
}

async function BuildingDetailBody({
  building,
  buildingId,
}: {
  building: {
    id: string;
    organization_id: string;
    name: string;
    street_number: string;
    street: string;
    city: string;
    postal_code: string;
    created_at: string;
    updated_at: string;
  };
  buildingId: string;
}) {
  const supabase = await createClient();

  const [
    suites,
    { data: contacts, error: contactsError },
    { data: maintenances, error: maintenancesError },
    { data: filterSizes, error: filterSizesError },
  ] = await Promise.all([
    loadBuildingSuites(buildingId),
    supabase.from("building_contacts").select("*").eq("building_id", buildingId).order("name"),
    supabase
      .from("maintenances")
      .select("id, start_date, end_date, status")
      .eq("building_id", buildingId)
      .order("start_date", { ascending: false }),
    supabase
      .from("filter_sizes")
      .select("id, length_in, width_in, thickness_in")
      .order("length_in")
      .order("width_in")
      .order("thickness_in"),
  ]);

  if (contactsError) throw new Error(contactsError.message);
  if (maintenancesError) throw new Error(maintenancesError.message);
  if (filterSizesError) throw new Error(filterSizesError.message);

  const maintenanceIds = (maintenances ?? []).map((m) => m.id);
  const progressByMaintenance = new Map<string, { status: string }[]>();

  if (maintenanceIds.length > 0) {
    const { data: visitStatuses, error: visitError } = await supabase
      .from("suite_visits")
      .select("maintenance_id, status")
      .in("maintenance_id", maintenanceIds);

    if (visitError) throw new Error(visitError.message);

    for (const visit of visitStatuses ?? []) {
      const list = progressByMaintenance.get(visit.maintenance_id) ?? [];
      list.push({ status: visit.status });
      progressByMaintenance.set(visit.maintenance_id, list);
    }
  }

  return (
    <BuildingDetailTabs
      building={building}
      buildingId={buildingId}
      filterSizes={filterSizes ?? []}
      suites={suites}
      contacts={contacts ?? []}
      maintenances={(maintenances ?? []).map((m) => ({
        ...m,
        suite_visits: progressByMaintenance.get(m.id) ?? [],
      }))}
    />
  );
}

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="space-y-4">
            <BuildingHeader building={building} />
            <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-slate-100" />
            <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
        }
      >
        <BuildingDetailBody building={building} buildingId={id} />
      </Suspense>
    </div>
  );
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BuildingDetailTabs } from "@/components/buildings/building-detail-tabs";

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
      supabase
        .from("filter_sizes")
        .select("id, length_in, width_in, thickness_in")
        .order("length_in")
        .order("width_in")
        .order("thickness_in"),
    ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <BuildingDetailTabs
        building={building}
        buildingId={id}
        filterSizes={filterSizes ?? []}
        suites={suites ?? []}
        contacts={contacts ?? []}
        maintenances={maintenances ?? []}
      />
    </div>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultUnitLocation, normalizeUnitName } from "@maintenancebuddy/shared";

export type FieldUnitInput = {
  suite_number: string;
  filter_size: string;
  unit_location?: string;
};

export async function addFieldUnit(
  supabase: SupabaseClient,
  buildingId: string,
  input: FieldUnitInput
): Promise<{ error: string | null; suiteId?: string }> {
  const suiteNumber = input.suite_number.trim();
  const filterSize = input.filter_size.trim();
  const locationName = defaultUnitLocation(input.unit_location ?? "");

  const { data: existingSuite, error: lookupError } = await supabase
    .from("suites")
    .select("id, suite_number, hvac_units(id, name, sort_order)")
    .eq("building_id", buildingId)
    .eq("suite_number", suiteNumber)
    .maybeSingle();

  if (lookupError) {
    return { error: lookupError.message };
  }

  if (existingSuite) {
    const normalized = normalizeUnitName(locationName);
    const unitNameTaken = (existingSuite.hvac_units ?? []).some(
      (unit) => normalizeUnitName(unit.name) === normalized
    );

    if (unitNameTaken) {
      return {
        error: `A unit named "${locationName}" already exists in suite ${suiteNumber}.`,
      };
    }

    const maxSort = Math.max(-1, ...(existingSuite.hvac_units ?? []).map((unit) => unit.sort_order));
    const { error: insertError } = await supabase.from("hvac_units").insert({
      suite_id: existingSuite.id,
      name: locationName,
      filter_size: filterSize,
      filter_quantity: 1,
      sort_order: maxSort + 1,
    });

    if (insertError) {
      return {
        error:
          insertError.code === "23505"
            ? `A unit named "${locationName}" already exists in suite ${suiteNumber}.`
            : insertError.message,
      };
    }

    return { error: null, suiteId: existingSuite.id };
  }

  const { data: suite, error: suiteError } = await supabase
    .from("suites")
    .insert({
      suite_number: suiteNumber,
      filter_size: filterSize,
      filter_quantity: 1,
      building_id: buildingId,
    })
    .select("id")
    .single();

  if (suiteError || !suite) {
    return { error: suiteError?.message ?? "Failed to create suite." };
  }

  const { data: mainUnit } = await supabase
    .from("hvac_units")
    .select("id")
    .eq("suite_id", suite.id)
    .eq("name", "Main unit")
    .maybeSingle();

  if (mainUnit) {
    const { error: updateError } = await supabase
      .from("hvac_units")
      .update({
        name: locationName,
        filter_size: filterSize,
        filter_quantity: 1,
      })
      .eq("id", mainUnit.id);

    if (updateError) {
      return { error: updateError.message };
    }
  } else {
    const { error: insertError } = await supabase.from("hvac_units").insert({
      suite_id: suite.id,
      name: locationName,
      filter_size: filterSize,
      filter_quantity: 1,
      sort_order: 0,
    });

    if (insertError) {
      return { error: insertError.message };
    }
  }

  return { error: null, suiteId: suite.id };
}

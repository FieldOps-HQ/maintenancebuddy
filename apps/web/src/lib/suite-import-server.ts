import type { SupabaseClient } from "@supabase/supabase-js";
import type { HvacUnit, Suite } from "@maintenancebuddy/shared";
import {
  defaultUnitLocation,
  normalizeUnitName,
  type SuiteImportRow,
} from "@maintenancebuddy/shared";

export type SuiteWithUnits = Suite & { hvac_units?: HvacUnit[] };

export type ImportRowError = {
  rowIndex: number;
  suite_number: string;
  message: string;
};

function unitNameTaken(suite: SuiteWithUnits, locationName: string) {
  const normalized = normalizeUnitName(locationName);
  return (suite.hvac_units ?? []).some((u) => normalizeUnitName(u.name) === normalized);
}

export async function importSingleUnit(
  supabase: SupabaseClient,
  buildingId: string,
  row: SuiteImportRow,
  resolvedFilter: string,
  suiteByNumber: Map<string, SuiteWithUnits>
): Promise<string | null> {
  const suiteNumber = row.suite_number.trim();
  const locationName = defaultUnitLocation(row.unit_location);
  let existingSuite = suiteByNumber.get(suiteNumber);

  if (existingSuite) {
    if (unitNameTaken(existingSuite, locationName)) {
      return `A unit named "${locationName}" already exists in suite ${suiteNumber}.`;
    }

    const maxSort = Math.max(-1, ...(existingSuite.hvac_units ?? []).map((u) => u.sort_order));
    const { data: inserted, error: insertError } = await supabase
      .from("hvac_units")
      .insert({
        suite_id: existingSuite.id,
        name: locationName,
        filter_size: resolvedFilter,
        filter_quantity: 1,
        sort_order: maxSort + 1,
      })
      .select(
        "id, name, filter_size, filter_quantity, sort_order, suite_id, location_notes, created_at"
      )
      .single();

    if (insertError) {
      return insertError.code === "23505"
        ? `A unit named "${locationName}" already exists in suite ${suiteNumber}.`
        : insertError.message;
    }

    if (inserted) {
      existingSuite = {
        ...existingSuite,
        hvac_units: [...(existingSuite.hvac_units ?? []), inserted as HvacUnit],
      };
      suiteByNumber.set(suiteNumber, existingSuite);
    }

    return null;
  }

  const { data: suite, error: suiteError } = await supabase
    .from("suites")
    .insert({
      suite_number: suiteNumber,
      filter_size: resolvedFilter,
      filter_quantity: 1,
      building_id: buildingId,
    })
    .select("*")
    .single();

  if (suiteError || !suite) {
    return suiteError?.message ?? "Failed to create suite.";
  }

  const { data: mainUnit } = await supabase
    .from("hvac_units")
    .select("*")
    .eq("suite_id", suite.id)
    .eq("name", "Main unit")
    .maybeSingle();

  let unit: HvacUnit;

  if (mainUnit) {
    const { data: updated, error: updateError } = await supabase
      .from("hvac_units")
      .update({
        name: locationName,
        filter_size: resolvedFilter,
        filter_quantity: 1,
      })
      .eq("id", mainUnit.id)
      .select("*")
      .single();

    if (updateError || !updated) return updateError?.message ?? "Failed to create unit.";
    unit = updated as HvacUnit;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("hvac_units")
      .insert({
        suite_id: suite.id,
        name: locationName,
        filter_size: resolvedFilter,
        filter_quantity: 1,
        sort_order: 0,
      })
      .select("*")
      .single();

    if (insertError || !inserted) return insertError?.message ?? "Failed to create unit.";
    unit = inserted as HvacUnit;
  }

  suiteByNumber.set(suiteNumber, { ...(suite as Suite), hvac_units: [unit] });
  return null;
}

export async function importSuiteRows(
  supabase: SupabaseClient,
  buildingId: string,
  rows: Array<{ rowIndex: number; row: SuiteImportRow; resolvedFilterSize: string }>,
  existingSuites: SuiteWithUnits[]
): Promise<{ imported: number; failed: number; errors: ImportRowError[] }> {
  const suiteByNumber = new Map<string, SuiteWithUnits>(
    existingSuites.map((s) => [s.suite_number, s])
  );
  const errors: ImportRowError[] = [];
  let imported = 0;

  for (const { rowIndex, row, resolvedFilterSize } of rows) {
    const createError = await importSingleUnit(
      supabase,
      buildingId,
      row,
      resolvedFilterSize,
      suiteByNumber
    );

    if (createError) {
      errors.push({
        rowIndex,
        suite_number: row.suite_number,
        message: createError,
      });
    } else {
      imported += 1;
    }
  }

  return { imported, failed: errors.length, errors };
}

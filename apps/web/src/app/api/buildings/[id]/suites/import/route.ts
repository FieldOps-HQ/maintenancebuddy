import { NextRequest, NextResponse } from "next/server";
import {
  createFilterSizeResolver,
  validateSuiteImportRows,
  type SuiteImportRow,
} from "@maintenancebuddy/shared";
import { createClient, getProfile } from "@/lib/supabase/server";
import { importSuiteRows, type SuiteWithUnits } from "@/lib/suite-import-server";

const BATCH_SIZE = 50;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildingId } = await params;
  const profile = await getProfile();

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { rows?: SuiteImportRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const inputRows = body.rows ?? [];
  if (inputRows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const supabase = await createClient();

  const [{ data: building }, { data: filterSizes }, { data: suites }] = await Promise.all([
    supabase.from("buildings").select("id").eq("id", buildingId).single(),
    supabase
      .from("filter_sizes")
      .select("length_in, width_in, thickness_in")
      .order("length_in")
      .order("width_in")
      .order("thickness_in"),
    supabase.from("suites").select("*, hvac_units(name)").eq("building_id", buildingId),
  ]);

  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  let existingSuites = (suites ?? []) as SuiteWithUnits[];

  const resolveFilterSize = createFilterSizeResolver(filterSizes ?? []);
  const parsedRows = inputRows.map((row, index) => ({
    rowIndex: index,
    suite_number: row.suite_number?.trim() ?? "",
    filter_size: row.filter_size?.trim() ?? "",
    unit_location: row.unit_location?.trim() ?? "",
  }));

  const validations = validateSuiteImportRows(parsedRows, {
    resolveFilterSize,
    existingSuites: existingSuites.map((suite) => ({
      suite_number: suite.suite_number,
      units: (suite.hvac_units ?? []).map((unit) => ({ name: unit.name })),
    })),
  });

  const validationErrors = validations
    .filter((v) => !v.valid)
    .map((v) => ({
      rowIndex: v.rowIndex,
      suite_number: v.row.suite_number,
      message: v.errors.join(" "),
    }));

  const validRows = validations
    .filter((v) => v.valid && v.resolvedFilterSize)
    .map((v) => ({
      rowIndex: v.rowIndex,
      row: v.row,
      resolvedFilterSize: v.resolvedFilterSize!,
    }));

  let imported = 0;
  const importErrors: typeof validationErrors = [];

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    const result = await importSuiteRows(
      supabase,
      buildingId,
      batch,
      existingSuites
    );
    imported += result.imported;
    importErrors.push(...result.errors);

    if (result.imported > 0) {
      const { data: refreshedSuites } = await supabase
        .from("suites")
        .select("*, hvac_units(*)")
        .eq("building_id", buildingId);
      if (refreshedSuites) {
        existingSuites = refreshedSuites as SuiteWithUnits[];
      }
    }
  }

  const errors = [...validationErrors, ...importErrors];
  const failed = errors.length;

  return NextResponse.json({
    imported,
    failed,
    skipped: validationErrors.length,
    errors,
  });
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  suiteSchema,
  formatFilterSize,
  formatFilterSizeLabel,
} from "@maintenancebuddy/shared";
import type { Suite, HvacUnit } from "@maintenancebuddy/shared";
import { AddHvacUnitForm, HvacUnitRow } from "@/components/buildings/hvac-unit-form";
import { createClient } from "@/lib/supabase/client";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type FilterSizeOption = {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
};

type SuiteTableRow = {
  id: string;
  suite_number: string;
  floor: string;
  filter_size: string;
  unit_location: string;
};

type SuiteWithUnits = Suite & { hvac_units?: HvacUnit[] };

function newEntryRow(): SuiteTableRow {
  return {
    id: crypto.randomUUID(),
    suite_number: "",
    floor: "",
    filter_size: "",
    unit_location: "",
  };
}

function suiteCounts(rows: SuiteTableRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.suite_number.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function flattenSuiteUnits(suites: SuiteWithUnits[]) {
  return suites.flatMap((suite) => {
    const units = (suite.hvac_units ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );

    if (units.length === 0) {
      return [{ suite, unit: null as HvacUnit | null, isFirstInSuite: true }];
    }

    return units.map((unit, index) => ({
      suite,
      unit,
      isFirstInSuite: index === 0,
    }));
  });
}

const inputCellClass =
  "h-9 border-transparent bg-transparent shadow-none hover:border-slate-200 focus-visible:border-sky-400 focus-visible:bg-white";

export function SuitesSpreadsheet({
  buildingId,
  filterSizes,
  suites,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
  suites: SuiteWithUnits[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entryRows, setEntryRows] = useState<SuiteTableRow[]>([newEntryRow()]);

  const existingRows = flattenSuiteUnits(suites);
  const entryCounts = suiteCounts(entryRows);

  function updateEntryRow(id: string, patch: Partial<SuiteTableRow>) {
    setEntryRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addEntryRow() {
    setEntryRows((current) => [...current, newEntryRow()]);
  }

  function removeEntryRow(id: string) {
    setEntryRows((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  }

  function validateEntryRows(filledRows: SuiteTableRow[]): string | null {
    const counts = suiteCounts(filledRows);

    for (const row of filledRows) {
      if (!row.suite_number.trim()) return "Each row needs a suite number.";
      if (!row.filter_size) return `Suite ${row.suite_number.trim()} needs a filter size.`;

      const suiteKey = row.suite_number.trim();
      if ((counts.get(suiteKey) ?? 0) > 1 && !row.unit_location.trim()) {
        return `Suite ${suiteKey} has multiple units — enter a location for each row.`;
      }
    }

    const floorsBySuite = new Map<string, Set<string>>();
    for (const row of filledRows) {
      const suiteKey = row.suite_number.trim();
      const floor = row.floor.trim();
      if (!floorsBySuite.has(suiteKey)) floorsBySuite.set(suiteKey, new Set());
      if (floor) floorsBySuite.get(suiteKey)!.add(floor);
    }

    for (const [suiteKey, floors] of floorsBySuite) {
      if (floors.size > 1) {
        return `Suite ${suiteKey} has conflicting floor values across rows.`;
      }
    }

    return null;
  }

  async function createSuiteWithUnits(
    supabase: ReturnType<typeof createClient>,
    suiteNumber: string,
    floor: string | undefined,
    units: { filter_size: string; name: string; location_notes?: string }[]
  ): Promise<string | null> {
    const primaryFilter = units[0]?.filter_size;

    const { data: suite, error: suiteError } = await supabase
      .from("suites")
      .insert({
        suite_number: suiteNumber,
        floor,
        filter_size: primaryFilter,
        filter_quantity: 1,
        building_id: buildingId,
      })
      .select("id")
      .single();

    if (suiteError || !suite) {
      if (suiteError?.code === "23505") {
        return `Suite ${suiteNumber} already exists in this building.`;
      }
      return suiteError?.message ?? `Failed to create suite ${suiteNumber}.`;
    }

    const { data: mainUnit } = await supabase
      .from("hvac_units")
      .select("id")
      .eq("suite_id", suite.id)
      .eq("name", "Main unit")
      .maybeSingle();

    const [firstUnit, ...extraUnits] = units;

    if (mainUnit) {
      const { error: updateError } = await supabase
        .from("hvac_units")
        .update({
          name: firstUnit.name,
          filter_size: firstUnit.filter_size,
          filter_quantity: 1,
          location_notes: firstUnit.location_notes ?? null,
        })
        .eq("id", mainUnit.id);

      if (updateError) return updateError.message;
    } else {
      const { error: insertError } = await supabase.from("hvac_units").insert({
        suite_id: suite.id,
        name: firstUnit.name,
        filter_size: firstUnit.filter_size,
        filter_quantity: 1,
        location_notes: firstUnit.location_notes ?? null,
        sort_order: 0,
      });

      if (insertError) return insertError.message;
    }

    if (extraUnits.length > 0) {
      const { error: unitsError } = await supabase.from("hvac_units").insert(
        extraUnits.map((unit, index) => ({
          suite_id: suite.id,
          name: unit.name,
          filter_size: unit.filter_size,
          filter_quantity: 1,
          location_notes: unit.location_notes ?? null,
          sort_order: index + 1,
        }))
      );

      if (unitsError) {
        if (unitsError.code === "23505") {
          return `Duplicate unit name in suite ${suiteNumber}.`;
        }
        return unitsError.message;
      }
    }

    return null;
  }

  async function handleAddSuites(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const filledRows = entryRows.filter(
      (row) =>
        row.suite_number.trim() ||
        row.floor.trim() ||
        row.filter_size ||
        row.unit_location.trim()
    );

    if (filledRows.length === 0) {
      setError("Enter a suite number and filter size in the row above.");
      setLoading(false);
      return;
    }

    const validationError = validateEntryRows(filledRows);
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    const grouped = new Map<string, SuiteTableRow[]>();
    for (const row of filledRows) {
      const key = row.suite_number.trim();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    const supabase = createClient();

    for (const [suiteNumber, suiteRows] of grouped) {
      const counts = suiteCounts(filledRows);
      const isMultiUnit = (counts.get(suiteNumber) ?? 0) > 1;
      const floor = suiteRows.find((r) => r.floor.trim())?.floor.trim() || undefined;

      const units = suiteRows.map((row) => {
        const location = row.unit_location.trim();
        if (isMultiUnit) {
          return { filter_size: row.filter_size, name: location };
        }
        return {
          filter_size: row.filter_size,
          name: "Main unit",
          location_notes: location || undefined,
        };
      });

      const createError = await createSuiteWithUnits(supabase, suiteNumber, floor, units);
      if (createError) {
        setError(createError);
        setLoading(false);
        return;
      }
    }

    setEntryRows([newEntryRow()]);
    router.refresh();
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Suites ({suites.length})</CardTitle>
        <CardDescription>
          Use the top row(s) to add suites. Repeat the same suite number on multiple rows to add
          several HVAC units — unit location is required when a suite appears more than once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAddSuites} className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
            <div className="max-h-[36rem] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Suite #</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Filter size</TableHead>
                    <TableHead>Unit location</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entryRows.map((row) => {
                    const suiteKey = row.suite_number.trim();
                    const isMultiUnit = suiteKey ? (entryCounts.get(suiteKey) ?? 0) > 1 : false;

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "bg-sky-50/40",
                          isMultiUnit && "border-l-2 border-l-sky-400"
                        )}
                      >
                        <TableCell>
                          <Input
                            placeholder="e.g. 201"
                            value={row.suite_number}
                            onChange={(e) => updateEntryRow(row.id, { suite_number: e.target.value })}
                            className={inputCellClass}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="e.g. 2"
                            value={row.floor}
                            onChange={(e) => updateEntryRow(row.id, { floor: e.target.value })}
                            className={inputCellClass}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.filter_size}
                            onChange={(e) => updateEntryRow(row.id, { filter_size: e.target.value })}
                            className={inputCellClass}
                            disabled={filterSizes.length === 0}
                          >
                            <option value="">Select size</option>
                            {filterSizes.map((size) => {
                              const value = formatFilterSize(size);
                              return (
                                <option key={size.id} value={value}>
                                  {formatFilterSizeLabel(size)}
                                </option>
                              );
                            })}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder={isMultiUnit ? "Required" : "Optional"}
                            value={row.unit_location}
                            onChange={(e) => updateEntryRow(row.id, { unit_location: e.target.value })}
                            className={inputCellClass}
                            required={isMultiUnit}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {entryRows.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                onClick={() => removeEntryRow(row.id)}
                                aria-label="Remove entry row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            {row.id === entryRows[entryRows.length - 1].id && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-sky-600"
                                onClick={addEntryRow}
                                aria-label="Add another entry row"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {existingRows.length > 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-slate-50 px-4 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Existing suites
                        </span>
                      </TableCell>
                    </TableRow>
                  )}

                  {existingRows.map(({ suite, unit, isFirstInSuite }) => (
                    <ExistingSuiteUnitRow
                      key={unit ? `${suite.id}-${unit.id}` : suite.id}
                      suite={suite}
                      unit={unit}
                      filterSizes={filterSizes}
                      hvacUnits={(suite.hvac_units ?? []).sort(
                        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
                      )}
                      showActions={isFirstInSuite}
                    />
                  ))}

                  {existingRows.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                        No suites yet. Enter details in the row above and click Add suites.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="submit" disabled={loading || filterSizes.length === 0} size="sm">
              {loading ? "Adding..." : "Add suites"}
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {filterSizes.length === 0 && (
            <p className="text-xs text-slate-500">
              Add filter sizes under Filter Sizes in the sidebar first.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function SuiteFields({
  suite,
  idPrefix,
}: {
  suite?: Suite;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-suite_number`}>Suite #</Label>
        <Input
          id={`${idPrefix}-suite_number`}
          name="suite_number"
          defaultValue={suite?.suite_number}
          required
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-floor`}>Floor</Label>
        <Input id={`${idPrefix}-floor`} name="floor" defaultValue={suite?.floor ?? ""} />
      </div>
      <p className="sm:col-span-2 text-xs text-slate-500">
        Manage HVAC units and filter sizes in the units section below.
      </p>
    </div>
  );
}

function ExistingSuiteUnitRow({
  suite,
  unit,
  filterSizes,
  hvacUnits,
  showActions,
}: {
  suite: Suite;
  unit: HvacUnit | null;
  filterSizes: FilterSizeOption[];
  hvacUnits: HvacUnit[];
  showActions: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unitLabel = unit
    ? unit.name === "Main unit" && unit.location_notes
      ? unit.location_notes
      : unit.name
    : "—";
  const filterLabel = unit?.filter_size ?? suite.filter_size ?? "—";

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const parsed = suiteSchema.safeParse({
      suite_number: formData.get("suite_number") as string,
      floor: (formData.get("floor") as string) || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("suites")
      .update({ suite_number: parsed.data.suite_number, floor: parsed.data.floor })
      .eq("id", suite.id);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? "A suite with this number already exists in the building."
          : updateError.message
      );
      setLoading(false);
      return;
    }

    setEditing(false);
    router.refresh();
    setLoading(false);
  }

  async function handleDelete() {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: deleteError } = await supabase.from("suites").delete().eq("id", suite.id);

    if (deleteError) {
      setError(deleteError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  }

  if (editing) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={5} className="py-4">
          <form onSubmit={handleUpdate} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-sm font-medium text-slate-900">Edit Suite {suite.suite_number}</p>
            <SuiteFields suite={suite} idPrefix={`edit-${suite.id}`} />
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium text-slate-900">{suite.suite_number}</TableCell>
        <TableCell className="text-slate-600">{suite.floor ?? "—"}</TableCell>
        <TableCell className="text-slate-700">{filterLabel}</TableCell>
        <TableCell className="text-slate-600">{unitLabel}</TableCell>
        <TableCell className="text-right">
          {showActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Suite actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setExpanded(true)}>Manage units</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing(true)}>Edit suite</DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  disabled={loading}
                  onClick={() => {
                    if (
                      !confirm(
                        "Delete this suite? This will also remove all related maintenance visit records."
                      )
                    ) {
                      return;
                    }
                    handleDelete();
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </TableCell>
      </TableRow>
      {expanded && showActions && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="pb-4 pl-8">
            <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-700">HVAC units</p>
              <ul className="space-y-2">
                {hvacUnits.map((u) => (
                  <HvacUnitRow key={u.id} unit={u} filterSizes={filterSizes} />
                ))}
              </ul>
              <AddHvacUnitForm suiteId={suite.id} filterSizes={filterSizes} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** @deprecated Use SuitesSpreadsheet */
export const SuiteForm = SuitesSpreadsheet;

/** @deprecated Use ExistingSuiteUnitRow inside SuitesSpreadsheet */
export function SuiteRow({
  suite,
  filterSizes,
  hvacUnits = [],
}: {
  suite: Suite;
  filterSizes: FilterSizeOption[];
  hvacUnits?: HvacUnit[];
}) {
  const units = hvacUnits.length > 0 ? hvacUnits : [null];
  return (
    <>
      {units.map((unit, index) => (
        <ExistingSuiteUnitRow
          key={unit?.id ?? suite.id}
          suite={suite}
          unit={unit}
          filterSizes={filterSizes}
          hvacUnits={hvacUnits}
          showActions={index === 0}
        />
      ))}
    </>
  );
}

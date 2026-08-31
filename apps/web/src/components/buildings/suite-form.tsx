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
import { MoreHorizontal } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

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

function newTableRow(): SuiteTableRow {
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

export function SuiteForm({
  buildingId,
  filterSizes,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<SuiteTableRow[]>([newTableRow(), newTableRow(), newTableRow()]);

  function updateRow(id: string, patch: Partial<SuiteTableRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, newTableRow()]);
  }

  function removeRow(id: string) {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  }

  function validateRows(filledRows: SuiteTableRow[]): string | null {
    const counts = suiteCounts(filledRows);

    for (const row of filledRows) {
      if (!row.suite_number.trim()) return "Each row needs a suite number.";
      if (!row.filter_size) return `Suite ${row.suite_number.trim()} needs a filter size.`;

      const suiteKey = row.suite_number.trim();
      const isMultiUnit = (counts.get(suiteKey) ?? 0) > 1;
      if (isMultiUnit && !row.unit_location.trim()) {
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const filledRows = rows.filter(
      (row) =>
        row.suite_number.trim() ||
        row.floor.trim() ||
        row.filter_size ||
        row.unit_location.trim()
    );

    if (filledRows.length === 0) {
      setError("Add at least one row with a suite number and filter size.");
      setLoading(false);
      return;
    }

    const validationError = validateRows(filledRows);
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
          return {
            filter_size: row.filter_size,
            name: location,
          };
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

    setRows([newTableRow(), newTableRow(), newTableRow()]);
    router.refresh();
    setLoading(false);
  }

  const counts = suiteCounts(rows);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-zinc-600">
        Enter one row per HVAC unit. Repeat the same suite number on multiple rows to add several
        units to one suite — a unit location is required when a suite appears more than once.
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-zinc-50 text-left text-zinc-500">
              <th className="px-3 py-2 font-medium">Suite #</th>
              <th className="px-3 py-2 font-medium">Floor</th>
              <th className="px-3 py-2 font-medium">Filter size</th>
              <th className="px-3 py-2 font-medium">Unit location</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const suiteKey = row.suite_number.trim();
              const needsLocation = suiteKey ? (counts.get(suiteKey) ?? 0) > 1 : false;

              return (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2">
                    <Input
                      placeholder="e.g. 201"
                      value={row.suite_number}
                      onChange={(e) => updateRow(row.id, { suite_number: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      placeholder="e.g. 2"
                      value={row.floor}
                      onChange={(e) => updateRow(row.id, { floor: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={row.filter_size}
                      onChange={(e) => updateRow(row.id, { filter_size: e.target.value })}
                      className="h-8"
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
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      placeholder={needsLocation ? "Required for multi-unit" : "Optional"}
                      value={row.unit_location}
                      onChange={(e) => updateRow(row.id, { unit_location: e.target.value })}
                      className="h-8"
                      required={needsLocation}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-zinc-400 hover:text-red-600"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 1}
                      aria-label="Remove row"
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + Add row
        </Button>
        <Button type="submit" disabled={loading || filterSizes.length === 0} size="sm">
          {loading ? "Adding..." : "Add suites"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {filterSizes.length === 0 && (
        <p className="text-xs text-zinc-500">
          Add filter sizes under Filter Sizes in the sidebar first.
        </p>
      )}
    </form>
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
      <p className="sm:col-span-2 text-xs text-zinc-500">
        Manage HVAC units and filter sizes in the units section below.
      </p>
    </div>
  );
}

export function SuiteRow({
  suite,
  filterSizes,
  hvacUnits = [],
}: {
  suite: Suite;
  filterSizes: FilterSizeOption[];
  hvacUnits?: HvacUnit[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      <tr>
        <td colSpan={4} className="py-3">
          <form onSubmit={handleUpdate} className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
            <p className="text-sm font-medium">Edit Suite {suite.suite_number}</p>
            <SuiteFields suite={suite} idPrefix={`edit-${suite.id}`} />
            {error && <p className="text-sm text-red-600">{error}</p>}
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
        </td>
      </tr>
    );
  }

  const unitSummary =
    hvacUnits.length > 0
      ? `${hvacUnits.length} unit${hvacUnits.length === 1 ? "" : "s"}`
      : "—";

  return (
    <>
      <tr className="border-b border-zinc-50">
        <td className="py-2 pr-4 font-medium">
          <button
            type="button"
            className="text-left hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {suite.suite_number}
          </button>
        </td>
        <td className="py-2 pr-4">{suite.floor ?? "—"}</td>
        <td className="py-2 pr-4">
          {hvacUnits.length === 1 && hvacUnits[0].filter_size ? (
            <Badge variant="secondary">{hvacUnits[0].filter_size}</Badge>
          ) : (
            <span className="text-zinc-600">{unitSummary}</span>
          )}
        </td>
        <td className="py-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Suite actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="pb-4 pl-6">
            <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
              <p className="text-sm font-medium text-zinc-700">HVAC units</p>
              <ul className="space-y-2">
                {hvacUnits.map((unit) => (
                  <HvacUnitRow key={unit.id} unit={unit} filterSizes={filterSizes} />
                ))}
              </ul>
              <AddHvacUnitForm suiteId={suite.id} filterSizes={filterSizes} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

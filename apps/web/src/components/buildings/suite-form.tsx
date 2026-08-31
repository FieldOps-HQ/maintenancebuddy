"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  suiteSchema,
  suiteCreateSchema,
  suiteUnitDraftSchema,
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

type UnitDraftRow = {
  id: string;
  name: string;
  filter_size: string;
};

function newUnitRow(filterSize = ""): UnitDraftRow {
  return { id: crypto.randomUUID(), name: "Main unit", filter_size: filterSize };
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
  const [suiteFilterSize, setSuiteFilterSize] = useState("");
  const [unitRows, setUnitRows] = useState<UnitDraftRow[]>([newUnitRow()]);

  function syncFirstUnitFilter(size: string) {
    setSuiteFilterSize(size);
    setUnitRows((rows) =>
      rows.map((row, i) => (i === 0 ? { ...row, filter_size: size } : row))
    );
  }

  function addUnitRow() {
    setUnitRows((rows) => [
      ...rows,
      { id: crypto.randomUUID(), name: "", filter_size: suiteFilterSize },
    ]);
  }

  function updateUnitRow(id: string, patch: Partial<UnitDraftRow>) {
    setUnitRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeUnitRow(id: string) {
    setUnitRows((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.id !== id)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const suiteParsed = suiteCreateSchema.safeParse({
      suite_number: formData.get("suite_number") as string,
      floor: (formData.get("floor") as string) || undefined,
      filter_size: suiteFilterSize,
    });

    if (!suiteParsed.success) {
      setError(suiteParsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const unitsParsed = unitRows.map((row) =>
      suiteUnitDraftSchema.safeParse({
        name: row.name.trim(),
        filter_size: row.filter_size || suiteParsed.data.filter_size,
      })
    );

    const firstInvalid = unitsParsed.find((p) => !p.success);
    if (firstInvalid && !firstInvalid.success) {
      setError(firstInvalid.error.errors[0]?.message ?? "Check unit fields");
      setLoading(false);
      return;
    }

    const units = unitsParsed.map((p) => p.data!);
    const supabase = createClient();

    const { data: suite, error: suiteError } = await supabase
      .from("suites")
      .insert({
        suite_number: suiteParsed.data.suite_number,
        floor: suiteParsed.data.floor,
        filter_size: suiteParsed.data.filter_size,
        filter_quantity: 1,
        building_id: buildingId,
      })
      .select("id")
      .single();

    if (suiteError || !suite) {
      setError(
        suiteError?.code === "23505"
          ? "A suite with this number already exists in the building."
          : suiteError?.message ?? "Failed to create suite"
      );
      setLoading(false);
      return;
    }

    const { data: mainUnit } = await supabase
      .from("hvac_units")
      .select("id")
      .eq("suite_id", suite.id)
      .eq("name", "Main unit")
      .maybeSingle();

    const [firstUnit, ...extraUnits] = units;

    if (mainUnit) {
      await supabase
        .from("hvac_units")
        .update({
          name: firstUnit.name,
          filter_size: firstUnit.filter_size,
          filter_quantity: 1,
        })
        .eq("id", mainUnit.id);
    } else {
      await supabase.from("hvac_units").insert({
        suite_id: suite.id,
        name: firstUnit.name,
        filter_size: firstUnit.filter_size,
        filter_quantity: 1,
        sort_order: 0,
      });
    }

    if (extraUnits.length > 0) {
      const { error: unitsError } = await supabase.from("hvac_units").insert(
        extraUnits.map((unit, index) => ({
          suite_id: suite.id,
          name: unit.name,
          filter_size: unit.filter_size,
          filter_quantity: 1,
          sort_order: index + 1,
        }))
      );

      if (unitsError) {
        setError(unitsError.message);
        setLoading(false);
        return;
      }
    }

    setSuiteFilterSize("");
    setUnitRows([newUnitRow()]);
    (e.target as HTMLFormElement).reset();
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="suite_number" className="sr-only">Suite</Label>
          <Input id="suite_number" name="suite_number" placeholder="Suite # *" required />
        </div>
        <div>
          <Label htmlFor="floor" className="sr-only">Floor</Label>
          <Input id="floor" name="floor" placeholder="Floor" />
        </div>
        <div>
          <Label htmlFor="filter_size" className="sr-only">Filter size</Label>
          <Select
            id="filter_size"
            name="filter_size"
            value={suiteFilterSize}
            onChange={(e) => syncFirstUnitFilter(e.target.value)}
            required
          >
            <option value="" disabled>
              Filter size *
            </option>
            {filterSizes.map((size) => {
              const value = formatFilterSize(size);
              return (
                <option key={size.id} value={value}>
                  {formatFilterSizeLabel(size)}
                </option>
              );
            })}
          </Select>
        </div>
        <Button type="submit" disabled={loading || filterSizes.length === 0} size="sm">
          {loading ? "Adding..." : "Add suite"}
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
        <p className="text-sm font-medium text-zinc-700">HVAC units</p>
        {unitRows.map((row, index) => (
          <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder={index === 0 ? "Main unit" : "Unit name *"}
              value={row.name}
              onChange={(e) => updateUnitRow(row.id, { name: e.target.value })}
              required
            />
            <Select
              value={row.filter_size}
              onChange={(e) => updateUnitRow(row.id, { filter_size: e.target.value })}
              required
            >
              <option value="" disabled>
                Filter size *
              </option>
              {filterSizes.map((size) => {
                const value = formatFilterSize(size);
                return (
                  <option key={size.id} value={value}>
                    {formatFilterSizeLabel(size)}
                  </option>
                );
              })}
            </Select>
            {index > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => removeUnitRow(row.id)}>
                Remove
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addUnitRow}>
          + Add unit
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

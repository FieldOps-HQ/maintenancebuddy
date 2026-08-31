"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suiteSchema, formatFilterSize, formatFilterSizeLabel } from "@maintenancebuddy/shared";
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

export function SuiteForm({
  buildingId,
  filterSizes,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      suite_number: formData.get("suite_number") as string,
      floor: (formData.get("floor") as string) || undefined,
      filter_size: (formData.get("filter_size") as string) || undefined,
      filter_quantity: formData.get("filter_quantity") as string,
    };

    const parsed = suiteSchema.safeParse(data);
    if (!parsed.success) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.from("suites").insert({ ...parsed.data, building_id: buildingId });
    (e.target as HTMLFormElement).reset();
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div>
        <Label htmlFor="suite_number" className="sr-only">Suite</Label>
        <Input id="suite_number" name="suite_number" placeholder="Suite #" required />
      </div>
      <div>
        <Label htmlFor="floor" className="sr-only">Floor</Label>
        <Input id="floor" name="floor" placeholder="Floor" />
      </div>
      <div>
        <Label htmlFor="filter_size" className="sr-only">Filter size</Label>
        <Select id="filter_size" name="filter_size" defaultValue="">
          <option value="" disabled>
            Filter size
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
      <div>
        <Label htmlFor="filter_quantity" className="sr-only">Qty</Label>
        <Input id="filter_quantity" name="filter_quantity" type="number" defaultValue={1} min={0} />
      </div>
      <Button type="submit" disabled={loading || filterSizes.length === 0} size="sm">
        Add
      </Button>
      {filterSizes.length === 0 && (
        <p className="col-span-full text-xs text-zinc-500">
          Add filter sizes under Filter Sizes in the sidebar first.
        </p>
      )}
    </form>
  );
}

function SuiteFields({
  suite,
  filterSizes,
  idPrefix,
}: {
  suite?: Suite;
  filterSizes: FilterSizeOption[];
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
      <div>
        <Label htmlFor={`${idPrefix}-filter_size`}>Filter size</Label>
        <Select
          id={`${idPrefix}-filter_size`}
          name="filter_size"
          defaultValue={suite?.filter_size ?? ""}
        >
          <option value="">None</option>
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
      <div>
        <Label htmlFor={`${idPrefix}-filter_quantity`}>Filter qty</Label>
        <Input
          id={`${idPrefix}-filter_quantity`}
          name="filter_quantity"
          type="number"
          defaultValue={suite?.filter_quantity ?? 1}
          min={0}
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-hvac_location_notes`}>HVAC location notes</Label>
        <Input
          id={`${idPrefix}-hvac_location_notes`}
          name="hvac_location_notes"
          defaultValue={suite?.hvac_location_notes ?? ""}
        />
      </div>
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
      filter_size: (formData.get("filter_size") as string) || undefined,
      filter_quantity: formData.get("filter_quantity") as string,
      hvac_location_notes: (formData.get("hvac_location_notes") as string) || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("suites")
      .update(parsed.data)
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
            <SuiteFields suite={suite} filterSizes={filterSizes} idPrefix={`edit-${suite.id}`} />
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
      : suite.filter_size
        ? `${suite.filter_quantity}x ${suite.filter_size}`
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
            <Badge variant="secondary">
              {hvacUnits[0].filter_quantity}x {hvacUnits[0].filter_size}
            </Badge>
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

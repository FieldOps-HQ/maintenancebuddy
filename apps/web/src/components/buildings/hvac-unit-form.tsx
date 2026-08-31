"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hvacUnitSchema, formatFilterSize, formatFilterSizeLabel } from "@maintenancebuddy/shared";
import type { HvacUnit } from "@maintenancebuddy/shared";
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

function UnitFields({
  unit,
  filterSizes,
  idPrefix,
}: {
  unit?: HvacUnit;
  filterSizes: FilterSizeOption[];
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Unit name</Label>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={unit?.name} required />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-filter_size`}>Filter size</Label>
        <Select id={`${idPrefix}-filter_size`} name="filter_size" defaultValue={unit?.filter_size ?? ""}>
          <option value="" disabled>
            Select filter size
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
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-location_notes`}>Location notes</Label>
        <Input
          id={`${idPrefix}-location_notes`}
          name="location_notes"
          defaultValue={unit?.location_notes ?? ""}
        />
      </div>
    </div>
  );
}

export function HvacUnitRow({
  unit,
  filterSizes,
}: {
  unit: HvacUnit;
  filterSizes: FilterSizeOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const parsed = hvacUnitSchema.safeParse({
      name: formData.get("name") as string,
      location_notes: (formData.get("location_notes") as string) || undefined,
      filter_size: (formData.get("filter_size") as string) || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("hvac_units")
      .update({ ...parsed.data, filter_quantity: 1 })
      .eq("id", unit.id);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? "A unit with this name already exists in the suite."
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
    const { error: deleteError } = await supabase.from("hvac_units").delete().eq("id", unit.id);

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
      <li className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
        <form onSubmit={handleUpdate} className="space-y-3">
          <UnitFields unit={unit} filterSizes={filterSizes} idPrefix={`edit-unit-${unit.id}`} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-sm">
      <div>
        <p className="font-medium">{unit.name}</p>
        {unit.filter_size && (
          <Badge variant="secondary" className="mt-1">
            {unit.filter_size}
          </Badge>
        )}
        {unit.location_notes && <p className="mt-1 text-xs text-zinc-500">{unit.location_notes}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Unit actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem
            destructive
            disabled={loading}
            onClick={() => {
              if (!confirm("Delete this HVAC unit? Related visit records will also be removed.")) return;
              handleDelete();
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function AddHvacUnitForm({
  suiteId,
  filterSizes,
}: {
  suiteId: string;
  filterSizes: FilterSizeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const parsed = hvacUnitSchema.safeParse({
      name: formData.get("name") as string,
      location_notes: (formData.get("location_notes") as string) || undefined,
      filter_size: (formData.get("filter_size") as string) || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: insertError } = await supabase.from("hvac_units").insert({
      ...parsed.data,
      filter_quantity: 1,
      suite_id: suiteId,
    });

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "A unit with this name already exists in the suite."
          : insertError.message
      );
      setLoading(false);
      return;
    }

    setOpen(false);
    router.refresh();
    setLoading(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add unit
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-zinc-200 p-3">
      <UnitFields filterSizes={filterSizes} idPrefix={`add-unit-${suiteId}`} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Adding..." : "Add unit"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

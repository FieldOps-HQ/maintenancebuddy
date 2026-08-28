"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building, buildingSchema, formatBuildingAddress } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BuildingFormProps = {
  building?: Building;
  onSaved?: () => void;
  onCancel?: () => void;
};

export function BuildingForm({ building, onSaved, onCancel }: BuildingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(building);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      street_number: formData.get("street_number") as string,
      street: formData.get("street") as string,
      city: formData.get("city") as string,
      postal_code: formData.get("postal_code") as string,
    };

    const parsed = buildingSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    if (isEditing && building) {
      const { error: updateError } = await supabase
        .from("buildings")
        .update(parsed.data)
        .eq("id", building.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      router.refresh();
      onSaved?.();
      setLoading(false);
      return;
    }

    const { data: created, error: insertError } = await supabase
      .from("buildings")
      .insert(parsed.data)
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/buildings/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Building Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Harbour View Condos"
          defaultValue={building?.name}
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="street_number">Street #</Label>
          <Input
            id="street_number"
            name="street_number"
            placeholder="100"
            defaultValue={building?.street_number}
            required
          />
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="street">Street</Label>
          <Input
            id="street"
            name="street"
            placeholder="Lakeshore Blvd"
            defaultValue={building?.street}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" placeholder="Toronto" defaultValue={building?.city} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postal_code">Postal Code</Label>
          <Input
            id="postal_code"
            name="postal_code"
            placeholder="M5J 2T4"
            defaultValue={building?.postal_code}
            required
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className={isEditing ? "flex gap-2" : ""}>
        {isEditing && onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" className={isEditing ? "flex-1" : "w-full"} disabled={loading}>
          {loading ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save Changes" : "Create Building"}
        </Button>
      </div>
    </form>
  );
}

export function BuildingHeader({ building }: { building: Building }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");

    const supabase = createClient();
    const { error } = await supabase.from("buildings").delete().eq("id", building.id);

    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }

    router.push("/buildings");
    router.refresh();
  }

  if (editing) {
    return (
      <div className="max-w-lg">
        <h2 className="mb-4 text-lg font-semibold">Edit Building</h2>
        <BuildingForm
          building={building}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{building.name}</h1>
        <p className="text-zinc-500">{formatBuildingAddress(building)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {!confirmDelete ? (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </>
          )}
        </div>
        {confirmDelete && (
          <p className="max-w-xs text-right text-sm text-red-600">
            This will permanently delete the building and all its suites, contacts, and maintenance
            records.
          </p>
        )}
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      </div>
    </div>
  );
}

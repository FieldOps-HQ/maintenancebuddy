"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVE_MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABELS,
  maintenanceUpdateSchema,
  type MaintenanceStatus,
} from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Technician {
  id: string;
  full_name: string;
  email: string;
}

interface MaintenanceData {
  id: string;
  building_id: string;
  start_date: string;
  end_date: string;
  status: MaintenanceStatus;
  notes: string | null;
}

interface ActiveMaintenance {
  id: string;
  building_id: string;
}

const ACTIVE_MAINTENANCE_MESSAGE =
  "This building already has an active maintenance. Complete or cancel it before activating another.";

function MaintenanceEditForm({
  maintenance,
  technicians,
  assignedTechnicianIds,
  activeMaintenances,
  onSaved,
  onCancel,
}: {
  maintenance: MaintenanceData;
  technicians: Technician[];
  assignedTechnicianIds: string[];
  activeMaintenances: ActiveMaintenance[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTechs, setSelectedTechs] = useState(assignedTechnicianIds);
  const [status, setStatus] = useState<MaintenanceStatus>(maintenance.status);

  const conflictingActiveMaintenance = useMemo(() => {
    if (!ACTIVE_MAINTENANCE_STATUSES.includes(status)) return undefined;
    return activeMaintenances.find(
      (m) => m.building_id === maintenance.building_id && m.id !== maintenance.id
    );
  }, [activeMaintenances, maintenance.building_id, maintenance.id, status]);

  function toggleTech(id: string) {
    setSelectedTechs((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      start_date: formData.get("start_date") as string,
      end_date: formData.get("end_date") as string,
      notes: (formData.get("notes") as string) || undefined,
      status,
      technician_ids: selectedTechs,
    };

    const parsed = maintenanceUpdateSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    if (conflictingActiveMaintenance) {
      setError(ACTIVE_MAINTENANCE_MESSAGE);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("maintenances")
      .update({
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
      })
      .eq("id", maintenance.id);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? ACTIVE_MAINTENANCE_MESSAGE
          : updateError.message
      );
      setLoading(false);
      return;
    }

    await supabase.from("maintenance_assignments").delete().eq("maintenance_id", maintenance.id);

    const { error: assignmentError } = await supabase.from("maintenance_assignments").insert(
      parsed.data.technician_ids.map((technician_id) => ({
        maintenance_id: maintenance.id,
        technician_id,
      }))
    );

    if (assignmentError) {
      setError(assignmentError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    onSaved();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={maintenance.start_date}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={maintenance.end_date}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          {(Object.keys(MAINTENANCE_STATUS_LABELS) as MaintenanceStatus[]).map((value) => (
            <option key={value} value={value}>
              {MAINTENANCE_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        {conflictingActiveMaintenance && (
          <p className="text-sm text-amber-700">{ACTIVE_MAINTENANCE_MESSAGE}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Optional notes..."
          defaultValue={maintenance.notes ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label>Assigned Technicians</Label>
        <div className="space-y-2">
          {technicians.length === 0 ? (
            <p className="text-sm text-zinc-500">No technicians found.</p>
          ) : (
            technicians.map((tech) => (
              <label
                key={tech.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={selectedTechs.includes(tech.id)}
                  onChange={() => toggleTech(tech.id)}
                  className="h-4 w-4"
                />
                <div>
                  <p className="font-medium">{tech.full_name}</p>
                  <p className="text-sm text-zinc-500">{tech.email}</p>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || Boolean(conflictingActiveMaintenance)}>
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

export function MaintenanceHeader({
  maintenance,
  buildingName,
  assignedTechnicianIds,
}: {
  maintenance: MaintenanceData;
  buildingName: string;
  assignedTechnicianIds: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [activeMaintenances, setActiveMaintenances] = useState<ActiveMaintenance[]>([]);

  async function startEditing() {
    setEditLoading(true);
    setEditError("");

    const supabase = createClient();
    const [{ data: techRows, error: techError }, { data: activeRows, error: activeError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("role", "technician")
          .order("full_name"),
        supabase
          .from("maintenances")
          .select("id, building_id")
          .in("status", ACTIVE_MAINTENANCE_STATUSES),
      ]);

    if (techError || activeError) {
      setEditError(techError?.message ?? activeError?.message ?? "Failed to load edit form");
      setEditLoading(false);
      return;
    }

    setTechnicians(techRows ?? []);
    setActiveMaintenances(activeRows ?? []);
    setEditing(true);
    setEditLoading(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");

    const supabase = createClient();
    const { error } = await supabase.from("maintenances").delete().eq("id", maintenance.id);

    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }

    router.push("/maintenances");
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Edit Maintenance</h2>
        <MaintenanceEditForm
          maintenance={maintenance}
          technicians={technicians}
          assignedTechnicianIds={assignedTechnicianIds}
          activeMaintenances={activeMaintenances}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{buildingName}</h1>
        <p className="text-zinc-500">
          {formatDate(maintenance.start_date)} – {formatDate(maintenance.end_date)}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={maintenance.status === "completed" ? "success" : "warning"}>
            {MAINTENANCE_STATUS_LABELS[maintenance.status]}
          </Badge>
          {maintenance.notes && (
            <span className="text-sm text-zinc-500">{maintenance.notes}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <div className="flex gap-2">
          <Button variant="outline" onClick={startEditing} disabled={editLoading}>
            {editLoading ? "Loading..." : "Edit"}
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
        {editError && <p className="text-sm text-red-600">{editError}</p>}
        {confirmDelete && (
          <p className="max-w-xs text-right text-sm text-red-600">
            This will permanently delete the maintenance and all suite visits, photos, and
            deficiencies.
          </p>
        )}
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      </div>
    </div>
  );
}

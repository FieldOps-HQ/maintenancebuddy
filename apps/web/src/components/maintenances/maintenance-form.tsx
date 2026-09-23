"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { maintenanceSchema } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Building {
  id: string;
  name: string;
}

interface Technician {
  id: string;
  full_name: string;
  email: string;
}

interface ActiveMaintenance {
  id: string;
  building_id: string;
  status: string;
}

const ACTIVE_MAINTENANCE_MESSAGE =
  "This building already has an active maintenance. Complete or cancel it before scheduling another.";

export function MaintenanceForm({
  buildings,
  technicians,
  activeMaintenances,
}: {
  buildings: Building[];
  technicians: Technician[];
  activeMaintenances: ActiveMaintenance[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");

  const activeByBuilding = useMemo(
    () => new Map(activeMaintenances.map((m) => [m.building_id, m])),
    [activeMaintenances]
  );

  const selectedActiveMaintenance = selectedBuildingId
    ? activeByBuilding.get(selectedBuildingId)
    : undefined;

  const availableBuildings = buildings.filter((b) => !activeByBuilding.has(b.id));

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
      building_id: formData.get("building_id") as string,
      start_date: formData.get("start_date") as string,
      end_date: formData.get("end_date") as string,
      notes: (formData.get("notes") as string) || undefined,
      technician_ids: selectedTechs,
    };

    const parsed = maintenanceSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    if (activeByBuilding.has(parsed.data.building_id)) {
      setError(ACTIVE_MAINTENANCE_MESSAGE);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: maintenance, error: insertError } = await supabase
      .from("maintenances")
      .insert({
        building_id: parsed.data.building_id,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (insertError || !maintenance) {
      setError(
        insertError?.code === "23505"
          ? ACTIVE_MAINTENANCE_MESSAGE
          : insertError?.message ?? "Failed to create maintenance"
      );
      setLoading(false);
      return;
    }

    await supabase.from("maintenance_assignments").insert(
      parsed.data.technician_ids.map((technician_id) => ({
        maintenance_id: maintenance.id,
        technician_id,
      }))
    );

    router.push(`/maintenances/${maintenance.id}`);
    router.refresh();
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="building_id">Building</Label>
        <select
          id="building_id"
          name="building_id"
          required
          value={selectedBuildingId}
          onChange={(e) => setSelectedBuildingId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Select a building</option>
          {buildings.map((b) => {
            const active = activeByBuilding.get(b.id);
            return (
              <option key={b.id} value={b.id} disabled={Boolean(active)}>
                {b.name}
                {active ? " (active maintenance)" : ""}
              </option>
            );
          })}
        </select>
        {selectedActiveMaintenance && (
          <p className="text-sm text-amber-700">
            {ACTIVE_MAINTENANCE_MESSAGE}{" "}
            <Link
              href={`/maintenances/${selectedActiveMaintenance.id}`}
              className="font-medium underline"
            >
              View active maintenance
            </Link>
          </p>
        )}
        {buildings.length > 0 && availableBuildings.length === 0 && (
          <p className="text-sm text-zinc-500">
            All buildings currently have an active maintenance scheduled or in progress.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input id="start_date" name="start_date" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <Input id="end_date" name="end_date" type="date" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" placeholder="Optional notes..." />
      </div>

      <div className="space-y-2">
        <Label>Assign Technicians</Label>
        <div className="space-y-2">
          {technicians.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No technicians found.{" "}
              <a href="/team" className="font-medium text-teal-800 hover:underline">
                Invite technicians
              </a>{" "}
              from the Team page.
            </p>
          ) : (
            technicians.map((tech) => (
              <label key={tech.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 p-3 cursor-pointer hover:bg-zinc-50">
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
      <Button
        type="submit"
        disabled={loading || availableBuildings.length === 0 || Boolean(selectedActiveMaintenance)}
      >
        {loading ? "Creating..." : "Schedule Maintenance"}
      </Button>
    </form>
  );
}

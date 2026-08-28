import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MaintenanceForm } from "@/components/maintenances/maintenance-form";
import { ACTIVE_MAINTENANCE_STATUSES } from "@maintenancebuddy/shared";

export default async function NewMaintenancePage() {
  const supabase = await createClient();

  const [{ data: buildings }, { data: technicians }, { data: activeMaintenances }] = await Promise.all([
    supabase.from("buildings").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "technician").order("full_name"),
    supabase
      .from("maintenances")
      .select("id, building_id, status")
      .in("status", ACTIVE_MAINTENANCE_STATUSES),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule Maintenance</h1>
        <p className="text-zinc-500">Create a new maintenance job and assign technicians</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance Details</CardTitle>
        </CardHeader>
        <CardContent>
          <MaintenanceForm
            buildings={buildings ?? []}
            technicians={technicians ?? []}
            activeMaintenances={activeMaintenances ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { collectVisitIssues } from "@/lib/visit-issues";
import { VisitIssuesCard } from "@/components/maintenances/visit-issues-card";
import { SUITE_VISIT_ISSUES_SELECT } from "@/lib/suite-visit-mapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function MaintenanceSidePanels({
  maintenanceId,
  assignments,
}: {
  maintenanceId: string;
  assignments: {
    technician: { full_name: string; email: string } | null;
  }[];
}) {
  const supabase = await createClient();
  const { data: suiteVisits } = await supabase
    .from("suite_visits")
    .select(SUITE_VISIT_ISSUES_SELECT)
    .eq("maintenance_id", maintenanceId);

  const visitIssues = collectVisitIssues(suiteVisits ?? []);

  if (assignments.length === 0 && visitIssues.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned Technicians</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assignments.map((a) => (
              <div key={a.technician?.email} className="text-sm">
                <p className="font-medium">{a.technician?.full_name}</p>
                <p className="text-slate-500">{a.technician?.email}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {visitIssues.length > 0 && <VisitIssuesCard issues={visitIssues} />}
    </div>
  );
}

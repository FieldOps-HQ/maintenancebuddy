import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VisitIssue } from "@/lib/visit-issues";

export function VisitIssuesCard({ issues }: { issues: VisitIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Incomplete visits & issues ({issues.length})</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 space-y-3 overflow-auto">
        {issues.map((issue) => (
          <div key={issue.key} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-sm">
            <p className="font-medium text-slate-900">
              Suite {issue.suiteNumber}
              {issue.unitName ? ` · ${issue.unitName}` : ""}
            </p>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{issue.statusLabel}</p>
            <p className="mt-1 text-slate-700">{issue.reason}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

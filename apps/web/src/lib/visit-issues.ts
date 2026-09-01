import {
  DEFICIENCY_LABELS,
  SUITE_VISIT_STATUS_LABELS,
  type DeficiencyCategory,
  type SuiteVisitStatus,
} from "@maintenancebuddy/shared";

export type VisitIssue = {
  key: string;
  suiteNumber: string;
  unitName?: string;
  statusLabel: string;
  reason: string;
};

type VisitWithIssues = {
  suite: { suite_number: string } | null;
  hvac_unit_visits?: {
    id: string;
    status: string;
    notes: string | null;
    hvac_unit: { name: string } | null;
    deficiencies?: { id: string; category: string; description: string }[];
  }[];
};

export function collectVisitIssues(visits: VisitWithIssues[]): VisitIssue[] {
  const issues: VisitIssue[] = [];

  for (const visit of visits) {
    const suiteNumber = visit.suite?.suite_number ?? "?";

    for (const unitVisit of visit.hvac_unit_visits ?? []) {
      const unitName = unitVisit.hvac_unit?.name ?? undefined;

      if (unitVisit.status === "blocked_unit" || unitVisit.status === "no_access") {
        issues.push({
          key: `unit-${unitVisit.id}`,
          suiteNumber,
          unitName,
          statusLabel: SUITE_VISIT_STATUS_LABELS[unitVisit.status as SuiteVisitStatus],
          reason: unitVisit.notes?.trim() || "No reason provided",
        });
      }

      for (const deficiency of unitVisit.deficiencies ?? []) {
        const categoryLabel =
          DEFICIENCY_LABELS[deficiency.category as DeficiencyCategory] ?? deficiency.category;

        issues.push({
          key: `deficiency-${deficiency.id}`,
          suiteNumber,
          unitName,
          statusLabel: categoryLabel,
          reason: deficiency.description,
        });
      }
    }
  }

  return issues.sort((a, b) =>
    a.suiteNumber.localeCompare(b.suiteNumber, undefined, { numeric: true })
  );
}

export function getVisitReasonPreview(visit: {
  unit_visits: { status: SuiteVisitStatus; notes: string | null }[];
}): string | null {
  const unitWithReason = visit.unit_visits.find(
    (unitVisit) =>
      (unitVisit.status === "blocked_unit" || unitVisit.status === "no_access") &&
      unitVisit.notes?.trim()
  );

  return unitWithReason?.notes?.trim() ?? null;
}

import type { SuiteVisitStatus } from "./types";

const SUITE_LEVEL_STATUSES: SuiteVisitStatus[] = ["no_access", "blocked_unit", "skipped"];

export function getSuiteVisitRollupStatus(
  unitVisits: { status: SuiteVisitStatus }[],
  currentSuiteStatus?: SuiteVisitStatus
): SuiteVisitStatus {
  if (currentSuiteStatus && SUITE_LEVEL_STATUSES.includes(currentSuiteStatus)) {
    return currentSuiteStatus;
  }

  if (unitVisits.length === 0) {
    return "pending";
  }

  const completed = unitVisits.filter((v) => v.status === "completed").length;
  const started = unitVisits.filter((v) => v.status === "in_progress" || v.status === "completed").length;

  if (completed === unitVisits.length) {
    return "completed";
  }
  if (started > 0) {
    return "in_progress";
  }
  return "pending";
}

export function countCompletedUnitVisits(unitVisits: { status: SuiteVisitStatus }[]): {
  completed: number;
  total: number;
} {
  return {
    completed: unitVisits.filter((v) => v.status === "completed").length,
    total: unitVisits.length,
  };
}

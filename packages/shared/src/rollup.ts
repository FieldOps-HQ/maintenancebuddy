import type { SuiteVisitStatus } from "./types";

const SUITE_LEVEL_STATUSES: SuiteVisitStatus[] = ["no_access", "blocked_unit", "skipped"];

const UNIT_DONE_STATUSES: SuiteVisitStatus[] = [
  "completed",
  "blocked_unit",
  "no_access",
  "skipped",
];

export function isUnitVisitDone(status: SuiteVisitStatus): boolean {
  return UNIT_DONE_STATUSES.includes(status);
}

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

  const done = unitVisits.filter((v) => isUnitVisitDone(v.status)).length;
  const started = unitVisits.filter(
    (v) => v.status === "in_progress" || isUnitVisitDone(v.status)
  ).length;

  if (done === unitVisits.length) {
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
    completed: unitVisits.filter((v) => isUnitVisitDone(v.status)).length,
    total: unitVisits.length,
  };
}

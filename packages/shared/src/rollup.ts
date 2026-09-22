import type { SuiteVisitStatus } from "./types";

const UNIT_DONE_STATUSES: SuiteVisitStatus[] = [
  "completed",
  "blocked_unit",
  "no_access",
];

export function isUnitVisitDone(status: SuiteVisitStatus): boolean {
  return UNIT_DONE_STATUSES.includes(status);
}

export function getSuiteVisitRollupStatus(
  unitVisits: { status: SuiteVisitStatus }[]
): SuiteVisitStatus {
  if (unitVisits.length === 0) {
    return "pending";
  }

  const statuses = unitVisits.map((visit) => visit.status);

  if (statuses.every((status) => status === "pending")) {
    return "pending";
  }

  // Partially complete suites stay pending (no in_progress visit status / blue cells).
  if (!statuses.every((status) => isUnitVisitDone(status))) {
    return "pending";
  }

  const uniqueStatuses = new Set(statuses);
  if (uniqueStatuses.size === 1) {
    return statuses[0];
  }

  if (statuses.includes("blocked_unit")) {
    return "blocked_unit";
  }

  if (statuses.includes("no_access")) {
    return "no_access";
  }

  return "completed";
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

import type { DeficiencyCategory, MaintenanceStatus, SuiteVisitStatus } from "./types";

export const ACTIVE_MAINTENANCE_STATUSES: MaintenanceStatus[] = ["scheduled", "in_progress"];

export const SUITE_VISIT_STATUS_LABELS: Record<SuiteVisitStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  blocked_unit: "Blocked Unit",
  no_access: "No Access",
  skipped: "Skipped",
  in_progress: "In Progress",
};

export const SUITE_VISIT_STATUS_COLORS: Record<SuiteVisitStatus, string> = {
  pending: "bg-gray-200 text-gray-700",
  completed: "bg-green-500 text-white",
  blocked_unit: "bg-red-500 text-white",
  no_access: "bg-yellow-500 text-white",
  skipped: "bg-gray-400 text-white",
  in_progress: "bg-blue-500 text-white",
};

export const MOBILE_STATUS_COLORS: Record<SuiteVisitStatus, string> = {
  pending: "#e5e7eb",
  completed: "#22c55e",
  blocked_unit: "#ef4444",
  no_access: "#eab308",
  skipped: "#9ca3af",
  in_progress: "#3b82f6",
};

export const DEFICIENCY_LABELS: Record<DeficiencyCategory, string> = {
  not_cleaned: "Unit not cleaned",
  filter_not_changed: "Filter not changed",
  not_operating: "Unit not operating normally",
  other: "Other",
};

export const WIZARD_STEPS = [
  { key: "cleaned" as const, question: "Cleaned?", deficiency: "not_cleaned" as DeficiencyCategory },
  { key: "filter_changed" as const, question: "Filter changed?", deficiency: "filter_not_changed" as DeficiencyCategory },
  { key: "operating_normally" as const, question: "Operating normally?", deficiency: "not_operating" as DeficiencyCategory },
  { key: "photo" as const, question: "Take a photo", deficiency: null },
];

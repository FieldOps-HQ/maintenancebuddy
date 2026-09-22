import type { DeficiencyCategory, MaintenanceStatus, SuiteVisitStatus } from "./types";

export const ACTIVE_MAINTENANCE_STATUSES: MaintenanceStatus[] = ["scheduled", "in_progress"];

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SUITE_VISIT_STATUS_LABELS: Record<SuiteVisitStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  blocked_unit: "Blocked Unit",
  no_access: "No Access",
};

export const SUITE_VISIT_STATUS_COLORS: Record<SuiteVisitStatus, string> = {
  pending: "bg-gray-200 text-gray-700",
  completed: "bg-green-500 text-white",
  blocked_unit: "bg-red-500 text-white",
  no_access: "bg-yellow-500 text-white",
};

export const MOBILE_STATUS_COLORS: Record<SuiteVisitStatus, string> = {
  pending: "#e5e7eb",
  completed: "#22c55e",
  blocked_unit: "#ef4444",
  no_access: "#eab308",
};

export const DEFICIENCY_LABELS: Record<DeficiencyCategory, string> = {
  not_cleaned: "Unit not cleaned",
  filter_not_changed: "Filter not changed",
  not_operating: "Unit not operating normally",
  other: "Other",
};

export const WIZARD_STEPS = [
  { key: "cleaned" as const, title: "Cleaned", question: "Was the unit cleaned and vacuumed?", deficiency: "not_cleaned" as DeficiencyCategory },
  { key: "filter_changed" as const, title: "Filter Replaced", question: "Was the filter replaced with a new one?", deficiency: "filter_not_changed" as DeficiencyCategory },
  { key: "operating_normally" as const, title: "Unit Operation", question: "Is the HVAC unit heating/cooling as designed?", deficiency: "not_operating" as DeficiencyCategory },
  { key: "photo" as const, title: "Photo", question: "Take a photo", deficiency: null },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

export const WIZARD_NO_REASON_PROMPTS: Record<
  Exclude<WizardStepKey, "photo">,
  string
> = {
  cleaned: "Why wasn't the unit cleaned and vacuumed?",
  filter_changed: "Why wasn't the filter replaced with a new one?",
  operating_normally: "Why isn't the HVAC unit heating/cooling as designed?",
};

export function formatBuildingAddress(building: {
  street_number: string;
  street: string;
  city: string;
  postal_code: string;
}): string {
  return `${building.street_number} ${building.street}, ${building.city}, ${building.postal_code}`;
}

export type MaintenanceTiming = "previous" | "current" | "future";

export function getMaintenanceTiming(
  maintenance: { start_date: string; end_date: string; status: string },
  today = new Date().toISOString().split("T")[0]
): MaintenanceTiming {
  if (maintenance.status === "completed" || maintenance.status === "cancelled") {
    return "previous";
  }
  if (maintenance.start_date > today) {
    return "future";
  }
  if (maintenance.end_date < today) {
    return "previous";
  }
  return "current";
}

export const MAINTENANCE_TIMING_LABELS: Record<MaintenanceTiming, string> = {
  current: "Current",
  future: "Upcoming",
  previous: "Previous",
};

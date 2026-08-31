export function formatBuildingAddress(building: {
  street_number: string;
  street: string;
  city: string;
  postal_code: string;
}): string {
  return `${building.street_number} ${building.street}, ${building.city}, ${building.postal_code}`;
}

function formatInches(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Compact size string stored on suites, e.g. 16x25x1 */
export function formatFilterSize(size: {
  length_in: number;
  width_in: number;
  thickness_in: number;
}): string {
  return `${formatInches(size.length_in)}x${formatInches(size.width_in)}x${formatInches(size.thickness_in)}`;
}

/** Human-readable label with L/W/thickness, e.g. L 16 × W 25 × 1 in */
export function formatFilterSizeLabel(size: {
  length_in: number;
  width_in: number;
  thickness_in: number;
}): string {
  return `L ${formatInches(size.length_in)} × W ${formatInches(size.width_in)} × ${formatInches(size.thickness_in)} in`;
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

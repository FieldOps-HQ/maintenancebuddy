import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function parseCsvSuites(csv: string) {
  const lines = csv.trim().split("\n");
  const startIndex = lines[0]?.toLowerCase().includes("suite") ? 1 : 0;

  return lines.slice(startIndex).map((line) => {
    const [suite_number, floor, filter_size, filter_quantity, hvac_location_notes] = line
      .split(",")
      .map((v) => v.trim());
    return {
      suite_number,
      floor: floor || undefined,
      filter_size: filter_size || undefined,
      filter_quantity: filter_quantity ? parseInt(filter_quantity, 10) : 1,
      hvac_location_notes: hvac_location_notes || undefined,
    };
  }).filter((s) => s.suite_number);
}

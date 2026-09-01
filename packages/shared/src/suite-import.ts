import { formatFilterSize, formatFilterSizeLabel } from "./format";

export type SuiteImportRow = {
  suite_number: string;
  filter_size: string;
  unit_location: string;
};

export type ParsedSuiteImportRow = SuiteImportRow & {
  rowIndex: number;
};

export type FilterSizeOption = {
  length_in: number;
  width_in: number;
  thickness_in: number;
};

export type ExistingSuiteForImport = {
  suite_number: string;
  units: Array<{ name: string }>;
};

export type SuiteImportRowValidation = {
  rowIndex: number;
  row: SuiteImportRow;
  resolvedFilterSize: string | null;
  valid: boolean;
  errors: string[];
};

export function defaultUnitLocation(value: string) {
  return value.trim() || "Main";
}

export function normalizeUnitName(value: string) {
  return value.trim().toLowerCase();
}

export function createFilterSizeResolver(filterSizes: FilterSizeOption[]) {
  return (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const exact = filterSizes.find((s) => formatFilterSize(s) === trimmed);
    if (exact) return formatFilterSize(exact);

    const byLabel = filterSizes.find(
      (s) => formatFilterSizeLabel(s).toLowerCase() === trimmed.toLowerCase()
    );
    if (byLabel) return formatFilterSize(byLabel);

    return null;
  };
}

function splitImportLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim());
  }
  return line.split(",").map((cell) => cell.trim());
}

export function parseSuiteImportRows(text: string): ParsedSuiteImportRow[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const startIndex = lines[0]?.toLowerCase().includes("suite") ? 1 : 0;

  return lines.slice(startIndex).map((line, offset) => {
    const cells = splitImportLine(line);
    return {
      rowIndex: startIndex + offset,
      suite_number: (cells[0] ?? "").trim(),
      filter_size: (cells[1] ?? "").trim(),
      unit_location: defaultUnitLocation(cells[2] ?? ""),
    };
  });
}

export function validateSuiteImportRows(
  rows: ParsedSuiteImportRow[],
  options: {
    resolveFilterSize: (input: string) => string | null;
    existingSuites: ExistingSuiteForImport[];
  }
): SuiteImportRowValidation[] {
  const { resolveFilterSize, existingSuites } = options;
  const existingBySuite = new Map(
    existingSuites.map((suite) => [suite.suite_number, new Set(suite.units.map((u) => normalizeUnitName(u.name)))])
  );
  const batchUnitsBySuite = new Map<string, Set<string>>();

  return rows.map((row) => {
    const errors: string[] = [];
    const suiteNumber = row.suite_number.trim();
    const locationName = defaultUnitLocation(row.unit_location);
    const resolvedFilter = resolveFilterSize(row.filter_size);

    if (!suiteNumber) {
      errors.push("Suite number is required.");
    }
    if (!row.filter_size.trim()) {
      errors.push("Filter size is required.");
    } else if (!resolvedFilter) {
      errors.push(`Unknown filter size "${row.filter_size.trim()}".`);
    }

    if (suiteNumber) {
      const normalizedLocation = normalizeUnitName(locationName);
      const existingUnits = existingBySuite.get(suiteNumber) ?? new Set<string>();

      if (existingUnits.has(normalizedLocation)) {
        errors.push(`Unit "${locationName}" already exists in suite ${suiteNumber}.`);
      }

      if (!batchUnitsBySuite.has(suiteNumber)) {
        batchUnitsBySuite.set(suiteNumber, new Set());
      }
      const batchUnits = batchUnitsBySuite.get(suiteNumber)!;
      if (batchUnits.has(normalizedLocation)) {
        errors.push(`Duplicate unit "${locationName}" in import for suite ${suiteNumber}.`);
      } else {
        batchUnits.add(normalizedLocation);
      }
    }

    return {
      rowIndex: row.rowIndex,
      row: {
        suite_number: suiteNumber,
        filter_size: row.filter_size.trim(),
        unit_location: locationName,
      },
      resolvedFilterSize: resolvedFilter,
      valid: errors.length === 0,
      errors,
    };
  });
}

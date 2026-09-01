"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatFilterSize, formatFilterSizeLabel } from "@maintenancebuddy/shared";
import type { Suite, HvacUnit } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { SuiteImportDialog } from "@/components/buildings/suite-import-dialog";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type FilterSizeOption = {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
};

type SuiteWithUnits = Suite & { hvac_units?: HvacUnit[] };

type DraftRow = {
  id: string;
  suite_number: string;
  filter_size: string;
  unit_location: string;
};

type CellFocus = { rowId: string; col: number };

const COLS = ["suite_number", "filter_size", "unit_location"] as const;

function lastFilterStorageKey(buildingId: string) {
  return `mb-last-filter-${buildingId}`;
}

function inferLastFilterFromSuites(suites: SuiteWithUnits[]): string {
  let latest: { at: string; size: string } | null = null;

  for (const suite of suites) {
    for (const unit of suite.hvac_units ?? []) {
      if (!unit.filter_size) continue;
      const at = unit.created_at ?? "";
      if (!latest || at > latest.at) {
        latest = { at, size: unit.filter_size };
      }
    }
    if (suite.filter_size) {
      const at = suite.created_at ?? "";
      if (!latest || at > latest.at) {
        latest = { at, size: suite.filter_size };
      }
    }
  }

  return latest?.size ?? "";
}

function makeDraftRow(filterSize = "", unitLocation = "Main"): DraftRow {
  return {
    id: crypto.randomUUID(),
    suite_number: "",
    filter_size: filterSize,
    unit_location: unitLocation,
  };
}

function defaultUnitLocation(value: string) {
  return value.trim() || "Main";
}

function getSortedUnits(suite: SuiteWithUnits): HvacUnit[] {
  return (suite.hvac_units ?? []).sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

function summarizeUnits(units: HvacUnit[]) {
  return units.map((unit) => unit.name).join(", ");
}

function summarizeFilterSizes(units: HvacUnit[], suite: SuiteWithUnits) {
  const sizes = [...new Set(units.map((unit) => unit.filter_size).filter(Boolean))];
  if (sizes.length === 1) return sizes[0]!;
  if (sizes.length > 1) return "Mixed sizes";
  return suite.filter_size ?? "—";
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function parsePasteRows(text: string): Omit<DraftRow, "id">[] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split("\t");
      return {
        suite_number: (cells[0] ?? "").trim(),
        filter_size: (cells[1] ?? "").trim(),
        unit_location: defaultUnitLocation((cells[2] ?? "").trim()),
      };
    })
    .filter((row) => row.suite_number || row.filter_size || row.unit_location);
}

const cellInputClass =
  "h-9 w-full min-w-[7rem] rounded-none border-0 bg-transparent px-2 shadow-none ring-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400";

const cellSelectClass =
  "h-9 w-full min-w-[7rem] cursor-pointer appearance-none rounded-none border-0 bg-transparent px-2 py-0 shadow-none ring-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400";

function FilterSizeSelect({
  value,
  onChange,
  filterSizes,
  disabled,
  onFocus,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  filterSizes: FilterSizeOption[];
  disabled?: boolean;
  onFocus?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement>) => void;
}) {
  const knownValues = new Set(filterSizes.map((size) => formatFilterSize(size)));
  const showLegacyValue = Boolean(value && !knownValues.has(value));

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      disabled={disabled || filterSizes.length === 0}
      className={cellSelectClass}
    >
      <option value="">Select size</option>
      {showLegacyValue && <option value={value}>{value}</option>}
      {filterSizes.map((size) => {
        const optionValue = formatFilterSize(size);
        return (
          <option key={size.id} value={optionValue}>
            {formatFilterSizeLabel(size)}
          </option>
        );
      })}
    </Select>
  );
}

const rowActionsClass =
  "absolute inset-y-0 right-2 z-10 flex items-center gap-1 rounded-md bg-white/95 px-1 shadow-sm ring-1 ring-slate-200/80";

function RowIconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50",
        destructive
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

type ResolveFilterSize = (input: string) => string | null;

function unitRowKey(unitId: string) {
  return `unit:${unitId}`;
}

function suiteRowKey(suiteId: string) {
  return `suite:${suiteId}`;
}

function getSelectableKeys(suites: SuiteWithUnits[]): string[] {
  return suites.flatMap((suite) => {
    const units = getSortedUnits(suite);
    if (units.length === 0) return [suiteRowKey(suite.id)];
    return units.map((unit) => unitRowKey(unit.id));
  });
}

function getSuiteUnitKeys(suite: SuiteWithUnits): string[] {
  const units = getSortedUnits(suite);
  if (units.length === 0) return [suiteRowKey(suite.id)];
  return units.map((unit) => unitRowKey(unit.id));
}

async function deleteSelectedRows(
  suites: SuiteWithUnits[],
  selectedKeys: Set<string>
): Promise<string | null> {
  const supabase = createClient();
  const unitsToDelete = new Set<string>();
  const suitesToDelete = new Set<string>();

  for (const key of selectedKeys) {
    if (key.startsWith("unit:")) unitsToDelete.add(key.slice(5));
    if (key.startsWith("suite:")) suitesToDelete.add(key.slice(6));
  }

  for (const suite of suites) {
    const units = getSortedUnits(suite);
    if (units.length === 0) continue;

    const selectedInSuite = units.filter((unit) => unitsToDelete.has(unit.id));
    if (selectedInSuite.length === units.length) {
      suitesToDelete.add(suite.id);
    }
  }

  for (const unitId of unitsToDelete) {
    const { error } = await supabase.from("hvac_units").delete().eq("id", unitId);
    if (error) return error.message;
  }

  for (const suite of suites) {
    if (suitesToDelete.has(suite.id)) continue;
    const units = getSortedUnits(suite);
    const remaining = units.filter((unit) => !unitsToDelete.has(unit.id)).length;
    if (units.length > 0 && remaining === 0) {
      suitesToDelete.add(suite.id);
    }
  }

  for (const suiteId of suitesToDelete) {
    const { error } = await supabase.from("suites").delete().eq("id", suiteId);
    if (error) return error.message;
  }

  return null;
}

const checkboxClass =
  "h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:opacity-50";

function RowCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className={checkboxClass}
    />
  );
}

function ExistingUnitRow({
  suite,
  unit,
  suites,
  filterSizes,
  resolveFilterSize,
  nested = false,
  selected,
  onSelectedChange,
  selectionDisabled,
}: {
  suite: SuiteWithUnits;
  unit: HvacUnit | null;
  suites: SuiteWithUnits[];
  filterSizes: FilterSizeOption[];
  resolveFilterSize: ResolveFilterSize;
  nested?: boolean;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  selectionDisabled?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    suite_number: suite.suite_number,
    filter_size: unit?.filter_size ?? suite.filter_size ?? "",
    unit_location: unit?.name ?? "",
  });

  function resetValues() {
    setValues({
      suite_number: suite.suite_number,
      filter_size: unit?.filter_size ?? suite.filter_size ?? "",
      unit_location: unit?.name ?? "",
    });
    setError("");
  }

  function unitNameTaken(locationName: string) {
    const normalized = normalizeName(locationName);
    return (suite.hvac_units ?? []).some(
      (u) => u.id !== unit?.id && normalizeName(u.name) === normalized
    );
  }

  function suiteNumberTaken(suiteNumber: string) {
    return suites.some((s) => s.id !== suite.id && s.suite_number === suiteNumber);
  }

  async function handleSave() {
    setLoading(true);
    setError("");

    const suiteNumber = values.suite_number.trim();
    const locationName = defaultUnitLocation(values.unit_location);
    const resolvedFilter = resolveFilterSize(values.filter_size);

    if (!suiteNumber) {
      setError("Suite number is required.");
      setLoading(false);
      return;
    }
    if (suiteNumberTaken(suiteNumber)) {
      setError(`Suite ${suiteNumber} already exists in this building.`);
      setLoading(false);
      return;
    }
    if (!resolvedFilter) {
      setError(
        values.filter_size.trim()
          ? `Unknown filter size "${values.filter_size.trim()}".`
          : "Filter size is required."
      );
      setLoading(false);
      return;
    }
    if (unit && unitNameTaken(locationName)) {
      setError(`A unit named "${locationName}" already exists in this suite.`);
      setLoading(false);
      return;
    }

    const supabase = createClient();

    if (!nested && suiteNumber !== suite.suite_number) {
      const { error: suiteError } = await supabase
        .from("suites")
        .update({ suite_number: suiteNumber })
        .eq("id", suite.id);

      if (suiteError) {
        setError(
          suiteError.code === "23505"
            ? `Suite ${suiteNumber} already exists in this building.`
            : suiteError.message
        );
        setLoading(false);
        return;
      }
    }

    if (unit) {
      const { error: unitError } = await supabase
        .from("hvac_units")
        .update({
          name: locationName,
          filter_size: resolvedFilter,
          filter_quantity: 1,
        })
        .eq("id", unit.id);

      if (unitError) {
        setError(
          unitError.code === "23505"
            ? `A unit named "${locationName}" already exists in this suite.`
            : unitError.message
        );
        setLoading(false);
        return;
      }

      if ((suite.hvac_units ?? []).length <= 1) {
        await supabase
          .from("suites")
          .update({ filter_size: resolvedFilter, suite_number: suiteNumber })
          .eq("id", suite.id);
      }
    } else {
      const { error: suiteError } = await supabase
        .from("suites")
        .update({ filter_size: resolvedFilter, suite_number: suiteNumber })
        .eq("id", suite.id);

      if (suiteError) {
        setError(suiteError.message);
        setLoading(false);
        return;
      }
    }

    setEditing(false);
    router.refresh();
    setLoading(false);
  }

  async function handleDelete() {
    const label = unit
      ? `Delete unit "${unit.name}" in suite ${suite.suite_number}?`
      : `Delete suite ${suite.suite_number}?`;
    if (
      !confirm(
        `${label} Related visit records for deleted units will also be removed.${
          unit && (suite.hvac_units ?? []).length <= 1
            ? " This is the only unit, so the suite will be removed too."
            : ""
        }`
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();

    if (unit) {
      const { error: deleteError } = await supabase.from("hvac_units").delete().eq("id", unit.id);
      if (deleteError) {
        setError(deleteError.message);
        setLoading(false);
        return;
      }

      if ((suite.hvac_units ?? []).length <= 1) {
        const { error: suiteDeleteError } = await supabase
          .from("suites")
          .delete()
          .eq("id", suite.id);
        if (suiteDeleteError) {
          setError(suiteDeleteError.message);
          setLoading(false);
          return;
        }
      }
    } else {
      const { error: suiteDeleteError } = await supabase.from("suites").delete().eq("id", suite.id);
      if (suiteDeleteError) {
        setError(suiteDeleteError.message);
        setLoading(false);
        return;
      }
    }

    router.refresh();
    setLoading(false);
  }

  if (editing) {
    return (
      <>
        <TableRow className="group border-b border-slate-200 bg-amber-50/40 hover:bg-amber-50/60">
          <TableCell className="border-r border-slate-200 px-2 py-1.5">
            <RowCheckbox
              checked={selected}
              disabled={selectionDisabled || loading}
              onChange={onSelectedChange}
              ariaLabel="Select row"
            />
          </TableCell>
          <TableCell className={cn("border-r border-slate-200 p-0", nested && "px-2 py-1.5")}>
            {nested ? (
              <span className="pl-6 font-sans text-xs text-slate-500">↳</span>
            ) : (
              <Input
                value={values.suite_number}
                onChange={(e) => setValues((v) => ({ ...v, suite_number: e.target.value }))}
                className={cellInputClass}
                disabled={loading}
              />
            )}
          </TableCell>
          <TableCell className="border-r border-slate-200 p-0">
            <FilterSizeSelect
              value={values.filter_size}
              onChange={(filter_size) => setValues((v) => ({ ...v, filter_size }))}
              filterSizes={filterSizes}
              disabled={loading}
            />
          </TableCell>
          <TableCell className="relative border-r border-slate-200 p-0 pr-28">
            {unit ? (
              <Input
                value={values.unit_location}
                onChange={(e) => setValues((v) => ({ ...v, unit_location: e.target.value }))}
                className={cellInputClass}
                disabled={loading}
              />
            ) : (
              <span className="block px-2 py-2 text-slate-400">—</span>
            )}
            <div className={cn(rowActionsClass, "font-sans opacity-100")}>
              <Button type="button" size="sm" disabled={loading} onClick={handleSave}>
                {loading ? "..." : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  resetValues();
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </TableCell>
        </TableRow>
        {error && (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={4}
              className="border-b border-slate-200 bg-amber-50/60 px-2 py-1.5 font-sans text-xs text-red-600"
            >
              {error}
            </TableCell>
          </TableRow>
        )}
      </>
    );
  }

  return (
    <>
      <TableRow
        className={cn(
          "group border-b border-slate-200 hover:bg-slate-50/80",
          selected ? "bg-sky-50/60" : "bg-white"
        )}
      >
        <TableCell className="border-r border-slate-200 px-2 py-1.5">
          <RowCheckbox
            checked={selected}
            disabled={selectionDisabled || loading}
            onChange={onSelectedChange}
            ariaLabel={`Select suite ${suite.suite_number}${unit ? `, ${unit.name}` : ""}`}
          />
        </TableCell>
        <TableCell
          className={cn(
            "border-r border-slate-200 px-2 py-1.5 text-slate-900",
            nested && "pl-8 font-sans text-xs text-slate-500"
          )}
        >
          {nested ? "↳" : suite.suite_number}
        </TableCell>
        <TableCell className="border-r border-slate-200 px-2 py-1.5 text-slate-700">
          {unit?.filter_size ?? suite.filter_size ?? ""}
        </TableCell>
        <TableCell className="relative border-r border-slate-200 px-2 py-1.5 pr-20 text-slate-600">
          {unit?.name ?? ""}
          <div
            className={cn(
              rowActionsClass,
              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            )}
          >
            <RowIconButton
              label="Edit row"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                resetValues();
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </RowIconButton>
            <RowIconButton
              label="Delete row"
              destructive
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </RowIconButton>
          </div>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={4}
            className="border-b border-slate-200 bg-red-50/40 px-2 py-1.5 font-sans text-xs text-red-600"
          >
            {error}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ExistingSuiteRow({
  suite,
  suites,
  filterSizes,
  resolveFilterSize,
  expanded,
  onToggle,
  selectedKeys,
  onSelectedKeysChange,
  selectionDisabled,
}: {
  suite: SuiteWithUnits;
  suites: SuiteWithUnits[];
  filterSizes: FilterSizeOption[];
  resolveFilterSize: ResolveFilterSize;
  expanded: boolean;
  onToggle: () => void;
  selectedKeys: Set<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
  selectionDisabled?: boolean;
}) {
  const units = getSortedUnits(suite);
  const isMultiUnit = units.length > 1;
  const suiteKeys = getSuiteUnitKeys(suite);
  const selectedCount = suiteKeys.filter((key) => selectedKeys.has(key)).length;
  const allSelected = suiteKeys.length > 0 && selectedCount === suiteKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function setSuiteSelection(checked: boolean) {
    onSelectedKeysChange(
      (() => {
        const next = new Set(selectedKeys);
        for (const key of suiteKeys) {
          if (checked) next.add(key);
          else next.delete(key);
        }
        return next;
      })()
    );
  }

  function setUnitSelection(key: string, checked: boolean) {
    onSelectedKeysChange(
      (() => {
        const next = new Set(selectedKeys);
        if (checked) next.add(key);
        else next.delete(key);
        return next;
      })()
    );
  }

  if (!isMultiUnit) {
    const key = suiteKeys[0]!;
    return (
      <ExistingUnitRow
        suite={suite}
        unit={units[0] ?? null}
        suites={suites}
        filterSizes={filterSizes}
        resolveFilterSize={resolveFilterSize}
        selected={selectedKeys.has(key)}
        onSelectedChange={(checked) => setUnitSelection(key, checked)}
        selectionDisabled={selectionDisabled}
      />
    );
  }

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer border-b border-slate-200 hover:bg-slate-100/80",
          someSelected || allSelected ? "bg-sky-50/50" : "bg-slate-50/80"
        )}
        onClick={onToggle}
      >
        <TableCell className="border-r border-slate-200 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
          <RowCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            disabled={selectionDisabled}
            onChange={setSuiteSelection}
            ariaLabel={`Select all units in suite ${suite.suite_number}`}
          />
        </TableCell>
        <TableCell className="border-r border-slate-200 px-2 py-1.5 text-slate-900">
          <div className="flex items-center gap-2">
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                expanded && "rotate-90"
              )}
            />
            <span>{suite.suite_number}</span>
            <span className="font-sans text-xs text-slate-500">{units.length} units</span>
          </div>
        </TableCell>
        <TableCell className="border-r border-slate-200 px-2 py-1.5 font-sans text-xs text-slate-600">
          {summarizeFilterSizes(units, suite)}
        </TableCell>
        <TableCell className="border-r border-slate-200 px-2 py-1.5 font-sans text-xs text-slate-600">
          {expanded ? "—" : summarizeUnits(units)}
        </TableCell>
      </TableRow>
      {expanded &&
        units.map((unit) => {
          const key = unitRowKey(unit.id);
          return (
            <ExistingUnitRow
              key={unit.id}
              suite={suite}
              unit={unit}
              suites={suites}
              filterSizes={filterSizes}
              resolveFilterSize={resolveFilterSize}
              nested
              selected={selectedKeys.has(key)}
              onSelectedChange={(checked) => setUnitSelection(key, checked)}
              selectionDisabled={selectionDisabled}
            />
          );
        })}
    </>
  );
}

export function SuitesSpreadsheet({
  buildingId,
  filterSizes,
  suites,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
  suites: SuiteWithUnits[];
}) {
  const router = useRouter();
  const tableRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFilterSize, setLastFilterSize] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => [makeDraftRow()]);
  const [focusedCell, setFocusedCell] = useState<CellFocus | null>(null);
  const [expandedSuiteIds, setExpandedSuiteIds] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const selectableKeys = getSelectableKeys(suites);
  const selectedCount = selectableKeys.filter((key) => selectedKeys.has(key)).length;
  const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(lastFilterStorageKey(buildingId))
        : null;
    const initial = stored || inferLastFilterFromSuites(suites);
    if (initial) {
      setLastFilterSize(initial);
      setDraftRows([makeDraftRow(initial)]);
    }
  }, [buildingId]); // eslint-disable-line react-hooks/exhaustive-deps -- init per building only

  function rememberFilterSize(filterSize: string) {
    if (!filterSize) return;
    setLastFilterSize(filterSize);
    if (typeof window !== "undefined") {
      localStorage.setItem(lastFilterStorageKey(buildingId), filterSize);
    }
  }

  function toggleSuiteExpanded(suiteId: string) {
    setExpandedSuiteIds((current) => {
      const next = new Set(current);
      if (next.has(suiteId)) next.delete(suiteId);
      else next.add(suiteId);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedKeys(checked ? new Set(selectableKeys) : new Set());
  }

  async function handleBulkDelete() {
    if (selectedCount === 0) return;

    if (
      !confirm(
        `Delete ${selectedCount} selected row(s)? Related visit records will also be removed.`
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");

    const deleteError = await deleteSelectedRows(suites, selectedKeys);
    if (deleteError) {
      setError(deleteError);
      setLoading(false);
      return;
    }

    setSelectedKeys(new Set());
    router.refresh();
    setLoading(false);
  }

  const resolveFilterSize = useCallback(
    (input: string): string | null => {
      const trimmed = input.trim();
      if (!trimmed) return null;

      const exact = filterSizes.find((s) => formatFilterSize(s) === trimmed);
      if (exact) return formatFilterSize(exact);

      const byLabel = filterSizes.find(
        (s) => formatFilterSizeLabel(s).toLowerCase() === trimmed.toLowerCase()
      );
      if (byLabel) return formatFilterSize(byLabel);

      return null;
    },
    [filterSizes]
  );

  function updateDraftRow(id: string, patch: Partial<DraftRow>) {
    if (patch.filter_size) {
      rememberFilterSize(patch.filter_size);
    }
    setDraftRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addDraftRow() {
    setDraftRows((rows) => [...rows, makeDraftRow(lastFilterSize)]);
  }

  function resetDraftRows() {
    setDraftRows([makeDraftRow(lastFilterSize)]);
  }

  function unitNameTaken(suite: SuiteWithUnits, locationName: string) {
    const normalized = normalizeName(locationName);
    return (suite.hvac_units ?? []).some((u) => normalizeName(u.name) === normalized);
  }

  async function createSingleUnit(
    supabase: ReturnType<typeof createClient>,
    suiteNumber: string,
    locationName: string,
    filterSize: string,
    suiteByNumber: Map<string, SuiteWithUnits>
  ): Promise<string | null> {
    let existingSuite = suiteByNumber.get(suiteNumber);

    if (existingSuite) {
      if (unitNameTaken(existingSuite, locationName)) {
        return `A unit named "${locationName}" already exists in suite ${suiteNumber}.`;
      }

      const maxSort = Math.max(-1, ...(existingSuite.hvac_units ?? []).map((u) => u.sort_order));
      const { data: inserted, error: insertError } = await supabase
        .from("hvac_units")
        .insert({
          suite_id: existingSuite.id,
          name: locationName,
          filter_size: filterSize,
          filter_quantity: 1,
          sort_order: maxSort + 1,
        })
        .select("id, name, filter_size, filter_quantity, sort_order, suite_id, location_notes, created_at")
        .single();

      if (insertError) {
        return insertError.code === "23505"
          ? `A unit named "${locationName}" already exists in suite ${suiteNumber}.`
          : insertError.message;
      }

      if (inserted) {
        existingSuite = {
          ...existingSuite,
          hvac_units: [...(existingSuite.hvac_units ?? []), inserted as HvacUnit],
        };
        suiteByNumber.set(suiteNumber, existingSuite);
      }

      return null;
    }

    const { data: suite, error: suiteError } = await supabase
      .from("suites")
      .insert({
        suite_number: suiteNumber,
        filter_size: filterSize,
        filter_quantity: 1,
        building_id: buildingId,
      })
      .select("*")
      .single();

    if (suiteError || !suite) {
      return suiteError?.message ?? "Failed to create suite.";
    }

    const { data: mainUnit } = await supabase
      .from("hvac_units")
      .select("*")
      .eq("suite_id", suite.id)
      .eq("name", "Main unit")
      .maybeSingle();

    let unit: HvacUnit;

    if (mainUnit) {
      const { data: updated, error: updateError } = await supabase
        .from("hvac_units")
        .update({
          name: locationName,
          filter_size: filterSize,
          filter_quantity: 1,
        })
        .eq("id", mainUnit.id)
        .select("*")
        .single();

      if (updateError || !updated) return updateError?.message ?? "Failed to create unit.";
      unit = updated as HvacUnit;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("hvac_units")
        .insert({
          suite_id: suite.id,
          name: locationName,
          filter_size: filterSize,
          filter_quantity: 1,
          sort_order: 0,
        })
        .select("*")
        .single();

      if (insertError || !inserted) return insertError?.message ?? "Failed to create unit.";
      unit = inserted as HvacUnit;
    }

    suiteByNumber.set(suiteNumber, { ...(suite as Suite), hvac_units: [unit] });
    return null;
  }

  async function handleCreate() {
    setLoading(true);
    setError("");

    const filledRows = draftRows.filter(
      (row) => row.suite_number.trim() || row.filter_size.trim() || row.unit_location.trim()
    );

    if (filledRows.length === 0) {
      setError("Enter suite # and filter size in the new unit row.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const suiteByNumber = new Map<string, SuiteWithUnits>(
      suites.map((s) => [s.suite_number, s])
    );

    let lastCreatedFilter = lastFilterSize;

    for (const row of filledRows) {
      const suiteNumber = row.suite_number.trim();
      const locationName = defaultUnitLocation(row.unit_location);
      const resolvedFilter = resolveFilterSize(row.filter_size);

      if (!suiteNumber) {
        setError("Suite number is required on each row.");
        setLoading(false);
        return;
      }
      if (!resolvedFilter) {
        setError(
          row.filter_size.trim()
            ? `Unknown filter size "${row.filter_size.trim()}" on suite ${suiteNumber}.`
            : `Filter size is required for suite ${suiteNumber}.`
        );
        setLoading(false);
        return;
      }

      const createError = await createSingleUnit(
        supabase,
        suiteNumber,
        locationName,
        resolvedFilter,
        suiteByNumber
      );

      if (createError) {
        setError(createError);
        setLoading(false);
        return;
      }

      lastCreatedFilter = resolvedFilter;
    }

    rememberFilterSize(lastCreatedFilter);

    const expandedSuiteNumbers = new Set(
      filledRows.map((row) => row.suite_number.trim()).filter(Boolean)
    );
    setExpandedSuiteIds((current) => {
      const next = new Set(current);
      for (const suite of suites) {
        if (expandedSuiteNumbers.has(suite.suite_number)) {
          next.add(suite.id);
        }
      }
      return next;
    });

    resetDraftRows();
    router.refresh();
    setLoading(false);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;

    e.preventDefault();
    const pasted = parsePasteRows(text);
    if (pasted.length === 0) return;

    setDraftRows((rows) => {
      const next = [...rows];
      const startIndex = focusedCell
        ? next.findIndex((r) => r.id === focusedCell.rowId)
        : 0;
      const safeStart = startIndex >= 0 ? startIndex : 0;

      pasted.forEach((pastedRow, offset) => {
        const targetIndex = safeStart + offset;
        const resolvedFilter =
          resolveFilterSize(pastedRow.filter_size) ?? pastedRow.filter_size;
        const rowData = { ...pastedRow, filter_size: resolvedFilter };

        if (targetIndex < next.length) {
          next[targetIndex] = { ...next[targetIndex], ...rowData };
        } else {
          next.push({ id: crypto.randomUUID(), ...rowData });
        }
      });

      return next;
    });

    const lastPasted = [...pasted].reverse().find((row) => row.filter_size.trim());
    if (lastPasted) {
      rememberFilterSize(resolveFilterSize(lastPasted.filter_size) ?? lastPasted.filter_size);
    }
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent,
    rowId: string,
    colIndex: number
  ) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleCreate();
      return;
    }

    if (e.key === "Tab" && !e.shiftKey && colIndex === COLS.length - 1) {
      const rowIndex = draftRows.findIndex((r) => r.id === rowId);
      if (rowIndex === draftRows.length - 1) {
        e.preventDefault();
        addDraftRow();
      }
    }
  }

  const filledDraftCount = draftRows.filter(
    (row) => row.suite_number.trim() || row.filter_size.trim() || row.unit_location.trim()
  ).length;

  const existingSuitesForImport = suites.map((suite) => ({
    suite_number: suite.suite_number,
    units: (suite.hvac_units ?? []).map((unit) => ({ name: unit.name })),
  }));

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="shrink-0 space-y-1 pb-3">
        <CardTitle>Suites ({suites.length})</CardTitle>
        <CardDescription>
          Add units one at a time below, or use Import from spreadsheet for 20+ rows. Select rows to
          delete in bulk, or hover a row to edit or delete individually.
        </CardDescription>
        {filterSizes.length === 0 && (
          <p className="font-sans text-sm text-slate-500">
            Add filter sizes under Filter Sizes first.
          </p>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col pb-6">
        <div
          ref={tableRef}
          onPaste={handlePaste}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white font-mono text-sm shadow-sm"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sky-200/80 bg-sky-50/80 px-3 py-2 font-sans">
            <div className="min-w-0">
              <p className="text-sm font-medium text-sky-900">New unit</p>
              <p className="text-xs text-sky-700/80">Fill the row below, then press Enter or Add unit</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || filterSizes.length === 0}
                onClick={() => setImportOpen(true)}
                className="shrink-0"
              >
                Import from spreadsheet
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={loading || filterSizes.length === 0}
                onClick={() => void handleCreate()}
                className="shrink-0"
              >
                {loading
                  ? "Adding..."
                  : filledDraftCount > 1
                    ? `Add ${filledDraftCount} units`
                    : "Add unit"}
              </Button>
            </div>
          </div>
          {error && (
            <p className="shrink-0 border-b border-red-100 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {error}
            </p>
          )}
          {selectedCount > 0 && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 font-sans">
              <p className="text-sm text-slate-700">
                {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={loading}
                  onClick={() => void handleBulkDelete()}
                >
                  {loading ? "Deleting..." : `Delete selected (${selectedCount})`}
                </Button>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 hover:bg-slate-100">
                  <TableHead className="w-10 border-r border-slate-200 px-2">
                    <RowCheckbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      disabled={loading || selectableKeys.length === 0}
                      onChange={toggleSelectAll}
                      ariaLabel="Select all rows"
                    />
                  </TableHead>
                  <TableHead className="border-r border-slate-200">Suite #</TableHead>
                  <TableHead className="border-r border-slate-200">Filter size</TableHead>
                  <TableHead className="border-r border-slate-200">Unit location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-b border-slate-200 bg-sky-50/30 hover:bg-sky-50/50"
                  >
                    <TableCell className="border-r border-slate-200" />
                    <TableCell className="border-r border-slate-200 p-0">
                      <Input
                        placeholder="201"
                        value={row.suite_number}
                        onChange={(e) => updateDraftRow(row.id, { suite_number: e.target.value })}
                        onFocus={() => setFocusedCell({ rowId: row.id, col: 0 })}
                        onKeyDown={(e) => handleCellKeyDown(e, row.id, 0)}
                        className={cellInputClass}
                      />
                    </TableCell>
                    <TableCell className="border-r border-slate-200 p-0">
                      <FilterSizeSelect
                        value={row.filter_size}
                        onChange={(filter_size) => updateDraftRow(row.id, { filter_size })}
                        filterSizes={filterSizes}
                        onFocus={() => setFocusedCell({ rowId: row.id, col: 1 })}
                        onKeyDown={(e) => handleCellKeyDown(e, row.id, 1)}
                      />
                    </TableCell>
                    <TableCell className="border-r border-slate-200 p-0">
                      <Input
                        placeholder="Main"
                        value={row.unit_location}
                        onChange={(e) => updateDraftRow(row.id, { unit_location: e.target.value })}
                        onFocus={() => setFocusedCell({ rowId: row.id, col: 2 })}
                        onKeyDown={(e) => handleCellKeyDown(e, row.id, 2)}
                        className={cellInputClass}
                      />
                    </TableCell>
                  </TableRow>
                ))}

                {suites.map((suite) => (
                  <ExistingSuiteRow
                    key={suite.id}
                    suite={suite}
                    suites={suites}
                    filterSizes={filterSizes}
                    resolveFilterSize={resolveFilterSize}
                    expanded={expandedSuiteIds.has(suite.id)}
                    onToggle={() => toggleSuiteExpanded(suite.id)}
                    selectedKeys={selectedKeys}
                    onSelectedKeysChange={setSelectedKeys}
                    selectionDisabled={loading}
                  />
                ))}

                {suites.length === 0 && draftRows.every((r) => !r.suite_number.trim()) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-8 text-center font-sans text-sm text-slate-500">
                      No suites yet. Add a unit using the row above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <SuiteImportDialog
        buildingId={buildingId}
        filterSizes={filterSizes}
        existingSuites={existingSuitesForImport}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => router.refresh()}
      />
    </Card>
  );
}

/** @deprecated Use SuitesSpreadsheet */
export const SuiteForm = SuitesSpreadsheet;

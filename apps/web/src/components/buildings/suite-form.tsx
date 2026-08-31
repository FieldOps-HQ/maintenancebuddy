"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatFilterSize, formatFilterSizeLabel } from "@maintenancebuddy/shared";
import type { Suite, HvacUnit } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

type DisplayRow = {
  suite: SuiteWithUnits;
  unit: HvacUnit | null;
  unitIndex: number;
  unitCount: number;
  isMultiUnit: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};

function buildDisplayRows(suites: SuiteWithUnits[]): DisplayRow[] {
  return suites.flatMap((suite) => {
    const units = (suite.hvac_units ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    const rows: (HvacUnit | null)[] = units.length === 0 ? [null] : units;
    const unitCount = rows.length;
    const isMultiUnit = unitCount > 1;

    return rows.map((unit, unitIndex) => ({
      suite,
      unit,
      unitIndex,
      unitCount,
      isMultiUnit,
      isFirstInGroup: unitIndex === 0,
      isLastInGroup: unitIndex === unitCount - 1,
    }));
  });
}

function multiUnitRowClass(row: Pick<DisplayRow, "isMultiUnit" | "isFirstInGroup" | "isLastInGroup">) {
  if (!row.isMultiUnit) {
    return "border-b border-slate-200 bg-white hover:bg-slate-50/80";
  }

  return cn(
    "border-b border-violet-100 bg-violet-50/70 hover:bg-violet-50",
    row.isFirstInGroup && "border-t-2 border-t-violet-300",
    row.isLastInGroup && "border-b-2 border-b-violet-300"
  );
}

function suiteCellClass(row: Pick<DisplayRow, "isMultiUnit" | "isFirstInGroup">) {
  return cn(
    "border-r border-slate-200 px-2 py-1.5",
    row.isMultiUnit && "border-l-4",
    row.isMultiUnit && (row.isFirstInGroup ? "border-l-violet-500" : "border-l-violet-300")
  );
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
        unit_location: (cells[2] ?? "").trim(),
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
  onClick: () => void;
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

function ExistingSuiteUnitRow({
  suite,
  unit,
  suites,
  filterSizes,
  resolveFilterSize,
  unitCount,
  isMultiUnit,
  isFirstInGroup,
  isLastInGroup,
}: {
  suite: SuiteWithUnits;
  unit: HvacUnit | null;
  suites: SuiteWithUnits[];
  filterSizes: FilterSizeOption[];
  resolveFilterSize: ResolveFilterSize;
  unitCount: number;
  isMultiUnit: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
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

    if (suiteNumber !== suite.suite_number) {
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

  const groupProps = { isMultiUnit, isFirstInGroup, isLastInGroup };

  if (editing) {
    return (
      <>
        <TableRow className={cn("group", multiUnitRowClass(groupProps), "bg-amber-50/40 hover:bg-amber-50/60")}>
          <TableCell className={cn(suiteCellClass(groupProps), "p-0")}>
            <Input
              value={values.suite_number}
              onChange={(e) => setValues((v) => ({ ...v, suite_number: e.target.value }))}
              className={cellInputClass}
              disabled={loading}
            />
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
              colSpan={3}
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
      <TableRow className={cn("group", multiUnitRowClass(groupProps))}>
        <TableCell className={cn(suiteCellClass(groupProps), "text-slate-900")}>
          {isFirstInGroup ? (
            <div className="flex items-center gap-2">
              <span>{suite.suite_number}</span>
              {isMultiUnit && (
                <Badge
                  variant="secondary"
                  className="border-violet-200 bg-violet-100 font-sans text-[10px] font-medium text-violet-800"
                >
                  {unitCount} units
                </Badge>
              )}
            </div>
          ) : (
            <span aria-hidden className="pl-3 font-sans text-violet-400">
              ↳
            </span>
          )}
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
              onClick={() => {
                resetValues();
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </RowIconButton>
            <RowIconButton label="Delete row" destructive disabled={loading} onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </RowIconButton>
          </div>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={3}
            className="border-b border-slate-200 bg-red-50/40 px-2 py-1.5 font-sans text-xs text-red-600"
          >
            {error}
          </TableCell>
        </TableRow>
      )}
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

  const displayRows = buildDisplayRows(suites);
  const multiUnitSuiteCount = suites.filter((s) => (s.hvac_units ?? []).length > 1).length;

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

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="shrink-0 space-y-1 pb-3">
        <CardTitle>Suites ({suites.length})</CardTitle>
        <CardDescription>
          Add units in the highlighted row below. Violet bands group suites with multiple units
          {multiUnitSuiteCount > 0 ? ` (${multiUnitSuiteCount})` : ""}. Hover a row to edit or delete.
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
          {error && (
            <p className="shrink-0 border-b border-red-100 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 hover:bg-slate-100">
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

                {displayRows.map((row) => (
                  <ExistingSuiteUnitRow
                    key={row.unit ? `${row.suite.id}-${row.unit.id}` : row.suite.id}
                    suite={row.suite}
                    unit={row.unit}
                    suites={suites}
                    filterSizes={filterSizes}
                    resolveFilterSize={resolveFilterSize}
                    unitCount={row.unitCount}
                    isMultiUnit={row.isMultiUnit}
                    isFirstInGroup={row.isFirstInGroup}
                    isLastInGroup={row.isLastInGroup}
                  />
                ))}

                {displayRows.length === 0 && draftRows.every((r) => !r.suite_number.trim()) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="py-8 text-center font-sans text-sm text-slate-500">
                      No suites yet. Add a unit using the row above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** @deprecated Use SuitesSpreadsheet */
export const SuiteForm = SuitesSpreadsheet;

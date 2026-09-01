"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  createFilterSizeResolver,
  parseSuiteImportRows,
  validateSuiteImportRows,
  type ExistingSuiteForImport,
  type FilterSizeOption,
  type SuiteImportRowValidation,
} from "@maintenancebuddy/shared";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ImportResult = {
  imported: number;
  failed: number;
  skipped: number;
  errors: Array<{ rowIndex: number; suite_number: string; message: string }>;
};

export function SuiteImportDialog({
  buildingId,
  filterSizes,
  existingSuites,
  open,
  onClose,
  onImported,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
  existingSuites: ExistingSuiteForImport[];
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const resolveFilterSize = useMemo(
    () => createFilterSizeResolver(filterSizes),
    [filterSizes]
  );

  const parsedRows = useMemo(() => {
    if (!pasteText.trim()) return [];
    return parseSuiteImportRows(pasteText);
  }, [pasteText]);

  const validations: SuiteImportRowValidation[] = useMemo(() => {
    if (parsedRows.length === 0) return [];
    return validateSuiteImportRows(parsedRows, {
      resolveFilterSize,
      existingSuites,
    });
  }, [parsedRows, resolveFilterSize, existingSuites]);

  const validCount = validations.filter((v) => v.valid).length;
  const invalidCount = validations.length - validCount;

  function handleClose() {
    if (loading) return;
    setPasteText("");
    setError("");
    setResult(null);
    onClose();
  }

  async function handleImport() {
    if (validCount === 0) {
      setError("Fix validation errors or paste valid rows before importing.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const rowsToImport = validations
      .filter((v) => v.valid)
      .map((v) => ({
        suite_number: v.row.suite_number,
        filter_size: v.row.filter_size,
        unit_location: v.row.unit_location,
      }));

    try {
      const response = await fetch(`/api/buildings/${buildingId}/suites/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsToImport }),
      });

      const data = (await response.json()) as ImportResult & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Import failed.");
        setLoading(false);
        return;
      }

      setResult(data);
      onImported();
      setLoading(false);
    } catch {
      setError("Import failed. Please try again.");
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import from spreadsheet</h2>
            <p className="text-sm text-slate-500">
              Paste from Excel: Suite #, Filter size, Unit location (optional, defaults to Main)
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} disabled={loading}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {!result ? (
            <>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"201\t16x25x1\tMain\n202\t16x25x1\tMain\n203\t16x20x1\tKitchen"}
                rows={8}
                disabled={loading}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus-visible:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/20 disabled:opacity-50"
              />

              {validations.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-sm text-slate-600">
                    {validCount} row{validCount === 1 ? "" : "s"} ready to import
                    {invalidCount > 0 && ` · ${invalidCount} with errors (will be skipped)`}
                  </p>
                  <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Suite #</TableHead>
                          <TableHead>Filter size</TableHead>
                          <TableHead>Unit location</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validations.map((validation) => (
                          <TableRow
                            key={validation.rowIndex}
                            className={cn(!validation.valid && "bg-red-50/60")}
                          >
                            <TableCell className="font-mono text-xs text-slate-500">
                              {validation.rowIndex + 1}
                            </TableCell>
                            <TableCell>{validation.row.suite_number || "—"}</TableCell>
                            <TableCell>{validation.row.filter_size || "—"}</TableCell>
                            <TableCell>{validation.row.unit_location}</TableCell>
                            <TableCell className="font-sans text-xs">
                              {validation.valid ? (
                                <span className="text-emerald-700">OK</span>
                              ) : (
                                <span className="text-red-600">{validation.errors.join(" ")}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {error && <p className="font-sans text-sm text-red-600">{error}</p>}
            </>
          ) : (
            <div className="space-y-3 font-sans">
              <p className="text-sm text-slate-700">
                Imported <strong>{result.imported}</strong> unit
                {result.imported === 1 ? "" : "s"}.
                {result.failed > 0 && (
                  <>
                    {" "}
                    <strong>{result.failed}</strong> row{result.failed === 1 ? "" : "s"} failed or
                    were skipped.
                  </>
                )}
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-auto rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
                  {result.errors.map((err) => (
                    <p key={`${err.rowIndex}-${err.message}`}>
                      Row {err.rowIndex + 1}
                      {err.suite_number ? ` (${err.suite_number})` : ""}: {err.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
          {result ? (
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={loading || validCount === 0 || filterSizes.length === 0}
                onClick={() => void handleImport()}
              >
                {loading ? "Importing..." : `Import ${validCount} row${validCount === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

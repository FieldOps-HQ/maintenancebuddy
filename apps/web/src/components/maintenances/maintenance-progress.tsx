"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOBILE_STATUS_COLORS, SUITE_VISIT_STATUS_LABELS, countCompletedUnitVisits } from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { getVisitReasonPreview } from "@/lib/visit-issues";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SuiteVisitDetailDialog,
  fetchSuiteVisit,
  type SuiteVisitDetailData,
} from "@/components/maintenances/suite-visit-detail-dialog";
import {
  SUITE_VISIT_GRID_SELECT,
  mapSuiteVisitGridRows,
} from "@/lib/suite-visit-mapper";

export function MaintenanceProgress({
  maintenanceId,
  buildingId,
  initialVisits,
}: {
  maintenanceId: string;
  buildingId: string;
  initialVisits: SuiteVisitDetailData[];
}) {
  const [visits, setVisits] = useState(initialVisits);
  const [selectedVisit, setSelectedVisit] = useState<SuiteVisitDetailData | null>(null);
  const [openingVisitId, setOpeningVisitId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredVisits = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...visits].sort((a, b) =>
      a.suite_number.localeCompare(b.suite_number, undefined, { numeric: true })
    );
    if (!query) return sorted;
    return sorted.filter((visit) => visit.suite_number.toLowerCase().includes(query));
  }, [visits, search]);

  const fetchVisits = useCallback(async () => {
    const supabase = createClient();
    const [{ data: suiteVisits }, { data: suites }] = await Promise.all([
      supabase
        .from("suite_visits")
        .select(SUITE_VISIT_GRID_SELECT)
        .eq("maintenance_id", maintenanceId),
      supabase
        .from("suites")
        .select("id, suite_number, floor")
        .eq("building_id", buildingId),
    ]);

    if (!suiteVisits) return;

    const suitesById = new Map(
      (suites ?? []).map((suite) => [
        suite.id,
        { suite_number: suite.suite_number, floor: suite.floor },
      ])
    );
    setVisits(mapSuiteVisitGridRows(suiteVisits, suitesById));
  }, [maintenanceId, buildingId]);

  useEffect(() => {
    setVisits(initialVisits);
  }, [initialVisits]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`maintenance-${maintenanceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "suite_visits",
          filter: `maintenance_id=eq.${maintenanceId}`,
        },
        () => {
          fetchVisits();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "suite_visits",
          filter: `maintenance_id=eq.${maintenanceId}`,
        },
        () => {
          fetchVisits();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "hvac_unit_visits",
        },
        () => {
          fetchVisits();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [maintenanceId, fetchVisits]);

  async function handleSuiteClick(visit: SuiteVisitDetailData) {
    setOpenError(null);
    setSelectedVisit(visit);
    setOpeningVisitId(visit.id);
    try {
      const full = await fetchSuiteVisit(visit.id);
      setVisits((current) => current.map((item) => (item.id === full.id ? full : item)));
      setSelectedVisit(full);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not open suite details");
      setSelectedVisit(null);
    } finally {
      setOpeningVisitId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-base">Suites</CardTitle>
            <p className="text-xs text-slate-500">Click a suite to view unit details and photos</p>
          </div>
          <Input
            type="search"
            placeholder="Search suite number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {(["pending", "completed", "no_access", "blocked_unit"] as SuiteVisitStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: MOBILE_STATUS_COLORS[s] }}
                />
                {SUITE_VISIT_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
          {openError && <p className="text-sm text-red-600">{openError}</p>}
        </CardHeader>
        <CardContent>
          {filteredVisits.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {search.trim() ? `No suites matching "${search.trim()}"` : "No suites in this maintenance."}
            </p>
          ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
            {filteredVisits.map((visit) => {
                const { completed, total } = countCompletedUnitVisits(visit.unit_visits);
                const progressLabel = total > 1 ? `${completed}/${total}` : visit.suite_number;
                const reasonPreview = getVisitReasonPreview(visit);
                const isOpening = openingVisitId === visit.id;

                return (
                  <button
                    key={visit.id}
                    type="button"
                    onClick={() => handleSuiteClick(visit)}
                    disabled={openingVisitId !== null}
                    className="flex h-12 cursor-pointer flex-col items-center justify-center rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-70"
                    style={{
                      backgroundColor: MOBILE_STATUS_COLORS[visit.status] ?? MOBILE_STATUS_COLORS.pending,
                      color: visit.status === "pending" ? "#52525b" : "#ffffff",
                    }}
                    title={`${visit.suite_number}: ${SUITE_VISIT_STATUS_LABELS[visit.status] ?? visit.status}${
                      total > 1 ? ` (${completed}/${total} units)` : ""
                    }${reasonPreview ? `\nReason: ${reasonPreview}` : ""}`}
                  >
                    <span>{isOpening ? "…" : visit.suite_number}</span>
                    {total > 1 && !isOpening && (
                      <span className="text-[10px] font-normal opacity-90">{progressLabel}</span>
                    )}
                  </button>
                );
              })}
          </div>
          )}
        </CardContent>
      </Card>

      <SuiteVisitDetailDialog
        visit={selectedVisit}
        loading={openingVisitId !== null && selectedVisit?.id === openingVisitId}
        onClose={() => {
          setSelectedVisit(null);
          setOpeningVisitId(null);
        }}
        onVisitUpdated={(updated) => {
          setVisits((current) => current.map((visit) => (visit.id === updated.id ? updated : visit)));
          setSelectedVisit(updated);
        }}
      />
    </>
  );
}

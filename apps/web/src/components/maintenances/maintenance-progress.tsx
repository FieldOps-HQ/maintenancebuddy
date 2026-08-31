"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOBILE_STATUS_COLORS, SUITE_VISIT_STATUS_LABELS, countCompletedUnitVisits } from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SuiteVisitDetailDialog,
  type SuiteVisitDetailData,
  type UnitVisitDetailData,
} from "@/components/maintenances/suite-visit-detail-dialog";

function mapVisitRow(v: {
  id: string;
  status: string;
  visited_at: string | null;
  notes: string | null;
  suite: {
    suite_number: string;
    floor: string | null;
  } | null;
  hvac_unit_visits?: {
    id: string;
    status: string;
    cleaned: boolean | null;
    filter_changed: boolean | null;
    operating_normally: boolean | null;
    visited_at: string | null;
    notes: string | null;
    hvac_unit: {
      name: string;
      filter_size: string | null;
      filter_quantity: number | null;
    } | null;
    deficiencies?: { id: string; category: string; description: string }[];
    visit_photos?: { id: string; storage_path: string }[];
  }[];
}): SuiteVisitDetailData {
  const unitVisits: UnitVisitDetailData[] = (v.hvac_unit_visits ?? []).map((uv) => ({
    id: uv.id,
    status: uv.status as SuiteVisitStatus,
    cleaned: uv.cleaned,
    filter_changed: uv.filter_changed,
    operating_normally: uv.operating_normally,
    visited_at: uv.visited_at,
    notes: uv.notes,
    unit_name: uv.hvac_unit?.name ?? "Unit",
    filter_size: uv.hvac_unit?.filter_size ?? null,
    filter_quantity: uv.hvac_unit?.filter_quantity ?? null,
    deficiencies: uv.deficiencies ?? [],
    photos: uv.visit_photos ?? [],
  }));

  return {
    id: v.id,
    status: v.status as SuiteVisitStatus,
    suite_number: v.suite?.suite_number ?? "",
    floor: v.suite?.floor ?? null,
    visited_at: v.visited_at,
    notes: v.notes,
    unit_visits: unitVisits,
  };
}

const UNIT_VISIT_SELECT = `
  id,
  status,
  cleaned,
  filter_changed,
  operating_normally,
  visited_at,
  notes,
  hvac_unit:hvac_units(name, filter_size, filter_quantity),
  deficiencies:deficiencies!deficiencies_hvac_unit_visit_id_fkey(id, category, description),
  visit_photos:visit_photos!visit_photos_hvac_unit_visit_id_fkey(id, storage_path)
`;

export function MaintenanceProgress({
  maintenanceId,
  initialVisits,
}: {
  maintenanceId: string;
  initialVisits: SuiteVisitDetailData[];
}) {
  const [visits, setVisits] = useState(initialVisits);
  const [selectedVisit, setSelectedVisit] = useState<SuiteVisitDetailData | null>(null);

  const fetchVisits = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("suite_visits")
      .select(`
        id,
        status,
        visited_at,
        notes,
        suite:suites(suite_number, floor),
        hvac_unit_visits(${UNIT_VISIT_SELECT})
      `)
      .eq("maintenance_id", maintenanceId);

    if (data) {
      setVisits(data.map(mapVisitRow));
    }
  }, [maintenanceId]);

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suite Progress</CardTitle>
          <p className="text-xs text-zinc-500">Click a suite to view unit details and photos</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {(["pending", "completed", "no_access", "blocked_unit"] as SuiteVisitStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ backgroundColor: MOBILE_STATUS_COLORS[s] }}
                />
                {SUITE_VISIT_STATUS_LABELS[s]}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
            {visits
              .sort((a, b) => a.suite_number.localeCompare(b.suite_number, undefined, { numeric: true }))
              .map((visit) => {
                const { completed, total } = countCompletedUnitVisits(visit.unit_visits);
                const progressLabel = total > 1 ? `${completed}/${total}` : visit.suite_number;

                return (
                  <button
                    key={visit.id}
                    type="button"
                    onClick={() => setSelectedVisit(visit)}
                    className="flex h-12 cursor-pointer flex-col items-center justify-center rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: MOBILE_STATUS_COLORS[visit.status],
                      color: visit.status === "pending" ? "#52525b" : "#ffffff",
                    }}
                    title={`${visit.suite_number}: ${SUITE_VISIT_STATUS_LABELS[visit.status]}${
                      total > 1 ? ` (${completed}/${total} units)` : ""
                    }`}
                  >
                    <span>{visit.suite_number}</span>
                    {total > 1 && <span className="text-[10px] font-normal opacity-90">{progressLabel}</span>}
                  </button>
                );
              })}
          </div>
        </CardContent>
      </Card>

      <SuiteVisitDetailDialog visit={selectedVisit} onClose={() => setSelectedVisit(null)} />
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MOBILE_STATUS_COLORS, SUITE_VISIT_STATUS_LABELS } from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SuiteVisitDetailDialog,
  type SuiteVisitDetailData,
} from "@/components/maintenances/suite-visit-detail-dialog";

function mapVisitRow(v: {
  id: string;
  status: string;
  cleaned: boolean | null;
  filter_changed: boolean | null;
  operating_normally: boolean | null;
  visited_at: string | null;
  notes: string | null;
  suite: {
    suite_number: string;
    floor: string | null;
    filter_size: string | null;
    filter_quantity: number | null;
  } | null;
  deficiencies?: { id: string; category: string; description: string }[];
  visit_photos?: { id: string; storage_path: string }[];
}): SuiteVisitDetailData {
  return {
    id: v.id,
    status: v.status as SuiteVisitStatus,
    suite_number: v.suite?.suite_number ?? "",
    floor: v.suite?.floor ?? null,
    filter_size: v.suite?.filter_size ?? null,
    filter_quantity: v.suite?.filter_quantity ?? null,
    cleaned: v.cleaned,
    filter_changed: v.filter_changed,
    operating_normally: v.operating_normally,
    visited_at: v.visited_at,
    notes: v.notes,
    deficiencies: v.deficiencies ?? [],
    photos: v.visit_photos ?? [],
  };
}

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
        cleaned,
        filter_changed,
        operating_normally,
        visited_at,
        notes,
        suite:suites(suite_number, floor, filter_size, filter_quantity),
        deficiencies(id, category, description),
        visit_photos(id, storage_path)
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
        (payload) => {
          const updated = payload.new as {
            id: string;
            status: SuiteVisitStatus;
            cleaned: boolean | null;
            filter_changed: boolean | null;
            operating_normally: boolean | null;
            visited_at: string | null;
            notes: string | null;
          };
          setVisits((prev) =>
            prev.map((v) =>
              v.id === updated.id
                ? {
                    ...v,
                    status: updated.status,
                    cleaned: updated.cleaned,
                    filter_changed: updated.filter_changed,
                    operating_normally: updated.operating_normally,
                    visited_at: updated.visited_at,
                    notes: updated.notes,
                  }
                : v
            )
          );
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
          <p className="text-xs text-zinc-500">Click a suite to view details and photos</p>
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
              .map((visit) => (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => setSelectedVisit(visit)}
                  className="flex h-12 cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: MOBILE_STATUS_COLORS[visit.status],
                    color: visit.status === "pending" ? "#52525b" : "#ffffff",
                  }}
                  title={`${visit.suite_number}: ${SUITE_VISIT_STATUS_LABELS[visit.status]}`}
                >
                  {visit.suite_number}
                </button>
              ))}
          </div>
        </CardContent>
      </Card>

      <SuiteVisitDetailDialog visit={selectedVisit} onClose={() => setSelectedVisit(null)} />
    </>
  );
}

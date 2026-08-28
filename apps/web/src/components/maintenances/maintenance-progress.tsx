"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUITE_VISIT_STATUS_COLORS, SUITE_VISIT_STATUS_LABELS } from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SuiteVisitDetailDialog,
  type SuiteVisitDetailData,
} from "@/components/maintenances/suite-visit-detail-dialog";

export function MaintenanceProgress({
  maintenanceId,
  initialVisits,
}: {
  maintenanceId: string;
  initialVisits: SuiteVisitDetailData[];
}) {
  const [visits, setVisits] = useState(initialVisits);
  const [selectedVisit, setSelectedVisit] = useState<SuiteVisitDetailData | null>(null);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [maintenanceId]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suite Progress</CardTitle>
          <p className="text-xs text-zinc-500">Click a suite to view details and photos</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {(["pending", "completed", "no_access", "blocked_unit"] as SuiteVisitStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={cn("inline-block h-3 w-3 rounded", SUITE_VISIT_STATUS_COLORS[s].split(" ")[0])} />
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
                  className={cn(
                    "flex h-12 cursor-pointer items-center justify-center rounded-lg text-sm font-semibold transition-opacity hover:opacity-80",
                    SUITE_VISIT_STATUS_COLORS[visit.status]
                  )}
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

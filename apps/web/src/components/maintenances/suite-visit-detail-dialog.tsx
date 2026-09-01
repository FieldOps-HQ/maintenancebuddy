"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFICIENCY_LABELS,
  SUITE_VISIT_STATUS_LABELS,
  type DeficiencyCategory,
  type SuiteVisitStatus,
} from "@maintenancebuddy/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  SUITE_VISIT_SELECT,
  buildSuiteVisitStatusUpdates,
  buildUnitVisitStatusUpdates,
  mapSuiteVisitRow,
} from "@/lib/suite-visit-mapper";
import {
  isLeavingCompletedStatus,
  resetSuiteVisitCompletionData,
} from "@/lib/reset-suite-visit-completion";
import { VisitStatusEditor } from "@/components/maintenances/visit-status-editor";
import { X } from "lucide-react";

export interface UnitVisitDetailData {
  id: string;
  status: SuiteVisitStatus;
  cleaned: boolean | null;
  filter_changed: boolean | null;
  operating_normally: boolean | null;
  visited_at: string | null;
  notes: string | null;
  unit_name: string;
  filter_size: string | null;
  filter_quantity: number | null;
  deficiencies: { id: string; category: string; description: string }[];
  photos: { id: string; storage_path: string }[];
}

export interface SuiteVisitDetailData {
  id: string;
  status: SuiteVisitStatus;
  suite_number: string;
  floor: string | null;
  visited_at: string | null;
  notes: string | null;
  unit_visits: UnitVisitDetailData[];
}

function BoolBadge({ value, yesLabel, noLabel }: { value: boolean | null; yesLabel: string; noLabel: string }) {
  if (value === null) return <span className="text-zinc-400">—</span>;
  return (
    <Badge variant={value ? "success" : "destructive"}>
      {value ? yesLabel : noLabel}
    </Badge>
  );
}

function UnitPhoto({ unitVisit }: { unitVisit: UnitVisitDetailData }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhotoLoading(true);
    setPhotoError(null);

    const supabase = createClient();

    async function loadPhoto() {
      const photoPath = unitVisit.photos[0]?.storage_path;
      if (!photoPath) {
        if (!cancelled) {
          setPhotoUrl(null);
          setPhotoLoading(false);
        }
        return;
      }

      const { data, error } = await supabase.storage.from("visit-photos").createSignedUrl(photoPath, 3600);

      if (!cancelled) {
        if (error) {
          setPhotoUrl(null);
          setPhotoError(error.message);
        } else {
          setPhotoUrl(data?.signedUrl ?? null);
        }
        setPhotoLoading(false);
      }
    }

    loadPhoto();

    return () => {
      cancelled = true;
    };
  }, [unitVisit.id, unitVisit.photos]);

  if (photoLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500">
        Loading photo...
      </div>
    );
  }

  if (photoUrl) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={`${unitVisit.unit_name} completion`} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (unitVisit.photos.length > 0 || photoError) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500">
        <span>Unable to load photo</span>
        {photoError && <span className="mt-1 text-xs text-red-500">{photoError}</span>}
      </div>
    );
  }

  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">
      No photo uploaded
    </div>
  );
}

async function fetchSuiteVisit(suiteVisitId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suite_visits")
    .select(SUITE_VISIT_SELECT)
    .eq("id", suiteVisitId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not refresh suite visit");
  }

  return mapSuiteVisitRow(data);
}

export function SuiteVisitDetailDialog({
  visit,
  onClose,
  onVisitUpdated,
}: {
  visit: SuiteVisitDetailData | null;
  onClose: () => void;
  onVisitUpdated?: (visit: SuiteVisitDetailData) => void;
}) {
  const [visitData, setVisitData] = useState<SuiteVisitDetailData | null>(visit);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setVisitData(visit);
  }, [visit]);

  if (!visitData) return null;

  const total = visitData.unit_visits.length;

  async function refreshVisit() {
    setRefreshing(true);
    try {
      const refreshed = await fetchSuiteVisit(visitData!.id);
      setVisitData(refreshed);
      onVisitUpdated?.(refreshed);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSuiteStatusSave(status: SuiteVisitStatus, notes: string | null) {
    const supabase = createClient();
    const leavingCompleted = isLeavingCompletedStatus(visitData!.status, status);

    if (leavingCompleted) {
      await resetSuiteVisitCompletionData(supabase, visitData!.unit_visits);
    }

    const suiteUpdates = buildSuiteVisitStatusUpdates(status, notes);
    const unitUpdates = buildUnitVisitStatusUpdates(status, notes, leavingCompleted);

    const { error: suiteError } = await supabase
      .from("suite_visits")
      .update(suiteUpdates)
      .eq("id", visitData!.id);

    if (suiteError) {
      throw new Error(suiteError.message);
    }

    const { error: unitsError } = await supabase
      .from("hvac_unit_visits")
      .update(unitUpdates)
      .eq("suite_visit_id", visitData!.id);

    if (unitsError) {
      throw new Error(unitsError.message);
    }

    await refreshVisit();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 p-6">
          <div>
            <h2 className="text-xl font-bold">Suite {visitData.suite_number}</h2>
            {visitData.floor && <p className="text-sm text-zinc-500">Floor {visitData.floor}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-6 p-6">
          <VisitStatusEditor
            label="Status"
            status={visitData.status}
            notes={visitData.notes}
            disabled={refreshing}
            onSave={handleSuiteStatusSave}
          />

          {total > 1 && (
            <p className="text-sm text-zinc-500">
              Applies to all {total} units in this suite
            </p>
          )}

          {visitData.visited_at && (
            <div className="text-sm">
              <span className="text-zinc-500">Visited: </span>
              {formatDate(visitData.visited_at)}
            </div>
          )}

          {visitData.notes && (
            <div>
              <p className="mb-1 text-sm font-medium text-zinc-500">
                {visitData.status === "blocked_unit" || visitData.status === "no_access" ? "Reason" : "Notes"}
              </p>
              <p className="text-sm">{visitData.notes}</p>
            </div>
          )}

          {visitData.unit_visits.map((unitVisit) => (
            <div key={unitVisit.id} className="space-y-4 rounded-lg border border-zinc-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{unitVisit.unit_name}</p>
                <Badge variant="secondary">{SUITE_VISIT_STATUS_LABELS[unitVisit.status]}</Badge>
              </div>

              {unitVisit.filter_size && (
                <div className="text-sm">
                  <span className="text-zinc-500">Filter: </span>
                  {unitVisit.filter_size}
                </div>
              )}

              {unitVisit.notes && (
                <div>
                  <p className="mb-1 text-sm font-medium text-zinc-500">
                    {unitVisit.status === "blocked_unit" || unitVisit.status === "no_access"
                      ? "Reason"
                      : "Notes"}
                  </p>
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{unitVisit.notes}</p>
                </div>
              )}

              {(unitVisit.status === "completed" || unitVisit.cleaned !== null) && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-zinc-100 p-3 text-center">
                    <p className="mb-2 text-xs text-zinc-500">Cleaned</p>
                    <BoolBadge value={unitVisit.cleaned} yesLabel="Yes" noLabel="No" />
                  </div>
                  <div className="rounded-lg border border-zinc-100 p-3 text-center">
                    <p className="mb-2 text-xs text-zinc-500">Filter changed</p>
                    <BoolBadge value={unitVisit.filter_changed} yesLabel="Yes" noLabel="No" />
                  </div>
                  <div className="rounded-lg border border-zinc-100 p-3 text-center">
                    <p className="mb-2 text-xs text-zinc-500">Operating normally</p>
                    <BoolBadge value={unitVisit.operating_normally} yesLabel="Yes" noLabel="No" />
                  </div>
                </div>
              )}

              {unitVisit.deficiencies.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-500">Deficiencies</p>
                  <ul className="space-y-1">
                    {unitVisit.deficiencies.map((d) => (
                      <li key={d.id} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                        {DEFICIENCY_LABELS[d.category as DeficiencyCategory] ?? d.description}
                        {d.description &&
                          d.category !== "other" &&
                          d.description !== DEFICIENCY_LABELS[d.category as DeficiencyCategory] && (
                            <span className="block text-xs text-red-600">{d.description}</span>
                          )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-500">Completion photo</p>
                <UnitPhoto unitVisit={unitVisit} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

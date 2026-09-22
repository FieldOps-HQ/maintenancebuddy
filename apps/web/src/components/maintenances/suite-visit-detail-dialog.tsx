"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFICIENCY_LABELS,
  MOBILE_STATUS_COLORS,
  SUITE_VISIT_STATUS_LABELS,
  type DeficiencyCategory,
  type SuiteVisitStatus,
} from "@maintenancebuddy/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  SUITE_VISIT_SELECT,
  buildUnitVisitStatusUpdates,
  mapSuiteVisitRow,
} from "@/lib/suite-visit-mapper";
import {
  isLeavingCompletedStatus,
  resetSuiteVisitCompletionData,
} from "@/lib/reset-suite-visit-completion";
import { VisitStatusEditor, UNIT_EDITABLE_STATUSES } from "@/components/maintenances/visit-status-editor";
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
  unit_visits: UnitVisitDetailData[];
}

function statusBadgeVariant(
  status: SuiteVisitStatus
): "secondary" | "success" | "warning" | "destructive" {
  switch (status) {
    case "completed":
      return "success";
    case "no_access":
      return "warning";
    case "blocked_unit":
      return "destructive";
    default:
      return "secondary";
  }
}

function ChecklistValue({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  return (
    <Badge variant={value ? "success" : "destructive"}>{value ? "Yes" : "No"}</Badge>
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
      <div className="flex h-28 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
        Loading photo...
      </div>
    );
  }

  if (photoUrl) {
    return (
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt={`${unitVisit.unit_name} completion`} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (unitVisit.photos.length > 0 || photoError) {
    return (
      <div className="flex h-28 flex-col items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
        <span>Unable to load photo</span>
        {photoError && <span className="mt-1 text-xs text-red-500">{photoError}</span>}
      </div>
    );
  }

  return (
    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
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

function UnitVisitCard({
  unitVisit,
  index,
  total,
  refreshing,
  onStatusSave,
}: {
  unitVisit: UnitVisitDetailData;
  index: number;
  total: number;
  refreshing: boolean;
  onStatusSave: (status: SuiteVisitStatus, notes: string | null) => Promise<void>;
}) {
  const showChecklist = unitVisit.status === "completed" || unitVisit.cleaned !== null;
  const hasNotes = Boolean(unitVisit.notes);
  const showReasonLabel =
    unitVisit.status === "blocked_unit" || unitVisit.status === "no_access";

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: MOBILE_STATUS_COLORS[unitVisit.status] }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="min-w-0">
          {total > 1 && (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Unit {index + 1} of {total}
            </p>
          )}
          <h3 className="truncate text-base font-semibold text-slate-900">{unitVisit.unit_name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {unitVisit.visited_at && <span>Visited {formatDate(unitVisit.visited_at)}</span>}
            {unitVisit.filter_size && (
              <span>
                Filter {unitVisit.filter_size}
                {unitVisit.filter_quantity != null ? ` × ${unitVisit.filter_quantity}` : ""}
              </span>
            )}
          </div>
        </div>
        <Badge variant={statusBadgeVariant(unitVisit.status)}>
          {SUITE_VISIT_STATUS_LABELS[unitVisit.status]}
        </Badge>
      </header>

      <div className="space-y-4 p-4">
        {showChecklist && (
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Cleaned</dt>
              <dd className="mt-1">
                <ChecklistValue value={unitVisit.cleaned} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Filter</dt>
              <dd className="mt-1">
                <ChecklistValue value={unitVisit.filter_changed} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Operating</dt>
              <dd className="mt-1">
                <ChecklistValue value={unitVisit.operating_normally} />
              </dd>
            </div>
          </dl>
        )}

        {hasNotes && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              {showReasonLabel ? "Reason" : "Notes"}
            </p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{unitVisit.notes}</p>
          </div>
        )}

        {unitVisit.deficiencies.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Deficiencies</p>
            <ul className="space-y-1.5">
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
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Photo</p>
          <UnitPhoto unitVisit={unitVisit} />
        </div>

        <div className="border-t border-slate-100 pt-3">
          <VisitStatusEditor
            label="Change status"
            status={unitVisit.status}
            notes={unitVisit.notes}
            disabled={refreshing}
            allowedStatuses={UNIT_EDITABLE_STATUSES}
            onSave={onStatusSave}
          />
        </div>
      </div>
    </section>
  );
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

  async function handleUnitStatusSave(
    unitVisit: UnitVisitDetailData,
    status: SuiteVisitStatus,
    notes: string | null
  ) {
    const supabase = createClient();
    const leavingCompleted = isLeavingCompletedStatus(unitVisit.status, status);

    if (leavingCompleted) {
      await resetSuiteVisitCompletionData(supabase, [unitVisit]);
    }

    const updates = buildUnitVisitStatusUpdates(status, notes, leavingCompleted);
    const { error } = await supabase.from("hvac_unit_visits").update(updates).eq("id", unitVisit.id);

    if (error) {
      throw new Error(error.message);
    }

    await refreshVisit();
  }

  const unitCount = visitData.unit_visits.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Suite {visitData.suite_number}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(visitData.status)}>
                {SUITE_VISIT_STATUS_LABELS[visitData.status]}
              </Badge>
              <span className="text-sm text-slate-500">
                {unitCount} {unitCount === 1 ? "unit" : "units"}
                {visitData.floor ? ` · Floor ${visitData.floor}` : ""}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          {unitCount === 0 ? (
            <p className="text-sm text-slate-500">No HVAC units linked to this suite visit.</p>
          ) : (
            visitData.unit_visits.map((unitVisit, index) => (
              <UnitVisitCard
                key={unitVisit.id}
                unitVisit={unitVisit}
                index={index}
                total={unitCount}
                refreshing={refreshing}
                onStatusSave={(status, notes) => handleUnitStatusSave(unitVisit, status, notes)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

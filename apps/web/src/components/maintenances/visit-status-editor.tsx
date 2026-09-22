"use client";

import { useEffect, useState } from "react";
import { SUITE_VISIT_STATUS_LABELS, type SuiteVisitStatus } from "@maintenancebuddy/shared";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const ALL_STATUSES: SuiteVisitStatus[] = [
  "pending",
  "completed",
  "no_access",
  "blocked_unit",
];

/** Statuses that can be set on an individual HVAC unit. */
export const UNIT_EDITABLE_STATUSES: SuiteVisitStatus[] = [
  "pending",
  "completed",
  "no_access",
  "blocked_unit",
];

const REASON_STATUSES: SuiteVisitStatus[] = ["no_access", "blocked_unit"];

export function VisitStatusEditor({
  label = "Status",
  status,
  notes,
  disabled,
  allowedStatuses = ALL_STATUSES,
  onSave,
}: {
  label?: string;
  status: SuiteVisitStatus;
  notes: string | null;
  disabled?: boolean;
  allowedStatuses?: SuiteVisitStatus[];
  onSave: (status: SuiteVisitStatus, notes: string | null) => Promise<void>;
}) {
  const statuses = allowedStatuses.includes(status)
    ? allowedStatuses
    : [status, ...allowedStatuses];
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftStatus(status);
    setDraftNotes(notes ?? "");
    setError(null);
  }, [status, notes]);

  const needsReason = REASON_STATUSES.includes(draftStatus);
  const isDirty =
    draftStatus !== status || (needsReason && draftNotes !== (notes ?? ""));

  async function handleSave() {
    if (needsReason && !draftNotes.trim()) {
      setError("A reason is required for this status.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await onSave(draftStatus, needsReason ? draftNotes.trim() : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-zinc-500">{label}</label>
      <Select
        value={draftStatus}
        disabled={disabled || saving}
        onChange={(event) => setDraftStatus(event.target.value as SuiteVisitStatus)}
      >
        {statuses.map((value) => (
          <option key={value} value={value}>
            {SUITE_VISIT_STATUS_LABELS[value]}
          </option>
        ))}
      </Select>

      {needsReason && (
        <Textarea
          placeholder="Reason (required)..."
          value={draftNotes}
          disabled={disabled || saving}
          onChange={(event) => setDraftNotes(event.target.value)}
          rows={3}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isDirty && (
        <Button size="sm" onClick={handleSave} disabled={disabled || saving}>
          {saving ? "Saving..." : "Save status"}
        </Button>
      )}
    </div>
  );
}

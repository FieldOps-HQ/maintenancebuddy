import { AppState, type AppStateStatus } from "react-native";
import type { DeficiencyCategory } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addFieldUnit } from "@/lib/add-field-unit";
import { buildUnitAccessStatusUpdates } from "@/lib/suite-visit-status";
import { uploadVisitPhoto } from "@/lib/upload-photo";
import {
  clearOutbox,
  processOutbox,
  type OutboxHandlers,
  type OutboxItem,
} from "@/lib/outbox";

let syncing = false;
let started = false;
let lastSyncError: string | null = null;

type SyncListener = (state: { error: string | null }) => void;
const syncListeners = new Set<SyncListener>();

function notifySyncListeners() {
  for (const listener of syncListeners) {
    listener({ error: lastSyncError });
  }
}

export function getLastSyncError() {
  return lastSyncError;
}

export function subscribeSyncError(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener({ error: lastSyncError });
  return () => {
    syncListeners.delete(listener);
  };
}

async function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

async function unitVisitHasPhoto(unitVisitId: string): Promise<boolean> {
  const { data } = await supabase
    .from("visit_photos")
    .select("id")
    .eq("hvac_unit_visit_id", unitVisitId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** True when the server already reflects this queued change — safe to drop automatically. */
async function isOutboxItemSatisfied(item: OutboxItem): Promise<boolean> {
  try {
    switch (item.type) {
      case "upload_photo": {
        const unitVisitId = item.payload.unitVisitId as string | undefined;
        const base64 = item.payload.base64 as string | undefined;
        if (!unitVisitId || !base64) return true;
        const { data: visit } = await supabase
          .from("hvac_unit_visits")
          .select("id")
          .eq("id", unitVisitId)
          .maybeSingle();
        if (!visit) return true;
        return unitVisitHasPhoto(unitVisitId);
      }
      case "update_unit_visit": {
        const unitVisitId = item.payload.unitVisitId as string | undefined;
        const updates = item.payload.updates as Record<string, unknown> | undefined;
        if (!unitVisitId) return true;
        const { data: visit } = await supabase
          .from("hvac_unit_visits")
          .select("status")
          .eq("id", unitVisitId)
          .maybeSingle();
        if (!visit) return true;
        if (updates?.status && visit.status === updates.status) return true;
        return false;
      }
      case "update_suite_unit_visits": {
        const suiteVisitId = item.payload.suiteVisitId as string | undefined;
        const status = item.payload.status as string | undefined;
        if (!suiteVisitId || !status) return false;
        const { data: units } = await supabase
          .from("hvac_unit_visits")
          .select("status")
          .eq("suite_visit_id", suiteVisitId);
        if (!units || units.length === 0) return true;
        return units.every((u) => u.status === status);
      }
      case "complete_unit_visit": {
        const unitVisitId = item.payload.unitVisitId as string | undefined;
        const updates = item.payload.updates as Record<string, unknown> | undefined;
        const photo = item.payload.photo as { base64?: string } | null | undefined;
        if (!unitVisitId) return true;
        const { data: visit } = await supabase
          .from("hvac_unit_visits")
          .select("status")
          .eq("id", unitVisitId)
          .maybeSingle();
        if (!visit) return true;
        const targetStatus = updates?.status as string | undefined;
        const statusOk = targetStatus
          ? visit.status === targetStatus
          : visit.status !== "pending";
        if (!statusOk) return false;
        if (photo?.base64) {
          return unitVisitHasPhoto(unitVisitId);
        }
        return true;
      }
      case "replace_deficiencies": {
        const unitVisitId = item.payload.unitVisitId as string | undefined;
        const deficiencies = (item.payload.deficiencies as unknown[]) ?? [];
        if (!unitVisitId) return true;
        const { data: visit } = await supabase
          .from("hvac_unit_visits")
          .select("id")
          .eq("id", unitVisitId)
          .maybeSingle();
        if (!visit) return true;
        const { count } = await supabase
          .from("deficiencies")
          .select("id", { count: "exact", head: true })
          .eq("hvac_unit_visit_id", unitVisitId);
        if (deficiencies.length === 0) return (count ?? 0) === 0;
        return (count ?? 0) >= deficiencies.length;
      }
      case "create_deficiency":
      case "add_suite":
      case "add_hvac_unit":
        return false;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

async function shouldAbandonOutboxItem(item: OutboxItem, _error: unknown): Promise<boolean> {
  try {
    if (item.type === "upload_photo") {
      const unitVisitId = item.payload.unitVisitId as string | undefined;
      if (!unitVisitId) return true;
      const { data: visit } = await supabase
        .from("hvac_unit_visits")
        .select("status")
        .eq("id", unitVisitId)
        .maybeSingle();
      // Visit already finished — don't leave a photo retry stuck on the badge forever.
      return Boolean(visit && visit.status !== "pending");
    }

    if (item.type === "complete_unit_visit") {
      const unitVisitId = item.payload.unitVisitId as string | undefined;
      const updates = item.payload.updates as Record<string, unknown> | undefined;
      if (!unitVisitId) return true;
      const { data: visit } = await supabase
        .from("hvac_unit_visits")
        .select("status")
        .eq("id", unitVisitId)
        .maybeSingle();
      if (!visit) return true;
      const targetStatus = updates?.status as string | undefined;
      // Status already saved on server; drop the queue item so sync doesn't stay stuck on photo.
      return targetStatus ? visit.status === targetStatus : visit.status !== "pending";
    }

    return false;
  } catch {
    return false;
  }
}

const handlers: OutboxHandlers = {
  updateUnitVisit: async (payload) => {
    const { unitVisitId, updates } = payload as {
      unitVisitId: string;
      updates: Record<string, unknown>;
    };
    const { error } = await supabase
      .from("hvac_unit_visits")
      .update(updates as never)
      .eq("id", unitVisitId);
    await assertNoError(error, "Failed to sync unit visit");
  },

  updateSuiteUnitVisits: async (payload) => {
    const { suiteVisitId, status, note } = payload as {
      suiteVisitId: string;
      status: "no_access" | "blocked_unit";
      note: string;
    };
    const { error } = await supabase
      .from("hvac_unit_visits")
      .update(buildUnitAccessStatusUpdates(status, note) as never)
      .eq("suite_visit_id", suiteVisitId);
    await assertNoError(error, "Failed to sync suite unit visits");
  },

  uploadPhoto: async (payload) => {
    const { unitVisitId, maintenanceId, suiteId, unitId, base64 } = payload as {
      unitVisitId: string;
      maintenanceId: string;
      suiteId: string;
      unitId: string;
      base64: string;
    };
    if (await unitVisitHasPhoto(unitVisitId)) return;
    await uploadVisitPhoto(
      `data:image/jpeg;base64,${base64}`,
      maintenanceId,
      suiteId,
      unitId,
      unitVisitId,
      base64
    );
  },

  createDeficiency: async (payload) => {
    const { unitVisitId, category, description } = payload as {
      unitVisitId: string;
      category: string;
      description: string;
    };
    const { error } = await supabase.from("deficiencies").insert({
      hvac_unit_visit_id: unitVisitId,
      category: category as DeficiencyCategory,
      description,
    });
    await assertNoError(error, "Failed to sync deficiency");
  },

  replaceDeficiencies: async (payload) => {
    const { unitVisitId, deficiencies } = payload as {
      unitVisitId: string;
      deficiencies: { category: DeficiencyCategory; description: string }[];
    };

    const { error: deleteError } = await supabase
      .from("deficiencies")
      .delete()
      .eq("hvac_unit_visit_id", unitVisitId);
    await assertNoError(deleteError, "Failed to clear deficiencies");

    if (deficiencies.length === 0) return;

    const { error: insertError } = await supabase.from("deficiencies").insert(
      deficiencies.map((d) => ({
        hvac_unit_visit_id: unitVisitId,
        category: d.category,
        description: d.description,
      }))
    );
    await assertNoError(insertError, "Failed to sync deficiencies");
  },

  completeUnitVisit: async (payload) => {
    const {
      unitVisitId,
      updates,
      deficiencies,
      photo,
    } = payload as {
      unitVisitId: string;
      updates: Record<string, unknown>;
      deficiencies: { category: DeficiencyCategory; description: string }[];
      photo?: {
        maintenanceId: string;
        suiteId: string;
        unitId: string;
        base64: string;
      } | null;
    };

    await handlers.updateUnitVisit({ unitVisitId, updates });
    await handlers.replaceDeficiencies({ unitVisitId, deficiencies });
    if (photo?.base64) {
      if (!(await unitVisitHasPhoto(unitVisitId))) {
        await handlers.uploadPhoto({
          unitVisitId,
          maintenanceId: photo.maintenanceId,
          suiteId: photo.suiteId,
          unitId: photo.unitId,
          base64: photo.base64,
        });
      }
    }
  },

  addSuite: async (payload) => {
    const { buildingId, suite_number, filter_size, unit_location, suite } = payload as {
      buildingId: string;
      suite_number?: string;
      filter_size?: string;
      unit_location?: string;
      suite?: {
        suite_number: string;
        floor?: string;
        filter_size?: string;
      };
    };

    const result = await addFieldUnit(supabase, buildingId, {
      suite_number: suite_number ?? suite?.suite_number ?? "",
      filter_size: filter_size ?? suite?.filter_size ?? "",
      unit_location,
    });

    if (result.error) {
      throw new Error(result.error);
    }
  },

  addHvacUnit: async (payload) => {
    const { suiteId, unit } = payload as {
      suiteId: string;
      unit: {
        name: string;
        location_notes?: string;
        filter_size?: string;
        filter_quantity?: number;
      };
    };
    const { error } = await supabase
      .from("hvac_units")
      .insert({ ...unit, filter_quantity: 1, suite_id: suiteId });
    await assertNoError(error, "Failed to sync HVAC unit");
  },
};

export async function runOutboxSync(): Promise<{
  processed: number;
  remaining: number;
  error: string | null;
}> {
  if (syncing) {
    return { processed: 0, remaining: -1, error: lastSyncError };
  }

  syncing = true;
  try {
    const result = await processOutbox(
      handlers,
      isOutboxItemSatisfied,
      shouldAbandonOutboxItem
    );
    lastSyncError = result.remaining > 0 ? result.error : null;
    notifySyncListeners();
    return result;
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : "Sync failed";
    notifySyncListeners();
    return { processed: 0, remaining: -1, error: lastSyncError };
  } finally {
    syncing = false;
  }
}

export async function discardPendingOutbox() {
  await clearOutbox();
  lastSyncError = null;
  notifySyncListeners();
}

export function startOutboxSyncListener() {
  if (started) return;
  started = true;

  void runOutboxSync();

  const onAppStateChange = (state: AppStateStatus) => {
    if (state === "active") {
      void runOutboxSync();
    }
  };

  const subscription = AppState.addEventListener("change", onAppStateChange);

  return () => {
    subscription.remove();
    started = false;
  };
}

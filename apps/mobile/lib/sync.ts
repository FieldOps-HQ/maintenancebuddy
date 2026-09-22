import { AppState, type AppStateStatus } from "react-native";
import type { DeficiencyCategory } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addFieldUnit } from "@/lib/add-field-unit";
import { buildUnitAccessStatusUpdates } from "@/lib/suite-visit-status";
import { base64ToArrayBuffer } from "@/lib/upload-photo";
import { processOutbox, type OutboxHandlers } from "@/lib/outbox";

let syncing = false;
let started = false;

async function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message || fallback);
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
    const path = `${maintenanceId}/${suiteId}/${unitId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("visit-photos")
      .upload(path, base64ToArrayBuffer(base64), {
        contentType: "image/jpeg",
        upsert: true,
      });
    await assertNoError(uploadError, "Failed to upload visit photo");

    const { error: deleteError } = await supabase
      .from("visit_photos")
      .delete()
      .eq("hvac_unit_visit_id", unitVisitId);
    await assertNoError(deleteError, "Failed to clear old visit photos");

    const { error: insertError } = await supabase.from("visit_photos").insert({
      hvac_unit_visit_id: unitVisitId,
      storage_path: path,
    });
    await assertNoError(insertError, "Failed to save visit photo record");
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
      await handlers.uploadPhoto({
        unitVisitId,
        maintenanceId: photo.maintenanceId,
        suiteId: photo.suiteId,
        unitId: photo.unitId,
        base64: photo.base64,
      });
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

export async function runOutboxSync(): Promise<{ processed: number; remaining: number }> {
  if (syncing) {
    return { processed: 0, remaining: -1 };
  }

  syncing = true;
  try {
    return await processOutbox(handlers);
  } finally {
    syncing = false;
  }
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

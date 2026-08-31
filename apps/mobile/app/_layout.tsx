import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { processOutbox } from "@/lib/outbox";
import { base64ToArrayBuffer } from "@/lib/upload-photo";

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    processOutbox({
      updateUnitVisit: async (payload) => {
        const { unitVisitId, updates } = payload as {
          unitVisitId: string;
          updates: Record<string, unknown>;
        };
        await supabase.from("hvac_unit_visits").update(updates as never).eq("id", unitVisitId);
      },
      updateSuiteVisit: async (payload) => {
        const { visitId, updates } = payload as { visitId: string; updates: Record<string, unknown> };
        await supabase.from("suite_visits").update(updates as never).eq("id", visitId);
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
        const { error } = await supabase.storage.from("visit-photos").upload(path, base64ToArrayBuffer(base64), {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (!error) {
          await supabase.from("visit_photos").delete().eq("hvac_unit_visit_id", unitVisitId);
          await supabase.from("visit_photos").insert({ hvac_unit_visit_id: unitVisitId, storage_path: path });
        }
      },
      createDeficiency: async (payload) => {
        const { unitVisitId, category, description } = payload as {
          unitVisitId: string;
          category: string;
          description: string;
        };
        await supabase.from("deficiencies").insert({
          hvac_unit_visit_id: unitVisitId,
          category: category as "not_cleaned",
          description,
        });
      },
      addSuite: async (payload) => {
        const { buildingId, suite } = payload as {
          buildingId: string;
          suite: {
            suite_number: string;
            floor?: string;
            filter_size?: string;
            filter_quantity?: number;
            hvac_location_notes?: string;
          };
        };
        await supabase.from("suites").insert({ ...suite, building_id: buildingId });
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
        await supabase.from("hvac_units").insert({ ...unit, suite_id: suiteId });
      },
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(main)" />
      </Stack>
    </QueryClientProvider>
  );
}

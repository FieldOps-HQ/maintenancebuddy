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
      updateVisit: async (payload) => {
        const { visitId, updates } = payload as { visitId: string; updates: Record<string, unknown> };
        await supabase.from("suite_visits").update(updates as never).eq("id", visitId);
      },
      uploadPhoto: async (payload) => {
        const { visitId, maintenanceId, suiteId, base64 } = payload as {
          visitId: string;
          maintenanceId: string;
          suiteId: string;
          base64: string;
        };
        const path = `${maintenanceId}/${suiteId}/${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("visit-photos").upload(path, base64ToArrayBuffer(base64), {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (!error) {
          await supabase.from("visit_photos").delete().eq("suite_visit_id", visitId);
          await supabase.from("visit_photos").insert({ suite_visit_id: visitId, storage_path: path });
        }
      },
      createDeficiency: async (payload) => {
        const { visitId, category, description } = payload as {
          visitId: string;
          category: string;
          description: string;
        };
        await supabase.from("deficiencies").insert({
          suite_visit_id: visitId,
          category: category as "not_cleaned",
          description,
        });
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
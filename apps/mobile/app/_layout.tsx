import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { startOutboxSyncListener } from "@/lib/sync";

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    return startOutboxSyncListener();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(main)" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

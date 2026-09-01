import { Stack } from "expo-router";

export default function MainLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "My Maintenances" }} />
      <Stack.Screen
        name="maintenance/[id]/index"
        options={{ title: "My Maintenances", headerBackTitle: "", headerBackTitleVisible: false }}
      />
      <Stack.Screen name="maintenance/[id]/wizard/[visitId]" options={{ title: "Visit", headerShown: false }} />
    </Stack>
  );
}

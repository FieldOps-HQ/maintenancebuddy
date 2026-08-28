import { Stack } from "expo-router";

export default function MainLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "My Jobs" }} />
      <Stack.Screen name="maintenance/[id]/index" options={{ title: "Suites" }} />
      <Stack.Screen name="maintenance/[id]/wizard/[visitId]" options={{ title: "Visit", headerShown: false }} />
    </Stack>
  );
}

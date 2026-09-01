import { Stack } from "expo-router";

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="maintenance/[id]/index" />
      <Stack.Screen name="maintenance/[id]/wizard/[visitId]" />
    </Stack>
  );
}

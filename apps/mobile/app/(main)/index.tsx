import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { formatBuildingAddress } from "@maintenancebuddy/shared";
import { colors, radius } from "@/lib/theme";
import { ScreenHeader } from "@/components/screen-header";

interface MaintenanceItem {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  building: {
    name: string;
    street_number: string;
    street: string;
    city: string;
    postal_code: string;
  } | null;
  completed: number;
  total: number;
}

export default function MaintenanceListScreen() {
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMaintenances = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: assignments } = await supabase
      .from("maintenance_assignments")
      .select(`
        maintenance:maintenances(
          id, start_date, end_date, status,
          building:buildings(name, street_number, street, city, postal_code),
          suite_visits(status)
        )
      `)
      .eq("technician_id", user.id);

    const items: MaintenanceItem[] = (assignments ?? [])
      .map((a) => a.maintenance)
      .filter(Boolean)
      .map((m) => {
        const visits = m!.suite_visits ?? [];
        return {
          id: m!.id,
          start_date: m!.start_date,
          end_date: m!.end_date,
          status: m!.status,
          building: m!.building,
          completed: visits.filter((v) =>
            ["completed", "blocked_unit", "no_access"].includes(v.status)
          ).length,
          total: visits.length,
        };
      });

    setMaintenances(items);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMaintenances();
    }, [loadMaintenances])
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="My Maintenances"
        large
        rightAction={
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logout}>Sign out</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={maintenances}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadMaintenances(true)} />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No assigned maintenances</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/maintenance/${item.id}`)}
          >
            <Text style={styles.buildingName}>{item.building?.name}</Text>
            {item.building ? (
              <Text style={styles.address}>
                {formatBuildingAddress(item.building)}
              </Text>
            ) : null}
            <Text style={styles.dates}>
              {item.start_date} – {item.end_date}
            </Text>
            <View style={styles.progressRow}>
              <Text style={styles.progress}>
                {item.completed}/{item.total} suites
              </Text>
              <View style={[styles.badge, item.status === "in_progress" && styles.badgeActive]}>
                <Text style={styles.badgeText}>{item.status.replace("_", " ")}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  logout: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buildingName: { fontSize: 18, fontWeight: "600", color: colors.text },
  address: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  dates: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  progress: { fontSize: 14, color: colors.slate700 },
  badge: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  badgeActive: { backgroundColor: colors.amber50 },
  badgeText: { fontSize: 12, fontWeight: "500", textTransform: "capitalize", color: colors.slate700 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 40, fontSize: 16 },
});

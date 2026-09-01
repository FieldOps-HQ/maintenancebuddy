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
import { colors, radius } from "@/lib/theme";

interface MaintenanceItem {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  building: { name: string } | null;
  completed: number;
  total: number;
}

export default function MaintenanceListScreen() {
  const [maintenances, setMaintenances] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMaintenances = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: assignments } = await supabase
      .from("maintenance_assignments")
      .select(`
        maintenance:maintenances(
          id, start_date, end_date, status,
          building:buildings(name),
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
      <View style={styles.header}>
        <Text style={styles.title}>My Jobs</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logout}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={maintenances}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMaintenances} />}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  logout: { color: colors.textSecondary, fontSize: 14 },
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

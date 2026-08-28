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
  container: { flex: 1, backgroundColor: "#fafafa" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  title: { fontSize: 24, fontWeight: "700", color: "#18181b" },
  logout: { color: "#71717a", fontSize: 14 },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  buildingName: { fontSize: 18, fontWeight: "600", color: "#18181b" },
  dates: { fontSize: 14, color: "#71717a", marginTop: 4 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  progress: { fontSize: 14, color: "#52525b" },
  badge: { backgroundColor: "#f4f4f5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeActive: { backgroundColor: "#fef3c7" },
  badgeText: { fontSize: 12, fontWeight: "500", textTransform: "capitalize" },
  empty: { textAlign: "center", color: "#71717a", marginTop: 40, fontSize: 16 },
});

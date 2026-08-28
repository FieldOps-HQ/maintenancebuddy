import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { MOBILE_STATUS_COLORS, SUITE_VISIT_STATUS_LABELS } from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addToOutbox } from "@/lib/outbox";

interface VisitTile {
  id: string;
  status: SuiteVisitStatus;
  suite_number: string;
  suite_id: string;
}

export default function SuiteGridScreen() {
  const { id: maintenanceId } = useLocalSearchParams<{ id: string }>();
  const [visits, setVisits] = useState<VisitTile[]>([]);
  const [buildingName, setBuildingName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<VisitTile | null>(null);
  const [pendingSync, setPendingSync] = useState(0);

  const loadData = useCallback(async () => {
    if (!maintenanceId) return;

    const [{ data: maintenance }, { data: visitData }] = await Promise.all([
      supabase.from("maintenances").select("building:buildings(name)").eq("id", maintenanceId).single(),
      supabase
        .from("suite_visits")
        .select("id, status, suite_id, suite:suites(suite_number)")
        .eq("maintenance_id", maintenanceId),
    ]);

    setBuildingName(maintenance?.building?.name ?? "");
    setVisits(
      (visitData ?? []).map((v: { id: string; status: string; suite_id: string; suite: { suite_number: string } | null }) => ({
        id: v.id,
        status: v.status as SuiteVisitStatus,
        suite_id: v.suite_id,
        suite_number: v.suite?.suite_number ?? "",
      }))
    );
  }, [maintenanceId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filtered = visits.filter((v) =>
    v.suite_number.toLowerCase().includes(search.toLowerCase())
  );

  const completed = visits.filter((v) =>
    ["completed", "blocked_unit", "no_access"].includes(v.status)
  ).length;

  async function handleQuickAction(status: "no_access" | "blocked_unit", note?: string) {
    if (!selectedVisit) return;

    const updates = {
      status,
      notes: note || null,
      visited_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("suite_visits")
      .update(updates)
      .eq("id", selectedVisit.id);

    if (error) {
      await addToOutbox({ type: "update_visit", payload: { visitId: selectedVisit.id, updates } });
      setPendingSync((p) => p + 1);
    }

    setSelectedVisit(null);
    loadData();
  }

  function handleSuitePress(visit: VisitTile) {
    if (visit.status !== "pending" && visit.status !== "in_progress") return;
    router.push(`/maintenance/${maintenanceId}/wizard/${visit.id}?suiteNumber=${visit.suite_number}&suiteId=${visit.suite_id}`);
  }

  function handleLongPress(visit: VisitTile) {
    if (visit.status !== "pending" && visit.status !== "in_progress") return;
    setSelectedVisit(visit);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{buildingName}</Text>
        <Text style={styles.progress}>{completed}/{visits.length} complete</Text>
        {pendingSync > 0 && (
          <Text style={styles.syncBadge}>{pendingSync} pending sync</Text>
        )}
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search suite number..."
        value={search}
        onChangeText={setSearch}
        keyboardType="number-pad"
      />

      <View style={styles.legend}>
        {(["pending", "completed", "no_access", "blocked_unit"] as SuiteVisitStatus[]).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: MOBILE_STATUS_COLORS[s] }]} />
            <Text style={styles.legendText}>{SUITE_VISIT_STATUS_LABELS[s]}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={filtered.sort((a, b) =>
          a.suite_number.localeCompare(b.suite_number, undefined, { numeric: true })
        )}
        numColumns={4}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.tile, { backgroundColor: MOBILE_STATUS_COLORS[item.status] }]}
            onPress={() => handleSuitePress(item)}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={400}
          >
            <Text style={[styles.tileText, item.status === "pending" ? styles.tileTextDark : styles.tileTextLight]}>
              {item.suite_number}
            </Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selectedVisit} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedVisit(null)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Suite {selectedVisit?.suite_number}</Text>
            <Text style={styles.modalSubtitle}>Quick action</Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#eab308" }]}
              onPress={() => handleQuickAction("no_access")}
            >
              <Text style={styles.modalButtonText}>No Access</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: "#ef4444" }]}
              onPress={() => handleQuickAction("blocked_unit")}
            >
              <Text style={styles.modalButtonText}>Blocked Unit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setSelectedVisit(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  header: { padding: 16, paddingTop: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e4e4e7" },
  back: { color: "#3b82f6", fontSize: 16, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#18181b" },
  progress: { fontSize: 14, color: "#71717a", marginTop: 4 },
  syncBadge: { fontSize: 12, color: "#eab308", marginTop: 4 },
  search: {
    margin: 16,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    fontSize: 16,
  },
  legend: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: "#71717a" },
  grid: { paddingHorizontal: 12, paddingBottom: 24 },
  tile: {
    flex: 1,
    margin: 4,
    aspectRatio: 1,
    maxWidth: "23%",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 72,
  },
  tileText: { fontSize: 16, fontWeight: "700" },
  tileTextDark: { color: "#52525b" },
  tileTextLight: { color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  modalSubtitle: { fontSize: 14, color: "#71717a", textAlign: "center", marginBottom: 20, marginTop: 4 },
  modalButton: { padding: 16, borderRadius: 10, marginBottom: 10 },
  modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  modalCancel: { padding: 12, marginTop: 4 },
  modalCancelText: { textAlign: "center", color: "#71717a", fontSize: 16 },
});

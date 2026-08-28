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
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import {
  MOBILE_STATUS_COLORS,
  SUITE_VISIT_STATUS_LABELS,
  technicianAddSuiteSchema,
} from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addToOutbox } from "@/lib/outbox";

interface VisitTile {
  id: string;
  status: SuiteVisitStatus;
  suite_number: string;
  suite_id: string;
}

interface AddSuiteForm {
  suite_number: string;
  floor: string;
  filter_size: string;
  filter_quantity: string;
  hvac_location_notes: string;
}

const emptyAddSuiteForm: AddSuiteForm = {
  suite_number: "",
  floor: "",
  filter_size: "",
  filter_quantity: "1",
  hvac_location_notes: "",
};

const DUPLICATE_SUITE_MESSAGE = "A suite with this number already exists in the building.";

export default function SuiteGridScreen() {
  const { id: maintenanceId } = useLocalSearchParams<{ id: string }>();
  const [visits, setVisits] = useState<VisitTile[]>([]);
  const [buildingName, setBuildingName] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<VisitTile | null>(null);
  const [showAddSuite, setShowAddSuite] = useState(false);
  const [addSuiteForm, setAddSuiteForm] = useState<AddSuiteForm>(emptyAddSuiteForm);
  const [addingSuite, setAddingSuite] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  const loadData = useCallback(async () => {
    if (!maintenanceId) return;

    const [{ data: maintenance }, { data: visitData }] = await Promise.all([
      supabase
        .from("maintenances")
        .select("building_id, building:buildings(name)")
        .eq("id", maintenanceId)
        .single(),
      supabase
        .from("suite_visits")
        .select("id, status, suite_id, suite:suites(suite_number)")
        .eq("maintenance_id", maintenanceId),
    ]);

    setBuildingName(maintenance?.building?.name ?? "");
    setBuildingId(maintenance?.building_id ?? "");
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

  const showSearchAddPrompt =
    search.trim().length > 0 &&
    !visits.some((v) => v.suite_number.toLowerCase() === search.trim().toLowerCase());

  function openAddSuiteModal(prefillSuiteNumber?: string) {
    setAddSuiteForm({
      ...emptyAddSuiteForm,
      suite_number: prefillSuiteNumber ?? "",
    });
    setShowAddSuite(true);
  }

  function promptStartVisit(visit: VisitTile) {
    Alert.alert(
      "Suite added",
      `Suite ${visit.suite_number} was added. Start the visit now?`,
      [
        { text: "Later", style: "cancel" },
        {
          text: "Start visit",
          onPress: () =>
            router.push(
              `/maintenance/${maintenanceId}/wizard/${visit.id}?suiteNumber=${visit.suite_number}&suiteId=${visit.suite_id}`
            ),
        },
      ]
    );
  }

  async function handleAddSuite() {
    if (!buildingId || !maintenanceId) {
      Alert.alert("Error", "Missing building information.");
      return;
    }

    const parsed = technicianAddSuiteSchema.safeParse({
      suite_number: addSuiteForm.suite_number.trim(),
      floor: addSuiteForm.floor.trim() || undefined,
      filter_size: addSuiteForm.filter_size.trim() || undefined,
      filter_quantity: addSuiteForm.filter_quantity,
      hvac_location_notes: addSuiteForm.hvac_location_notes.trim() || undefined,
    });

    if (!parsed.success) {
      Alert.alert("Invalid input", parsed.error.errors[0]?.message ?? "Check the form fields.");
      return;
    }

    setAddingSuite(true);

    const { data: suite, error } = await supabase
      .from("suites")
      .insert({ ...parsed.data, building_id: buildingId })
      .select("id, suite_number")
      .single();

    if (error) {
      if (error.code === "23505") {
        Alert.alert("Duplicate suite", DUPLICATE_SUITE_MESSAGE);
      } else {
        await addToOutbox({
          type: "add_suite",
          payload: { buildingId, suite: parsed.data },
        });
        setPendingSync((p) => p + 1);
        setShowAddSuite(false);
        setAddSuiteForm(emptyAddSuiteForm);
        Alert.alert(
          "Saved locally",
          "Suite will sync when you're back online. Check the grid after reconnecting."
        );
      }
      setAddingSuite(false);
      return;
    }

    await loadData();

    const { data: visitData } = await supabase
      .from("suite_visits")
      .select("id, status, suite_id, suite:suites(suite_number)")
      .eq("maintenance_id", maintenanceId)
      .eq("suite_id", suite.id)
      .single();

    const visit: VisitTile | null = visitData
      ? {
          id: visitData.id,
          status: visitData.status as SuiteVisitStatus,
          suite_id: visitData.suite_id,
          suite_number: visitData.suite?.suite_number ?? suite.suite_number,
        }
      : null;

    setShowAddSuite(false);
    setAddSuiteForm(emptyAddSuiteForm);
    setSearch("");
    setAddingSuite(false);

    if (visit) {
      promptStartVisit(visit);
    } else {
      Alert.alert("Suite added", `Suite ${suite.suite_number} was added to this maintenance.`);
    }
  }

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
    const base = `/maintenance/${maintenanceId}/wizard/${visit.id}?suiteNumber=${visit.suite_number}&suiteId=${visit.suite_id}`;

    if (visit.status === "pending" || visit.status === "in_progress") {
      router.push(base);
      return;
    }

    if (visit.status === "completed") {
      router.push(`${base}&edit=true`);
    }
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
        <TouchableOpacity style={styles.addButton} onPress={() => openAddSuiteModal()}>
          <Text style={styles.addButtonText}>+ Add Suite</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search suite number..."
        value={search}
        onChangeText={setSearch}
        keyboardType="number-pad"
      />

      {showSearchAddPrompt && (
        <TouchableOpacity
          style={styles.searchAddPrompt}
          onPress={() => openAddSuiteModal(search.trim())}
        >
          <Text style={styles.searchAddPromptText}>Add suite "{search.trim()}"?</Text>
        </TouchableOpacity>
      )}

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

      <Modal visible={showAddSuite} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalOverlayInner} onPress={() => setShowAddSuite(false)}>
            <Pressable style={styles.addSuiteModal} onPress={(e) => e.stopPropagation()}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Add Missing Suite</Text>
                <Text style={styles.modalSubtitle}>
                  This suite will be saved to the building and added to this maintenance.
                </Text>

                <Text style={styles.fieldLabel}>Suite # *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 1205"
                  value={addSuiteForm.suite_number}
                  onChangeText={(suite_number) => setAddSuiteForm((f) => ({ ...f, suite_number }))}
                  keyboardType="number-pad"
                />

                <Text style={styles.fieldLabel}>Floor</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 12"
                  value={addSuiteForm.floor}
                  onChangeText={(floor) => setAddSuiteForm((f) => ({ ...f, floor }))}
                />

                <Text style={styles.fieldLabel}>Filter size</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 16x25x1"
                  value={addSuiteForm.filter_size}
                  onChangeText={(filter_size) => setAddSuiteForm((f) => ({ ...f, filter_size }))}
                />

                <Text style={styles.fieldLabel}>Filter quantity</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="1"
                  value={addSuiteForm.filter_quantity}
                  onChangeText={(filter_quantity) => setAddSuiteForm((f) => ({ ...f, filter_quantity }))}
                  keyboardType="number-pad"
                />

                <Text style={styles.fieldLabel}>HVAC location notes</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldTextArea]}
                  placeholder="Optional notes..."
                  value={addSuiteForm.hvac_location_notes}
                  onChangeText={(hvac_location_notes) =>
                    setAddSuiteForm((f) => ({ ...f, hvac_location_notes }))
                  }
                  multiline
                />

                <TouchableOpacity
                  style={[styles.modalButton, styles.addSuiteSubmit, addingSuite && styles.buttonDisabled]}
                  onPress={handleAddSuite}
                  disabled={addingSuite}
                >
                  {addingSuite ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>Add Suite</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => setShowAddSuite(false)}
                  disabled={addingSuite}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
  addButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#18181b",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  search: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    fontSize: 16,
  },
  searchAddPrompt: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  searchAddPromptText: { color: "#2563eb", fontSize: 14, fontWeight: "600", textAlign: "center" },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" },
  modalOverlayInner: { flex: 1, justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  addSuiteModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  modalSubtitle: { fontSize: 14, color: "#71717a", textAlign: "center", marginBottom: 20, marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#52525b", marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: "#fff",
  },
  fieldTextArea: { minHeight: 72, textAlignVertical: "top" },
  modalButton: { padding: 16, borderRadius: 10, marginBottom: 10 },
  addSuiteSubmit: { backgroundColor: "#22c55e", marginTop: 4 },
  buttonDisabled: { opacity: 0.7 },
  modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  modalCancel: { padding: 12, marginTop: 4 },
  modalCancelText: { textAlign: "center", color: "#71717a", fontSize: 16 },
});

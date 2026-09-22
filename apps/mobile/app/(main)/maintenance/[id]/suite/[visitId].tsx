import { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import {
  MOBILE_STATUS_COLORS,
  SUITE_VISIT_STATUS_LABELS,
  technicianAddHvacUnitSchema,
  formatFilterSize,
  formatFilterSizeLabel,
  countCompletedUnitVisits,
  getSuiteVisitRollupStatus,
} from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addToOutbox } from "@/lib/outbox";
import { applyAllUnitsAccessStatus } from "@/lib/suite-visit-status";
import { colors, radius } from "@/lib/theme";
import { ScreenHeader } from "@/components/screen-header";

interface UnitTile {
  id: string;
  unitVisitId: string;
  unitId: string;
  name: string;
  status: SuiteVisitStatus;
  filter_size: string | null;
}

interface AddUnitForm {
  name: string;
  filter_size: string;
}

const emptyAddUnitForm: AddUnitForm = {
  name: "",
  filter_size: "",
};

const DUPLICATE_UNIT_MESSAGE = "A unit with this name already exists in the suite.";

const STATUS_REASON_PROMPTS: Record<"blocked_unit" | "no_access", string> = {
  blocked_unit: "Why is this suite blocked?",
  no_access: "Why was there no access to this suite?",
};

interface FilterSizeOption {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
}

export default function SuiteUnitsScreen() {
  const params = useLocalSearchParams<{
    id: string;
    visitId: string;
    suiteNumber: string;
    suiteId: string;
  }>();

  const maintenanceId = params.id;
  const visitId = params.visitId;
  const suiteNumber = params.suiteNumber;
  const suiteId = params.suiteId;

  const [units, setUnits] = useState<UnitTile[]>([]);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [addUnitForm, setAddUnitForm] = useState<AddUnitForm>(emptyAddUnitForm);
  const [addingUnit, setAddingUnit] = useState(false);
  const [filterSizes, setFilterSizes] = useState<FilterSizeOption[]>([]);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [statusReasonPrompt, setStatusReasonPrompt] = useState<"blocked_unit" | "no_access" | null>(null);
  const [statusReasonDraft, setStatusReasonDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [maintenanceStatus, setMaintenanceStatus] = useState<string>("scheduled");
  const autoRedirected = useRef(false);
  const isLocked =
    maintenanceStatus === "completed" || maintenanceStatus === "cancelled";

  const loadData = useCallback(async (): Promise<{ units: UnitTile[]; locked: boolean }> => {
    if (!visitId) return { units: [], locked: false };

    const [{ data: suiteVisit }, { data: unitVisits }, { data: sizes }] = await Promise.all([
      supabase
        .from("suite_visits")
        .select("maintenance:maintenances(status)")
        .eq("id", visitId)
        .single(),
      supabase
        .from("hvac_unit_visits")
        .select("id, status, hvac_unit:hvac_units(id, name, filter_size)")
        .eq("suite_visit_id", visitId),
      supabase
        .from("filter_sizes")
        .select("id, length_in, width_in, thickness_in")
        .order("length_in")
        .order("width_in")
        .order("thickness_in"),
    ]);

    const maintenance = Array.isArray(suiteVisit?.maintenance)
      ? suiteVisit?.maintenance[0]
      : suiteVisit?.maintenance;
    const status = maintenance?.status ?? "scheduled";
    setMaintenanceStatus(status);
    setFilterSizes(sizes ?? []);

    const mapped = (unitVisits ?? []).map((uv) => ({
      id: uv.hvac_unit?.id ?? uv.id,
      unitVisitId: uv.id,
      unitId: uv.hvac_unit?.id ?? "",
      name: uv.hvac_unit?.name ?? "Unit",
      status: uv.status as SuiteVisitStatus,
      filter_size: uv.hvac_unit?.filter_size ?? null,
    }));

    setUnits(mapped);

    return {
      units: mapped,
      locked: status === "completed" || status === "cancelled",
    };
  }, [visitId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function run() {
        const { units: loadedUnits, locked } = await loadData();
        if (cancelled || autoRedirected.current || locked || loadedUnits.length !== 1) return;

        const unit = loadedUnits[0];
        if (!unit.unitVisitId || !unit.unitId) return;

        autoRedirected.current = true;
        const edit = unit.status !== "pending";
        const base = `/maintenance/${maintenanceId}/wizard/${visitId}?suiteNumber=${suiteNumber}&suiteId=${suiteId}&unitVisitId=${unit.unitVisitId}&unitId=${unit.unitId}&unitName=${encodeURIComponent(unit.name)}`;
        router.replace(edit ? `${base}&edit=true` : base);
      }

      run();

      return () => {
        cancelled = true;
      };
    }, [loadData, maintenanceId, visitId, suiteNumber, suiteId])
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }

  const { completed, total } = countCompletedUnitVisits(units);
  const suiteStatus = getSuiteVisitRollupStatus(units.map((unit) => ({ status: unit.status })));
  const canServiceUnits = !isLocked && units.some((unit) => unit.status === "pending");
  const selectedFilterLabel = filterSizes.find((s) => formatFilterSize(s) === addUnitForm.filter_size);

  function selectFilterSize(size: FilterSizeOption) {
    setAddUnitForm((f) => ({ ...f, filter_size: formatFilterSize(size) }));
    setFilterPickerOpen(false);
  }

  function handleUnitPress(unit: UnitTile) {
    if (isLocked) return;

    const base = `/maintenance/${maintenanceId}/wizard/${visitId}?suiteNumber=${suiteNumber}&suiteId=${suiteId}&unitVisitId=${unit.unitVisitId}&unitId=${unit.unitId}&unitName=${encodeURIComponent(unit.name)}`;

    if (unit.status === "pending") {
      router.push(base);
      return;
    }

    router.push(`${base}&edit=true`);
  }

  async function handleQuickAction(status: "no_access" | "blocked_unit", note: string) {
    if (isLocked) {
      Alert.alert("Locked", "This maintenance is completed and can only be edited by an admin.");
      return;
    }
    if (!visitId) return;
    // No access is suite-level (any unit count). Blocked unit is single-unit only.
    if (status === "blocked_unit" && units.length !== 1) return;

    try {
      await applyAllUnitsAccessStatus(supabase, visitId, status, note);
    } catch {
      await addToOutbox({
        type: "update_suite_unit_visits",
        payload: { suiteVisitId: visitId, status, note },
      });
    }

    setShowQuickActions(false);
    setStatusReasonPrompt(null);
    setStatusReasonDraft("");
    router.back();
  }

  function startStatusReasonPrompt(status: "no_access" | "blocked_unit") {
    setStatusReasonPrompt(status);
    setStatusReasonDraft("");
  }

  function handleStatusReasonContinue() {
    if (!statusReasonPrompt) return;

    const reason = statusReasonDraft.trim();
    if (!reason) {
      Alert.alert("Reason required", "Please explain why before continuing.");
      return;
    }

    handleQuickAction(statusReasonPrompt, reason);
  }

  async function handleAddUnit() {
    if (isLocked) {
      Alert.alert("Locked", "This maintenance is completed and can only be edited by an admin.");
      return;
    }
    if (!suiteId) {
      Alert.alert("Error", "Missing suite information.");
      return;
    }

    const parsed = technicianAddHvacUnitSchema.safeParse({
      name: addUnitForm.name.trim(),
      filter_size: addUnitForm.filter_size.trim() || undefined,
    });

    if (!parsed.success) {
      Alert.alert("Invalid input", parsed.error.errors[0]?.message ?? "Check the form fields.");
      return;
    }

    setAddingUnit(true);

    const { data: unit, error } = await supabase
      .from("hvac_units")
      .insert({ ...parsed.data, filter_quantity: 1, suite_id: suiteId })
      .select("id, name")
      .single();

    if (error) {
      if (error.code === "23505") {
        Alert.alert("Duplicate unit", DUPLICATE_UNIT_MESSAGE);
      } else {
        await addToOutbox({
          type: "add_hvac_unit",
          payload: { suiteId, visitId, unit: parsed.data },
        });
        Alert.alert("Saved locally", "Unit will sync when you're back online.");
      }
      setAddingUnit(false);
      return;
    }

    await loadData();

    const { data: unitVisit } = await supabase
      .from("hvac_unit_visits")
      .select("id")
      .eq("suite_visit_id", visitId!)
      .eq("hvac_unit_id", unit.id)
      .single();

    setShowAddUnit(false);
    setAddUnitForm(emptyAddUnitForm);
    setAddingUnit(false);

    if (unitVisit) {
      Alert.alert("Unit added", `Start maintenance for ${unit.name}?`, [
        { text: "Later", style: "cancel" },
        {
          text: "Start",
          onPress: () =>
            router.push(
              `/maintenance/${maintenanceId}/wizard/${visitId}?suiteNumber=${suiteNumber}&suiteId=${suiteId}&unitVisitId=${unitVisit.id}&unitId=${unit.id}&unitName=${encodeURIComponent(unit.name)}`
            ),
        },
      ]);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={`Suite ${suiteNumber}`}
        subtitle={`${completed}/${total} units complete · ${SUITE_VISIT_STATUS_LABELS[suiteStatus]}`}
        showBack
      >
        {isLocked ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>
              Maintenance completed — view only. Ask an admin to make changes.
            </Text>
          </View>
        ) : null}
        {canServiceUnits ? (
          <>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddUnit(true)}>
              <Text style={styles.addButtonText}>+ Add unit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionLink} onPress={() => setShowQuickActions(true)}>
              <Text style={styles.quickActionText}>Suite quick actions</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScreenHeader>

      {!canServiceUnits && !isLocked ? (
        <View style={styles.blockedBanner}>
          <Text style={styles.blockedBannerText}>
            This suite is marked {SUITE_VISIT_STATUS_LABELS[suiteStatus]}. Unit maintenance is not required.
          </Text>
        </View>
      ) : (
        <FlatList
          data={units}
          keyExtractor={(item) => item.unitVisitId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.unitCard, { borderLeftColor: MOBILE_STATUS_COLORS[item.status] }]}
              onPress={() => handleUnitPress(item)}
              disabled={isLocked}
              activeOpacity={isLocked ? 1 : 0.7}
            >
              <View style={styles.unitCardHeader}>
                <Text style={styles.unitName}>{item.name}</Text>
                <Text style={styles.unitStatus}>{SUITE_VISIT_STATUS_LABELS[item.status]}</Text>
              </View>
              {item.filter_size && (
                <Text style={styles.unitFilter}>{item.filter_size}</Text>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No HVAC units found for this suite.</Text>
          }
        />
      )}

      <Modal visible={showQuickActions} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowQuickActions(false);
            setStatusReasonPrompt(null);
            setStatusReasonDraft("");
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {statusReasonPrompt ? (
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <Text style={styles.modalTitle}>
                  {statusReasonPrompt === "blocked_unit" ? "Mark blocked" : "Mark no access"}
                </Text>
                <Text style={styles.modalSubtitle}>Suite {suiteNumber}</Text>
                <Text style={styles.reasonPrompt}>{STATUS_REASON_PROMPTS[statusReasonPrompt]}</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Enter reason (required)..."
                  value={statusReasonDraft}
                  onChangeText={setStatusReasonDraft}
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleStatusReasonContinue}
                >
                  <Text style={styles.modalButtonText}>Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => {
                    setStatusReasonPrompt(null);
                    setStatusReasonDraft("");
                  }}
                >
                  <Text style={styles.modalCancelText}>Back</Text>
                </TouchableOpacity>
              </KeyboardAvoidingView>
            ) : (
              <>
                <Text style={styles.modalTitle}>Suite {suiteNumber}</Text>
                <Text style={styles.modalSubtitle}>
                  {units.length === 1 ? "Mark entire suite" : "Mark suite (no access)"}
                </Text>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.warning }]}
                  onPress={() => startStatusReasonPrompt("no_access")}
                >
                  <Text style={styles.modalButtonText}>No Access</Text>
                </TouchableOpacity>
                {units.length === 1 ? (
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: colors.danger }]}
                    onPress={() => startStatusReasonPrompt("blocked_unit")}
                  >
                    <Text style={styles.modalButtonText}>Blocked Unit</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowQuickActions(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAddUnit} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalOverlayInner} onPress={() => setShowAddUnit(false)}>
            <Pressable style={styles.addModal} onPress={(e) => e.stopPropagation()}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Add HVAC Unit</Text>
                <Text style={styles.modalSubtitle}>This unit will be added to the suite and this maintenance.</Text>

                <Text style={styles.fieldLabel}>Unit location *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Kitchen"
                  value={addUnitForm.name}
                  onChangeText={(name) => setAddUnitForm((f) => ({ ...f, name }))}
                />

                <Text style={styles.fieldLabel}>Filter size</Text>
                <TouchableOpacity
                  style={[styles.fieldInput, styles.filterSelect, filterSizes.length === 0 && styles.fieldDisabled]}
                  onPress={() => filterSizes.length > 0 && setFilterPickerOpen((open) => !open)}
                  disabled={filterSizes.length === 0}
                >
                  <Text
                    style={
                      addUnitForm.filter_size ? styles.filterSelectValue : styles.filterSelectPlaceholder
                    }
                  >
                    {selectedFilterLabel
                      ? formatFilterSizeLabel(selectedFilterLabel)
                      : filterSizes.length === 0
                        ? "No filter sizes configured"
                        : "Select filter size"}
                  </Text>
                </TouchableOpacity>
                {filterPickerOpen && (
                  <View style={styles.filterPickerList}>
                    {filterSizes.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[
                          styles.filterPickerOption,
                          formatFilterSize(size) === addUnitForm.filter_size &&
                            styles.filterPickerOptionSelected,
                        ]}
                        onPress={() => selectFilterSize(size)}
                      >
                        <Text style={styles.filterPickerOptionText}>{formatFilterSizeLabel(size)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.modalButton, styles.addSubmit, addingUnit && styles.buttonDisabled]}
                  onPress={handleAddUnit}
                  disabled={addingUnit}
                >
                  {addingUnit ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalButtonText}>Add Unit</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => setShowAddUnit(false)}
                  disabled={addingUnit}
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
  container: { flex: 1, backgroundColor: colors.background },
  addButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  addButtonText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  quickActionLink: { marginTop: 10 },
  quickActionText: { color: colors.primary, fontSize: 14 },
  blockedBanner: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.amber50,
    borderRadius: radius.sm,
  },
  blockedBannerText: { color: colors.amber800, fontSize: 14 },
  lockedBanner: {
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.amber50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  lockedBannerText: { fontSize: 13, color: colors.amber800, fontWeight: "500" },
  list: { padding: 16, gap: 12 },
  unitCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    borderLeftWidth: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  unitName: { fontSize: 17, fontWeight: "700", color: colors.text },
  unitStatus: { fontSize: 13, color: colors.textSecondary },
  unitFilter: { marginTop: 6, fontSize: 13, color: colors.slate700 },
  emptyText: { textAlign: "center", color: colors.textSecondary, marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center" },
  modalOverlayInner: { flex: 1, justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, margin: 24 },
  addModal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, maxHeight: "85%" },
  modalTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", color: colors.text },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    marginTop: 4,
  },
  reasonPrompt: { fontSize: 16, color: colors.text, marginBottom: 12, textAlign: "center" },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.slate700, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: colors.surface,
  },
  fieldDisabled: { backgroundColor: colors.slate100, opacity: 0.8 },
  filterSelect: { justifyContent: "center" },
  filterSelectValue: { fontSize: 16, color: colors.text },
  filterSelectPlaceholder: { fontSize: 16, color: colors.textMuted },
  filterPickerList: {
    marginTop: -10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  filterPickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterPickerOptionSelected: { backgroundColor: colors.primaryLight },
  filterPickerOptionText: { fontSize: 16, color: colors.text },
  modalButton: { padding: 16, borderRadius: 10, marginBottom: 10 },
  addSubmit: { backgroundColor: colors.success, marginTop: 4 },
  buttonDisabled: { opacity: 0.7 },
  modalButtonText: { color: colors.white, fontSize: 16, fontWeight: "600", textAlign: "center" },
  modalCancel: { padding: 12, marginTop: 4 },
  modalCancelText: { textAlign: "center", color: colors.textSecondary, fontSize: 16 },
});

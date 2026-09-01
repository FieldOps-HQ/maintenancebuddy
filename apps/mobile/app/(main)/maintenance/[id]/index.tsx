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
  Linking,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import {
  MOBILE_STATUS_COLORS,
  SUITE_VISIT_STATUS_LABELS,
  technicianFieldUnitSchema,
  formatFilterSize,
  formatFilterSizeLabel,
  formatBuildingAddress,
  getSuiteVisitRollupStatus,
  isUnitVisitDone,
} from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addToOutbox } from "@/lib/outbox";
import { addFieldUnit } from "@/lib/add-field-unit";
import { applyAllUnitsAccessStatus } from "@/lib/suite-visit-status";
import { colors, radius } from "@/lib/theme";
import { ScreenHeader } from "@/components/screen-header";

interface VisitTile {
  id: string;
  status: SuiteVisitStatus;
  suite_number: string;
  suite_id: string;
  unitsCompleted: number;
  unitsTotal: number;
  unitVisitId?: string;
  unitId?: string;
  unitName?: string;
  unitStatus?: SuiteVisitStatus;
}

interface FilterSizeOption {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
}

interface BuildingContact {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

interface AddUnitForm {
  suite_number: string;
  filter_size: string;
  unit_location: string;
}

const emptyAddUnitForm: AddUnitForm = {
  suite_number: "",
  filter_size: "",
  unit_location: "Main",
};

const STATUS_REASON_PROMPTS: Record<"blocked_unit" | "no_access", string> = {
  blocked_unit: "Why is this suite blocked?",
  no_access: "Why was there no access to this suite?",
};

export default function SuiteGridScreen() {
  const { id: maintenanceId } = useLocalSearchParams<{ id: string }>();
  const [visits, setVisits] = useState<VisitTile[]>([]);
  const [buildingName, setBuildingName] = useState("");
  const [buildingAddress, setBuildingAddress] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<VisitTile | null>(null);
  const [statusReasonPrompt, setStatusReasonPrompt] = useState<"blocked_unit" | "no_access" | null>(null);
  const [statusReasonDraft, setStatusReasonDraft] = useState("");
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [addUnitForm, setAddUnitForm] = useState<AddUnitForm>(emptyAddUnitForm);
  const [addingUnit, setAddingUnit] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [filterSizes, setFilterSizes] = useState<FilterSizeOption[]>([]);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<BuildingContact[]>([]);
  const [showContacts, setShowContacts] = useState(false);

  const loadData = useCallback(async () => {
    if (!maintenanceId) return;

    const [{ data: maintenance }, { data: visitData }, { data: sizes }] = await Promise.all([
      supabase
        .from("maintenances")
        .select(`
          building_id,
          building:buildings(
            name,
            street_number,
            street,
            city,
            postal_code,
            building_contacts(id, name, role, phone, email)
          )
        `)
        .eq("id", maintenanceId)
        .single(),
      supabase
        .from("suite_visits")
        .select(
          "id, status, suite_id, suite:suites(suite_number), hvac_unit_visits(id, status, hvac_unit:hvac_units(id, name))"
        )
        .eq("maintenance_id", maintenanceId),
      supabase
        .from("filter_sizes")
        .select("id, length_in, width_in, thickness_in")
        .order("length_in")
        .order("width_in")
        .order("thickness_in"),
    ]);

    setFilterSizes(sizes ?? []);
    setBuildingName(maintenance?.building?.name ?? "");
    const building = maintenance?.building;
    setBuildingAddress(
      building
        ? formatBuildingAddress({
            street_number: building.street_number,
            street: building.street,
            city: building.city,
            postal_code: building.postal_code,
          })
        : ""
    );
    setBuildingId(maintenance?.building_id ?? "");
    const buildingContacts = maintenance?.building?.building_contacts ?? [];
    setContacts(
      [...buildingContacts].sort((a, b) => a.name.localeCompare(b.name))
    );
    setVisits(
      (visitData ?? []).map((v: {
        id: string;
        status: string;
        suite_id: string;
        suite: { suite_number: string } | null;
        hvac_unit_visits: {
          id: string;
          status: string;
          hvac_unit: { id: string; name: string } | null;
        }[] | null;
      }) => {
        const unitVisits = v.hvac_unit_visits ?? [];
        const unitsTotal = unitVisits.length;
        const singleUnit = unitsTotal === 1 ? unitVisits[0] : null;

        return {
          id: v.id,
          status: getSuiteVisitRollupStatus(
            unitVisits.map((uv) => ({ status: uv.status as SuiteVisitStatus }))
          ),
          suite_id: v.suite_id,
          suite_number: v.suite?.suite_number ?? "",
          unitsCompleted: unitVisits.filter((uv) =>
            isUnitVisitDone(uv.status as SuiteVisitStatus)
          ).length,
          unitsTotal,
          ...(singleUnit && {
            unitVisitId: singleUnit.id,
            unitId: singleUnit.hvac_unit?.id,
            unitName: singleUnit.hvac_unit?.name ?? "Unit",
            unitStatus: singleUnit.status as SuiteVisitStatus,
          }),
        };
      })
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

  function openAddUnitModal(prefillSuiteNumber?: string) {
    setAddUnitForm({
      ...emptyAddUnitForm,
      suite_number: prefillSuiteNumber ?? "",
    });
    setFilterPickerOpen(false);
    setShowAddUnit(true);
  }

  const selectedFilterLabel = filterSizes.find(
    (s) => formatFilterSize(s) === addUnitForm.filter_size
  );

  function selectFilterSize(size: FilterSizeOption) {
    setAddUnitForm((f) => ({ ...f, filter_size: formatFilterSize(size) }));
    setFilterPickerOpen(false);
  }

  function suiteRoute(visit: VisitTile) {
    return `/maintenance/${maintenanceId}/suite/${visit.id}?suiteNumber=${visit.suite_number}&suiteId=${visit.suite_id}`;
  }

  function wizardRoute(
    visit: VisitTile,
    options?: {
      quickComplete?: boolean;
      unitVisitId?: string;
      unitId?: string;
      unitName?: string;
      unitStatus?: SuiteVisitStatus;
    }
  ) {
    const unitVisitId = options?.unitVisitId ?? visit.unitVisitId;
    const unitId = options?.unitId ?? visit.unitId;
    const unitName = options?.unitName ?? visit.unitName ?? "Unit";
    const unitStatus = options?.unitStatus ?? visit.unitStatus;
    const edit =
      unitStatus !== undefined &&
      unitStatus !== "pending" &&
      unitStatus !== "in_progress";
    const base = `/maintenance/${maintenanceId}/wizard/${visit.id}?suiteNumber=${visit.suite_number}&suiteId=${visit.suite_id}&unitVisitId=${unitVisitId}&unitId=${unitId}&unitName=${encodeURIComponent(unitName)}`;
    const withEdit = edit ? `${base}&edit=true` : base;
    return options?.quickComplete ? `${withEdit}&quickComplete=true` : withEdit;
  }

  function promptStartVisit(visit: VisitTile) {
    Alert.alert(
      "Suite added",
      `Suite ${visit.suite_number} was added. Start maintenance now?`,
      [
        { text: "Later", style: "cancel" },
        {
          text: visit.unitsTotal === 1 ? "Start unit" : "Open suite",
          onPress: () => {
            if (visit.unitsTotal === 1 && visit.unitVisitId && visit.unitId) {
              router.push(wizardRoute(visit));
            } else {
              router.push(suiteRoute(visit));
            }
          },
        },
      ]
    );
  }

  async function handleAddUnit() {
    if (!buildingId || !maintenanceId) {
      Alert.alert("Error", "Missing building information.");
      return;
    }

    const parsed = technicianFieldUnitSchema.safeParse({
      suite_number: addUnitForm.suite_number.trim(),
      filter_size: addUnitForm.filter_size.trim(),
      unit_location: addUnitForm.unit_location.trim() || undefined,
    });

    if (!parsed.success) {
      Alert.alert("Invalid input", parsed.error.errors[0]?.message ?? "Check the form fields.");
      return;
    }

    setAddingUnit(true);

    const result = await addFieldUnit(supabase, buildingId, parsed.data);

    if (result.error) {
      if (result.error.includes("already exists")) {
        Alert.alert("Could not add unit", result.error);
        setAddingUnit(false);
        return;
      }

      await addToOutbox({
        type: "add_suite",
        payload: {
          buildingId,
          suite_number: parsed.data.suite_number,
          filter_size: parsed.data.filter_size,
          unit_location: parsed.data.unit_location,
        },
      });
      setPendingSync((p) => p + 1);
      setShowAddUnit(false);
      setAddUnitForm(emptyAddUnitForm);
      Alert.alert(
        "Saved locally",
        "Unit will sync when you're back online. Check the grid after reconnecting."
      );
      setAddingUnit(false);
      return;
    }

    await loadData();

    const suiteId = result.suiteId;
    if (!suiteId) {
      setShowAddUnit(false);
      setAddUnitForm(emptyAddUnitForm);
      setSearch("");
      setAddingUnit(false);
      Alert.alert("Unit added", `Suite ${parsed.data.suite_number} was updated.`);
      return;
    }

    const { data: visitData } = await supabase
      .from("suite_visits")
      .select(
        "id, status, suite_id, suite:suites(suite_number), hvac_unit_visits(id, status, hvac_unit:hvac_units(id, name))"
      )
      .eq("maintenance_id", maintenanceId)
      .eq("suite_id", suiteId)
      .single();

    const unitVisits = visitData?.hvac_unit_visits ?? [];
    const singleUnit = unitVisits.length === 1 ? unitVisits[0] : null;

    const visit: VisitTile | null = visitData
      ? {
          id: visitData.id,
          status: visitData.status as SuiteVisitStatus,
          suite_id: visitData.suite_id,
          suite_number: visitData.suite?.suite_number ?? parsed.data.suite_number,
          unitsCompleted: unitVisits.filter((uv) =>
            isUnitVisitDone(uv.status as SuiteVisitStatus)
          ).length,
          unitsTotal: unitVisits.length,
          ...(singleUnit && {
            unitVisitId: singleUnit.id,
            unitId: singleUnit.hvac_unit?.id,
            unitName: singleUnit.hvac_unit?.name ?? "Unit",
            unitStatus: singleUnit.status as SuiteVisitStatus,
          }),
        }
      : null;

    setShowAddUnit(false);
    setAddUnitForm(emptyAddUnitForm);
    setSearch("");
    setAddingUnit(false);

    if (visit) {
      promptStartVisit(visit);
    } else {
      Alert.alert("Unit added", `Suite ${parsed.data.suite_number} was added to this maintenance.`);
    }
  }

  async function handleQuickAction(status: "no_access" | "blocked_unit", note: string) {
    if (!selectedVisit) return;

    const visitId = selectedVisit.id;

    try {
      await applyAllUnitsAccessStatus(supabase, visitId, status, note);
    } catch {
      await addToOutbox({
        type: "update_suite_unit_visits",
        payload: { suiteVisitId: visitId, status, note },
      });
      setPendingSync((p) => p + 1);
    }

    setSelectedVisit(null);
    setStatusReasonPrompt(null);
    setStatusReasonDraft("");
    loadData();
  }

  function closeQuickActions() {
    setSelectedVisit(null);
    setStatusReasonPrompt(null);
    setStatusReasonDraft("");
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

  async function handleCompleteQuickAction() {
    if (!selectedVisit) return;

    const visit = selectedVisit;
    closeQuickActions();

    if (visit.unitsTotal === 1 && visit.unitVisitId && visit.unitId) {
      router.push(wizardRoute(visit, { quickComplete: true }));
      return;
    }

    const { data: unitVisits, error } = await supabase
      .from("hvac_unit_visits")
      .select("id, status, hvac_unit:hvac_units(id, name)")
      .eq("suite_visit_id", visit.id);

    if (error || !unitVisits?.length) {
      Alert.alert("Error", "Could not load units for this suite.");
      return;
    }

    const nextUnit = unitVisits.find(
      (uv) => uv.status === "pending" || uv.status === "in_progress"
    );

    if (!nextUnit?.hvac_unit?.id) {
      Alert.alert("No units to complete", "All units in this suite are already done.");
      return;
    }

    router.push(
      wizardRoute(visit, {
        quickComplete: true,
        unitVisitId: nextUnit.id,
        unitId: nextUnit.hvac_unit.id,
        unitName: nextUnit.hvac_unit.name ?? "Unit",
        unitStatus: nextUnit.status as SuiteVisitStatus,
      })
    );
  }

  function handleSuitePress(visit: VisitTile) {
    if (visit.unitsTotal === 1 && visit.unitVisitId && visit.unitId) {
      router.push(wizardRoute(visit));
      return;
    }
    router.push(suiteRoute(visit));
  }

  function handleLongPress(visit: VisitTile) {
    if (visit.status !== "pending" && visit.status !== "in_progress") return;
    setSelectedVisit(visit);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={buildingName || "Maintenance"}
        showBack
        subtitle={`${completed}/${visits.length} suites complete`}
      >
        {buildingAddress ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(buildingAddress)}`)}
          >
            <Text style={styles.address}>{buildingAddress}</Text>
          </TouchableOpacity>
        ) : null}
        {pendingSync > 0 ? (
          <Text style={styles.syncBadge}>{pendingSync} pending sync</Text>
        ) : null}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowContacts(true)}>
            <Text style={styles.secondaryButtonText}>
              Contacts{contacts.length > 0 ? ` (${contacts.length})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => openAddUnitModal()}>
            <Text style={styles.addButtonText}>+ Add unit</Text>
          </TouchableOpacity>
        </View>
      </ScreenHeader>

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
          onPress={() => openAddUnitModal(search.trim())}
        >
          <Text style={styles.searchAddPromptText}>Add unit for suite "{search.trim()}"?</Text>
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
            {item.unitsTotal > 1 && (
              <Text
                style={[
                  styles.tileSubtext,
                  item.status === "pending" ? styles.tileTextDark : styles.tileTextLight,
                ]}
              >
                {item.unitsCompleted}/{item.unitsTotal}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selectedVisit} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeQuickActions}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {statusReasonPrompt ? (
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                <Text style={styles.modalTitle}>
                  {statusReasonPrompt === "blocked_unit" ? "Mark blocked" : "Mark no access"}
                </Text>
                <Text style={styles.modalSubtitle}>Suite {selectedVisit?.suite_number}</Text>
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
                <Text style={styles.modalTitle}>Suite {selectedVisit?.suite_number}</Text>
                <Text style={styles.modalSubtitle}>Quick action</Text>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleCompleteQuickAction}
                >
                  <Text style={styles.modalButtonText}>Complete unit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.warning }]}
                  onPress={() => startStatusReasonPrompt("no_access")}
                >
                  <Text style={styles.modalButtonText}>No Access</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.danger }]}
                  onPress={() => startStatusReasonPrompt("blocked_unit")}
                >
                  <Text style={styles.modalButtonText}>Blocked Unit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCancel} onPress={closeQuickActions}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showContacts} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowContacts(false)}>
          <Pressable style={styles.contactsModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Building contacts</Text>
            <Text style={styles.modalSubtitle}>{buildingName}</Text>
            <ScrollView style={styles.contactsList}>
              {contacts.length === 0 ? (
                <Text style={styles.contactsEmpty}>No contacts on file for this building.</Text>
              ) : (
                contacts.map((contact) => (
                  <View key={contact.id} style={styles.contactCard}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    {contact.role ? <Text style={styles.contactRole}>{contact.role}</Text> : null}
                    {contact.phone ? (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${contact.phone}`)}>
                        <Text style={styles.contactLink}>{contact.phone}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {contact.email ? (
                      <TouchableOpacity onPress={() => Linking.openURL(`mailto:${contact.email}`)}>
                        <Text style={styles.contactLink}>{contact.email}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowContacts(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAddUnit} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalOverlayInner} onPress={() => setShowAddUnit(false)}>
            <Pressable style={styles.addSuiteModal} onPress={(e) => e.stopPropagation()}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Add unit</Text>
                <Text style={styles.modalSubtitle}>
                  Saved to the building and added to this maintenance. Unit location defaults to Main.
                </Text>

                <Text style={styles.fieldLabel}>Suite # *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 201"
                  value={addUnitForm.suite_number}
                  onChangeText={(suite_number) => setAddUnitForm((f) => ({ ...f, suite_number }))}
                  keyboardType="number-pad"
                />

                <Text style={styles.fieldLabel}>Filter size *</Text>
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

                <Text style={styles.fieldLabel}>Unit location</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Main"
                  value={addUnitForm.unit_location}
                  onChangeText={(unit_location) => setAddUnitForm((f) => ({ ...f, unit_location }))}
                />

                <TouchableOpacity
                  style={[styles.modalButton, styles.addSuiteSubmit, addingUnit && styles.buttonDisabled]}
                  onPress={handleAddUnit}
                  disabled={addingUnit}
                >
                  {addingUnit ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.modalButtonText}>Add unit</Text>
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
  address: { fontSize: 14, color: colors.primary, lineHeight: 20 },
  syncBadge: { fontSize: 12, color: colors.warning, marginTop: 8 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  addButtonText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  search: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  searchAddPrompt: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  searchAddPromptText: { color: colors.primaryDark, fontSize: 14, fontWeight: "600", textAlign: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.textSecondary },
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
  tileSubtext: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  tileTextDark: { color: colors.slate700 },
  tileTextLight: { color: colors.white },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center" },
  modalOverlayInner: { flex: 1, justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, marginHorizontal: 24 },
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
  addSuiteModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 24,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", color: colors.text },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    marginTop: 4,
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
  fieldTextArea: { minHeight: 72, textAlignVertical: "top" },
  modalButton: { padding: 16, borderRadius: 10, marginBottom: 10 },
  addSuiteSubmit: { backgroundColor: colors.success, marginTop: 4 },
  buttonDisabled: { opacity: 0.7 },
  modalButtonText: { color: colors.white, fontSize: 16, fontWeight: "600", textAlign: "center" },
  modalCancel: { padding: 12, marginTop: 4 },
  modalCancelText: { textAlign: "center", color: colors.textSecondary, fontSize: 16 },
  contactsModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 24,
    margin: 24,
    maxHeight: "80%",
  },
  contactsList: { maxHeight: 360, marginBottom: 8 },
  contactsEmpty: { textAlign: "center", color: colors.textSecondary, fontSize: 14, paddingVertical: 24 },
  contactCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.slate100,
  },
  contactName: { fontSize: 16, fontWeight: "600", color: colors.text },
  contactRole: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  contactLink: { fontSize: 14, color: colors.primary, marginTop: 6 },
});

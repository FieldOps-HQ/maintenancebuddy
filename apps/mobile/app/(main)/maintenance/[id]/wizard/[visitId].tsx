import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  WIZARD_STEPS,
  WIZARD_NO_REASON_PROMPTS,
  technicianAddHvacUnitSchema,
  formatFilterSize,
  formatFilterSizeLabel,
} from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addToOutbox, getDeficienciesFromAnswers } from "@/lib/outbox";
import { uploadVisitPhoto } from "@/lib/upload-photo";
import * as FileSystem from "expo-file-system/legacy";

type AnswerKey = "cleaned" | "filter_changed" | "operating_normally";

type WizardAnswers = {
  cleaned?: boolean;
  filter_changed?: boolean;
  operating_normally?: boolean;
  reasons?: Partial<Record<AnswerKey, string>>;
};

const DEFICIENCY_TO_ANSWER: Record<string, AnswerKey> = {
  not_cleaned: "cleaned",
  filter_not_changed: "filter_changed",
  not_operating: "operating_normally",
};

const TERMINAL_UNIT_STATUSES: SuiteVisitStatus[] = [
  "completed",
  "blocked_unit",
  "no_access",
  "skipped",
];

interface FilterSizeOption {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
}

interface AddUnitForm {
  name: string;
  filter_size: string;
}

const emptyAddUnitForm: AddUnitForm = {
  name: "",
  filter_size: "",
};

export default function WizardScreen() {
  const params = useLocalSearchParams<{
    visitId: string;
    suiteNumber: string;
    suiteId: string;
    id: string;
    unitVisitId: string;
    unitId: string;
    unitName: string;
    edit?: string;
  }>();

  const visitId = params.visitId;
  const suiteNumber = params.suiteNumber;
  const suiteId = params.suiteId;
  const maintenanceId = params.id;
  const unitVisitId = params.unitVisitId;
  const unitId = params.unitId;
  const unitName = params.unitName ?? "Unit";

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [awaitingReason, setAwaitingReason] = useState<AnswerKey | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [hasExistingPhoto, setHasExistingPhoto] = useState(false);
  const [isEditing, setIsEditing] = useState(params.edit === "true");
  const [loadingVisit, setLoadingVisit] = useState(params.edit === "true");
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [addUnitForm, setAddUnitForm] = useState<AddUnitForm>(emptyAddUnitForm);
  const [addingUnit, setAddingUnit] = useState(false);
  const [filterSizes, setFilterSizes] = useState<FilterSizeOption[]>([]);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [unitCount, setUnitCount] = useState(1);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const currentStep = WIZARD_STEPS[step];

  useEffect(() => {
    if (!visitId) return;

    async function loadFilterSizes() {
      const { data: sizes } = await supabase
        .from("filter_sizes")
        .select("id, length_in, width_in, thickness_in")
        .order("length_in")
        .order("width_in")
        .order("thickness_in");
      setFilterSizes(sizes ?? []);
    }

    async function loadUnitCount() {
      const { count } = await supabase
        .from("hvac_unit_visits")
        .select("id", { count: "exact", head: true })
        .eq("suite_visit_id", visitId);
      setUnitCount(count ?? 1);
    }

    loadFilterSizes();
    loadUnitCount();
  }, [visitId]);

  useEffect(() => {
    if (!unitVisitId || params.edit !== "true") return;

    async function loadVisit() {
      setLoadingVisit(true);

      const [{ data: visit, error }, { data: deficiencies }] = await Promise.all([
        supabase
          .from("hvac_unit_visits")
          .select("status, cleaned, filter_changed, operating_normally, notes")
          .eq("id", unitVisitId)
          .single(),
        supabase
          .from("deficiencies")
          .select("category, description")
          .eq("hvac_unit_visit_id", unitVisitId!),
      ]);

      if (error || !visit) {
        Alert.alert("Error", "Could not load unit visit.");
        router.back();
        return;
      }

      if (!TERMINAL_UNIT_STATUSES.includes(visit.status as SuiteVisitStatus)) {
        setIsEditing(false);
        setLoadingVisit(false);
        return;
      }

      const reasons: Partial<Record<AnswerKey, string>> = {};
      for (const d of deficiencies ?? []) {
        const key = DEFICIENCY_TO_ANSWER[d.category];
        if (key) reasons[key] = d.description;
      }

      setIsEditing(true);
      setAnswers({
        cleaned: visit.cleaned ?? undefined,
        filter_changed: visit.filter_changed ?? undefined,
        operating_normally: visit.operating_normally ?? undefined,
        reasons,
      });

      const { data: photos } = await supabase
        .from("visit_photos")
        .select("storage_path")
        .eq("hvac_unit_visit_id", unitVisitId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (photos?.[0]) {
        const { data: signed } = await supabase.storage
          .from("visit-photos")
          .createSignedUrl(photos[0].storage_path, 3600);

        if (signed?.signedUrl) {
          setPhotoUri(signed.signedUrl);
          setHasExistingPhoto(true);
        }
      }

      setLoadingVisit(false);
    }

    loadVisit();
  }, [unitVisitId, params.edit]);

  async function updateUnitStatus(updates: {
    status: SuiteVisitStatus;
    visited_at?: string | null;
    notes?: string | null;
    cleaned?: null;
    filter_changed?: null;
    operating_normally?: null;
  }) {
    const { error } = await supabase.from("hvac_unit_visits").update(updates).eq("id", unitVisitId!);
    if (error) {
      await addToOutbox({ type: "update_unit_visit", payload: { unitVisitId, updates } });
    }
  }

  function goToGrid() {
    router.replace(`/maintenance/${maintenanceId}`);
  }

  async function handleMarkBlocked() {
    setShowActions(false);
    Alert.alert("Mark unit blocked?", "This unit will be marked as blocked.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark blocked",
        style: "destructive",
        onPress: async () => {
          await updateUnitStatus({
            status: "blocked_unit",
            visited_at: new Date().toISOString(),
            notes: null,
          });
          goToGrid();
        },
      },
    ]);
  }

  async function handleMarkNoAccess() {
    setShowActions(false);
    Alert.alert("Mark no access?", "This unit will be marked as no access.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark no access",
        onPress: async () => {
          await updateUnitStatus({
            status: "no_access",
            visited_at: new Date().toISOString(),
            notes: null,
          });
          goToGrid();
        },
      },
    ]);
  }

  async function handleResetPending() {
    setShowActions(false);
    Alert.alert("Reset to pending?", "Clears the terminal status so you can service this unit again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: async () => {
          await updateUnitStatus({
            status: "pending",
            visited_at: null,
            notes: null,
            cleaned: null,
            filter_changed: null,
            operating_normally: null,
          });
          setIsEditing(false);
          setAnswers({});
          setPhotoUri(null);
          setPhotoBase64(null);
          setHasExistingPhoto(false);
          setStep(0);
        },
      },
    ]);
  }

  async function handleAddUnit() {
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

    const { error } = await supabase.from("hvac_units").insert({
      ...parsed.data,
      filter_quantity: 1,
      suite_id: suiteId,
    });

    setAddingUnit(false);

    if (error) {
      if (error.code === "23505") {
        Alert.alert("Duplicate unit", "A unit with this name already exists in the suite.");
      } else {
        await addToOutbox({
          type: "add_hvac_unit",
          payload: { suiteId, visitId, unit: parsed.data },
        });
        Alert.alert("Saved locally", "Unit will sync when you're back online.");
      }
      return;
    }

    setShowAddUnit(false);
    setAddUnitForm(emptyAddUnitForm);
    const newCount = unitCount + 1;
    setUnitCount(newCount);

    Alert.alert("Unit added", newCount > 1 ? "View all units in this suite?" : "Unit added.", [
      { text: "Continue", style: "cancel" },
      ...(newCount > 1
        ? [
            {
              text: "View units",
              onPress: () =>
                router.replace(
                  `/maintenance/${maintenanceId}/suite/${visitId}?suiteNumber=${suiteNumber}&suiteId=${suiteId}`
                ),
            },
          ]
        : []),
    ]);
  }

  const selectedFilterLabel = filterSizes.find(
    (s) => formatFilterSize(s) === addUnitForm.filter_size
  );

  function TopBar({ onBack }: { onBack: () => void }) {
    return (
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← {step > 0 ? "Back" : "Cancel"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionsButton} onPress={() => setShowActions(true)}>
          <Text style={styles.actionsText}>⋯</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderModals() {
    return (
      <>
        <Modal visible={showActions} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Unit actions</Text>
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => {
                  setShowActions(false);
                  setShowAddUnit(true);
                }}
              >
                <Text style={styles.modalActionText}>Add unit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAction} onPress={handleMarkBlocked}>
                <Text style={[styles.modalActionText, styles.modalActionDestructive]}>Mark blocked</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAction} onPress={handleMarkNoAccess}>
                <Text style={styles.modalActionText}>Mark no access</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAction} onPress={handleResetPending}>
                <Text style={styles.modalActionText}>Reset to pending</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowActions(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
                  <Text style={styles.fieldLabel}>Unit name *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. Server room"
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
                          onPress={() => {
                            setAddUnitForm((f) => ({ ...f, filter_size: formatFilterSize(size) }));
                            setFilterPickerOpen(false);
                          }}
                        >
                          <Text style={styles.filterPickerOptionText}>
                            {formatFilterSizeLabel(size)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.modalSubmit, addingUnit && styles.buttonDisabled]}
                    onPress={handleAddUnit}
                    disabled={addingUnit}
                  >
                    {addingUnit ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalSubmitText}>Add unit</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddUnit(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  }

  async function saveProgress(partial: WizardAnswers) {
    const merged = { ...answers, ...partial };
    setAnswers(merged);

    const { data: { user } } = await supabase.auth.getUser();
    const updates = {
      cleaned: merged.cleaned,
      filter_changed: merged.filter_changed,
      operating_normally: merged.operating_normally,
      visited_by: user?.id,
      ...(isEditing ? {} : { status: "in_progress" as const }),
    };

    const { error } = await supabase.from("hvac_unit_visits").update(updates).eq("id", unitVisitId!);
    if (error) {
      await addToOutbox({ type: "update_unit_visit", payload: { unitVisitId, updates } });
    }
  }

  function advanceStep() {
    if (step < WIZARD_STEPS.length - 1) {
      if (step === 2) {
        setStep(3);
        if (!photoUri) setShowCamera(true);
      } else {
        setStep(step + 1);
      }
    }
  }

  async function handleYes() {
    if (currentStep.key === "photo") return;

    const key = currentStep.key as AnswerKey;
    const nextReasons = { ...answers.reasons };
    delete nextReasons[key];

    await saveProgress({ [key]: true, reasons: nextReasons });
    setAwaitingReason(null);
    setReasonDraft("");
    advanceStep();
  }

  function handleNo() {
    if (currentStep.key === "photo") return;

    const key = currentStep.key as AnswerKey;
    setAwaitingReason(key);
    setReasonDraft(answers.reasons?.[key] ?? "");
  }

  async function handleReasonContinue() {
    if (!awaitingReason) return;

    const reason = reasonDraft.trim();
    if (!reason) {
      Alert.alert("Reason required", "Please explain why before continuing.");
      return;
    }

    await saveProgress({
      [awaitingReason]: false,
      reasons: { ...answers.reasons, [awaitingReason]: reason },
    });
    setAwaitingReason(null);
    setReasonDraft("");
    advanceStep();
  }

  function handleBack() {
    if (awaitingReason) {
      setAwaitingReason(null);
      setReasonDraft("");
      return;
    }
    if (step > 0) setStep(step - 1);
    else router.back();
  }

  function validateNoReasons(): boolean {
    const keys: AnswerKey[] = ["cleaned", "filter_changed", "operating_normally"];
    for (const key of keys) {
      if (answers[key] === false && !answers.reasons?.[key]?.trim()) {
        Alert.alert("Reason required", `${WIZARD_NO_REASON_PROMPTS[key]}\n\nPlease go back and add an explanation.`);
        return false;
      }
    }
    return true;
  }

  async function handleComplete() {
    const hasNewPhoto = photoUri && !photoUri.startsWith("http");

    if (!photoUri || (!hasNewPhoto && !hasExistingPhoto)) {
      Alert.alert("Photo required", "Please take a photo to complete this visit.");
      return;
    }

    if (!validateNoReasons()) return;

    if (!maintenanceId || !suiteId || !unitVisitId || !unitId) {
      Alert.alert("Error", "Missing maintenance or unit info. Go back and try again.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const finalUpdates = {
        status: "completed" as const,
        visited_at: new Date().toISOString(),
        visited_by: user?.id,
        cleaned: answers.cleaned ?? null,
        filter_changed: answers.filter_changed ?? null,
        operating_normally: answers.operating_normally ?? null,
        notes: null,
      };

      const { error } = await supabase.from("hvac_unit_visits").update(finalUpdates).eq("id", unitVisitId);
      if (error) {
        await addToOutbox({ type: "update_unit_visit", payload: { unitVisitId, updates: finalUpdates } });
      }

      const deficiencies = getDeficienciesFromAnswers(answers);
      await supabase.from("deficiencies").delete().eq("hvac_unit_visit_id", unitVisitId);

      for (const d of deficiencies) {
        const { error: dError } = await supabase.from("deficiencies").insert({
          hvac_unit_visit_id: unitVisitId,
          category: d.category,
          description: d.description,
        });
        if (dError) {
          await addToOutbox({
            type: "create_deficiency",
            payload: { unitVisitId, category: d.category, description: d.description },
          });
        }
      }

      if (hasNewPhoto) {
        await uploadVisitPhoto(photoUri, maintenanceId, suiteId, unitId, unitVisitId, photoBase64);
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Photo upload failed";

      if (hasNewPhoto && photoUri) {
        try {
          const base64 =
            photoBase64 ??
            (await FileSystem.readAsStringAsync(photoUri, {
              encoding: FileSystem.EncodingType.Base64,
            }));
          await addToOutbox({
            type: "upload_photo",
            payload: { unitVisitId, maintenanceId, suiteId, unitId, base64 },
          });
          Alert.alert(
            "Photo saved locally",
            `Visit updated but photo upload failed:\n${message}\n\nPhoto queued to sync later.`
          );
          router.back();
        } catch {
          Alert.alert("Upload failed", message);
        }
      } else {
        Alert.alert("Save failed", message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
    if (photo?.uri) {
      setPhotoUri(photo.uri);
      setPhotoBase64(photo.base64 ?? null);
      setHasExistingPhoto(false);
      setShowCamera(false);
    }
  }

  if (loadingVisit) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading visit...</Text>
      </View>
    );
  }

  if (showCamera) {
    if (!permission?.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.question}>Camera permission needed</Text>
          <TouchableOpacity style={styles.yesButton} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 3 && photoUri) {
    return (
      <>
        <View style={styles.container}>
          <TopBar onBack={() => router.back()} />
          <Text style={styles.suiteLabel}>Suite {suiteNumber} · {unitName}</Text>
          <Text style={styles.stepIndicator}>Step 4 of 4</Text>
          <Text style={styles.stepTitle}>Photo</Text>
          <Text style={styles.question}>Photo Preview</Text>
          <Image source={{ uri: photoUri }} style={styles.preview} />
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.noButton}
              disabled={submitting}
              onPress={() => {
                setPhotoUri(null);
                setPhotoBase64(null);
                setHasExistingPhoto(false);
                setShowCamera(true);
              }}
            >
              <Text style={styles.noButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesButton, submitting && styles.buttonDisabled]}
              onPress={handleComplete}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{isEditing ? "Save Changes ✓" : "Complete ✓"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {renderModals()}
      </>
    );
  }

  const currentAnswer =
    currentStep?.key === "cleaned"
      ? answers.cleaned
      : currentStep?.key === "filter_changed"
        ? answers.filter_changed
        : currentStep?.key === "operating_normally"
          ? answers.operating_normally
          : undefined;

  if (awaitingReason) {
    return (
      <>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TopBar onBack={handleBack} />
          <Text style={styles.suiteLabel}>Suite {suiteNumber} · {unitName}</Text>
          <Text style={styles.stepIndicator}>Step {step + 1} of 4</Text>
          <Text style={styles.stepTitle}>
            {WIZARD_STEPS.find((s) => s.key === awaitingReason)?.title}
          </Text>
          <Text style={styles.question}>{WIZARD_NO_REASON_PROMPTS[awaitingReason]}</Text>

          <TextInput
            style={styles.noteInput}
            placeholder="Enter reason (required)..."
            value={reasonDraft}
            onChangeText={setReasonDraft}
            multiline
            autoFocus
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.yesButton} onPress={handleReasonContinue}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        {renderModals()}
      </>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <TopBar onBack={handleBack} />

        <Text style={styles.suiteLabel}>
          Suite {suiteNumber} · {unitName}{isEditing ? " · Editing" : ""}
        </Text>
        <Text style={styles.stepIndicator}>Step {step + 1} of 4</Text>
        <Text style={styles.stepTitle}>{currentStep.title}</Text>
        <Text style={styles.question}>{currentStep.question}</Text>

        {isEditing && currentAnswer !== undefined && currentStep?.key !== "photo" && (
          <Text style={styles.currentAnswer}>
            Current answer: {currentAnswer ? "Yes" : "No"}
            {!currentAnswer && answers.reasons?.[currentStep.key as AnswerKey] && (
              <> — {answers.reasons[currentStep.key as AnswerKey]}</>
            )}
          </Text>
        )}

        {currentStep?.key !== "photo" && (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.noButton} onPress={handleNo}>
              <Text style={styles.noButtonText}>No</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.yesButton} onPress={handleYes}>
              <Text style={styles.buttonText}>Yes</Text>
            </TouchableOpacity>
          </View>
        )}

        {isEditing && step < 3 && photoUri && (
          <TouchableOpacity style={styles.skipToPhotoButton} onPress={() => setStep(3)}>
            <Text style={styles.skipToPhotoText}>Skip to photo review</Text>
          </TouchableOpacity>
        )}

        {isEditing && step === 3 && !photoUri && (
          <TouchableOpacity style={styles.skipToPhotoButton} onPress={() => setShowCamera(true)}>
            <Text style={styles.skipToPhotoText}>Take new photo</Text>
          </TouchableOpacity>
        )}
      </View>
      {renderModals()}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, paddingTop: 60 },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 16, color: "#71717a" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  backText: { fontSize: 16, color: "#3b82f6" },
  actionsButton: { padding: 8 },
  actionsText: { fontSize: 24, color: "#52525b", fontWeight: "700" },
  suiteLabel: { fontSize: 16, color: "#71717a", marginBottom: 8 },
  stepIndicator: { fontSize: 14, color: "#a1a1aa", marginBottom: 8 },
  stepTitle: { fontSize: 22, fontWeight: "700", color: "#18181b", marginBottom: 12 },
  question: { fontSize: 28, fontWeight: "600", color: "#18181b", marginBottom: 40, lineHeight: 36 },
  currentAnswer: { fontSize: 16, color: "#71717a", marginTop: -24, marginBottom: 24 },
  buttonRow: { flexDirection: "row", gap: 16, marginTop: "auto", marginBottom: 40 },
  yesButton: {
    flex: 1,
    backgroundColor: "#22c55e",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  noButton: {
    flex: 1,
    backgroundColor: "#f4f4f5",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  noButtonText: { color: "#52525b", fontSize: 24, fontWeight: "700" },
  noteInput: {
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 120,
    textAlignVertical: "top",
  },
  skipToPhotoButton: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipToPhotoText: { color: "#3b82f6", fontSize: 16, fontWeight: "600" },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  cameraControls: { position: "absolute", bottom: 40, left: 0, right: 0, alignItems: "center" },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  preview: { flex: 1, borderRadius: 12, marginBottom: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" },
  modalOverlayInner: { flex: 1, justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 24, margin: 24 },
  addModal: { backgroundColor: "#fff", borderRadius: 16, padding: 24, maxHeight: "85%" },
  modalTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  modalAction: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f4f4f5" },
  modalActionText: { fontSize: 16, color: "#18181b", textAlign: "center" },
  modalActionDestructive: { color: "#ef4444" },
  modalCancel: { padding: 12, marginTop: 8 },
  modalCancelText: { textAlign: "center", color: "#71717a", fontSize: 16 },
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
  fieldDisabled: { backgroundColor: "#f4f4f5", opacity: 0.8 },
  filterSelect: { justifyContent: "center" },
  filterSelectValue: { fontSize: 16, color: "#18181b" },
  filterSelectPlaceholder: { fontSize: 16, color: "#a1a1aa" },
  filterPickerList: {
    marginTop: -10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  filterPickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
  },
  filterPickerOptionSelected: { backgroundColor: "#eff6ff" },
  filterPickerOptionText: { fontSize: 16, color: "#18181b" },
  modalSubmit: {
    backgroundColor: "#22c55e",
    padding: 16,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  modalSubmitText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
});

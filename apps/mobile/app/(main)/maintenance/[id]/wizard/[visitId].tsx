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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  WIZARD_STEPS,
  WIZARD_NO_REASON_PROMPTS,
} from "@maintenancebuddy/shared";
import type { SuiteVisitStatus } from "@maintenancebuddy/shared";
import { supabase } from "@/lib/supabase";
import { addToOutbox, getDeficienciesFromAnswers } from "@/lib/outbox";
import { uploadVisitPhoto } from "@/lib/upload-photo";
import { colors, radius } from "@/lib/theme";
import { ScreenHeader } from "@/components/screen-header";
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
];

const BLOCKED_REASON_PROMPT = "Why is this unit blocked?";

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
    quickComplete?: string;
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
  const [statusReasonPrompt, setStatusReasonPrompt] = useState(false);
  const [statusReasonDraft, setStatusReasonDraft] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const quickCompleteHandled = useRef(false);

  const currentStep = WIZARD_STEPS[step];

  useEffect(() => {
    if (!maintenanceId) return;

    async function loadMaintenanceLock() {
      const { data } = await supabase
        .from("maintenances")
        .select("status")
        .eq("id", maintenanceId!)
        .single();

      const status = data?.status;
      const locked = status === "completed" || status === "cancelled";
      setIsLocked(locked);
      if (locked) {
        setIsEditing(true);
        setShowCamera(false);
      }
    }

    loadMaintenanceLock();
  }, [maintenanceId]);

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

  useEffect(() => {
    if (quickCompleteHandled.current) return;
    if (params.quickComplete !== "true") return;
    if (params.edit === "true") return;
    if (isLocked) return;
    if (!unitVisitId) return;
    if (loadingVisit) return;

    quickCompleteHandled.current = true;
    void runQuickComplete();
  }, [params.quickComplete, params.edit, unitVisitId, loadingVisit, isLocked]);

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
    if (isLocked) {
      Alert.alert("Locked", "This maintenance is completed and can only be edited by an admin.");
      return;
    }
    setShowActions(false);
    setStatusReasonDraft("");
    setStatusReasonPrompt(true);
  }

  async function handleStatusReasonContinue() {
    if (!statusReasonPrompt) return;
    if (isLocked) return;

    const reason = statusReasonDraft.trim();
    if (!reason) {
      Alert.alert("Reason required", "Please explain why before continuing.");
      return;
    }

    await updateUnitStatus({
      status: "blocked_unit",
      visited_at: new Date().toISOString(),
      notes: reason,
      cleaned: null,
      filter_changed: null,
      operating_normally: null,
    });
    setStatusReasonPrompt(false);
    setStatusReasonDraft("");
    goToGrid();
  }

  async function runQuickComplete() {
    const quickAnswers: WizardAnswers = {
      cleaned: true,
      filter_changed: true,
      operating_normally: true,
      reasons: {},
    };

    setAnswers(quickAnswers);
    setAwaitingReason(null);
    setReasonDraft("");
    await saveProgress(quickAnswers);
    setStep(3);
    if (!photoUri) {
      setShowCamera(true);
    }
  }

  async function handleCompleteUnit() {
    if (isLocked) {
      Alert.alert("Locked", "This maintenance is completed and can only be edited by an admin.");
      return;
    }
    setShowActions(false);
    await runQuickComplete();
  }

  function WizardHeader({ onBack }: { onBack: () => void }) {
    return (
      <ScreenHeader
        title={`Suite ${suiteNumber}`}
        subtitle={`${unitName}${isLocked ? " · View only" : isEditing ? " · Editing" : ""}`}
        showBack
        onBack={onBack}
        rightAction={
          isLocked ? undefined : (
            <TouchableOpacity
              style={styles.actionsButton}
              onPress={() => setShowActions(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.actionsText}>⋯</Text>
            </TouchableOpacity>
          )
        }
      />
    );
  }

  function renderModals() {
    return (
      <Modal visible={showActions} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowActions(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Unit actions</Text>
            <TouchableOpacity style={styles.modalAction} onPress={handleCompleteUnit}>
              <Text style={styles.modalActionText}>Complete unit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalAction} onPress={handleMarkBlocked}>
              <Text style={[styles.modalActionText, styles.modalActionDestructive]}>Mark blocked</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowActions(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    );
  }

  async function saveProgress(partial: WizardAnswers) {
    if (isLocked) return;

    const merged = { ...answers, ...partial };
    setAnswers(merged);

    const { data: { user } } = await supabase.auth.getUser();
    const updates = {
      cleaned: merged.cleaned,
      filter_changed: merged.filter_changed,
      operating_normally: merged.operating_normally,
      visited_by: user?.id,
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
    if (isLocked) return;
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
    if (isLocked) return;
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
    if (statusReasonPrompt) {
      setStatusReasonPrompt(false);
      setStatusReasonDraft("");
      return;
    }
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
    if (isLocked) {
      goToGrid();
      return;
    }

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const finalUpdates = {
        status: "completed" as const,
        visited_at: new Date().toISOString(),
        visited_by: user?.id,
        cleaned: answers.cleaned ?? null,
        filter_changed: answers.filter_changed ?? null,
        operating_normally: answers.operating_normally ?? null,
        notes: null,
      };
      const deficiencies = getDeficienciesFromAnswers(answers);

      async function resolvePhotoBase64(): Promise<string | null> {
        if (!hasNewPhoto || !photoUri) return null;
        return (
          photoBase64 ??
          (await FileSystem.readAsStringAsync(photoUri, {
            encoding: FileSystem.EncodingType.Base64,
          }))
        );
      }

      const { error } = await supabase
        .from("hvac_unit_visits")
        .update(finalUpdates)
        .eq("id", unitVisitId);

      if (error) {
        const base64 = await resolvePhotoBase64();
        await addToOutbox({
          type: "complete_unit_visit",
          payload: {
            unitVisitId,
            updates: finalUpdates,
            deficiencies,
            photo:
              base64 != null
                ? { maintenanceId, suiteId, unitId, base64 }
                : null,
          },
        });
        Alert.alert(
          "Saved locally",
          "Visit will sync when you're back online."
        );
        router.back();
        return;
      }

      const { error: deleteError } = await supabase
        .from("deficiencies")
        .delete()
        .eq("hvac_unit_visit_id", unitVisitId);

      if (deleteError) {
        await addToOutbox({
          type: "replace_deficiencies",
          payload: { unitVisitId, deficiencies },
        });
      } else if (deficiencies.length > 0) {
        const { error: insertError } = await supabase.from("deficiencies").insert(
          deficiencies.map((d) => ({
            hvac_unit_visit_id: unitVisitId,
            category: d.category,
            description: d.description,
          }))
        );
        if (insertError) {
          await addToOutbox({
            type: "replace_deficiencies",
            payload: { unitVisitId, deficiencies },
          });
        }
      }

      if (hasNewPhoto) {
        try {
          await uploadVisitPhoto(
            photoUri,
            maintenanceId,
            suiteId,
            unitId,
            unitVisitId,
            photoBase64
          );
        } catch (photoErr) {
          const message =
            photoErr instanceof Error ? photoErr.message : "Photo upload failed";
          const base64 = await resolvePhotoBase64();
          if (!base64) {
            Alert.alert("Upload failed", message);
            return;
          }
          await addToOutbox({
            type: "upload_photo",
            payload: { unitVisitId, maintenanceId, suiteId, unitId, base64 },
          });
          Alert.alert(
            "Photo saved locally",
            `Visit updated but photo upload failed:\n${message}\n\nPhoto queued to sync later.`
          );
        }
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      Alert.alert("Save failed", message);
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
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading visit...</Text>
      </View>
    );
  }

  if (showCamera) {
    if (!permission?.granted) {
      return (
        <View style={styles.screen}>
          <WizardHeader onBack={() => setShowCamera(false)} />
          <View style={[styles.content, styles.centered]}>
            <Text style={styles.question}>Camera permission needed</Text>
            <TouchableOpacity style={styles.yesButton} onPress={requestPermission}>
              <Text style={styles.buttonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
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
        <View style={styles.screen}>
          <WizardHeader onBack={() => router.back()} />
          <View style={styles.content}>
            {isLocked ? (
              <View style={styles.lockedBanner}>
                <Text style={styles.lockedBannerText}>
                  This maintenance is completed — view only. Ask an admin to make changes.
                </Text>
              </View>
            ) : null}
            <Text style={styles.stepIndicator}>Step 4 of 4</Text>
            <Text style={styles.stepTitle}>Photo</Text>
            <Text style={styles.question}>Photo Preview</Text>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            <View style={styles.buttonRow}>
              {isLocked ? (
                <TouchableOpacity style={styles.yesButton} onPress={goToGrid}>
                  <Text style={styles.buttonText}>Done</Text>
                </TouchableOpacity>
              ) : (
                <>
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
                </>
              )}
            </View>
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

  if (statusReasonPrompt) {
    return (
      <>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <WizardHeader onBack={handleBack} />
          <View style={styles.content}>
            <Text style={styles.stepTitle}>Mark blocked</Text>
            <Text style={styles.question}>{BLOCKED_REASON_PROMPT}</Text>

            <TextInput
              style={styles.noteInput}
              placeholder="Enter reason (required)..."
              value={statusReasonDraft}
              onChangeText={setStatusReasonDraft}
              multiline
              autoFocus
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.yesButton} onPress={handleStatusReasonContinue}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
        {renderModals()}
      </>
    );
  }

  if (awaitingReason) {
    return (
      <>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <WizardHeader onBack={handleBack} />
          <View style={styles.content}>
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
          </View>
        </KeyboardAvoidingView>
        {renderModals()}
      </>
    );
  }

  return (
    <>
      <View style={styles.screen}>
        <WizardHeader onBack={handleBack} />

        <View style={styles.content}>
        {isLocked ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>
              This maintenance is completed — view only. Ask an admin to make changes.
            </Text>
          </View>
        ) : null}
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

        {isLocked ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.yesButton} onPress={goToGrid}>
              <Text style={styles.buttonText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
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
          </>
        )}
        </View>
      </View>
      {renderModals()}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, backgroundColor: colors.surface, padding: 24 },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 16, color: colors.textSecondary },
  actionsButton: { padding: 4 },
  actionsText: { fontSize: 22, color: "#fafafa", fontWeight: "700", lineHeight: 24 },
  stepIndicator: { fontSize: 13, color: colors.textMuted, marginBottom: 8, letterSpacing: 0.3 },
  stepTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  question: {
    fontSize: 26,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 40,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  currentAnswer: { fontSize: 15, color: colors.textSecondary, marginTop: -24, marginBottom: 24 },
  lockedBanner: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.amber50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  lockedBannerText: { fontSize: 13, color: colors.amber800, fontWeight: "500" },
  buttonRow: { flexDirection: "row", gap: 16, marginTop: "auto", marginBottom: 40 },
  yesButton: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: 24,
    borderRadius: radius.md,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  noButton: {
    flex: 1,
    backgroundColor: colors.slate100,
    padding: 24,
    borderRadius: radius.md,
    alignItems: "center",
  },
  buttonText: { color: colors.white, fontSize: 22, fontWeight: "700" },
  noButtonText: { color: colors.slate700, fontSize: 22, fontWeight: "700" },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
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
  skipToPhotoText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
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
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
  preview: { flex: 1, borderRadius: radius.md, marginBottom: 24 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center" },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, margin: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 16, color: colors.text },
  modalAction: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  modalActionText: { fontSize: 16, color: colors.text, textAlign: "center" },
  modalActionDestructive: { color: colors.danger },
  modalCancel: { padding: 12, marginTop: 8 },
  modalCancelText: { textAlign: "center", color: colors.textSecondary, fontSize: 16 },
});

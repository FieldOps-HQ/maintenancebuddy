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
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { WIZARD_STEPS, WIZARD_NO_REASON_PROMPTS } from "@maintenancebuddy/shared";
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

export default function WizardScreen() {
  const params = useLocalSearchParams<{
    visitId: string;
    suiteNumber: string;
    suiteId: string;
    id: string;
    edit?: string;
  }>();

  const visitId = params.visitId;
  const suiteNumber = params.suiteNumber;
  const suiteId = params.suiteId;
  const maintenanceId = params.id;

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
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const currentStep = WIZARD_STEPS[step];

  useEffect(() => {
    if (!visitId || params.edit !== "true") return;

    async function loadVisit() {
      setLoadingVisit(true);

      const [{ data: visit, error }, { data: deficiencies }] = await Promise.all([
        supabase
          .from("suite_visits")
          .select("status, cleaned, filter_changed, operating_normally, notes")
          .eq("id", visitId)
          .single(),
        supabase
          .from("deficiencies")
          .select("category, description")
          .eq("suite_visit_id", visitId!),
      ]);

      if (error || !visit) {
        Alert.alert("Error", "Could not load suite visit.");
        router.back();
        return;
      }

      if (visit.status !== "completed") {
        Alert.alert("Cannot edit", "Only completed suites can be edited.");
        router.back();
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
        .eq("suite_visit_id", visitId)
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
  }, [visitId, params.edit]);

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

    const { error } = await supabase.from("suite_visits").update(updates).eq("id", visitId!);
    if (error) {
      await addToOutbox({ type: "update_visit", payload: { visitId, updates } });
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

    if (!maintenanceId || !suiteId || !visitId) {
      Alert.alert("Error", "Missing maintenance or suite info. Go back and try again.");
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

      const { error } = await supabase.from("suite_visits").update(finalUpdates).eq("id", visitId);
      if (error) {
        await addToOutbox({ type: "update_visit", payload: { visitId, updates: finalUpdates } });
      }

      const deficiencies = getDeficienciesFromAnswers(answers);
      await supabase.from("deficiencies").delete().eq("suite_visit_id", visitId);

      for (const d of deficiencies) {
        const { error: dError } = await supabase.from("deficiencies").insert({
          suite_visit_id: visitId,
          category: d.category,
          description: d.description,
        });
        if (dError) {
          await addToOutbox({
            type: "create_deficiency",
            payload: { visitId, category: d.category, description: d.description },
          });
        }
      }

      if (hasNewPhoto) {
        await uploadVisitPhoto(photoUri, maintenanceId, suiteId, visitId, photoBase64);
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
            payload: { visitId, maintenanceId, suiteId, base64 },
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
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} disabled={submitting}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.suiteLabel}>Suite {suiteNumber}</Text>
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.suiteLabel}>Suite {suiteNumber}</Text>
        <Text style={styles.stepIndicator}>Step {step + 1} of 4</Text>
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
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backText}>← {step > 0 ? "Back" : "Cancel"}</Text>
      </TouchableOpacity>

      <Text style={styles.suiteLabel}>
        Suite {suiteNumber}{isEditing ? " · Editing" : ""}
      </Text>
      <Text style={styles.stepIndicator}>Step {step + 1} of 4</Text>
      <Text style={styles.question}>{currentStep?.question}</Text>

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, paddingTop: 60 },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 16, color: "#71717a" },
  backButton: { marginBottom: 24 },
  backText: { fontSize: 16, color: "#3b82f6" },
  suiteLabel: { fontSize: 16, color: "#71717a", marginBottom: 8 },
  stepIndicator: { fontSize: 14, color: "#a1a1aa", marginBottom: 16 },
  question: { fontSize: 32, fontWeight: "700", color: "#18181b", marginBottom: 40, lineHeight: 40 },
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
});

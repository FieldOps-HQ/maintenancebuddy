import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readPhotoAsBase64(photoUri: string, inlineBase64?: string | null): Promise<string> {
  if (inlineBase64) return inlineBase64;

  return FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function uploadVisitPhoto(
  photoUri: string,
  maintenanceId: string,
  suiteId: string,
  unitId: string,
  unitVisitId: string,
  inlineBase64?: string | null
): Promise<{ storagePath: string }> {
  if (!maintenanceId || !suiteId || !unitId || !unitVisitId) {
    throw new Error(
      `Missing IDs: maintenance=${maintenanceId}, suite=${suiteId}, unit=${unitId}, unitVisit=${unitVisitId}`
    );
  }

  const base64 = await readPhotoAsBase64(photoUri, inlineBase64);
  if (!base64) {
    throw new Error("Photo file is empty");
  }

  const storagePath = `${maintenanceId}/${suiteId}/${unitId}/${Date.now()}.jpg`;
  const fileData = base64ToUint8Array(base64);

  const { error: uploadError } = await supabase.storage
    .from("visit-photos")
    .upload(storagePath, fileData, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  await supabase.from("visit_photos").delete().eq("hvac_unit_visit_id", unitVisitId);

  const { error: insertError } = await supabase.from("visit_photos").insert({
    hvac_unit_visit_id: unitVisitId,
    storage_path: storagePath,
  });

  if (insertError) {
    throw new Error(`Photo record failed: ${insertError.message}`);
  }

  return { storagePath };
}

export { base64ToUint8Array as base64ToArrayBuffer };

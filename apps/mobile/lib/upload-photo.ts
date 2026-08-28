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
  visitId: string,
  inlineBase64?: string | null
): Promise<{ storagePath: string }> {
  if (!maintenanceId || !suiteId || !visitId) {
    throw new Error(`Missing IDs: maintenance=${maintenanceId}, suite=${suiteId}, visit=${visitId}`);
  }

  const base64 = await readPhotoAsBase64(photoUri, inlineBase64);
  if (!base64) {
    throw new Error("Photo file is empty");
  }

  const storagePath = `${maintenanceId}/${suiteId}/${Date.now()}.jpg`;
  const fileData = base64ToUint8Array(base64);

  const { error: uploadError } = await supabase.storage
    .from("visit-photos")
    .upload(storagePath, fileData, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  await supabase.from("visit_photos").delete().eq("suite_visit_id", visitId);

  const { error: insertError } = await supabase.from("visit_photos").insert({
    suite_visit_id: visitId,
    storage_path: storagePath,
  });

  if (insertError) {
    throw new Error(`Photo record failed: ${insertError.message}`);
  }

  return { storagePath };
}

export { base64ToUint8Array as base64ToArrayBuffer };

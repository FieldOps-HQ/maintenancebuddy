import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";
import { apiFetch } from "./api";

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

  const { url, storagePath, headers } = await apiFetch<{
    url: string;
    storagePath: string;
    headers: Record<string, string>;
  }>("/api/photos/presign-upload", {
    method: "POST",
    json: {
      maintenanceId,
      suiteId,
      unitId,
      contentType: "image/jpeg",
    },
  });

  const fileData = base64ToUint8Array(base64);
  const body = fileData.buffer.slice(
    fileData.byteOffset,
    fileData.byteOffset + fileData.byteLength
  ) as ArrayBuffer;
  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": headers["Content-Type"] ?? "image/jpeg",
    },
    body,
  });

  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    throw new Error(
      `Upload failed (${putRes.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
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

export async function getSignedVisitPhotoUrl(storagePath: string): Promise<string | null> {
  const { urls } = await apiFetch<{ urls: Record<string, string> }>(
    "/api/photos/presign-get",
    {
      method: "POST",
      json: { paths: [storagePath] },
    }
  );
  return urls[storagePath] ?? null;
}

export { base64ToUint8Array as base64ToArrayBuffer };

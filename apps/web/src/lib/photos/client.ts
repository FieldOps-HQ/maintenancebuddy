"use client";

export async function fetchSignedPhotoUrls(
  paths: string[]
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const res = await fetch("/api/photos/presign-get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });

  const json = (await res.json().catch(() => null)) as
    | { urls?: Record<string, string>; error?: string }
    | null;

  if (!res.ok) {
    throw new Error(json?.error ?? "Failed to sign photo URLs");
  }

  return json?.urls ?? {};
}

export async function deleteVisitPhotoObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const res = await fetch("/api/photos/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });

  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(json?.error ?? "Failed to delete photos");
  }
}

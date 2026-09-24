import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanDeletePhotos,
  maintenanceIdFromPath,
  requirePhotoUser,
} from "@/lib/photos/auth";
import { deleteObjects } from "@/lib/r2";

const bodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  const auth = await requirePhotoUser(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const uniquePaths = [...new Set(parsed.data.paths)];

  const maintenanceIds = new Set<string>();
  for (const path of uniquePaths) {
    const maintenanceId = maintenanceIdFromPath(path);
    if (!maintenanceId) {
      return NextResponse.json({ error: `Invalid path: ${path}` }, { status: 400 });
    }
    maintenanceIds.add(maintenanceId);
  }

  for (const maintenanceId of maintenanceIds) {
    const denied = await assertCanDeletePhotos(auth, maintenanceId);
    if (denied) return denied;
  }

  try {
    await deleteObjects(uniquePaths);
    return NextResponse.json({ deleted: uniquePaths.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete photos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

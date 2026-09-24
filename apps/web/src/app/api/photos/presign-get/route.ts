import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanReadMaintenance,
  maintenanceIdFromPath,
  requirePhotoUser,
} from "@/lib/photos/auth";
import { presignGet } from "@/lib/r2";

const bodySchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(50),
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

  const { paths } = parsed.data;
  const uniquePaths = [...new Set(paths)];

  const maintenanceIds = new Set<string>();
  for (const path of uniquePaths) {
    const maintenanceId = maintenanceIdFromPath(path);
    if (!maintenanceId) {
      return NextResponse.json({ error: `Invalid path: ${path}` }, { status: 400 });
    }
    maintenanceIds.add(maintenanceId);
  }

  for (const maintenanceId of maintenanceIds) {
    const denied = await assertCanReadMaintenance(auth, maintenanceId);
    if (denied) return denied;
  }

  try {
    const urls: Record<string, string> = {};
    await Promise.all(
      uniquePaths.map(async (path) => {
        urls[path] = await presignGet(path, 3600);
      })
    );
    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create download URLs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

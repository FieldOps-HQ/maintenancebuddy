import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanUploadPhoto, requirePhotoUser } from "@/lib/photos/auth";
import { presignPut } from "@/lib/r2";

const bodySchema = z.object({
  maintenanceId: z.string().uuid(),
  suiteId: z.string().uuid(),
  unitId: z.string().uuid(),
  contentType: z.enum(["image/jpeg"]).optional().default("image/jpeg"),
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

  const { maintenanceId, suiteId, unitId, contentType } = parsed.data;
  const denied = await assertCanUploadPhoto(auth, maintenanceId);
  if (denied) return denied;

  const storagePath = `${maintenanceId}/${suiteId}/${unitId}/${Date.now()}.jpg`;

  try {
    const url = await presignPut(storagePath, contentType, 600);
    return NextResponse.json({
      url,
      storagePath,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

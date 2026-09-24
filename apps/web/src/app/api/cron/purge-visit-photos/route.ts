import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteObjects } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Daily retention: delete visit photos for maintenances completed ≥ 3 months.
 * Secure with CRON_SECRET (Authorization: Bearer <secret> or ?secret=).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const urlSecret = new URL(request.url).searchParams.get("secret");
  if (bearer !== secret && urlSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  const { data: expiredMaintenances, error: maintenanceError } = await admin
    .from("maintenances")
    .select("id")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .lte("completed_at", cutoff.toISOString());

  if (maintenanceError) {
    return NextResponse.json({ error: maintenanceError.message }, { status: 500 });
  }

  const maintenanceIds = (expiredMaintenances ?? []).map((m) => m.id);
  if (maintenanceIds.length === 0) {
    return NextResponse.json({ deletedPhotos: 0, deletedObjects: 0 });
  }

  const { data: suiteVisits, error: suiteError } = await admin
    .from("suite_visits")
    .select("id")
    .in("maintenance_id", maintenanceIds);

  if (suiteError) {
    return NextResponse.json({ error: suiteError.message }, { status: 500 });
  }

  const suiteVisitIds = (suiteVisits ?? []).map((s) => s.id);
  if (suiteVisitIds.length === 0) {
    return NextResponse.json({ deletedPhotos: 0, deletedObjects: 0 });
  }

  const { data: unitVisits, error: unitError } = await admin
    .from("hvac_unit_visits")
    .select("id")
    .in("suite_visit_id", suiteVisitIds);

  if (unitError) {
    return NextResponse.json({ error: unitError.message }, { status: 500 });
  }

  const unitVisitIds = (unitVisits ?? []).map((u) => u.id);
  if (unitVisitIds.length === 0) {
    return NextResponse.json({ deletedPhotos: 0, deletedObjects: 0 });
  }

  const { data: photos, error: photoError } = await admin
    .from("visit_photos")
    .select("id, storage_path")
    .in("hvac_unit_visit_id", unitVisitIds);

  if (photoError) {
    return NextResponse.json({ error: photoError.message }, { status: 500 });
  }

  const rows = photos ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ deletedPhotos: 0, deletedObjects: 0 });
  }

  const paths = [...new Set(rows.map((p) => p.storage_path))];
  const ids = rows.map((p) => p.id);

  try {
    await deleteObjects(paths);
  } catch (err) {
    const message = err instanceof Error ? err.message : "R2 delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: deleteError } = await admin.from("visit_photos").delete().in("id", ids);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    deletedPhotos: ids.length,
    deletedObjects: paths.length,
  });
}

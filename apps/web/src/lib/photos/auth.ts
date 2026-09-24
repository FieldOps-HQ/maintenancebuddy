import "server-only";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@maintenancebuddy/supabase";
import { createClient } from "@/lib/supabase/server";

type Authed = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: "admin" | "technician";
  organizationId: string;
};

export async function requirePhotoUser(
  request: Request
): Promise<Authed | { error: NextResponse }> {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const supabase = bearer
    ? createSupabaseJsClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      )
    : await createClient();

  const {
    data: { user },
    error: userError,
  } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id || !profile.role) {
    return { error: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };
  }

  return {
    supabase,
    userId: user.id,
    role: profile.role,
    organizationId: profile.organization_id,
  };
}

async function getMaintenanceAccess(
  supabase: Authed["supabase"],
  maintenanceId: string
): Promise<{ organizationId: string; status: string } | null> {
  const { data } = await supabase
    .from("maintenances")
    .select("id, status, buildings!inner(organization_id)")
    .eq("id", maintenanceId)
    .maybeSingle();

  if (!data) return null;

  const buildings = data.buildings as
    | { organization_id: string }
    | { organization_id: string }[]
    | null;
  const organizationId = Array.isArray(buildings)
    ? buildings[0]?.organization_id
    : buildings?.organization_id;

  if (!organizationId) return null;
  return { organizationId, status: data.status };
}

export async function assertCanUploadPhoto(
  auth: Authed,
  maintenanceId: string
): Promise<NextResponse | null> {
  const maintenance = await getMaintenanceAccess(auth.supabase, maintenanceId);
  if (!maintenance || maintenance.organizationId !== auth.organizationId) {
    return NextResponse.json({ error: "Maintenance not found" }, { status: 404 });
  }

  if (auth.role === "admin") {
    return null;
  }

  const { data: assignment } = await auth.supabase
    .from("maintenance_assignments")
    .select("id")
    .eq("maintenance_id", maintenanceId)
    .eq("technician_id", auth.userId)
    .maybeSingle();

  if (
    !assignment ||
    (maintenance.status !== "scheduled" && maintenance.status !== "in_progress")
  ) {
    return NextResponse.json({ error: "Not allowed to upload photos" }, { status: 403 });
  }

  return null;
}

export async function assertCanReadMaintenance(
  auth: Authed,
  maintenanceId: string
): Promise<NextResponse | null> {
  const maintenance = await getMaintenanceAccess(auth.supabase, maintenanceId);
  if (!maintenance || maintenance.organizationId !== auth.organizationId) {
    return NextResponse.json({ error: "Maintenance not found" }, { status: 404 });
  }

  if (auth.role === "admin") {
    return null;
  }

  const { data: assignment } = await auth.supabase
    .from("maintenance_assignments")
    .select("id")
    .eq("maintenance_id", maintenanceId)
    .eq("technician_id", auth.userId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Not allowed to view photos" }, { status: 403 });
  }

  return null;
}

/** Admin-only destructive ops (reopen reset). */
export async function assertCanDeletePhotos(
  auth: Authed,
  maintenanceId: string
): Promise<NextResponse | null> {
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return assertCanReadMaintenance(auth, maintenanceId);
}

export function maintenanceIdFromPath(storagePath: string): string | null {
  const segment = storagePath.split("/")[0];
  return segment && segment.length > 0 ? segment : null;
}

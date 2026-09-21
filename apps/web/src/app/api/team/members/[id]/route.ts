import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/team/auth";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireOrgAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  if (id === auth.profile.id) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  const { data: member, error: memberError } = await auth.supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("organization_id", auth.profile.organization_id)
    .single();

  if (memberError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.role === "admin") {
    const { count } = await auth.supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", auth.profile.organization_id)
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot remove the last admin." }, { status: 400 });
    }
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

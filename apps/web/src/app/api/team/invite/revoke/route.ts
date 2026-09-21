import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/team/auth";
import { createServiceClient } from "@/lib/supabase/service";

const revokeSchema = z.object({
  invite_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireOrgAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invite id" }, { status: 400 });
  }

  const { data: invite, error: inviteError } = await auth.supabase
    .from("organization_invites")
    .select("*")
    .eq("id", parsed.data.invite_id)
    .eq("organization_id", auth.profile.organization_id)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Only pending invites can be revoked" }, { status: 400 });
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

  const { data: memberProfile } = await admin
    .from("profiles")
    .select("id, role")
    .eq("organization_id", auth.profile.organization_id)
    .ilike("email", invite.email)
    .maybeSingle();

  if (memberProfile?.role === "technician") {
    const { error: deleteError } = await admin.auth.admin.deleteUser(memberProfile.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await auth.supabase
    .from("organization_invites")
    .update({ status: "revoked" })
    .eq("id", invite.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

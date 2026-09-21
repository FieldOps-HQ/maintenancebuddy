import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@/lib/team/auth";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  invite_id: z.string().uuid(),
});

/** Regenerates a PKCE-safe accept URL for a pending invite. */
export async function POST(request: Request) {
  const auth = await requireOrgAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
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
    return NextResponse.json({ error: "Invite is not pending" }, { status: 400 });
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

  const origin = new URL(request.url).origin;
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: invite.email,
    options: {
      data: {
        full_name: invite.full_name ?? invite.email.split("@")[0],
        role: "technician",
      },
      redirectTo: `${origin}/invite/complete`,
    },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkError?.message ?? "Failed to generate link" },
      { status: 500 }
    );
  }

  if (linkData.user?.id) {
    await admin.auth.admin.updateUserById(linkData.user.id, {
      app_metadata: {
        organization_id: auth.profile.organization_id,
        role: "technician",
      },
    });
  }

  const acceptUrl = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    linkData.properties.hashed_token
  )}&type=invite&next=${encodeURIComponent("/invite/complete")}`;

  return NextResponse.json({ accept_url: acceptUrl });
}

import { NextResponse } from "next/server";
import { teamInviteSchema } from "@maintenancebuddy/shared";
import { requireOrgAdmin } from "@/lib/team/auth";
import { createServiceClient } from "@/lib/supabase/service";

function buildAcceptUrl(origin: string, hashedToken: string) {
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    hashedToken
  )}&type=invite&next=${encodeURIComponent("/invite/complete")}`;
}

export async function POST(request: Request) {
  const auth = await requireOrgAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = teamInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const fullName = parsed.data.full_name?.trim() || null;
  const { profile } = auth;

  const { data: existingMember } = await auth.supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .ilike("email", email)
    .maybeSingle();

  if (existingMember) {
    return NextResponse.json({ error: "That email is already on your team." }, { status: 409 });
  }

  const { data: existingInvite } = await auth.supabase
    .from("organization_invites")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();

  if (existingInvite) {
    return NextResponse.json({ error: "An invite is already pending for that email." }, { status: 409 });
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

  const { data: invite, error: inviteInsertError } = await auth.supabase
    .from("organization_invites")
    .insert({
      organization_id: profile.organization_id,
      email,
      full_name: fullName,
      invited_by: profile.id,
      status: "pending",
    })
    .select("*")
    .single();

  if (inviteInsertError || !invite) {
    return NextResponse.json(
      { error: inviteInsertError?.message ?? "Failed to create invite" },
      { status: 500 }
    );
  }

  const origin = new URL(request.url).origin;
  const userMeta = {
    full_name: fullName ?? email.split("@")[0],
    role: "technician",
  };

  // Single token_hash link via generateLink. Do NOT also call inviteUserByEmail —
  // that sends a second invite and invalidates this token (email click then fails).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: userMeta,
      redirectTo: `${origin}/invite/complete`,
    },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    await auth.supabase.from("organization_invites").delete().eq("id", invite.id);
    return NextResponse.json(
      {
        error:
          linkError?.message ??
          "Invite could not be created (accept link generation failed).",
      },
      { status: 500 }
    );
  }

  const userId = linkData.user?.id;
  if (userId) {
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        organization_id: profile.organization_id,
        role: "technician",
      },
    });
  }

  return NextResponse.json({
    invite,
    accept_url: buildAcceptUrl(origin, linkData.properties.hashed_token),
    email_sent: false,
  });
}

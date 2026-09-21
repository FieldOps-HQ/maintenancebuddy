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

  // Create auth user + send Supabase invite email (template should use TokenHash → /auth/confirm).
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: userMeta,
    redirectTo: `${origin}/invite/complete`,
  });

  if (inviteError && !inviteError.message.toLowerCase().includes("already")) {
    await auth.supabase.from("organization_invites").delete().eq("id", invite.id);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const userId = invited?.user?.id;
  if (userId) {
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        organization_id: profile.organization_id,
        role: "technician",
      },
    });
  }

  // Fresh token_hash link that works without PKCE (share this if email link fails).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: userMeta,
      redirectTo: `${origin}/invite/complete`,
    },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json({
      invite,
      accept_url: null,
      email_sent: !inviteError,
      error: linkError?.message ?? "Invite created but accept link could not be generated.",
    });
  }

  if (linkData.user?.id) {
    await admin.auth.admin.updateUserById(linkData.user.id, {
      app_metadata: {
        organization_id: profile.organization_id,
        role: "technician",
      },
    });
  }

  return NextResponse.json({
    invite,
    accept_url: buildAcceptUrl(origin, linkData.properties.hashed_token),
    email_sent: !inviteError,
  });
}

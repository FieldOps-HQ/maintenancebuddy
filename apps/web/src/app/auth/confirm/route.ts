import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@maintenancebuddy/supabase";
import { safeAuthRedirectPath } from "@/lib/auth-redirect";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Invite / OTP confirmation. Sets the session on the redirect response so
 * /invite/complete can show the set-password form.
 *
 * Accept URL shape:
 * /auth/confirm?token_hash=...&type=invite&next=/invite/complete
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeAuthRedirectPath(
    searchParams.get("next"),
    "/invite/complete"
  );

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/invite/complete?error=missing_token`);
  }

  const cookieStore = await cookies();
  let successRedirect = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            successRedirect.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/invite/complete?error=${encodeURIComponent(error?.message ?? "invalid_token")}`
    );
  }

  if (data.user.email) {
    try {
      const admin = createServiceClient();
      await admin
        .from("organization_invites")
        .update({ status: "accepted" })
        .eq("status", "pending")
        .ilike("email", data.user.email);
    } catch {
      // non-fatal
    }
  }

  return successRedirect;
}

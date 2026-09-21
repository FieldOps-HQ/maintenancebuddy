import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@maintenancebuddy/supabase";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Email invite / OTP confirmation endpoint.
 * Expects: /auth/confirm?token_hash=...&type=invite&next=/invite/complete
 *
 * Use this with the Invite email template:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/invite/complete
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/invite/complete";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/invite/complete?error=missing_token`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // ignore
          }
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

  const dest = next.startsWith("/") ? next : "/invite/complete";
  return NextResponse.redirect(`${origin}${dest}`);
}

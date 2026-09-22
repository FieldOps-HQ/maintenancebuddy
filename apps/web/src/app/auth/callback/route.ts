import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@maintenancebuddy/supabase";
import { safeAuthRedirectPath } from "@/lib/auth-redirect";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeAuthRedirectPath(searchParams.get("next"), "/");

  // Prefer sending invitees straight to the set-password page with the same params.
  // That page handles code / token_hash / hash fragments client-side.
  if (
    type === "invite" ||
    type === "signup" ||
    (tokenHash && type) ||
    searchParams.get("redirect_to")?.includes("/invite")
  ) {
    const complete = new URL(`${origin}/invite/complete`);
    searchParams.forEach((value, key) => {
      if (key !== "next") complete.searchParams.set(key, value);
    });
    return NextResponse.redirect(complete);
  }

  if (code || tokenHash) {
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
              // ignore in route handler edge cases
            }
          },
        },
      }
    );

    let authError = null as { message: string } | null;

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      authError = error;
    } else if (tokenHash && type) {
      const otpType =
        type === "signup" ? "signup" : type === "magiclink" ? "magiclink" : "invite";
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      authError = error;
    }

    if (!authError) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.email) {
        try {
          const admin = createServiceClient();
          await admin
            .from("organization_invites")
            .update({ status: "accepted" })
            .eq("status", "pending")
            .ilike("email", user.email);
        } catch {
          // Service role may be unset; invite can stay pending.
        }
      }

      const { data: profile } = user
        ? await supabase.from("profiles").select("role").eq("id", user.id).single()
        : { data: null };

      if (profile?.role === "technician" || type === "invite") {
        return NextResponse.redirect(`${origin}/invite/complete`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Invite flows should never dump onto the admin login page.
  if (type === "invite" || searchParams.has("token_hash")) {
    return NextResponse.redirect(`${origin}/invite/complete?error=auth_callback`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}

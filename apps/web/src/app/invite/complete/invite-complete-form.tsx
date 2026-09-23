"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/layout/auth-shell";
import { Wrench } from "lucide-react";

type Phase = "loading" | "no_session" | "set_password" | "done";

async function establishInviteSession() {
  const supabase = createClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const urlError = url.searchParams.get("error");

  if (urlError && urlError !== "auth_callback") {
    throw new Error(decodeURIComponent(urlError));
  }

  // Implicit redirect fragments from Supabase verify
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const hashError = hashParams.get("error_description") || hashParams.get("error");

  if (hashError) {
    throw new Error(hashError.replace(/\+/g, " "));
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  } else if (tokenHash && type) {
    // Prefer hitting /auth/confirm from the email; handle token_hash here as a fallback.
    const otpType =
      type === "signup" ? "signup" : type === "magiclink" ? "magiclink" : "invite";
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (error) throw error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(
        `${error.message} If you opened an email invite, ask your admin for a fresh invite link (token_hash), or update the Supabase Invite email template.`
      );
    }
  } else {
    await supabase.auth.getSession();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    try {
      await fetch("/api/team/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
    } catch {
      // non-fatal
    }
  }

  if (code || tokenHash || accessToken) {
    window.history.replaceState({}, "", "/invite/complete");
  }

  return user;
}

export default function InviteCompleteForm() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const user = await establishInviteSession();
        if (cancelled) return;

        if (!user) {
          setPhase("no_session");
          return;
        }

        const supabase = createClient();
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, email")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        if (profile?.role === "admin") {
          window.location.href = "/";
          return;
        }

        setEmail(user.email ?? profile?.email ?? "");
        setPhase("set_password");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not open this invite.");
        setPhase("no_session");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setPhase("done");
    setLoading(false);
  }

  return (
    <AuthShell
      headline="Join your maintenance team"
      subline="Set a password, then sign in on the MaintenanceBuddy mobile app."
    >
      <div className="mb-8 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-white">
            <Wrench className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">MaintenanceBuddy</span>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {phase === "done" ? "You're all set" : "Accept your invite"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {phase === "done"
            ? "Your technician account is ready"
            : "Create a password to finish joining your team"}
        </p>
      </div>

      <div className="mt-8">
        {phase === "loading" && (
          <p className="text-sm text-muted-foreground">Checking your invite…</p>
        )}

        {phase === "no_session" && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              This invite link is missing or expired. Ask your admin to resend or share a fresh
              invite link from the Team page.
            </p>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <p>After you set a password, sign in with the MaintenanceBuddy mobile app.</p>
          </div>
        )}

        {phase === "set_password" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {email && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} disabled />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Set password"}
            </Button>
          </form>
        )}

        {phase === "done" && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Open <span className="font-medium text-foreground">MaintenanceBuddy</span> on your
              phone and sign in with:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {email && (
                <li>
                  Email: <span className="font-medium text-foreground">{email}</span>
                </li>
              )}
              <li>The password you just created</li>
            </ul>
            <p>
              The admin dashboard is for organization admins only. Technicians use the mobile app.
            </p>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

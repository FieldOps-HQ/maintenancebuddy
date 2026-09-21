"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100/80 via-slate-50 to-slate-50" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-slate-200/40 blur-3xl" />

      <Card className="relative w-full max-w-md border-slate-200/80 shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-2xl text-slate-900">
              {phase === "done" ? "You're all set" : "Accept your invite"}
            </CardTitle>
            <CardDescription className="mt-1">
              {phase === "done"
                ? "Your technician account is ready"
                : "Create a password to finish joining your team"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {phase === "loading" && (
            <p className="text-center text-sm text-slate-500">Checking your invite…</p>
          )}

          {phase === "no_session" && (
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                This invite link is missing or expired. Ask your admin to resend or share a fresh
                invite link from the Team page.
              </p>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <p className="text-slate-500">
                After you set a password, sign in with the MaintenanceBuddy mobile app.
              </p>
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
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving…" : "Set password"}
              </Button>
            </form>
          )}

          {phase === "done" && (
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                Open <span className="font-medium text-slate-900">MaintenanceBuddy</span> on your
                phone and sign in with:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {email && (
                  <li>
                    Email: <span className="font-medium text-slate-900">{email}</span>
                  </li>
                )}
                <li>The password you just created</li>
              </ul>
              <p className="text-slate-500">
                The admin dashboard is for organization admins only. Technicians use the mobile app.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

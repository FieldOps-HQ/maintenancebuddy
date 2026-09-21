"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { teamInviteSchema } from "@maintenancebuddy/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TeamInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [acceptUrl, setAcceptUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setAcceptUrl("");
    setCopied(false);

    const parsed = teamInviteSchema.safeParse({
      email,
      full_name: fullName || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "Failed to send invite");
      setLoading(false);
      return;
    }

    setEmail("");
    setFullName("");
    setSuccess(
      data.email_sent
        ? `Invite created for ${parsed.data.email}. Share the accept link below (email links may not work until the Supabase Invite template is updated).`
        : `Invite created for ${parsed.data.email}. Share the accept link below.`
    );
    if (data.accept_url) setAcceptUrl(data.accept_url);
    router.refresh();
    setLoading(false);
  }

  async function copyLink() {
    if (!acceptUrl) return;
    await navigator.clipboard.writeText(acceptUrl);
    setCopied(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite_email">Email</Label>
          <Input
            id="invite_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tech@company.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite_name">Name (optional)</Label>
          <Input
            id="invite_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Rivera"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
      {acceptUrl && (
        <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/80 p-3">
          <p className="text-sm font-medium text-slate-800">Accept link (send to technician)</p>
          <p className="break-all text-xs text-slate-600">{acceptUrl}</p>
          <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
      <Button type="submit" disabled={loading} size="sm">
        {loading ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrganizationInvite, Profile } from "@maintenancebuddy/shared";
import { teamMemberUpdateSchema } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function PendingInviteRow({ invite }: { invite: OrganizationInvite }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    setLoading(true);
    setError("");
    setCopied(false);
    const res = await fetch("/api/team/invite/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: invite.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.accept_url) {
      setError(data.error ?? "Failed to generate link");
      setLoading(false);
      return;
    }
    await navigator.clipboard.writeText(data.accept_url);
    setCopied(true);
    setLoading(false);
  }

  async function handleRevoke() {
    if (!confirm(`Revoke invite for ${invite.email}?`)) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/team/invite/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: invite.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to revoke invite");
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-slate-900">{invite.full_name || invite.email}</p>
        <p className="text-sm text-slate-500">{invite.email}</p>
        <p className="mt-1 text-xs text-slate-400">
          Invited {new Date(invite.created_at).toLocaleDateString()}
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Pending</Badge>
        <Button variant="ghost" size="sm" onClick={handleCopyLink} disabled={loading}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={loading}>
          Revoke
        </Button>
      </div>
    </div>
  );
}

export function TeamMemberRow({
  member,
  currentUserId,
}: {
  member: Profile;
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(member.full_name);
  const [role, setRole] = useState(member.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isSelf = member.id === currentUserId;

  async function handleSave() {
    setLoading(true);
    setError("");
    const parsed = teamMemberUpdateSchema.safeParse({ full_name: fullName, role });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update(parsed.data)
      .eq("id", member.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setEditing(false);
    router.refresh();
    setLoading(false);
  }

  async function handleRemove() {
    if (!confirm(`Remove ${member.full_name} from the team? This deletes their account.`)) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/team/members/${member.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to remove member");
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="rounded-lg border border-slate-100 px-4 py-3">
      {editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "technician")}
            >
              <option value="admin">Admin</option>
              <option value="technician">Technician</option>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={loading}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setFullName(member.full_name);
                setRole(member.role);
                setError("");
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900">{member.full_name}</p>
              <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                {member.role === "admin" ? "Admin" : "Technician"}
              </Badge>
              {isSelf && <Badge variant="outline">You</Badge>}
            </div>
            <p className="text-sm text-slate-500">{member.email}</p>
            <p className="mt-1 text-xs text-slate-400">
              Joined {new Date(member.created_at).toLocaleDateString()}
            </p>
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={loading}>
              Edit
            </Button>
            {!isSelf && (
              <Button size="sm" variant="ghost" onClick={handleRemove} disabled={loading}>
                Remove
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { createClient, getProfile } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { TeamInviteForm } from "@/components/team/team-invite-form";
import { PendingInviteRow, TeamMemberRow } from "@/components/team/team-member-row";
import type { OrganizationInvite, Profile } from "@maintenancebuddy/shared";

export default async function TeamPage() {
  const supabase = await createClient();
  const profile = await getProfile();

  const [{ data: members }, { data: invites }, { data: organization }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase
      .from("organization_invites")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    profile
      ? supabase.from("organizations").select("name").eq("id", profile.organization_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const pending = (invites ?? []) as OrganizationInvite[];
  const pendingEmails = new Set(pending.map((i) => i.email.toLowerCase()));
  const activeMembers = ((members ?? []) as Profile[]).filter(
    (m) => !pendingEmails.has(m.email.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description={
          organization?.name
            ? `Manage members for ${organization.name}`
            : "Invite technicians and manage organization members."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite technician</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamInviteForm />
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((invite) => (
              <PendingInviteRow key={invite.id} invite={invite} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({activeMembers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!activeMembers.length ? (
            <p className="text-sm text-slate-500">No active members yet.</p>
          ) : (
            activeMembers.map((member) => (
              <TeamMemberRow
                key={member.id}
                member={member}
                currentUserId={profile?.id ?? ""}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

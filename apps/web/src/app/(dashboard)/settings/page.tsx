import { createClient, getProfile } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { OrganizationBrandingForm } from "@/components/settings/organization-branding-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await getProfile();

  if (!profile) {
    return (
      <div className="space-y-8">
        <PageHeader title="Settings" description="Manage your company branding." />
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Unable to load your profile.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, logo_path")
    .eq("id", profile.organization_id)
    .single();

  let logoUrl: string | null = null;
  if (organization?.logo_path) {
    const { data } = await supabase.storage
      .from("organization-logos")
      .createSignedUrl(organization.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Set your company name and logo for PDF reports."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company branding</CardTitle>
        </CardHeader>
        <CardContent>
          {organization ? (
            <OrganizationBrandingForm
              organizationId={organization.id}
              initialName={organization.name}
              initialLogoPath={organization.logo_path}
              initialLogoUrl={logoUrl}
            />
          ) : (
            <p className="text-sm text-slate-500">Organization not found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { MaintenanceReportDocument } from "@/components/reports/maintenance-report-document";
import { formatDate } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ maintenanceId: string }> }
) {
  const { maintenanceId } = await params;
  const download = request.nextUrl.searchParams.get("download") === "true";
  const supabase = await createClient();

  const { data: maintenance } = await supabase
    .from("maintenances")
    .select(`
      *,
      building:buildings(*),
      assignments:maintenance_assignments(technician:profiles(full_name)),
      suite_visits(
        *,
        suite:suites(*),
        hvac_unit_visits(
          *,
          hvac_unit:hvac_units(name),
          deficiencies:deficiencies!deficiencies_hvac_unit_visit_id_fkey(*)
        )
      )
    `)
    .eq("id", maintenanceId)
    .single();

  if (!maintenance) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const organizationId = maintenance.building?.organization_id;
  let organizationName = "MaintenanceBuddy";
  let logoUrl: string | null = null;

  if (organizationId) {
    const { data: organization } = await supabase
      .from("organizations")
      .select("name, logo_path")
      .eq("id", organizationId)
      .single();

    if (organization?.name) {
      organizationName = organization.name;
    }

    if (organization?.logo_path) {
      const { data: signed } = await supabase.storage
        .from("organization-logos")
        .createSignedUrl(organization.logo_path, 3600);
      logoUrl = signed?.signedUrl ?? null;
    }
  }

  const { data: filterSummary } = await supabase
    .from("maintenance_filter_summary")
    .select("*")
    .eq("maintenance_id", maintenanceId);

  const buffer = await renderToBuffer(
    MaintenanceReportDocument({
      organization: {
        name: organizationName,
        logoUrl,
      },
      maintenance,
      filterSummary: filterSummary ?? [],
    })
  );

  const rawName = maintenance.building?.name?.replace(/\s+/g, "-") ?? "maintenance";
  const safeName =
    rawName.replace(/[^a-zA-Z0-9._-]/g, "").replace(/["\r\n]/g, "") || "report";
  const filename = `${safeName}-${formatDate(maintenance.start_date)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}

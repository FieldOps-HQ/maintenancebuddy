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
      suite_visits(*, suite:suites(*), deficiencies(*))
    `)
    .eq("id", maintenanceId)
    .single();

  if (!maintenance) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: filterSummary } = await supabase
    .from("maintenance_filter_summary")
    .select("*")
    .eq("maintenance_id", maintenanceId);

  const buffer = await renderToBuffer(
    MaintenanceReportDocument({
      maintenance,
      filterSummary: filterSummary ?? [],
    })
  );

  const filename = `${maintenance.building?.name?.replace(/\s+/g, "-") ?? "maintenance"}-${formatDate(maintenance.start_date)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}

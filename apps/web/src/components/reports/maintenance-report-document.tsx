import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { SUITE_VISIT_STATUS_LABELS, formatBuildingAddress } from "@maintenancebuddy/shared";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4, fontWeight: "bold" },
  subtitle: { fontSize: 11, color: "#666", marginBottom: 20 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 8, borderBottom: "1 solid #eee", paddingBottom: 4 },
  row: { flexDirection: "row", borderBottom: "1 solid #f0f0f0", paddingVertical: 4 },
  cell: { flex: 1 },
  cellSm: { width: 50 },
  cellMd: { width: 70 },
  header: { flexDirection: "row", backgroundColor: "#f5f5f5", paddingVertical: 6, fontWeight: "bold" },
  stat: { flexDirection: "row", gap: 20, marginBottom: 12 },
  statItem: { fontSize: 11 },
});

interface ReportUnitRow {
  suite_number: string;
  unit_name: string;
  suite_status: string;
  unit_status: string;
  cleaned: boolean | null;
  filter_changed: boolean | null;
  operating_normally: boolean | null;
  deficiencies: { category: string; description: string }[];
}

interface ReportProps {
  maintenance: {
    start_date: string;
    end_date: string;
    status: string;
    notes: string | null;
    building: {
      name: string;
      street_number: string;
      street: string;
      city: string;
      postal_code: string;
    } | null;
    assignments: { technician: { full_name: string } | null }[];
    suite_visits: {
      status: string;
      suite: { suite_number: string } | null;
      hvac_unit_visits: {
        status: string;
        cleaned: boolean | null;
        filter_changed: boolean | null;
        operating_normally: boolean | null;
        hvac_unit: { name: string } | null;
        deficiencies: { category: string; description: string }[];
      }[];
    }[];
  };
  filterSummary: { filter_size: string; total_quantity: number }[];
}

function buildUnitRows(maintenance: ReportProps["maintenance"]): ReportUnitRow[] {
  const rows: ReportUnitRow[] = [];

  for (const visit of maintenance.suite_visits ?? []) {
    const unitVisits = visit.hvac_unit_visits ?? [];
    if (unitVisits.length === 0) {
      rows.push({
        suite_number: visit.suite?.suite_number ?? "",
        unit_name: "—",
        suite_status: visit.status,
        unit_status: visit.status,
        cleaned: null,
        filter_changed: null,
        operating_normally: null,
        deficiencies: [],
      });
      continue;
    }

    for (const uv of unitVisits) {
      rows.push({
        suite_number: visit.suite?.suite_number ?? "",
        unit_name: uv.hvac_unit?.name ?? "Unit",
        suite_status: visit.status,
        unit_status: uv.status,
        cleaned: uv.cleaned,
        filter_changed: uv.filter_changed,
        operating_normally: uv.operating_normally,
        deficiencies: uv.deficiencies ?? [],
      });
    }
  }

  return rows.sort((a, b) =>
    a.suite_number.localeCompare(b.suite_number, undefined, { numeric: true }) ||
    a.unit_name.localeCompare(b.unit_name)
  );
}

export function MaintenanceReportDocument({ maintenance, filterSummary }: ReportProps) {
  const visits = maintenance.suite_visits ?? [];
  const completed = visits.filter((v) => v.status === "completed").length;
  const techs = maintenance.assignments?.map((a) => a.technician?.full_name).filter(Boolean).join(", ");
  const unitRows = buildUnitRows(maintenance);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>HVAC Maintenance Report</Text>
        <Text style={styles.subtitle}>
          {maintenance.building?.name} —{" "}
          {maintenance.building ? formatBuildingAddress(maintenance.building) : ""}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text>Period: {maintenance.start_date} to {maintenance.end_date}</Text>
          <Text>Status: {maintenance.status}</Text>
          <Text>Technicians: {techs || "—"}</Text>
          <View style={styles.stat}>
            <Text style={styles.statItem}>Completed suites: {completed}/{visits.length}</Text>
          </View>
        </View>

        {filterSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Filter Requirements</Text>
            {filterSummary.map((f) => (
              <Text key={f.filter_size}>{f.filter_size}: {f.total_quantity} filters</Text>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Unit Details</Text>
          <View style={styles.header}>
            <Text style={styles.cellSm}>Suite</Text>
            <Text style={styles.cellMd}>Unit</Text>
            <Text style={styles.cell}>Status</Text>
            <Text style={styles.cell}>Cleaned</Text>
            <Text style={styles.cell}>Filter</Text>
            <Text style={styles.cell}>Operating</Text>
          </View>
          {unitRows.map((row, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.cellSm}>{row.suite_number}</Text>
              <Text style={styles.cellMd}>{row.unit_name}</Text>
              <Text style={styles.cell}>
                {SUITE_VISIT_STATUS_LABELS[row.unit_status as keyof typeof SUITE_VISIT_STATUS_LABELS] ?? row.unit_status}
              </Text>
              <Text style={styles.cell}>{row.cleaned === null ? "—" : row.cleaned ? "Yes" : "No"}</Text>
              <Text style={styles.cell}>{row.filter_changed === null ? "—" : row.filter_changed ? "Yes" : "No"}</Text>
              <Text style={styles.cell}>{row.operating_normally === null ? "—" : row.operating_normally ? "Yes" : "No"}</Text>
            </View>
          ))}
        </View>

        {unitRows.some((r) => r.deficiencies.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deficiencies</Text>
            {unitRows
              .filter((r) => r.deficiencies.length > 0)
              .map((r, i) => (
                <View key={i}>
                  <Text style={{ fontWeight: "bold" }}>
                    Suite {r.suite_number} — {r.unit_name}
                  </Text>
                  {r.deficiencies.map((d, j) => (
                    <Text key={j}>  • {d.description}</Text>
                  ))}
                </View>
              ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

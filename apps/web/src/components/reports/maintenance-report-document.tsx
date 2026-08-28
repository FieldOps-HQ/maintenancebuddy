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
  cellSm: { width: 60 },
  header: { flexDirection: "row", backgroundColor: "#f5f5f5", paddingVertical: 6, fontWeight: "bold" },
  stat: { flexDirection: "row", gap: 20, marginBottom: 12 },
  statItem: { fontSize: 11 },
});

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
      cleaned: boolean | null;
      filter_changed: boolean | null;
      operating_normally: boolean | null;
      visited_at: string | null;
      suite: { suite_number: string; filter_size: string | null } | null;
      deficiencies: { category: string; description: string }[];
    }[];
  };
  filterSummary: { filter_size: string; total_quantity: number }[];
}

export function MaintenanceReportDocument({ maintenance, filterSummary }: ReportProps) {
  const visits = maintenance.suite_visits ?? [];
  const completed = visits.filter((v) => v.status === "completed").length;
  const techs = maintenance.assignments?.map((a) => a.technician?.full_name).filter(Boolean).join(", ");

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
            <Text style={styles.statItem}>Completed: {completed}/{visits.length}</Text>
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
          <Text style={styles.sectionTitle}>Suite Details</Text>
          <View style={styles.header}>
            <Text style={styles.cellSm}>Suite</Text>
            <Text style={styles.cell}>Status</Text>
            <Text style={styles.cell}>Cleaned</Text>
            <Text style={styles.cell}>Filter</Text>
            <Text style={styles.cell}>Operating</Text>
          </View>
          {visits
            .sort((a, b) => (a.suite?.suite_number ?? "").localeCompare(b.suite?.suite_number ?? "", undefined, { numeric: true }))
            .map((v, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.cellSm}>{v.suite?.suite_number}</Text>
                <Text style={styles.cell}>{SUITE_VISIT_STATUS_LABELS[v.status as keyof typeof SUITE_VISIT_STATUS_LABELS] ?? v.status}</Text>
                <Text style={styles.cell}>{v.cleaned === null ? "—" : v.cleaned ? "Yes" : "No"}</Text>
                <Text style={styles.cell}>{v.filter_changed === null ? "—" : v.filter_changed ? "Yes" : "No"}</Text>
                <Text style={styles.cell}>{v.operating_normally === null ? "—" : v.operating_normally ? "Yes" : "No"}</Text>
              </View>
            ))}
        </View>

        {visits.some((v) => v.deficiencies?.length) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deficiencies</Text>
            {visits
              .filter((v) => v.deficiencies?.length)
              .map((v, i) => (
                <View key={i}>
                  <Text style={{ fontWeight: "bold" }}>Suite {v.suite?.suite_number}</Text>
                  {v.deficiencies?.map((d, j) => (
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

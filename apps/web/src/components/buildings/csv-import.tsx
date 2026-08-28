"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseCsvSuites } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function CsvImport({ buildingId }: { buildingId: string }) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleImport() {
    setLoading(true);
    setMessage("");

    try {
      const suites = parseCsvSuites(csv);
      if (!suites.length) {
        setMessage("No valid suites found in CSV.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.from("suites").insert(
        suites.map((s) => ({ ...s, building_id: buildingId }))
      );

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(`Imported ${suites.length} suites.`);
        setCsv("");
        router.refresh();
      }
    } catch {
      setMessage("Failed to parse CSV.");
    }

    setLoading(false);
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-zinc-200 p-4">
      <Label>Bulk Import (CSV)</Label>
      <p className="text-xs text-zinc-500">
        Format: suite_number, floor, filter_size, filter_quantity
      </p>
      <Textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={"201, 2, 16x25x1, 1\n202, 2, 16x25x1, 1"}
        rows={4}
      />
      <Button onClick={handleImport} disabled={loading || !csv.trim()} size="sm" variant="outline">
        {loading ? "Importing..." : "Import Suites"}
      </Button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </div>
  );
}

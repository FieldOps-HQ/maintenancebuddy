"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function DownloadReportButton({ maintenanceId }: { maintenanceId: string }) {
  return (
    <a href={`/api/reports/${maintenanceId}`} target="_blank" rel="noopener noreferrer">
      <Button variant="outline">
        <Download className="mr-2 h-4 w-4" /> Download PDF Report
      </Button>
    </a>
  );
}

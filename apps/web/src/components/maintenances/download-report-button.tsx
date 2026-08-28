"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eye, X } from "lucide-react";

export function DownloadReportButton({ maintenanceId }: { maintenanceId: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewUrl = `/api/reports/${maintenanceId}`;
  const downloadUrl = `/api/reports/${maintenanceId}?download=true`;

  return (
    <>
      <Button variant="outline" onClick={() => setPreviewOpen(true)}>
        <Eye className="mr-2 h-4 w-4" /> Preview Report
      </Button>

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewOpen(false)} />
          <div className="relative z-10 flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <h2 className="text-lg font-semibold">Report Preview</h2>
              <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <iframe
              src={previewUrl}
              title="Maintenance report preview"
              className="min-h-0 flex-1 w-full border-0 bg-zinc-100"
            />

            <div className="flex justify-end gap-2 border-t border-zinc-200 px-6 py-4">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              <a href={downloadUrl} download>
                <Button>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function MaintenanceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Maintenance detail failed to load:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Couldn’t load this maintenance</h2>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          The request timed out or failed. This is usually temporary — try again.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

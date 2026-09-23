import { Wrench } from "lucide-react";

export function AuthShell({
  children,
  headline = "Dispatch & track HVAC maintenance",
  subline = "One console for buildings, technicians, and suite-level progress.",
}: {
  children: React.ReactNode;
  headline?: string;
  subline?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-blueprint relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-950/80 via-transparent to-amber-950/40" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-500 text-white">
            <Wrench className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            MaintenanceBuddy
          </span>
        </div>
        <div className="relative max-w-md space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-teal-300/80">
            Field operations
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            {headline}
          </h2>
          <p className="text-base leading-relaxed text-zinc-400">{subline}</p>
        </div>
        <p className="relative font-mono text-[11px] text-zinc-600">
          Suite visits · live progress · PDF reports
        </p>
      </div>

      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

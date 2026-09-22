export default function MaintenanceDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="h-8 w-64 rounded-lg bg-slate-200" />
          <div className="h-4 w-40 rounded bg-slate-100" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-slate-200" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 h-5 w-24 rounded bg-slate-200" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
          {Array.from({ length: 24 }).map((_, index) => (
            <div key={index} className="h-12 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BuildingsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-lg bg-slate-200" />
        <div className="h-4 w-64 rounded bg-slate-100" />
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="h-72 rounded-xl border border-slate-200 bg-white lg:col-span-1" />
        <div className="space-y-3 lg:col-span-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}

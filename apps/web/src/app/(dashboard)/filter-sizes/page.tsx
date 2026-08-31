import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterSizeForm, FilterSizeRow } from "@/components/filter-sizes/filter-size-form";

export default async function FilterSizesPage() {
  const supabase = await createClient();
  const { data: filterSizes } = await supabase
    .from("filter_sizes")
    .select("*")
    .order("length_in")
    .order("width_in")
    .order("thickness_in");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Filter Sizes</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage filter sizes by length, width, and thickness (inches) for suite dropdowns.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Filter Size</CardTitle>
        </CardHeader>
        <CardContent>
          <FilterSizeForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Sizes ({filterSizes?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!filterSizes?.length ? (
            <p className="text-sm text-zinc-500">No filter sizes yet. Add one above.</p>
          ) : (
            filterSizes.map((size) => <FilterSizeRow key={size.id} filterSize={size} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

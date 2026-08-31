import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterSizeForm, FilterSizeRow } from "@/components/filter-sizes/filter-size-form";
import { PageHeader } from "@/components/layout/page-header";

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
      <PageHeader
        title="Filter Sizes"
        description="Manage filter sizes by length, width, and thickness (inches) for suite dropdowns."
      />

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
            <p className="text-sm text-slate-500">No filter sizes yet. Add one above.</p>
          ) : (
            filterSizes.map((size) => <FilterSizeRow key={size.id} filterSize={size} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

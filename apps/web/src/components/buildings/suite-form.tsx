"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suiteSchema, formatFilterSize, formatFilterSizeLabel } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type FilterSizeOption = {
  id: string;
  length_in: number;
  width_in: number;
  thickness_in: number;
};

export function SuiteForm({
  buildingId,
  filterSizes,
}: {
  buildingId: string;
  filterSizes: FilterSizeOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      suite_number: formData.get("suite_number") as string,
      floor: (formData.get("floor") as string) || undefined,
      filter_size: (formData.get("filter_size") as string) || undefined,
      filter_quantity: formData.get("filter_quantity") as string,
    };

    const parsed = suiteSchema.safeParse(data);
    if (!parsed.success) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.from("suites").insert({ ...parsed.data, building_id: buildingId });
    (e.target as HTMLFormElement).reset();
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div>
        <Label htmlFor="suite_number" className="sr-only">Suite</Label>
        <Input id="suite_number" name="suite_number" placeholder="Suite #" required />
      </div>
      <div>
        <Label htmlFor="floor" className="sr-only">Floor</Label>
        <Input id="floor" name="floor" placeholder="Floor" />
      </div>
      <div>
        <Label htmlFor="filter_size" className="sr-only">Filter size</Label>
        <Select id="filter_size" name="filter_size" defaultValue="">
          <option value="" disabled>
            Filter size
          </option>
          {filterSizes.map((size) => {
            const value = formatFilterSize(size);
            return (
              <option key={size.id} value={value}>
                {formatFilterSizeLabel(size)}
              </option>
            );
          })}
        </Select>
      </div>
      <div>
        <Label htmlFor="filter_quantity" className="sr-only">Qty</Label>
        <Input id="filter_quantity" name="filter_quantity" type="number" defaultValue={1} min={0} />
      </div>
      <Button type="submit" disabled={loading || filterSizes.length === 0} size="sm">
        Add
      </Button>
      {filterSizes.length === 0 && (
        <p className="col-span-full text-xs text-zinc-500">
          Add filter sizes under Filter Sizes in the sidebar first.
        </p>
      )}
    </form>
  );
}

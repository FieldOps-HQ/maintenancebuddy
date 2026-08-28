"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suiteSchema } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SuiteForm({ buildingId }: { buildingId: string }) {
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
        <Input id="filter_size" name="filter_size" placeholder="16x25x1" />
      </div>
      <div>
        <Label htmlFor="filter_quantity" className="sr-only">Qty</Label>
        <Input id="filter_quantity" name="filter_quantity" type="number" defaultValue={1} min={0} />
      </div>
      <Button type="submit" disabled={loading} size="sm">
        Add
      </Button>
    </form>
  );
}

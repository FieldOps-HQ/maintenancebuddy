"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildingSchema } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BuildingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      notes: (formData.get("notes") as string) || undefined,
    };

    const parsed = buildingSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: building, error: insertError } = await supabase
      .from("buildings")
      .insert(parsed.data)
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/buildings/${building.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Building Name</Label>
        <Input id="name" name="name" placeholder="Harbour View Condos" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" placeholder="100 Lakeshore Blvd" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="city">City</Label>
        <Input id="city" name="city" placeholder="Toronto" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" placeholder="Optional notes..." />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating..." : "Create Building"}
      </Button>
    </form>
  );
}

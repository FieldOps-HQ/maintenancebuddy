"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { filterSizeSchema, formatFilterSizeLabel } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FilterSizeForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const parsed = filterSizeSchema.safeParse({
      length_in: formData.get("length_in") as string,
      width_in: formData.get("width_in") as string,
      thickness_in: formData.get("thickness_in") as string,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: insertError } = await supabase.from("filter_sizes").insert(parsed.data);

    if (insertError) {
      setError(insertError.code === "23505" ? "That filter size already exists." : insertError.message);
      setLoading(false);
      return;
    }

    (e.target as HTMLFormElement).reset();
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="length_in">Length (L), in</Label>
          <Input id="length_in" name="length_in" type="number" step="1" min="1" placeholder="16" required />
        </div>
        <div>
          <Label htmlFor="width_in">Width (W), in</Label>
          <Input id="width_in" name="width_in" type="number" step="1" min="1" placeholder="25" required />
        </div>
        <div>
          <Label htmlFor="thickness_in">Thickness, in</Label>
          <Input id="thickness_in" name="thickness_in" type="number" step="1" min="1" placeholder="1" required />
        </div>
      </div>
      <Button type="submit" disabled={loading} size="sm">
        Add
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function FilterSizeRow({
  filterSize,
}: {
  filterSize: { id: string; length_in: number; width_in: number; thickness_in: number };
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const label = formatFilterSizeLabel(filterSize);

  async function handleDelete() {
    if (!confirm(`Delete filter size "${label}"?`)) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("filter_sizes").delete().eq("id", filterSize.id);
    router.refresh();
    setDeleting(false);
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-3">
      <p className="font-medium">{label}</p>
      <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}>
        Delete
      </Button>
    </div>
  );
}

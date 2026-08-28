"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildingContactSchema } from "@maintenancebuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactForm({ buildingId }: { buildingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      role: (formData.get("role") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
    };

    const parsed = buildingContactSchema.safeParse(data);
    if (!parsed.success) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.from("building_contacts").insert({ ...parsed.data, building_id: buildingId });
    (e.target as HTMLFormElement).reset();
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Input name="name" placeholder="Name" required />
      <Input name="role" placeholder="Role" />
      <Input name="phone" placeholder="Phone" />
      <Input name="email" type="email" placeholder="Email" />
      <Button type="submit" disabled={loading} size="sm">Add</Button>
    </form>
  );
}

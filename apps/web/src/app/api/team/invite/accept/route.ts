import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  email: z.string().email(),
});

/** Marks a pending invite accepted after the invitee establishes a session. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  if (user.email?.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return NextResponse.json({ error: "Email mismatch" }, { status: 403 });
  }

  try {
    const admin = createServiceClient();
    await admin
      .from("organization_invites")
      .update({ status: "accepted" })
      .eq("status", "pending")
      .ilike("email", parsed.data.email);
  } catch {
    return NextResponse.json({ error: "Could not update invite" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

#!/usr/bin/env node
/**
 * Seeds demo users and a sample maintenance.
 * Run: pnpm seed  (loads .env from project root automatically)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars. Copy .env.example to .env and set:");
  console.error("  SUPABASE_URL");
  console.error("  SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { email: "admin@maintenancebuddy.com", password: "password123", full_name: "Admin User", role: "admin" },
  { email: "tech@maintenancebuddy.com", password: "password123", full_name: "John Technician", role: "technician" },
  { email: "tech2@maintenancebuddy.com", password: "password123", full_name: "Jane Technician", role: "technician" },
];

const userIds = {};

for (const user of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.full_name, role: user.role },
  });

  if (error && !error.message.includes("already been registered")) {
    console.error(`Failed to create ${user.email}:`, error.message);
    continue;
  }

  const id =
    data?.user?.id ??
    (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === user.email)?.id;

  if (id) {
    userIds[user.email] = id;
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      { onConflict: "id" }
    );
    if (profileError) {
      console.error(`Failed to upsert profile for ${user.email}:`, profileError.message);
    } else {
      console.log(`✓ ${user.email} (${user.role})`);
    }
  }
}

const buildingId = "11111111-1111-1111-1111-111111111111";
const techId = userIds["tech@maintenancebuddy.com"];
const tech2Id = userIds["tech2@maintenancebuddy.com"];

if (techId) {
  const startDate = new Date().toISOString().split("T")[0];
  const endDate = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  const { data: newMaint, error: createError } = await admin
    .from("maintenances")
    .insert({
      building_id: buildingId,
      start_date: startDate,
      end_date: endDate,
      status: "in_progress",
      notes: "Spring 2026 HVAC maintenance",
    })
    .select()
    .single();

  if (createError) {
    console.error("Maintenance create error:", createError.message);
    if (createError.message.includes("permission denied")) {
      console.error("\nRun supabase/migrations/20250828000002_grant_roles.sql in the Supabase SQL Editor, then re-run: pnpm seed");
    }
  } else if (newMaint) {
    await admin.from("maintenance_assignments").insert([
      { maintenance_id: newMaint.id, technician_id: techId },
      ...(tech2Id ? [{ maintenance_id: newMaint.id, technician_id: tech2Id }] : []),
    ]);
    console.log(`✓ Sample maintenance created (${newMaint.id})`);
  }
}

console.log("\nDemo accounts ready:");
console.log("  Admin: admin@maintenancebuddy.com / password123");
console.log("  Tech:  tech@maintenancebuddy.com / password123");

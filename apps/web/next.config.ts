import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@maintenancebuddy/shared", "@maintenancebuddy/supabase"],
  // Monorepo: lockfile lives at repo root (two levels above apps/web)
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;

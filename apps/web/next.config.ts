import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@maintenancebuddy/shared", "@maintenancebuddy/supabase"],
};

export default nextConfig;

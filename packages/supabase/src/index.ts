import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createBrowserClient(supabaseUrl: string, supabaseAnonKey: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

export type { Database };


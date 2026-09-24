import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

function getApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const base = (fromExtra || fromEnv || "").replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Missing EXPO_PUBLIC_API_URL (web app origin used for photo presign)"
    );
  }
  return base;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not signed in");
  }
  return session.access_token;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new Error(
      `Cannot reach web API at ${getApiBaseUrl()}. Is Next running, and is EXPO_PUBLIC_API_URL set to this machine's Network URL?`
    );
  }

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;

  if (!res.ok) {
    throw new Error(
      (data && "error" in data && data.error) || `Request failed (${res.status})`
    );
  }

  return data as T;
}

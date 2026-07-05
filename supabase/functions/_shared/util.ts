// Shared helpers for Arnold edge functions

export const APP_ORIGIN = "https://harrison-lewis.github.io";
export const APP_URL = "https://harrison-lewis.github.io/arnold/";

export const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Verify a Supabase JWT and return the user id, or null. */
export async function getUserId(jwt: string | null): Promise<string | null> {
  if (!jwt) return null;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ?? null;
}

/** Minimal Supabase REST helper using the service role key (bypasses RLS). */
export async function serviceRest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

// --- HMAC-signed state for the WHOOP OAuth round trip ---

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("WHOOP_CLIENT_SECRET") ?? "state-secret";
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signState(userId: string): Promise<string> {
  const exp = Date.now() + 10 * 60 * 1000; // 10 min
  const payload = `${userId}.${exp}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${hex(sig)}`;
}

export async function verifyState(state: string | null): Promise<string | null> {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  const expected = hex(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(),
      new TextEncoder().encode(`${userId}.${exp}`),
    ),
  );
  return sig === expected ? userId : null;
}

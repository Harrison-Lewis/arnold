// whoop-recovery: returns the caller's last 7 days of WHOOP recovery.
// Refreshes the WHOOP access token when expired and caches rows in
// whoop_recovery. Returns {connected:false} when WHOOP isn't linked.
import { corsHeaders, json, getUserId, serviceRest } from "../_shared/util.ts";

interface TokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

async function refreshToken(row: TokenRow): Promise<TokenRow | null> {
  const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: Deno.env.get("WHOOP_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("WHOOP_CLIENT_SECRET") ?? "",
      scope: "offline",
    }),
  });
  if (!res.ok) {
    console.error("WHOOP refresh failed", await res.text());
    return null;
  }
  const tok = await res.json();
  const updated: TokenRow = {
    ...row,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token, // persist rotation
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000)
      .toISOString(),
  };
  await serviceRest(`whoop_tokens?user_id=eq.${row.user_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      access_token: updated.access_token,
      refresh_token: updated.refresh_token,
      expires_at: updated.expires_at,
    }),
  });
  return updated;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const userId = await getUserId(jwt);
  if (!userId) return json({ error: "unauthorized" }, 401);

  // Load token row (service role; table has no client policies)
  const tokRes = await serviceRest(
    `whoop_tokens?user_id=eq.${userId}&select=user_id,access_token,refresh_token,expires_at`,
  );
  const rows: TokenRow[] = tokRes.ok ? await tokRes.json() : [];
  if (!rows.length) return json({ connected: false });

  let tok = rows[0];
  if (new Date(tok.expires_at).getTime() < Date.now() + 60_000) {
    const refreshed = await refreshToken(tok);
    if (!refreshed) return json({ connected: false, error: "refresh_failed" });
    tok = refreshed;
  }

  const recRes = await fetch(
    "https://api.prod.whoop.com/developer/v1/recovery?limit=7",
    { headers: { Authorization: `Bearer ${tok.access_token}` } },
  );
  if (!recRes.ok) {
    console.error("WHOOP recovery fetch failed", recRes.status);
    return json({ connected: true, recovery: [], error: "whoop_api_error" });
  }

  const data = await recRes.json();
  const records: unknown[] = data.records ?? [];
  const out = records
    .map((r: any) => ({
      user_id: userId,
      date: (r.created_at ?? "").split("T")[0],
      recovery_score: r.score?.recovery_score ?? null,
      hrv_ms: r.score?.hrv_rmssd_milli ?? null,
      rhr: r.score?.resting_heart_rate ?? null,
      sleep_performance: null, // needs read:sleep scope; column reserved
    }))
    .filter((r) => r.date);

  // Deduplicate by date (keep newest record per day)
  const byDate = new Map<string, typeof out[number]>();
  for (const r of out) if (!byDate.has(r.date)) byDate.set(r.date, r);
  const recovery = [...byDate.values()];

  if (recovery.length) {
    await serviceRest("whoop_recovery?on_conflict=user_id,date", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(recovery),
    });
  }

  return json({
    connected: true,
    recovery: recovery
      .map(({ user_id: _u, ...rest }) => rest)
      .sort((a, b) => b.date.localeCompare(a.date)),
  });
});

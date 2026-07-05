// whoop-disconnect: removes the caller's WHOOP tokens.
import { corsHeaders, json, getUserId, serviceRest } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const userId = await getUserId(jwt);
  if (!userId) return json({ error: "unauthorized" }, 401);

  await serviceRest(`whoop_tokens?user_id=eq.${userId}`, { method: "DELETE" });
  return json({ ok: true });
});

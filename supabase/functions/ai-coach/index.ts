// ai-coach: Claude-powered coaching Q&A grounded in the user's history.
// Rate limited to 20 requests/user/day via the ai_usage table.
import { corsHeaders, json, getUserId, serviceRest } from "../_shared/util.ts";

const SYSTEM_PROMPT =
  "You are Arnold, a concise evidence-based strength coach inside a workout " +
  "tracking app. You are given the user's full training history as JSON " +
  "(weights, reps, RPE, estimated 1RMs, weekly volumes). Answer questions " +
  "using their actual data — cite specific lifts, dates, and numbers. Keep " +
  "answers under 250 words. Give concrete numbers (target weights, sets, " +
  "reps) rather than generalities. Flag stalls, imbalances between muscle " +
  "groups, and excessive weekly volume (>20 hard sets/muscle). Never give " +
  "medical advice; suggest a professional for pain or injury questions.";

const DAILY_LIMIT = 20;
const MAX_BODY_BYTES = 100_000;

async function checkRateLimit(userId: string): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  const res = await serviceRest(
    `ai_usage?user_id=eq.${userId}&date=eq.${today}&select=count`,
  );
  const rows = res.ok ? await res.json() : [];
  const count = rows[0]?.count ?? 0;
  if (count >= DAILY_LIMIT) return false;
  await serviceRest("ai_usage?on_conflict=user_id,date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, date: today, count: count + 1 }),
  });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const userId = await getUserId(jwt);
  if (!userId) return json({ error: "unauthorized" }, 401);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  let body: { messages?: { role: string; content: string }[]; history?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" && m.content.trim())
    .slice(-40);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "no_user_message" }, 400);
  }

  if (!(await checkRateLimit(userId))) {
    return json({ error: "rate_limit" }, 429);
  }

  const system = body.history
    ? `${SYSTEM_PROMPT}\n\nUser's training history JSON:\n${JSON.stringify(body.history)}`
    : SYSTEM_PROMPT;

  const anthRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      system,
      messages,
    }),
  });

  if (!anthRes.ok) {
    console.error("Anthropic API error", anthRes.status, await anthRes.text());
    return json({ error: "ai_error" }, 502);
  }

  const data = await anthRes.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");

  return json({ text });
});

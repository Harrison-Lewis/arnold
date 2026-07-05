# Arnold — Claude Code Instructions for Changes 5 and 6

Changes 1-4 (AI export, warm-up/plate math, weekly set volume, PWA) are already implemented in `docs/index.html`, `docs/sw.js`, `docs/manifest.json`, `docs/icon.svg`. The two changes below need a backend (Supabase Edge Functions), so implement them with Claude Code.

Context for Claude Code: the app is a single-file SPA at `docs/index.html` served on GitHub Pages at https://harrison-lewis.github.io/arnold/. It uses Supabase (project `suzavcotbneyhqzygrym`) for auth (Google OAuth) and persistence. Tables: `profiles`, `sessions` (exercises stored as jsonb), `routines`, `custom_exercises`, `feedback`. All app logic is inline JS in `docs/index.html`. Key existing functions: `buildExportData()` (structured history export), `getOverloadRec(exId, targetReps, targetRPE)` (progressive overload engine), `startRoutine()`, `DB` (in-memory cache with userId/userName), `supa` (Supabase client). Follow the existing code style: compact vanilla JS, no build step, CSS variables for theming.

---

## Change 5: WHOOP recovery integration — recovery-aware training recommendations

Goal: pull the user's daily WHOOP recovery score and adjust workout recommendations. Green recovery = progress as planned. Yellow = hold weights. Red = suggest reduced volume or rest.

### Step 1 — Supabase migration

Create `supabase/migrations/whoop.sql`:

- Table `whoop_tokens`: `user_id uuid primary key references profiles on delete cascade`, `access_token text`, `refresh_token text`, `expires_at timestamptz`, `whoop_user_id text`, `created_at timestamptz default now()`. Enable RLS with NO select/insert policies for anon/authenticated (tokens only touched by edge functions using the service role key).
- Table `whoop_recovery`: `user_id uuid references profiles on delete cascade`, `date date`, `recovery_score int`, `hrv_ms numeric`, `rhr numeric`, `sleep_performance int`, primary key `(user_id, date)`. RLS: authenticated users can select their own rows only.

### Step 2 — Edge functions (Deno)

Register an app at developer.whoop.com to get client id/secret. Set as Supabase secrets: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`. Scopes needed: `read:recovery offline`.

Create three functions under `supabase/functions/`:

1. `whoop-auth-start`: verifies the Supabase JWT, then redirects (302) to `https://api.prod.whoop.com/oauth/oauth2/auth` with client_id, `redirect_uri` pointing at the `whoop-auth-callback` function URL, `state` = signed value containing the user id, scopes above.
2. `whoop-auth-callback`: exchanges `code` for tokens at `https://api.prod.whoop.com/oauth/oauth2/token`, upserts into `whoop_tokens` (service role), then redirects back to `https://harrison-lewis.github.io/arnold/?whoop=connected`.
3. `whoop-recovery`: verifies the Supabase JWT. Loads the user's token (refreshing via refresh_token if `expires_at` is past — persist the rotated refresh token). Calls `GET https://api.prod.whoop.com/developer/v1/recovery?limit=7`, upserts rows into `whoop_recovery`, and returns the latest 7 days as JSON `{date, recovery_score, hrv_ms, rhr, sleep_performance}[]`. Return `{connected:false}` with 200 if no token row exists.

Deploy with `supabase functions deploy` and verify CORS headers allow the GitHub Pages origin.

### Step 3 — Frontend changes in `docs/index.html`

1. Profile modal: add a "Connect WHOOP" row. If not connected, button opens `{SUPA_URL}/functions/v1/whoop-auth-start` with the auth header (use `supa.auth.getSession()` access token via fetch, then follow redirect URL returned; simplest: have whoop-auth-start accept the JWT as a `?token=` query param). If connected, show "WHOOP connected" plus a Disconnect button (deletes token via a small `whoop-disconnect` function or direct authenticated RPC).
2. On app load (inside `loadUserData`, non-blocking): `fetch({SUPA_URL}/functions/v1/whoop-recovery)` with the session JWT. Store the result in `DB.whoopRecovery`.
3. Home screen (`renderHome`): if today's recovery exists, render a card showing the score with WHOOP color semantics (>=67 green #34C759, 34-66 yellow var(--warn), <34 red var(--danger)), HRV, RHR, and a one-line training directive:
   - Green: "Recovery {score}% — full send. Progress your lifts as recommended."
   - Yellow: "Recovery {score}% — go steady. Hold last session's weights, cut 1 set on isolations."
   - Red: "Recovery {score}% — back off. Consider rest or light technique work at 60-70%."
4. Overload engine (`getOverloadRec`): after computing the recommendation, if `DB.whoopRecovery` has today's score: red recovery caps the recommendation at `hold` type with 90% of the computed weight and appends "(WHOOP red recovery)" to the text; yellow converts a `progress` rec into `hold` at last session's weight with note "(WHOOP yellow recovery)". Green leaves it unchanged. Guard everything so users without WHOOP see zero change.
5. `buildExportData()`: include the last 30 days of `whoop_recovery` (fetch or from cache) in the export under `recovery_data`, so AI coaching sees recovery context.

### Acceptance checks

- User without WHOOP: app behaves exactly as before, no errors in console.
- Connect flow round-trips and shows "WHOOP connected".
- Red recovery visibly changes rec text in the logger.
- Tokens never appear in client-readable tables or network responses.

---

## Change 6: In-app AI coach ("Ask Arnold") — Claude-powered weekly review and Q&A

Goal: a chat sheet where the user asks training questions and gets answers grounded in their actual history, plus a generated weekly review.

### Step 1 — Edge function `ai-coach`

- Secret: `ANTHROPIC_API_KEY` (Supabase secret, never in the client).
- Function verifies the Supabase JWT, receives `{messages:[{role,content}...], history:<compact history JSON>}`.
- Enforce limits: max 20 requests/user/day (track in a small `ai_usage` table: user_id, date, count), reject history payloads > 100KB.
- Calls Anthropic Messages API (`claude-sonnet-5`, max_tokens 1000) with system prompt:

  "You are Arnold, a concise evidence-based strength coach inside a workout tracking app. You are given the user's full training history as JSON (weights, reps, RPE, estimated 1RMs, weekly volumes). Answer questions using their actual data — cite specific lifts, dates, and numbers. Keep answers under 250 words. Give concrete numbers (target weights, sets, reps) rather than generalities. Flag stalls, imbalances between muscle groups, and excessive weekly volume (>20 hard sets/muscle). Never give medical advice; suggest a professional for pain or injury questions."

- Streams or returns the completion text as JSON. CORS: allow the GitHub Pages origin only.

### Step 2 — Frontend in `docs/index.html`

1. Add a "Coach" tab to the bottom nav (or a floating button on Home) opening a full-screen chat view styled like the existing screens (user bubbles right/accent, coach bubbles left/card background).
2. On send: build the compact history with the existing `buildExportData()`, but trim to last 90 days of sessions and drop per-set `est_1rm` (recomputable) to keep payload small. POST to the edge function with the session JWT and the running message array (client-side state only; do not persist chat).
3. Prewritten quick prompts as tappable chips above the input: "Review my last week", "Where am I stalling?", "Plan my next push day", "Am I balanced across muscle groups?".
4. Weekly review: on Home, if it's Monday (or 7+ days since `LS.get('wc_last_review')`), show a "Your weekly review is ready" card; tapping it opens the chat pre-sending "Review my last week of training: what went well, what stalled, and exactly what to change this week." Store the timestamp in localStorage after generation.
5. Loading state: typing indicator dots; on error show a toast and keep the user's message in the input.
6. If the edge function returns a rate-limit error, show "Coach limit reached for today — try tomorrow."

### Acceptance checks

- Responses reference the user's real lifts and numbers.
- No Anthropic key in any client-served file or network response.
- Rate limit enforced server-side.
- Chat works on mobile Safari (keyboard doesn't cover the input — reuse the `visualViewport` pattern from `_syncPickerToKeyboard`).

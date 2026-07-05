// whoop-auth-callback: WHOOP redirects here with ?code&state.
// Exchanges the code for tokens, stores them (service role), and bounces
// back to the app. Deploy with --no-verify-jwt.
import { verifyState, serviceRest, APP_URL } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = await verifyState(url.searchParams.get("state"));

  if (!code || !userId) {
    return Response.redirect(`${APP_URL}?whoop=error`, 302);
  }

  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whoop-auth-callback`;
  const tokenRes = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: Deno.env.get("WHOOP_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("WHOOP_CLIENT_SECRET") ?? "",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    console.error("WHOOP token exchange failed", await tokenRes.text());
    return Response.redirect(`${APP_URL}?whoop=error`, 302);
  }

  const tok = await tokenRes.json();
  const upsert = await serviceRest("whoop_tokens?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000)
        .toISOString(),
    }),
  });

  if (!upsert.ok) {
    console.error("whoop_tokens upsert failed", await upsert.text());
    return Response.redirect(`${APP_URL}?whoop=error`, 302);
  }

  return Response.redirect(`${APP_URL}?whoop=connected`, 302);
});

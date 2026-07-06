// whoop-auth-callback: WHOOP redirects here with ?code&state.
// Exchanges the code for tokens, stores them (service role), and shows a
// self-closing result page (the app opens this flow in a popup/new tab so
// it never navigates away from its own session). Deploy with --no-verify-jwt.
import { verifyState, serviceRest, APP_URL } from "../_shared/util.ts";

function resultPage(ok: boolean): Response {
  const msg = ok ? "WHOOP connected" : "WHOOP connection failed";
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${msg}</title></head>
<body style="margin:0;background:#0d0d0f;color:#f2f2f2;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
<div><h2 style="margin:0 0 8px">${ok ? "&#10003; " : ""}${msg}</h2>
<p style="color:#999">This window will close itself.<br>If it doesn't, <a href="${APP_URL}?whoop=${ok ? "connected" : "error"}" style="color:#e84040">return to Arnold</a>.</p>
<script>setTimeout(function(){window.close()},1500)</script></div></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const userId = await verifyState(url.searchParams.get("state"));

  if (!code || !userId) {
    return resultPage(false);
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
    return resultPage(false);
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
    return resultPage(false);
  }

  return resultPage(true);
});

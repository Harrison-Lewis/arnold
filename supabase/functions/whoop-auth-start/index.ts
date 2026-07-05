// whoop-auth-start: begins the WHOOP OAuth flow.
// Opened as a plain browser navigation with ?token=<supabase access token>
// (deploy with --no-verify-jwt since redirects can't carry auth headers).
import { getUserId, signState, APP_URL } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const userId = await getUserId(token);
  if (!userId) {
    return Response.redirect(`${APP_URL}?whoop=error`, 302);
  }

  const state = await signState(userId);
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whoop-auth-callback`;

  const auth = new URL("https://api.prod.whoop.com/oauth/oauth2/auth");
  auth.searchParams.set("client_id", Deno.env.get("WHOOP_CLIENT_ID") ?? "");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "read:recovery offline");
  auth.searchParams.set("state", state);

  return Response.redirect(auth.toString(), 302);
});

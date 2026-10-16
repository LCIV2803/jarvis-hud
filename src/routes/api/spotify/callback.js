import { createFileRoute } from "@tanstack/react-router";
import { secrets } from "base44:runtime";

// Spotify's redirect target: exchanges the code for tokens and stores the
// refresh token on the Profile record so spotifyPlay can refresh access.
export const Route = createFileRoute("/api/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const back = (note) => Response.redirect(origin + "/?spotify=" + encodeURIComponent(note), 302);
        try {
          const code = url.searchParams.get("code");
          if (!code) return back(url.searchParams.get("error") || "cancelled");
          const clientId = secrets.get("SPOTIFY_CLIENT_ID");
          const clientSecret = secrets.get("SPOTIFY_CLIENT_SECRET");
          if (!clientId || !clientSecret) return back("missing_secrets");
          const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: "Basic " + btoa(clientId + ":" + clientSecret),
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: origin + "/api/spotify/callback",
            }),
          });
          if (!tokenRes.ok) return back("token_failed");
          const tokens = await tokenRes.json();
          if (!tokens.refresh_token) return back("no_refresh_token");
          const base44 = context.getBase44().asServiceRole;
          const profile = (await base44.entities.Profile.list("-updated_date", 1))[0];
          if (profile) await base44.entities.Profile.update(profile.id, { spotify_refresh_token: tokens.refresh_token });
          else await base44.entities.Profile.create({ spotify_refresh_token: tokens.refresh_token });
          return back("connected");
        } catch {
          return back("error");
        }
      },
    },
  },
});
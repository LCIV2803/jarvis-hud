import { createFileRoute } from "@tanstack/react-router";
import { secrets } from "base44:runtime";

// Starts the Spotify OAuth flow: redirects the browser to Spotify's authorize
// page, which sends the user back to /api/spotify/callback. The credentials
// come from the app's Secrets page (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).
export const Route = createFileRoute("/api/spotify/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = secrets.get("SPOTIFY_CLIENT_ID");
        if (!clientId) {
          return Response.json(
            { error: "missing_secrets", message: "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the dashboard Secrets page, then try again." },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
        const origin = new URL(request.url).origin;
        const authorize = new URL("https://accounts.spotify.com/authorize");
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("client_id", clientId);
        authorize.searchParams.set("scope", "user-read-playback-state user-modify-playback-state user-top-read");
        authorize.searchParams.set("redirect_uri", origin + "/api/spotify/callback");
        return Response.redirect(authorize.toString(), 302);
      },
    },
  },
});
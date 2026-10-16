import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

const SPOTIFY_API = 'https://api.spotify.com/v1';

function json(body, status) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Plays one song on the owner's Spotify device. Triggered by the HUD clap
// listener: it speaks the greeting line first, then calls this.
export default async function(req) {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let base44, user;
    try {
      base44 = createClientFromRequest(req);
      user = await base44.auth.me();
    } catch { return json({ error: 'unauthorized' }, 401); }
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (user.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const clientId = secrets.get('SPOTIFY_CLIENT_ID');
    const clientSecret = secrets.get('SPOTIFY_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return json({ error: 'missing_secrets', message: 'Spotify is not set up yet. Add the Spotify credentials in the dashboard Secrets page, then press Connect Spotify.' }, 503);
    }

    const profile = (await base44.asServiceRole.entities.Profile.list('-updated_date', 1))[0];
    const refreshToken = profile ? profile.spotify_refresh_token : undefined;
    if (!refreshToken) {
      return json({ error: 'not_connected', message: 'Connect Spotify first — press Connect Spotify in the HUD.' }, 400);
    }

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!tokenRes.ok) {
      return json({ error: 'reconnect', message: 'Spotify connection expired. Press Connect Spotify again.' }, 401);
    }
    const tokens = await tokenRes.json();
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken && profile) {
      try { await base44.asServiceRole.entities.Profile.update(profile.id, { spotify_refresh_token: tokens.refresh_token }); } catch {}
    }
    const headers = { Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json' };

    // The song a clap plays: the owner's most-played track.
    let uri = '';
    let trackName = '';
    try {
      const topRes = await fetch(SPOTIFY_API + '/me/top/tracks?limit=1', { headers });
      if (topRes.ok) {
        const top = await topRes.json();
        const t = top && top.items && top.items[0];
        if (t && t.uri) { uri = t.uri; trackName = t.name; }
      }
    } catch {}
    if (!uri) {
      return json({ error: 'no_track', message: 'No song found on your Spotify yet. Play or like a few songs so Spotify has a top track.' }, 400);
    }

    const devicesRes = await fetch(SPOTIFY_API + '/me/player/devices', { headers });
    const devices = devicesRes.ok ? (((await devicesRes.json()) || {}).devices || []) : [];
    const device = devices.find((d) => d.is_active) || devices[0];
    if (!device) {
      return json({ error: 'no_device', message: 'No Spotify device is online. Open Spotify on your phone or computer, then clap again.' }, 409);
    }
    if (!device.is_active) {
      await fetch(SPOTIFY_API + '/me/player', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ device_ids: [device.id], play: false }),
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    const playRes = await fetch(SPOTIFY_API + '/me/player/play?device_id=' + device.id, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ uris: [uri], position_ms: 0 }),
    });
    if (playRes.status !== 200 && playRes.status !== 204) {
      return json({ error: 'play_failed', message: 'Spotify refused the play request. Make sure Spotify Premium is active on the device.' }, 502);
    }
    return json({ ok: true, track: trackName, device: device.name }, 200);
  } catch {
    return json({ error: 'play_failed', message: 'Could not start the music. Try again in a moment.' }, 500);
  }
}
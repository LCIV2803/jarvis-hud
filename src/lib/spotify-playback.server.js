const API = 'https://api.spotify.com/v1';
const URI = 'spotify:track:1FA0Adwe8FnRNpja1KYyT5';
const NAME = 'Back To Life — Adriatique';
const failure = (error, message) => ({ ok: false, error, message });
const matches = (state) => state?.item?.uri === URI || state?.item?.linked_from?.uri === URI;

async function playback(headers) {
  const response = await fetch(API + '/me/player', { headers });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error('Could not check Spotify playback. Please reconnect Spotify.');
  return response.json();
}

function success(state, alreadyPlaying = false) {
  return {
    ok: true, verified: true, already_playing: alreadyPlaying,
    uri: URI, track: NAME, device: state.device?.name || 'Spotify',
  };
}

export async function playPinnedSpotifyTrack(base44, clientId, clientSecret) {
  if (!clientId || !clientSecret) return failure('missing_secrets', 'Spotify credentials are missing.');
  const page = await base44.asServiceRole.entities.Profile.filter({}, {
    sort: '-updated_date', limit: 1, fields: ['spotify_refresh_token'],
  });
  const profile = page.items[0];
  if (!profile?.spotify_refresh_token) return failure('not_connected', 'Connect Spotify first.');
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: profile.spotify_refresh_token }),
  });
  if (!tokenResponse.ok) return failure('reconnect', 'Reconnect Spotify to start the music.');
  const tokens = await tokenResponse.json();
  if (tokens.refresh_token && tokens.refresh_token !== profile.spotify_refresh_token) {
    await base44.asServiceRole.entities.Profile.update(profile.id, { spotify_refresh_token: tokens.refresh_token });
  }
  const headers = { Authorization: 'Bearer ' + tokens.access_token, 'Content-Type': 'application/json' };
  let state = await playback(headers);
  if (matches(state) && state.is_playing) return success(state, true);
  const deviceResponse = await fetch(API + '/me/player/devices', { headers });
  if (!deviceResponse.ok) return failure('devices_failed', 'Could not read your Spotify devices.');
  const { devices = [] } = await deviceResponse.json();
  const device = devices.find((d) => d.is_active && !d.is_restricted) || devices.find((d) => !d.is_restricted);
  if (!device) return failure('no_device', 'Open Spotify on your phone or computer, then try again.');
  if (!device.is_active) {
    const transfer = await fetch(API + '/me/player', {
      method: 'PUT', headers, body: JSON.stringify({ device_ids: [device.id], play: false }),
    });
    if (!transfer.ok) return failure('transfer_failed', 'Spotify could not switch to that device.');
    // Wait for the transfer instead of racing Spotify's previous playback context.
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      state = await playback(headers);
      if (state?.device?.id === device.id && state.device.is_active) break;
    }
    if (state?.device?.id !== device.id || !state?.device?.is_active) {
      return failure('device_not_ready', 'Your Spotify device is still connecting. Try again shortly.');
    }
  }
  const response = await fetch(API + '/me/player/play?device_id=' + encodeURIComponent(device.id), {
    method: 'PUT', headers, body: JSON.stringify({ uris: [URI], position_ms: 0 }),
  });
  if (!response.ok) return failure('play_failed', 'Spotify refused playback. Check that Spotify Premium is active.');
  // A 204 is an acknowledgement, not proof that the correct song started.
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    state = await playback(headers);
    if (matches(state) && state.is_playing && state.device?.id === device.id) return success(state);
  }
  const actual = state?.item?.name;
  return failure('playback_unconfirmed', actual
    ? 'Spotify is still on “' + actual + '”. Back To Life has not been confirmed.'
    : 'Spotify has not confirmed Back To Life yet. No replacement song was requested.');
}
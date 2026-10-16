import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { secrets } from 'base44:runtime';
import { requireUser } from '@/lib/auth-middleware';
import { playPinnedSpotifyTrack } from '@/lib/spotify-playback.server';

// This operation ships with the HUD, rather than a separately versioned function.
export const startClapMusic = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(z.object({}).strict())
  .handler(({ context }) => {
    if (context.user.role !== 'admin') throw Object.assign(new Error('Only the owner can control Spotify.'), { status: 403 });
    return playPinnedSpotifyTrack(
      context.getBase44(), secrets.get('SPOTIFY_CLIENT_ID'), secrets.get('SPOTIFY_CLIENT_SECRET'),
    );
  });

export const getSpotifyConnection = createServerFn({ method: 'GET' })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (context.user.role !== 'admin') return { connected: false, canControl: false };
    const page = await context.getBase44().asServiceRole.entities.Profile.filter({}, {
      sort: '-updated_date', limit: 1, fields: ['spotify_refresh_token'],
    });
    return { connected: Boolean(page.items[0]?.spotify_refresh_token), canControl: true };
  });
import React, { useState, useEffect, useCallback } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import VoiceProviderSetting from '@/components/jarvis/VoiceProviderSetting';
import JarvisAgentSetting from '@/components/jarvis/JarvisAgentSetting';
import GrainOverlay from '@/components/jarvis/GrainOverlay';

const PAGE_BG =
  'radial-gradient(ellipse 80% 60% at 50% 5%, rgba(17,78,114,0.24) 0%, transparent 70%), radial-gradient(ellipse 90% 70% at 50% 95%, rgba(15,46,82,0.2) 0%, transparent 70%), #040e1d';

export default function Settings() {
  const { isAuthenticated, user } = useAuth();
  const canEdit = isAuthenticated && user?.role === 'admin';
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const list = await base44.entities.Profile.list('-updated_date', 1);
      setProfile(list[0] || null);
    } catch (e) { /* best effort */ }
    setLoaded(true);
  }, []);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Save the given fields to the Profile, reload it, and return the fresh record
  // so callers can re-evaluate setup state without a stale prop.
  const onSaveProfile = useCallback(async (update) => {
    if (!canEdit) return profile;
    try {
      const fields = update || {};
      if (profile?.id) {
        if (Object.keys(fields).length) await base44.entities.Profile.update(profile.id, fields);
      } else if (Object.keys(fields).length) {
        await base44.entities.Profile.create(fields);
      }
      const list = await base44.entities.Profile.list('-updated_date', 1);
      setProfile(list[0] || null);
      return list[0] || null;
    } catch (e) {
      setError('Could not save that setting.');
      return profile;
    }
  }, [canEdit, profile]);

  return (
    <div className="min-h-screen w-full" style={{ background: PAGE_BG }}>
      <GrainOverlay />
      <div className="jarvis-page-shell relative z-10">
        <div className="h-16 flex items-center gap-4 border-b border-hud-border">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1.5 border border-hud-border bg-transparent text-hud-text2 hover:bg-hud-panel hover:text-hud-text transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </Link>
          <span className="font-body text-[18px] tracking-[0.34em] text-hud-text">SETTINGS</span>
        </div>
        <div className="py-10 flex flex-col gap-6 max-w-[560px]">
          <JarvisAgentSetting
            profile={profile}
            canEdit={canEdit}
            loaded={loaded}
            onSaveProfile={onSaveProfile}
          />
          <VoiceProviderSetting
            profile={profile}
            canEdit={canEdit}
            loaded={loaded}
            onSaveProfile={onSaveProfile}
          />
          {error && (
            <div className="font-mono text-[10px] tracking-[0.14em] text-hud-red border px-3 py-1.5" style={{ borderColor: 'rgba(229,83,61,0.5)' }}>
              {error}
            </div>
          )}
          {!canEdit && loaded && (
            <div className="font-mono text-[10px] tracking-[0.14em] text-hud-faint">Sign in as an admin to change settings.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authed/settings")({
  ssr: false,
  component: Settings,
  head: () => ({ meta: [{ title: "Jarvis HUD — Settings" }] }),
});
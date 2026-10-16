import React, { useState, useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

const TOAST_MS = 5000;
const POLL_MS = 3000;
const MAX_POLL_MS = 180000;
// No cooldown. The only lock is a short in-flight guard so a double-click
// cannot place two simultaneous calls: it ends when the dispatch HTTP call
// returns, or at 10s max if it hangs. The button reads "Calling..." during it.
const IN_FLIGHT_MS = 10_000;
const btnBase = 'font-mono text-[10px] tracking-[0.18em] uppercase px-2.5 py-1.5 border border-hud-border bg-transparent text-hud-text2 hover:bg-hud-panel hover:text-hud-text transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent inline-flex items-center gap-1.5 disabled:opacity-60';

function prefersReducedMotion() { return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

export default function HeaderActions({ voiceProvider = 'base44' }) {
  const { user } = useAuth();
  const [calling, setCalling] = useState(false);
  const [toast, setToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastRed, setToastRed] = useState(false);
  const pendingRef = useRef(false);
  const timer = useRef(null);
  const pollTimer = useRef(null);
  const inFlightTimer = useRef(null);
  const mounted = useRef(true);
  const reduced = prefersReducedMotion();
  // WhatsApp link comes from the Profile record (whatsapp_url), so this header
  // installs unchanged for any owner; no account link is hard-coded.
  const [whatsappUrl, setWhatsappUrl] = useState('');
  useEffect(() => {
    let active = true;
    base44.entities.Profile.list('-updated_date', 1)
      .then((list) => { if (active) setWhatsappUrl((list && list[0] && list[0].whatsapp_url) || ''); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); if (pollTimer.current) clearTimeout(pollTimer.current); if (inFlightTimer.current) clearTimeout(inFlightTimer.current); }; }, []);
  const showToast = (msg, red = false) => { if (!mounted.current) return; setToastMsg(msg); setToastRed(red); setToast(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(false), TOAST_MS); };
  const releaseInFlight = () => { if (inFlightTimer.current) { clearTimeout(inFlightTimer.current); inFlightTimer.current = null; } pendingRef.current = false; if (mounted.current) setCalling(false); };
  const startInFlight = () => { pendingRef.current = true; setCalling(true); if (inFlightTimer.current) clearTimeout(inFlightTimer.current); inFlightTimer.current = setTimeout(releaseInFlight, IN_FLIGHT_MS); };
  // Background status polling only updates the toast; it never locks the button.
  const poll = async (requestId) => {
    const started = Date.now();
    while (Date.now() - started < MAX_POLL_MS) {
      await new Promise((resolve) => { pollTimer.current = setTimeout(resolve, POLL_MS); });
      if (!mounted.current) return;
      let response, data;
      try { response = await base44.functions.invoke('callStatus', { request_id: requestId }); data = response?.data; } catch (e) { response = e?.response; data = response?.data; }
      if (!mounted.current) return;
      if (data?.state === 'submitted') { showToast('Call request sent to Jarvis.'); return; }
      if (data?.state === 'failed') { showToast('Call request was not accepted. Check the call service.', true); return; }
      if (data?.state === 'unknown' || response?.status === 409) { showToast('A call is already in progress.'); return; }
      if (response?.status === 401) { showToast('Sign in to check call status.', true); return; }
      if (response?.status === 403) { showToast('Admin only.', true); return; }
    }
  };
  const handleCallMe = async () => {
    if (pendingRef.current || !mounted.current) return;
    const useRetell = voiceProvider === 'retell';
    startInFlight();
    showToast('Requesting a call…');
    try {
      if (useRetell) {
        let response;
        try { response = await base44.functions.invoke('callMeRetell', {}); }
        catch (e) { response = e?.response; }
        if (!mounted.current) return;
        releaseInFlight();
        const data = response?.data;
        if (response?.status === 202 && data?.call_id) { showToast('Retell call started.'); return; }
        if (response?.status === 409) { showToast('A call is already in progress.'); return; }
        showToast(data?.message || 'Retell call could not be started. Try again.', true);
        return;
      }
      let response;
      try { response = await base44.functions.invoke('callMe', {}); }
      catch (e) { response = e?.response; }
      if (!mounted.current) return;
      const data = response?.data;
      if (response?.status === 202 && data?.request_id) {
        releaseInFlight();
        showToast('Call request queued. Jarvis is preparing your call.');
        poll(data.request_id);
        return;
      }
      releaseInFlight();
      if (response?.status === 409) { showToast('A call is already in progress.'); return; }
      if (response?.status === 401) { showToast('Sign in to call.', true); return; }
      if (response?.status === 403) { showToast('Admin only.', true); return; }
      showToast(data?.message || 'Jarvis call service is unavailable. Try again later.', true);
    } catch {
      releaseInFlight();
      if (mounted.current) showToast('Call request failed. Try again.', true);
    }
  };
  const ownerLabel = user?.full_name ? user.full_name.trim().split(/\s+/)[0].toUpperCase() : 'OWNER';
  return <div className="relative ml-auto flex items-center gap-2">
    <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-hud-faint px-1">{ownerLabel}</span>
    <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-hud-text2 px-1" title="Active CALL ME voice provider — change it in Settings">Voice · {voiceProvider === 'retell' ? 'Retell' : 'Base44'}</span>
    <button type="button" onClick={handleCallMe} disabled={calling} className={btnBase}>{calling ? 'Calling...' : 'Call Me'}</button>
    {whatsappUrl && <button type="button" onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')} className={btnBase}>Text</button>}
    <Link to="/settings" className={btnBase}>Settings</Link>
    <div aria-live="polite" className="absolute right-0 top-full mt-2 z-50 pointer-events-none" style={{ opacity: toast ? 1 : 0, transform: toast ? 'translateY(0)' : 'translateY(-4px)', transition: reduced ? 'none' : 'opacity 200ms ease-out, transform 200ms ease-out' }}>
      {toast && <div className="max-w-[320px] font-mono text-[10px] tracking-[0.12em] bg-hud-panel border px-3 py-1.5 text-right" style={{ color: toastRed ? '#E5533D' : '#EAF4FF', borderColor: toastRed ? 'rgba(229,83,61,0.5)' : '#14356B' }}>{toastMsg}</div>}
    </div>
  </div>;
}
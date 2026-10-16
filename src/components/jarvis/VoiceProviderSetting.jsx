import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { HUD } from '@/lib/jarvis';

const OPTIONS = [
  { value: 'base44', label: 'Base44 agent, works out of the box' },
  { value: 'retell', label: 'Retell Jarvis, needs your Retell API key and a Retell number' },
];

const fieldCls = 'font-mono text-[12px] tracking-[0.06em] bg-hud-panel border border-hud-border text-hud-text px-3 py-2 w-full focus:outline-none focus-visible:border-hud-accent';
const btnCls = 'font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-2 border border-hud-border bg-transparent text-hud-text2 hover:bg-hud-panel hover:text-hud-text transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent disabled:opacity-60';

export default function VoiceProviderSetting({ profile, canEdit, loaded, onSaveProfile }) {
  const current = profile?.voice_provider || 'base44';
  const [discovering, setDiscovering] = useState(false);
  const [status, setStatus] = useState(null); // { msg, red }
  const [agents, setAgents] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  const agentSet = !!(profile?.retell_agent_id || '').trim();
  const numberSet = !!(profile?.retell_from_number || '').trim();
  const mobileSet = !!(profile?.owner_phone || '').trim();

  const evaluate = (fresh, ag, nm) => {
    const aOk = !!(fresh?.retell_agent_id || '').trim();
    const nOk = !!(fresh?.retell_from_number || '').trim();
    const mOk = !!(fresh?.owner_phone || '').trim();
    if (!ag.length) return setStatus({ msg: 'No Retell agents in your account yet. Create one at app.retellai.com, then press Check again.', red: true });
    if (!nm.length) return setStatus({ msg: 'No Retell phone numbers in your account yet. Buy one in Retell, then press Check again.', red: true });
    if (aOk && nOk && mOk) return setStatus({ msg: 'Found your Retell agent and number', red: false });
    if (!aOk && ag.length > 1) return setStatus({ msg: 'Pick your Retell agent below.', red: false });
    if (!nOk && nm.length > 1) return setStatus({ msg: 'Pick your Retell number below.', red: false });
    if (!mOk) return setStatus({ msg: 'Add your mobile number below.', red: false });
    return setStatus({ msg: 'Found your Retell agent and number', red: false });
  };

  const runDiscover = async (freshProfile) => {
    setDiscovering(true);
    try {
      const res = await base44.functions.invoke('retellDiscover', {});
      const data = res?.data;
      if (res?.status === 503 && data?.missing_secret) {
        setStatus({ msg: data.message, red: true });
        setDiscovering(false);
        return;
      }
      if (res?.status !== 200) {
        setStatus({ msg: data?.message || 'Could not reach Retell. Try again in a moment.', red: true });
        setDiscovering(false);
        return;
      }
      const ag = data.agents || [];
      const nm = data.phone_numbers || [];
      setAgents(ag);
      setNumbers(nm);
      const fresh = freshProfile || (await onSaveProfile({}));
      evaluate(fresh, ag, nm);
    } catch {
      setStatus({ msg: 'Could not reach Retell. Try again in a moment.', red: true });
    }
    setDiscovering(false);
  };

  // If Retell is active but its agent or number is still missing, look them
  // up once on page load so the panel shows real setup status, not silence.
  const discoverRan = useRef(false);
  useEffect(() => {
    if (discoverRan.current || !loaded || !canEdit || current !== 'retell') return;
    if (agentSet && numberSet) return;
    discoverRan.current = true;
    runDiscover(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canEdit, current, agentSet, numberSet]);

  const select = async (next) => {
    if (!canEdit || discovering || saving) return;
    const fresh = await onSaveProfile({ voice_provider: next });
    if (next === 'retell') {
      setStatus(null);
      await runDiscover(fresh);
    } else {
      setStatus(null);
      setAgents([]);
      setNumbers([]);
    }
  };

  const pickAgent = async (id) => {
    if (saving) return;
    setSaving(true);
    const fresh = await onSaveProfile({ retell_agent_id: id });
    setSaving(false);
    evaluate(fresh, agents, numbers);
  };

  const pickNumber = async (n) => {
    if (saving) return;
    setSaving(true);
    const fresh = await onSaveProfile({ retell_from_number: n });
    setSaving(false);
    evaluate(fresh, agents, numbers);
  };

  const saveMobile = async () => {
    if (saving || !mobile.trim()) return;
    setSaving(true);
    const fresh = await onSaveProfile({ owner_phone: mobile.trim() });
    setSaving(false);
    setMobile('');
    evaluate(fresh, agents, numbers);
  };

  const showAgentPicker = current === 'retell' && agents.length > 1 && !agentSet;
  const showNumberPicker = current === 'retell' && numbers.length > 1 && !numberSet;
  const showMobile = current === 'retell' && !mobileSet;
  const showRetellPanel = current === 'retell' && (discovering || status || showAgentPicker || showNumberPicker || showMobile);

  return (
    <section>
      <div className="pb-3">
        <h2 className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2">VOICE PROVIDER</h2>
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint mt-1">USED BY THE CALL ME BUTTON IN THE HEADER</p>
      </div>
      <div className="h-px bg-hud-border mb-4" />
      <div className="flex flex-col border border-hud-border">
        {OPTIONS.map((opt, i) => {
          const selected = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={!loaded || discovering || saving || !canEdit}
              onClick={() => select(opt.value)}
              className={`flex items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent ${i > 0 ? 'border-t border-hud-border' : ''} ${selected ? 'bg-hud-panel' : 'bg-transparent hover:bg-hud-panel'}`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border shrink-0"
                style={{ borderColor: selected ? HUD.accent : HUD.border, background: selected ? HUD.accent : 'transparent' }}
              />
              <span className={`font-body text-[14px] min-w-0 ${selected ? 'text-hud-text' : 'text-hud-text2'}`}>{opt.label}</span>
              {selected && <span className="ml-auto font-mono text-[10px] tracking-[0.18em] uppercase text-hud-accent shrink-0">Active</span>}
            </button>
          );
        })}
      </div>

      {showRetellPanel && (
        <div className="mt-4 flex flex-col gap-3">
          {discovering && <div className="font-mono text-[10px] tracking-[0.14em] text-hud-faint">Looking up your Retell setup…</div>}
          {status && !discovering && (
            <div className="font-mono text-[10px] tracking-[0.14em] px-3 py-1.5 border flex items-center justify-between gap-3" style={{ color: status.red ? '#E5533D' : HUD.green, borderColor: status.red ? 'rgba(229,83,61,0.5)' : 'rgba(61,220,132,0.4)' }}>
              <span>{status.msg}</span>
              <button type="button" className="font-mono text-[10px] tracking-[0.18em] uppercase text-hud-text2 hover:text-hud-text shrink-0" onClick={() => runDiscover(profile)} disabled={discovering}>Check again</button>
            </div>
          )}
          {showAgentPicker && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint">Retell agent</span>
              <select className={fieldCls} disabled={saving} value={profile?.retell_agent_id || ''} onChange={(e) => pickAgent(e.target.value)}>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {showNumberPicker && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint">Retell number</span>
              <select className={fieldCls} disabled={saving} value={profile?.retell_from_number || ''} onChange={(e) => pickNumber(e.target.value)}>
                {numbers.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          {showMobile && (
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint">Your mobile number</span>
              <div className="flex gap-2">
                <input className={fieldCls} placeholder="+61 4xx xxx xxx" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={saving} />
                <button type="button" className={btnCls} onClick={saveMobile} disabled={saving || !mobile.trim()}>Save</button>
              </div>
            </label>
          )}
        </div>
      )}

      {saving && <div className="font-mono text-[10px] tracking-[0.14em] text-hud-faint mt-3">Saving…</div>}
    </section>
  );
}
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { HUD } from '@/lib/jarvis';

const fieldCls = 'font-mono text-[12px] tracking-[0.06em] bg-hud-panel border border-hud-border text-hud-text px-3 py-2 w-full focus:outline-none focus-visible:border-hud-accent';
const btnCls = 'font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-2 border border-hud-border bg-transparent text-hud-text2 hover:bg-hud-panel hover:text-hud-text transition-colors duration-200 focus:outline-none focus-visible:border-hud-accent disabled:opacity-60';

// Save one field (or a few) through upsertProfile, reload the profile from the
// parent, and surface a plain-language result. `field` names a single field for
// the per-field Save button label feedback.
async function saveViaUpsert(update) {
  const res = await base44.functions.invoke('upsertProfile', update);
  const data = res?.data;
  if (res?.status === 200 || res?.status === 201) return { ok: true };
  return { ok: false, message: typeof data === 'string' && data ? data : 'Could not save that setting.' };
}

export default function JarvisAgentSetting({ profile, canEdit, loaded, onSaveProfile }) {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { msg, red }

  // Sync local inputs whenever the profile record changes.
  useEffect(() => {
    setAgentId(profile?.superagent_id || '');
    setName(profile?.owner_name || '');
    setTelegram(profile?.telegram_url || '');
  }, [profile]);

  const connected = !!(profile?.superagent_id || '').trim();

  // On first load, fill the HUD app id automatically from the app context so a
  // fresh install is fully configured without manual entry. Written through
  // upsertProfile like every other save in this section.
  useEffect(() => {
    if (!loaded || !canEdit) return;
    if (profile?.hud_app_id && String(profile.hud_app_id).trim()) return;
    if (!appParams?.appId) return;
    saveViaUpsert({ hud_app_id: appParams.appId })
      .then((r) => { if (r.ok) onSaveProfile({}); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canEdit, profile?.hud_app_id]);

  const doSave = async (fields, label) => {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveViaUpsert(fields);
      if (result.ok) {
        await onSaveProfile({});
        setStatus({ msg: label + ' saved.', red: false });
      } else {
        setStatus({ msg: result.message, red: true });
      }
    } catch {
      setStatus({ msg: 'Could not save that setting.', red: true });
    }
    setSaving(false);
  };

  return (
    <section>
      <div className="pb-3">
        <h2 className="font-mono text-[13px] uppercase tracking-[0.15em] text-hud-text2">YOUR JARVIS AGENT</h2>
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint mt-1">USED BY CALL ME, TEXT AND THE AFTER-CALL BRIDGE</p>
        {connected && (
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase mt-2 flex items-center gap-1.5" style={{ color: HUD.green }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: HUD.green }} />
            Connected
          </div>
        )}
      </div>
      <div className="h-px bg-hud-border mb-4" />
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint">Agent ID</span>
          <div className="flex gap-2">
            <input className={fieldCls} placeholder="24-hex Base44 Superagent id" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={saving || !canEdit} />
            <button type="button" className={btnCls} onClick={() => doSave({ superagent_id: agentId.trim() }, 'Agent ID')} disabled={saving || !canEdit || !agentId.trim()}>Save</button>
          </div>
          <span className="font-mono text-[9px] tracking-[0.1em] text-hud-faint">In your agent open Agent settings, then Developer, copy the id that comes after /agents/ in the Base URL</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint">Your name</span>
          <div className="flex gap-2">
            <input className={fieldCls} placeholder="First name Jarvis speaks" value={name} onChange={(e) => setName(e.target.value)} disabled={saving || !canEdit} />
            <button type="button" className={btnCls} onClick={() => doSave({ owner_name: name.trim() }, 'Name')} disabled={saving || !canEdit || !name.trim()}>Save</button>
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-hud-faint">Telegram link <span className="text-hud-faint normal-case">(optional)</span></span>
          <div className="flex gap-2">
            <input className={fieldCls} placeholder="Paste your Telegram bot link" value={telegram} onChange={(e) => setTelegram(e.target.value)} disabled={saving || !canEdit} />
            <button type="button" className={btnCls} onClick={() => doSave({ telegram_url: telegram.trim() }, 'Telegram link')} disabled={saving || !canEdit || !telegram.trim()}>Save</button>
          </div>
        </label>
      </div>

      {status && (
        <div className="font-mono text-[10px] tracking-[0.14em] px-3 py-1.5 mt-3 border" style={{ color: status.red ? HUD.red : HUD.green, borderColor: status.red ? 'rgba(229,83,61,0.5)' : 'rgba(61,220,132,0.4)' }}>
          {status.msg}
        </div>
      )}
      {saving && <div className="font-mono text-[10px] tracking-[0.14em] text-hud-faint mt-3">Saving…</div>}
    </section>
  );
}

// Shared Retell helpers used by the call functions.
export function json(body, status) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Secret-derived values are never returned in full; only a short tail for diagnostics.
export function mask(value) {
  if (typeof value !== 'string' || !value) return value ?? null;
  if (value.length <= 4) return 'set (' + value.length + ' chars)';
  return '…' + value.slice(-4);
}

export async function retellCall(apiKey, path, options = {}) {
  const response = await fetch('https://api.retellai.com' + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

export async function latestProfile(base44) {
  return (await base44.asServiceRole.entities.Profile.list('-updated_date', 1))[0] || null;
}
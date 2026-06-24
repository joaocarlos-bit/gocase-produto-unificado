import { useEffect, useRef, useState } from 'react';

interface OnlineUser { email: string; name: string; lastSeen: string; }

const POLL_MS = 25000; // bate ponto a cada 25s (janela online ~45s no backend)
const MAX_AVATARS = 4;

function initials(name: string, email: string): string {
  const base = (name && name !== '—' ? name : email.split('@')[0] || '?').trim();
  const parts = base.split(/[\s.]+/).filter(Boolean);
  const a = parts[0]?.[0] || '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Indicador de usuários online (heartbeat por polling). Vai no Header. */
export function OnlinePresence() {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [meEmail, setMeEmail] = useState<string>('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let aborted = false;

    async function beat() {
      // Não bate ponto com a aba em background (economiza cota do Apps Script)
      if (document.hidden) return;
      try {
        const r = await fetch('/api/presence', { method: 'POST', cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (aborted) return;
        setOnline((j.online || []) as OnlineUser[]);
        if (j.me?.email) setMeEmail(j.me.email);
      } catch { /* silencioso — presença é best-effort */ }
    }

    beat();
    timer.current = window.setInterval(beat, POLL_MS);
    const onVis = () => { if (!document.hidden) beat(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      aborted = true;
      if (timer.current) window.clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (online.length === 0) return null;

  // Ordena: eu primeiro, depois alfabético
  const sorted = [...online].sort((a, b) => {
    if (a.email === meEmail) return -1;
    if (b.email === meEmail) return 1;
    return (a.name || a.email).localeCompare(b.name || b.email, 'pt-BR');
  });
  const shown = sorted.slice(0, MAX_AVATARS);
  const extra = sorted.length - shown.length;
  const tooltip = sorted.map((u) => (u.name || u.email) + (u.email === meEmail ? ' (você)' : '')).join('\n');

  return (
    <div className="pres" title={tooltip}>
      <span className="pres__dot" />
      <span className="pres__count">{online.length} online</span>
      <div className="pres__avatars">
        {shown.map((u) => {
          const h = hue(u.email);
          return (
            <span
              key={u.email}
              className={`pres__av ${u.email === meEmail ? 'pres__av--me' : ''}`}
              style={{ background: `hsl(${h} 70% 88%)`, color: `hsl(${h} 55% 30%)` }}
            >
              {initials(u.name, u.email)}
            </span>
          );
        })}
        {extra > 0 && <span className="pres__av pres__av--more">+{extra}</span>}
      </div>

      <style>{`
        .pres {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 10px 5px 10px;
          background: rgba(0,0,0,0.25);
          border-radius: 8px;
        }
        .pres__dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.25);
          flex-shrink: 0;
        }
        .pres__count { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.2px; white-space: nowrap; }
        .pres__avatars { display: flex; align-items: center; }
        .pres__av {
          width: 24px; height: 24px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 9px; font-weight: 800; letter-spacing: 0.2px;
          border: 2px solid var(--brand-blue-d, #16407a);
          margin-left: -7px;
        }
        .pres__av:first-child { margin-left: 0; }
        .pres__av--me { box-shadow: 0 0 0 2px var(--accent); }
        .pres__av--more { background: rgba(255,255,255,0.85); color: var(--brand-blue-d, #16407a); }
        @media (max-width: 700px) { .pres__count { display: none; } }
      `}</style>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { PageHero } from '../../components/PageHero';
import { Card } from '../../components/Card';

interface Comment {
  id: string;
  email: string;
  name: string;
  message: string;
  createdAt: string;
}

const MAX_LEN = 2000;

function initials(name: string, email: string): string {
  const base = (name && name !== '—' ? name : email.split('@')[0] || '?').trim();
  const parts = base.split(/[\s.]+/).filter(Boolean);
  const a = parts[0]?.[0] || '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Cor estável por autor (hash simples → matiz)
function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function Feed() {
  const [comments, setComments] = useState<Comment[] | 'loading' | 'error'>('loading');
  const [me, setMe] = useState<{ email: string; name: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/comments', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setComments(j.comments || []);
      setMe(j.me || null);
    } catch {
      setComments('error');
    }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    const message = draft.trim();
    if (!message || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      // Prepend otimista (mais recente no topo)
      setComments((cur) => (Array.isArray(cur) ? [j.comment as Comment, ...cur] : [j.comment as Comment]));
      setDraft('');
      taRef.current?.focus();
    } catch (e) {
      setPostError((e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd + Enter envia
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  }

  const count = Array.isArray(comments) ? comments.length : 0;

  return (
    <div className="feed">
      <PageHero
        breadcrumb="Geral · Comentários & Feedbacks"
        title="Comentários & Feedbacks"
        subtitle="Feed do time Gocase — registre observações, ideias e feedbacks. Cada comentário fica marcado com seu e-mail e a data/hora do envio."
      />

      <Card className="feed__composer-card">
        <div className="feed__composer">
          <div
            className="feed__avatar feed__avatar--me"
            style={me ? { background: `hsl(${avatarHue(me.email)} 70% 92%)`, color: `hsl(${avatarHue(me.email)} 55% 32%)` } : undefined}
          >
            {me ? initials(me.name, me.email) : '…'}
          </div>
          <div className="feed__composer-main">
            <textarea
              ref={taRef}
              className="feed__textarea"
              placeholder="Escreva um comentário ou feedback para o time…"
              value={draft}
              maxLength={MAX_LEN}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="feed__composer-foot">
              <span className="feed__composer-hint">
                {me ? <>Comentando como <strong>{me.email}</strong></> : 'Identificando usuário…'}
                <span className="feed__dot">·</span>
                <span className={draft.length > MAX_LEN - 100 ? 'feed__count feed__count--warn' : 'feed__count'}>
                  {draft.length}/{MAX_LEN}
                </span>
                <span className="feed__dot">·</span>
                <span className="feed__kbd">Ctrl+Enter</span>
              </span>
              <button className="feed__send" disabled={!draft.trim() || posting} onClick={submit}>
                {posting ? 'Enviando…' : 'Publicar'}
              </button>
            </div>
            {postError && <div className="feed__post-error">⚠ {postError}</div>}
          </div>
        </div>
      </Card>

      <div className="section-title" style={{ marginTop: 20 }}>
        💬 Feed
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {comments === 'loading' ? 'carregando…' : comments === 'error' ? 'erro' : `${count} comentário${count === 1 ? '' : 's'} · mais recentes primeiro`}
        </span>
      </div>

      {comments === 'loading' && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>Carregando comentários…</div>
      )}
      {comments === 'error' && (
        <Card>
          <div style={{ padding: 28, textAlign: 'center' }}>
            <h3 style={{ marginBottom: 8 }}>⚠ Não foi possível carregar</h3>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 14 }}>
              Verifique se o Apps Script do feed está publicado e as env vars <code>FEEDBACK_SCRIPT_URL</code> / <code>FEEDBACK_SCRIPT_SECRET</code> estão setadas no projeto.
            </p>
            <button className="feed__send" onClick={load}>Tentar de novo</button>
          </div>
        </Card>
      )}
      {Array.isArray(comments) && comments.length === 0 && (
        <Card>
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)' }}>
            Ainda não há comentários. Seja o primeiro a publicar acima. 👆
          </div>
        </Card>
      )}

      {Array.isArray(comments) && comments.length > 0 && (
        <div className="feed__list">
          {comments.map((c) => {
            const hue = avatarHue(c.email);
            return (
              <div key={c.id} className="feed__item">
                <div className="feed__avatar" style={{ background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 32%)` }}>
                  {initials(c.name, c.email)}
                </div>
                <div className="feed__body">
                  <div className="feed__meta">
                    <span className="feed__author">{c.name || c.email.split('@')[0]}</span>
                    <span className="feed__email">{c.email}</span>
                    <span className="feed__time">{fmtDateTime(c.createdAt)}</span>
                  </div>
                  <div className="feed__msg">{c.message}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .feed__composer-card { overflow: visible; }
        .feed__composer { display: flex; gap: 12px; align-items: flex-start; }
        .feed__avatar {
          flex-shrink: 0;
          width: 40px; height: 40px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; letter-spacing: 0.3px;
          background: var(--surface-2); color: var(--text-2);
        }
        .feed__composer-main { flex: 1; min-width: 0; }
        .feed__textarea {
          width: 100%;
          resize: vertical;
          min-height: 64px;
          padding: 10px 12px;
          font-size: 14px;
          font-family: var(--font-sans);
          line-height: 1.5;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          outline: none;
        }
        .feed__textarea:focus { border-color: var(--brand-blue); }
        .feed__composer-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-top: 8px; flex-wrap: wrap;
        }
        .feed__composer-hint { font-size: 11px; color: var(--text-3); display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .feed__composer-hint strong { color: var(--text-2); font-weight: 700; }
        .feed__dot { color: var(--border); }
        .feed__count--warn { color: var(--red); font-weight: 700; }
        .feed__kbd {
          font-size: 10px; font-weight: 700; color: var(--text-3);
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 4px; padding: 1px 5px;
        }
        .feed__send {
          padding: 8px 18px;
          font-size: 13px; font-weight: 700;
          color: #fff; background: var(--brand-blue);
          border: none; border-radius: var(--r-sm);
          cursor: pointer;
          font-family: var(--font-sans);
        }
        .feed__send:hover:not(:disabled) { filter: brightness(1.05); }
        .feed__send:disabled { opacity: 0.5; cursor: not-allowed; }
        .feed__post-error { margin-top: 8px; font-size: 12px; color: var(--red); font-weight: 600; }
        .feed__list { display: flex; flex-direction: column; gap: 10px; }
        .feed__item {
          display: flex; gap: 12px; align-items: flex-start;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          padding: 14px 16px;
        }
        .feed__body { flex: 1; min-width: 0; }
        .feed__meta { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .feed__author { font-size: 13px; font-weight: 700; color: var(--text); }
        .feed__email { font-size: 11px; color: var(--text-3); }
        .feed__time { font-size: 11px; color: var(--text-3); margin-left: auto; white-space: nowrap; }
        .feed__msg { font-size: 14px; color: var(--text-2); line-height: 1.55; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
      `}</style>
    </div>
  );
}

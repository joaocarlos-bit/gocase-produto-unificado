import { useEffect, useMemo, useState } from 'react';
import { PageHero } from '../../components/PageHero';
import {
  REPORTS, REPORT_CATEGORIES, REPORTS_FOLDER_URL,
  reportPreviewUrl, reportViewUrl, reportDownloadUrl,
  type ReportFile,
} from '../../data/reports';

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

export function Relatorios() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ReportFile | null>(null);

  // Fecha o visualizador com ESC
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewer(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewer]);

  const groups = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('pt-BR');
    const filtered = REPORTS.filter(
      (r) =>
        (cat === null || r.category === cat) &&
        (term === '' || r.title.toLocaleLowerCase('pt-BR').includes(term) || r.category.toLocaleLowerCase('pt-BR').includes(term)),
    );
    return REPORT_CATEGORIES
      .map((c) => ({ category: c, items: filtered.filter((r) => r.category === c) }))
      .filter((g) => g.items.length > 0);
  }, [q, cat]);

  const total = REPORTS.length;

  return (
    <div className="rel">
      <PageHero
        breadcrumb="Gestão · Relatórios"
        title="Relatórios"
        subtitle={`Biblioteca de relatórios do time — ${total} documentos. Clique em "Visualizar" para abrir o PDF aqui mesmo.`}
        right={
          <a className="rel__drive" href={REPORTS_FOLDER_URL} target="_blank" rel="noopener noreferrer">
            📁 Abrir pasta no Drive
          </a>
        }
      />

      <div className="rel__bar">
        <input className="rel__search" placeholder="Buscar relatório…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="rel__chips">
          <button className={`rel__chip ${cat === null ? 'on' : ''}`} onClick={() => setCat(null)}>Todos</button>
          {REPORT_CATEGORIES.map((c) => (
            <button key={c} className={`rel__chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Nenhum relatório encontrado.</div>
      )}

      {groups.map((g) => (
        <div key={g.category} className="rel__group">
          <div className="rel__group-title">{g.category} <span className="rel__group-count">{g.items.length}</span></div>
          <div className="rel__grid">
            {g.items.map((r) => (
              <div key={r.id} className="rel__card">
                <div className="rel__card-top">
                  <div className={`rel__icon rel__icon--${r.kind}`}>{r.kind === 'xlsx' ? '📊' : '📄'}</div>
                  {r.badge && <span className="rel__badge">{r.badge}</span>}
                </div>
                <div className="rel__card-title">{r.title}</div>
                <div className="rel__card-meta">{r.kind.toUpperCase()} · {fmtSize(r.sizeBytes)} · {fmtDate(r.modifiedTime)}</div>
                <div className="rel__actions">
                  {r.kind === 'pdf' && (
                    <button className="rel__btn rel__btn--primary" onClick={() => setViewer(r)}>Visualizar</button>
                  )}
                  <a className="rel__btn" href={reportViewUrl(r.id)} target="_blank" rel="noopener noreferrer">Abrir no Drive</a>
                  <a className="rel__btn" href={reportDownloadUrl(r.id)} target="_blank" rel="noopener noreferrer">Baixar</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {viewer && (
        <div className="rel__overlay" onClick={() => setViewer(null)}>
          <div className="rel__modal" onClick={(e) => e.stopPropagation()}>
            <div className="rel__modal-hdr">
              <div className="rel__modal-title">
                📄 {viewer.title}
                {viewer.badge && <span className="rel__badge" style={{ marginLeft: 8 }}>{viewer.badge}</span>}
              </div>
              <div className="rel__modal-actions">
                <a className="rel__btn" href={reportViewUrl(viewer.id)} target="_blank" rel="noopener noreferrer">Abrir no Drive</a>
                <a className="rel__btn" href={reportDownloadUrl(viewer.id)} target="_blank" rel="noopener noreferrer">Baixar</a>
                <button className="rel__close" onClick={() => setViewer(null)} title="Fechar (Esc)">✕</button>
              </div>
            </div>
            <iframe
              className="rel__frame"
              src={reportPreviewUrl(viewer.id)}
              title={viewer.title}
              allow="autoplay"
            />
          </div>
        </div>
      )}

      <style>{`
        .rel__drive {
          padding: 8px 14px; font-size: 12px; font-weight: 700;
          color: var(--text-2); background: var(--surface);
          border: 1.5px solid var(--border); border-radius: var(--r-sm);
          text-decoration: none; white-space: nowrap;
        }
        .rel__drive:hover { border-color: var(--brand-blue); color: var(--brand-blue); }
        .rel__bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 22px; }
        .rel__search {
          flex: 1; min-width: 220px; padding: 8px 14px; font-size: 13px;
          border: 1.5px solid var(--border); border-radius: var(--r-sm);
          background: var(--surface); color: var(--text); outline: none;
        }
        .rel__search:focus { border-color: var(--brand-blue); }
        .rel__chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .rel__chip {
          padding: 6px 14px; font-size: 12px; font-weight: 700;
          color: var(--text-2); background: var(--surface);
          border: 1.5px solid var(--border); border-radius: 999px; cursor: pointer;
        }
        .rel__chip:hover { color: var(--text); }
        .rel__chip.on { background: var(--brand-blue); color: #fff; border-color: var(--brand-blue); }
        .rel__group { margin-bottom: 28px; }
        .rel__group-title {
          font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px;
          color: var(--text-3); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
        }
        .rel__group-count {
          font-size: 10px; font-weight: 700; color: var(--text-3);
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 999px; padding: 1px 8px;
        }
        .rel__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .rel__card {
          display: flex; flex-direction: column;
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: var(--r-md); box-shadow: var(--shadow-sm); padding: 16px;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .rel__card:hover { border-color: var(--brand-blue); box-shadow: 0 8px 24px rgba(30,95,184,0.10); transform: translateY(-2px); }
        .rel__card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .rel__icon {
          width: 42px; height: 42px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; font-size: 22px;
          background: var(--surface-2);
        }
        .rel__icon--pdf { background: #fde8e8; }
        .rel__icon--xlsx { background: #e6f4ea; }
        .rel__badge {
          font-size: 10px; font-weight: 800; letter-spacing: 0.3px;
          color: var(--brand-blue-d, #1d4fa3); background: var(--brand-blue-l, #e0eaff);
          border-radius: 6px; padding: 3px 8px; white-space: nowrap;
        }
        .rel__card-title { font-size: 14px; font-weight: 800; color: var(--text); line-height: 1.3; letter-spacing: -0.01em; }
        .rel__card-meta { font-size: 11px; color: var(--text-3); margin-top: 6px; }
        .rel__actions { display: flex; gap: 6px; margin-top: 14px; flex-wrap: wrap; }
        .rel__btn {
          padding: 6px 12px; font-size: 12px; font-weight: 700;
          color: var(--text-2); background: var(--surface);
          border: 1.5px solid var(--border); border-radius: var(--r-sm);
          cursor: pointer; text-decoration: none; white-space: nowrap;
        }
        .rel__btn:hover { color: var(--text); border-color: var(--text-3); }
        .rel__btn--primary { background: var(--brand-blue); color: #fff; border-color: var(--brand-blue); }
        .rel__btn--primary:hover { color: #fff; filter: brightness(1.05); }
        .rel__overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(15, 23, 42, 0.55);
          display: flex; align-items: center; justify-content: center; padding: 28px;
        }
        .rel__modal {
          width: min(1000px, 96vw); height: min(90vh, 1100px);
          background: var(--surface); border-radius: var(--r-md);
          box-shadow: 0 24px 64px rgba(0,0,0,0.32);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .rel__modal-hdr {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--surface-2);
        }
        .rel__modal-title { font-size: 14px; font-weight: 800; color: var(--text); display: flex; align-items: center; }
        .rel__modal-actions { display: flex; gap: 6px; align-items: center; }
        .rel__close {
          width: 30px; height: 30px; border-radius: 8px;
          border: 1.5px solid var(--border); background: var(--surface);
          color: var(--text-2); font-size: 14px; cursor: pointer;
        }
        .rel__close:hover { color: var(--red); border-color: var(--red); }
        .rel__frame { flex: 1; width: 100%; border: none; background: #f1f5f9; }
      `}</style>
    </div>
  );
}

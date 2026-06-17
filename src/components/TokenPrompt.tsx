// UI para configurar o token do Monday.com (salvo no localStorage). Mostrada
// pelas telas Prazo/Projetos quando não há token. Mesmo modelo do dash-produto.

import { useState } from 'react';
import { setMondayToken } from '../data/monday';

export function TokenPrompt({ tab, onSaved }: { tab: string; onSaved: () => void }) {
  const [val, setVal] = useState('');
  const save = () => {
    const t = val.trim();
    if (!t) return;
    setMondayToken(t);
    onSaved();
  };
  return (
    <div className="tk">
      <div className="tk__icon">🔒</div>
      <h3 className="tk__title">Token Monday.com necessário</h3>
      <p className="tk__desc">
        A frente <strong>{tab}</strong> consome dados do Monday.com. Por segurança o token não fica no código —
        cole seu token de API abaixo (salvo apenas no seu navegador).
      </p>
      <input className="tk__input" type="password" placeholder="Cole o token JWT aqui"
        value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      <button className="tk__btn" onClick={save}>Salvar token</button>
      <p className="tk__hint">Gere em: gogroup.monday.com/profile → Apps → API</p>
      <style>{`
        .tk { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: 32px; max-width: 520px; margin: 48px auto; text-align: center; }
        .tk__icon { font-size: 26px; margin-bottom: 8px; }
        .tk__title { font-size: 16px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .tk__desc { font-size: 13px; color: var(--text-2); line-height: 1.6; margin-bottom: 20px; }
        .tk__input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-family: monospace; margin-bottom: 12px; background: var(--surface); color: var(--text); }
        .tk__btn { background: var(--brand-blue); color: #fff; border-radius: 8px; padding: 10px 20px; font-weight: 700; font-size: 13px; }
        .tk__hint { font-size: 11px; color: var(--text-3); margin-top: 16px; }
      `}</style>
    </div>
  );
}

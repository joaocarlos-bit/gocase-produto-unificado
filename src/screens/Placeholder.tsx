// Tela temporária para as frentes ainda não migradas (Gestão / dash-produto).
// Some quando a tela real for portada do dash-produto pro app unificado.

interface Props {
  front: string;
  label: string;
}

export function Placeholder({ front, label }: Props) {
  return (
    <div className="ph">
      <div className="ph__icon">🚧</div>
      <h2 className="ph__title">{label}</h2>
      <p className="ph__sub">
        Frente <strong>{front}</strong> — em migração do <code>dash-produto</code> para a aplicação unificada.
      </p>
      <p className="ph__note">
        Esta tela ainda será portada. A navegação e a estrutura já estão prontas;
        o conteúdo entra na próxima etapa da unificação.
      </p>
      <style>{`
        .ph {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          min-height: 60vh;
          gap: 10px;
          color: var(--text-2);
        }
        .ph__icon { font-size: 40px; }
        .ph__title { font-size: 22px; font-weight: 800; color: var(--text); margin: 0; }
        .ph__sub { font-size: 14px; margin: 0; }
        .ph__note { font-size: 12px; color: var(--text-3); max-width: 420px; margin: 6px 0 0; }
        .ph code {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px 5px;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}

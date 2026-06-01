import { Card } from './Card';

type Status = 'done' | 'in_progress' | 'planned';

interface Item {
  sprint: string;
  feature: string;
  description: string;
  status: Status;
  eta: string;
}

const ROADMAP: Item[] = [
  // Sprint 0 — Setup
  { sprint: 'S0', feature: 'Setup técnico (Vite + React + TS)', description: 'Projeto base, build, tipos, formatadores', status: 'done', eta: '2026-05-21' },
  { sprint: 'S0', feature: 'Data layer + tipos canônicos', description: 'Loader e tipos do processed-data.json', status: 'done', eta: '2026-05-21' },
  { sprint: 'S0', feature: 'Design system (tokens, layout, componentes)', description: 'Cores Gocase, KPICard, Card, Header, Nav', status: 'done', eta: '2026-05-21' },
  { sprint: 'S0', feature: 'Aba 🗺️ Roadmap dedicada', description: 'Esta página — transparência do que está e do que vem', status: 'done', eta: '2026-05-21' },
  { sprint: 'S0', feature: 'Script refresh-snapshot.cjs', description: 'npm run refresh · puxa Sheets API e regenera processed-data.json + sales-by-sku.json', status: 'done', eta: '2026-05-22' },

  // Sprint 1 — Pulso
  { sprint: 'S1', feature: 'Tela 🎯 Pulso — KPIs MTD/QTD/YTD', description: 'Receita, qtd, ticket, margem, atingimento FC com YoY', status: 'done', eta: '2026-05-21' },
  { sprint: 'S1', feature: 'Tela 🎯 Pulso — Top 10 linhas com Δ vs FC', description: 'Barras horizontais ordenadas, semáforo por atingimento', status: 'done', eta: '2026-05-21' },
  { sprint: 'S1', feature: 'Tela 🎯 Pulso — Composição mensal por categoria', description: 'Stacked area de todas as categorias', status: 'done', eta: '2026-05-21' },
  { sprint: 'S1', feature: 'Banner de alertas (top 5 sinais)', description: 'Linhas grandes abaixo de FC, cobertura crítica, slow-movers, lançamentos', status: 'done', eta: '2026-05-21' },
  { sprint: 'S1', feature: 'Filtro de período (MonthRangePicker)', description: 'Picker de 2 painéis com shortcuts (1m, 3m, 6m, 12m, YTD, tudo) substituindo botões fixos', status: 'done', eta: '2026-05-21' },
  { sprint: 'S1', feature: 'Gráficos em linha — Receita / TM / Margem mês a mês', description: '3 line charts no período selecionado · TM = receita÷qtd · margem = (TM−custo) ponderado', status: 'done', eta: '2026-05-21' },
  { sprint: 'S1', feature: 'Receita diária 90d com banda de forecast', description: 'Linha + área para previsão vs realizado — depende de dados diários', status: 'planned', eta: 'S1' },

  // Sprint 2 — Lançamentos + Portfólio
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — novas linhas (Tipo A)', description: 'Cards com trajetória M0→Mn, vs FC, vs benchmark da categoria', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — drops de cor (Tipo B)', description: 'Performance da linha desde último drop + lista de SKUs novos', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — benchmark peer-to-peer', description: 'Receita acum. vs média de outros lançamentos da mesma categoria', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — tabelas ordenáveis + busca + CSV', description: 'Visão tabular ordenável por coluna, busca por nome, export CSV', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — visão por material (SKU)', description: 'Toggle linha/material · cada SKU com estoque, custo, saída, cobertura, curva ABC', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — filtro de período de estreia', description: 'MonthRangePicker filtrando lançamentos por janela absoluta de firstSale', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — material c/ Qtd/Receita/TM/Margem estimados', description: 'Receita estimada via saída 7d × 30 × TM linha · margem real por SKU (custo)', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — cutoff temporal jan/2026', description: 'Considera lançamento apenas estreias a partir de jan/26 · constante única em aggregates.ts', status: 'done', eta: '2026-05-21' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — calendário próximos 60d', description: 'Roadmap de drops planejados (requer fonte nova)', status: 'planned', eta: 'S2' },
  { sprint: 'S2', feature: 'Tela 🚀 Lançamentos — pós-mortem dos descontinuados', description: 'O que aprendemos com lançamentos que falharam', status: 'planned', eta: 'S2' },
  { sprint: 'S2', feature: 'Tela 📊 Portfólio — Pareto 80/20', description: 'Curva cumulativa de concentração de receita + marcadores 80% / 95%', status: 'done', eta: '2026-05-22' },
  { sprint: 'S2', feature: 'Tela 📊 Portfólio — tabela mestre + cross-filter', description: 'Linha, share, share acum., YoY %, margem % · clique-pra-filtrar', status: 'done', eta: '2026-05-22' },
  { sprint: 'S2', feature: 'Tela 📊 Portfólio — KPIs (top10, 80%, YoY)', description: 'Concentração top10, regra 80/20, linhas crescendo vs LY', status: 'done', eta: '2026-05-22' },
  { sprint: 'S2', feature: 'Tela 📊 Portfólio — lente Matriz BCG', description: 'Crescimento YoY × Share, tamanho = receita', status: 'planned', eta: 'S2' },
  { sprint: 'S2', feature: 'Tela 📊 Portfólio — lente Lifecycle', description: 'Idade × velocidade — Intro/Crescimento/Maturidade/Declínio', status: 'planned', eta: 'S2' },

  // Sprint 3 — Estoque + Diário
  { sprint: 'S3', feature: 'Tela 📦 Estoque — 5 KPIs estratégicos', description: 'Capital imobilizado, risco, ruptura, slow movers, obsoletos (>365d)', status: 'done', eta: '2026-05-22' },
  { sprint: 'S3', feature: 'Tela 📦 Estoque — heatmap ABC × Cobertura', description: 'Matriz 5×5 clicável · intensidade pela R$ · cross-filter com tabela', status: 'done', eta: '2026-05-22' },
  { sprint: 'S3', feature: 'Tela 📦 Estoque — tabela com sugestão de ação', description: 'SKU-level · Repor urgente/Repor/Monitorar/Manter/Promover/Liquidar', status: 'done', eta: '2026-05-22' },
  { sprint: 'S3', feature: 'Tela 📅 Diário — heatmap dia × semana', description: 'Padrões sazonais visíveis em 1 olhada', status: 'planned', eta: 'S3' },
  { sprint: 'S3', feature: 'Tela 📅 Diário — eventos marcados', description: 'Drops, lançamentos, BF anotados na linha temporal', status: 'planned', eta: 'S3' },

  // Sprint 4 — Infra
  { sprint: 'S4', feature: 'Backend proxy + cache (Cloudflare Worker)', description: 'Tira a chave da Sheets API do front, cache 1h', status: 'planned', eta: 'S4' },
  { sprint: 'S4', feature: 'URL state + filtros persistentes', description: 'Compartilhar visões via link, voltar no histórico', status: 'planned', eta: 'S4' },
  { sprint: 'S4', feature: 'Glossário de métricas linkável', description: 'Cada KPI tem ? que abre definição versionada', status: 'planned', eta: 'S4' },
  { sprint: 'S4', feature: 'Deploy CI/CD + preview por PR', description: 'Vercel/CF Pages, rollback, A/B', status: 'planned', eta: 'S4' },
];

const STATUS_META: Record<Status, { label: string; icon: string; color: string; bg: string }> = {
  done:        { label: 'Concluído',    icon: '✓',  color: 'var(--green)', bg: 'var(--green-l)' },
  in_progress: { label: 'Em andamento', icon: '◐',  color: 'var(--amber)', bg: 'var(--amber-l)' },
  planned:     { label: 'Planejado',    icon: '○',  color: 'var(--text-3)', bg: 'var(--bg)' },
};

const SPRINT_META: Record<string, { title: string; goal: string }> = {
  S0: { title: 'Sprint 0',     goal: 'Fundação técnica e estrutura de dados' },
  S1: { title: 'Sprint 1',     goal: 'Tela Pulso — substitui o "abrir e olhar" diário' },
  S2: { title: 'Sprint 2',     goal: 'Lançamentos + Portfólio (cadências quinzenal/mensal)' },
  S3: { title: 'Sprint 3',     goal: 'Estoque + Diário (operação)' },
  S4: { title: 'Sprint 4',     goal: 'Hardening: backend, deploy, glossário' },
};

export function Roadmap() {
  const grouped = ROADMAP.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.sprint] ??= []).push(item);
    return acc;
  }, {});
  const sprintIds = Object.keys(grouped);

  // Sprint progress summary
  const totals = sprintIds.map((s) => {
    const items = grouped[s];
    const done = items.filter((i) => i.status === 'done').length;
    const wip = items.filter((i) => i.status === 'in_progress').length;
    const total = items.length;
    const pct = Math.round(((done + wip * 0.5) / total) * 100);
    return { s, done, wip, total, pct };
  });

  return (
    <Card
      title="🗺️ Roadmap de entregas"
      subtitle="Transparência: o que já está pronto, o que está sendo construído agora e o que vem a seguir"
    >
      <div className="rm__summary">
        {totals.map(({ s, done, wip, total, pct }) => (
          <div key={s} className="rm__sprint-card">
            <div className="rm__sprint-head">
              <strong className="rm__sprint-id mono">{s}</strong>
              <span className="rm__sprint-title">{SPRINT_META[s]?.title}</span>
            </div>
            <p className="rm__sprint-goal">{SPRINT_META[s]?.goal}</p>
            <div className="rm__progress">
              <div className="rm__progress-bar">
                <div className="rm__progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="rm__progress-lbl mono">{done}/{total} {wip > 0 && <em>· {wip} em andamento</em>}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rm__table-wrap">
        <table className="rm__table">
          <thead>
            <tr>
              <th style={{ width: 56 }}>Sprint</th>
              <th>Feature</th>
              <th>Descrição</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ width: 90 }}>Entrega</th>
            </tr>
          </thead>
          <tbody>
            {ROADMAP.map((item, i) => {
              const meta = STATUS_META[item.status];
              return (
                <tr key={i} className={`rm__row rm__row--${item.status}`}>
                  <td><span className="rm__sprint-tag mono">{item.sprint}</span></td>
                  <td><span className="rm__feature">{item.feature}</span></td>
                  <td><span className="rm__desc">{item.description}</span></td>
                  <td>
                    <span
                      className="rm__status-pill"
                      style={{ color: meta.color, background: meta.bg, borderColor: meta.color }}
                    >
                      <span className="rm__status-icon">{meta.icon}</span> {meta.label}
                    </span>
                  </td>
                  <td className="mono rm__eta">{item.eta}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .rm__summary {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          padding: 0 0 16px;
        }
        @media (max-width: 1100px) {
          .rm__summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 600px) {
          .rm__summary { grid-template-columns: 1fr; }
        }
        .rm__sprint-card {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .rm__sprint-head {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .rm__sprint-id {
          font-size: 11px;
          font-weight: 700;
          color: var(--teal);
        }
        .rm__sprint-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text);
        }
        .rm__sprint-goal {
          font-size: 10px;
          color: var(--text-2);
          line-height: 1.4;
          min-height: 28px;
        }
        .rm__progress {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .rm__progress-bar {
          flex: 1;
          height: 4px;
          background: var(--bg);
          border-radius: 99px;
          overflow: hidden;
        }
        .rm__progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--teal), var(--accent));
          transition: width 0.4s ease;
        }
        .rm__progress-lbl {
          font-size: 10px;
          color: var(--text-2);
          white-space: nowrap;
        }
        .rm__progress-lbl em {
          color: var(--amber);
          font-style: normal;
          font-weight: 600;
        }
        .rm__table-wrap {
          border-top: 1px solid var(--border);
          margin: 0 -18px -16px;
          overflow-x: auto;
        }
        .rm__table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .rm__table th {
          text-align: left;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-3);
          padding: 10px 12px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
        }
        .rm__row {
          border-bottom: 1px solid var(--border);
        }
        .rm__row:last-child { border-bottom: none; }
        .rm__row:hover { background: var(--surface-2); }
        .rm__row--done { background: rgba(26, 158, 92, 0.03); }
        .rm__row td {
          padding: 9px 12px;
          vertical-align: middle;
        }
        .rm__sprint-tag {
          font-size: 10px;
          font-weight: 700;
          background: var(--teal-l);
          color: var(--teal);
          padding: 2px 7px;
          border-radius: 4px;
        }
        .rm__feature {
          font-weight: 600;
          color: var(--text);
        }
        .rm__desc {
          color: var(--text-2);
          font-size: 11px;
        }
        .rm__status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 99px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid;
        }
        .rm__status-icon {
          font-weight: 700;
        }
        .rm__eta {
          font-size: 10px;
          color: var(--text-2);
        }
      `}</style>
    </Card>
  );
}

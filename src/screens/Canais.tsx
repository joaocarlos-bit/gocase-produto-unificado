import { useMemo, useState } from 'react';
import type { ProcessedData, SalesBySkuPayload, Ym, CanalGrupo } from '../data/types';
import { CANAL_GRUPOS } from '../data/types';
import { allMonthsWithCurrent, latestMonth, topSkusByCanal, totalsByCanalWithSkus } from '../data/aggregates';
import { fmtBRL, fmtNum, shiftYm, ymLabel } from '../lib/format';
import { KPICard } from '../components/KPICard';
import { MonthRangePicker } from '../components/MonthRangePicker';
import { PageHero } from '../components/PageHero';
import { Card } from '../components/Card';

interface Props { data: ProcessedData; sales: SalesBySkuPayload; }

const CANAL_LABEL: Record<CanalGrupo, string> = {
  D2C: 'D2C · Varejo',
  B2B: 'B2B · Resellers',
  Lojas: 'Lojas Físicas',
  Brindes: 'Brindes',
};
const CANAL_HINT: Record<CanalGrupo, string> = {
  D2C: 'Site Gocase (e-commerce direto ao consumidor)',
  B2B: 'Resellers Brasil — venda atacado via Extrema',
  Lojas: 'Totem Iguatemi · Parkshopping · Analia Franco · Totem In Loco',
  Brindes: 'Influenciadores, prototipos, bonificações, requests — qtd inflada, receita ~0',
};
const CANAL_ICON: Record<CanalGrupo, string> = {
  D2C: '🛒', B2B: '🏭', Lojas: '🏬', Brindes: '🎁',
};
const CANAL_ACCENT: Record<CanalGrupo, 'blue' | 'purple' | 'yellow' | 'green' | 'red'> = {
  D2C: 'blue', B2B: 'purple', Lojas: 'green', Brindes: 'yellow',
};

export function Canais({ data, sales }: Props) {
  const months = useMemo(() => allMonthsWithCurrent(data), [data]);
  const latest = latestMonth(data) ?? months[months.length - 1] ?? '';
  const defaultFrom = useMemo(() => shiftYm(latest, -5), [latest]);
  const [range, setRange] = useState<{ from: Ym; to: Ym }>({ from: defaultFrom, to: latest });

  const totals = useMemo(
    () => totalsByCanalWithSkus(data, sales, range.from, range.to),
    [data, sales, range],
  );

  const [tableCanal, setTableCanal] = useState<CanalGrupo>('D2C');
  const [tableLimit, setTableLimit] = useState<number>(25);
  const [tableSearch, setTableSearch] = useState<string>('');
  const topSkus = useMemo(
    () => topSkusByCanal(data, sales, tableCanal, range.from, range.to, 500),
    [data, sales, tableCanal, range],
  );
  const filteredTop = useMemo(() => {
    const q = tableSearch.trim().toLocaleLowerCase('pt-BR');
    const rows = q === ''
      ? topSkus
      : topSkus.filter(
          (r) =>
            r.sku.toLocaleLowerCase('pt-BR').includes(q) ||
            r.linha.toLocaleLowerCase('pt-BR').includes(q) ||
            r.categoria.toLocaleLowerCase('pt-BR').includes(q),
        );
    return rows.slice(0, tableLimit);
  }, [topSkus, tableSearch, tableLimit]);

  const totReceita = totals.reduce((s, t) => s + t.receita, 0);
  const totQtd = totals.reduce((s, t) => s + t.qtd, 0);
  const tmGlobal = totQtd > 0 ? totReceita / totQtd : 0;

  return (
    <div className="cn">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Canais"
        title="Performance por Canal"
        subtitle={
          <>
            Split por canal de venda — <strong>D2C</strong> (Varejo direto), <strong>B2B</strong> (Resellers Extrema),
            <strong> Lojas físicas</strong> (Iguatemi · Parkshopping · Analia Franco) e <strong>Brindes</strong>
            (influenciadores · prototipos · bonificações — receita ~0).
            <br />
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
              💡 O seletor de canais no topo do dashboard filtra TODAS as outras abas — esta tela mostra sempre todos pra dar visibilidade do split.
            </span>
          </>
        }
        right={
          <div className="cn__period">
            <span className="cn__period-lbl">Período</span>
            <MonthRangePicker available={months} value={range} onChange={setRange} />
          </div>
        }
      />

      {/* KPI global */}
      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <KPICard
          label="Receita total no período"
          icon="💰"
          accent="blue"
          value={fmtBRL(totReceita)}
          hint={`${ymLabel(range.from)} → ${ymLabel(range.to)} · soma dos canais`}
        />
        <KPICard
          label="Qtd total no período"
          icon="📦"
          accent="purple"
          value={fmtNum(totQtd)}
          hint={`${totals.find((t) => t.canal === 'Brindes')?.qtd ?? 0} un como brindes (sem receita)`}
        />
        <KPICard
          label="Ticket médio agregado"
          icon="🎟️"
          accent="yellow"
          value={`R$ ${tmGlobal.toFixed(2)}`}
          hint="receita ÷ qtd (mistura todos canais)"
        />
      </div>

      {/* Cards por canal */}
      <div className="section-title">
        🔀 Receita por canal · share
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {range.from} → {range.to}
        </span>
      </div>
      <div className="grid grid-4">
        {totals.map((t) => (
          <KPICard
            key={t.canal}
            label={CANAL_LABEL[t.canal]}
            icon={CANAL_ICON[t.canal]}
            accent={CANAL_ACCENT[t.canal]}
            value={fmtBRL(t.receita)}
            hint={
              <>
                <strong>{t.share.toFixed(1)}%</strong> da receita · {fmtNum(t.qtd)} un · TM R$ {t.ticketMedio.toFixed(2)}
                <br />
                <span style={{ color: 'var(--text-3)' }}>{t.linhasCount} linhas · {t.skusCount} SKUs · {CANAL_HINT[t.canal]}</span>
              </>
            }
          />
        ))}
      </div>

      {/* Tabela */}
      <div className="section-title" style={{ marginTop: 18 }}>
        📋 Resumo por canal
      </div>
      <Card>
        <div className="tbl">
          <div className="tbl__wrap">
            <table className="tbl__table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th className="right">Receita</th>
                  <th className="right">Share %</th>
                  <th className="right">Qtd</th>
                  <th className="right">Ticket médio</th>
                  <th className="right">Linhas</th>
                  <th className="right">SKUs</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.canal}>
                    <td className="tbl__primary">{CANAL_ICON[t.canal]} {CANAL_LABEL[t.canal]}</td>
                    <td className="right tbl__strong">{fmtBRL(t.receita)}</td>
                    <td className="right tbl__muted">{t.share.toFixed(1)}%</td>
                    <td className="right">{fmtNum(t.qtd)}</td>
                    <td className="right tbl__muted">R$ {t.ticketMedio.toFixed(2)}</td>
                    <td className="right tbl__muted">{t.linhasCount}</td>
                    <td className="right tbl__muted">{t.skusCount}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-2)', fontWeight: 800 }}>
                  <td className="tbl__primary">Total</td>
                  <td className="right tbl__strong">{fmtBRL(totReceita)}</td>
                  <td className="right tbl__muted">100,0%</td>
                  <td className="right tbl__strong">{fmtNum(totQtd)}</td>
                  <td className="right tbl__muted">R$ {tmGlobal.toFixed(2)}</td>
                  <td className="right tbl__muted">—</td>
                  <td className="right tbl__muted">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Top SKUs por canal */}
      <div className="section-title" style={{ marginTop: 22 }}>
        🏆 Produtos mais vendidos por canal
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {ymLabel(range.from)} → {ymLabel(range.to)} · ranking de SKUs no canal escolhido
        </span>
      </div>
      <Card>
        <div className="cn__rank-bar">
          <div className="cn__rank-pills">
            {CANAL_GRUPOS.map((c) => {
              const t = totals.find((x) => x.canal === c);
              return (
                <button
                  key={c}
                  className={`cn__rank-pill ${tableCanal === c ? 'on' : ''}`}
                  onClick={() => setTableCanal(c)}
                >
                  <span className="cn__rank-pill-icon">{CANAL_ICON[c]}</span>
                  <span className="cn__rank-pill-lbl">{CANAL_LABEL[c]}</span>
                  {t && (
                    <span className="cn__rank-pill-cnt">
                      {t.skusCount} SKUs · {fmtBRL(t.receita)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="cn__rank-tools">
            <input
              className="cn__rank-search"
              placeholder="Filtrar por SKU, linha ou categoria…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
            <select
              className="cn__rank-limit"
              value={tableLimit}
              onChange={(e) => setTableLimit(Number(e.target.value))}
            >
              <option value={10}>Top 10</option>
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={500}>Top 500</option>
            </select>
          </div>
        </div>

        <div className="tbl">
          <div className="tbl__wrap">
            <table className="tbl__table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>SKU / Material</th>
                  <th>Linha</th>
                  <th>Categoria</th>
                  <th className="right">Receita</th>
                  <th className="right">Share no canal</th>
                  <th className="right">Qtd</th>
                  <th className="right">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {filteredTop.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>
                      Sem vendas registradas em <strong>{CANAL_LABEL[tableCanal]}</strong> para o período.
                    </td>
                  </tr>
                ) : (
                  filteredTop.map((r, i) => (
                    <tr key={r.sku}>
                      <td className="tbl__num">{i + 1}.</td>
                      <td className="tbl__primary" title={r.sku}>{r.sku}</td>
                      <td className="tbl__muted">{r.linha}</td>
                      <td className="tbl__muted">{r.categoria}</td>
                      <td className="right tbl__strong">{fmtBRL(r.receita)}</td>
                      <td className="right tbl__muted">{r.share.toFixed(1)}%</td>
                      <td className="right">{fmtNum(r.qtd)}</td>
                      <td className="right tbl__muted">R$ {r.ticketMedio.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <style>{`
        .cn__period { display: inline-flex; align-items: center; gap: 10px; }
        .cn__period-lbl {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-3);
        }
        .cn__rank-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }
        .cn__rank-pills {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .cn__rank-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border: 1.5px solid var(--border);
          border-radius: 99px;
          background: var(--surface);
          color: var(--text-2);
          font-size: 12px;
          font-weight: 600;
          transition: all .12s;
        }
        .cn__rank-pill:hover { border-color: var(--brand-blue); color: var(--text); }
        .cn__rank-pill.on {
          background: var(--brand-blue);
          color: #fff;
          border-color: var(--brand-blue);
        }
        .cn__rank-pill.on .cn__rank-pill-cnt { color: rgba(255,255,255,0.85); }
        .cn__rank-pill-icon { font-size: 14px; }
        .cn__rank-pill-lbl { font-weight: 700; }
        .cn__rank-pill-cnt {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-3);
          padding-left: 6px;
          border-left: 1px solid currentColor;
          opacity: 0.8;
        }
        .cn__rank-tools {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cn__rank-search {
          padding: 6px 12px;
          font-size: 12px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          min-width: 220px;
          outline: none;
        }
        .cn__rank-search:focus { border-color: var(--brand-blue); }
        .cn__rank-limit {
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-sans);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

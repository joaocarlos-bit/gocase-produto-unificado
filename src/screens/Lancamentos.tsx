import { useMemo, useState } from 'react';
import type { ProcessedData, SalesBySkuPayload, Ym } from '../data/types';
import {
  allMonthsWithCurrent,
  buildLancamentos,
  buildMaterialLancamentos,
  classifyLancamento,
  latestMonth,
  launchMonthlySeries,
  LAUNCH_CUTOFF,
} from '../data/aggregates';
import { fmtBRL, ymLabel } from '../lib/format';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { LancamentoTable } from '../components/LancamentoTable';
import { MaterialTable } from '../components/MaterialTable';
import { MonthRangePicker } from '../components/MonthRangePicker';
import { PageHero } from '../components/PageHero';
import { LaunchMonthlyCharts } from '../components/LaunchMonthlyCharts';
import { MultiSelect } from '../components/MultiSelect';
import { Card } from '../components/Card';
import { fmtNum, fmtPct } from '../lib/format';

interface Props { data: ProcessedData; sales: SalesBySkuPayload; }

type TipoFilter = 'all' | 'A' | 'B';
type ViewMode = 'linha' | 'material';

export function Lancamentos({ data, sales }: Props) {
  // Picker liberado pra todo o snapshot — usuário pode comparar com estreias anteriores
  const availableMonths = useMemo(() => allMonthsWithCurrent(data), [data]);
  const latest = latestMonth(data) ?? availableMonths[availableMonths.length - 1] ?? data.meta.period.to;

  // Dois filtros independentes:
  // - estreia: define quais lançamentos entram (por firstSale)
  // - consulta: define o período de agregação dos números (vendas/FC desse window)
  const [estreia, setEstreia] = useState<{ from: Ym; to: Ym }>({ from: LAUNCH_CUTOFF, to: latest });
  const [consulta, setConsulta] = useState<{ from: Ym; to: Ym }>({ from: LAUNCH_CUTOFF, to: latest });

  const allLinhas = useMemo(() => buildLancamentos(data, sales, consulta), [data, sales, consulta]);
  const allMaterials = useMemo(() => buildMaterialLancamentos(data, sales, consulta), [data, sales, consulta]);

  const [filterTipo, setFilterTipo] = useState<TipoFilter>('all');
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [filterMats, setFilterMats] = useState<string[]>([]);
  const [search, setSearch] = useState<string>('');
  const [view, setView] = useState<ViewMode>('linha');
  // Cross-filter: linha selecionada via clique na tabela
  const [selectedLinha, setSelectedLinha] = useState<string | null>(null);

  // Toggle: clicar na mesma linha desmarca; clicar em outra troca a seleção
  function toggleLinhaSelection(linha: string) {
    setSelectedLinha((cur) => (cur === linha ? null : linha));
  }

  const categorias = useMemo(
    () => Array.from(new Set(allLinhas.map((l) => l.categoria))).sort(),
    [allLinhas],
  );

  // Materiais disponíveis = SKUs de todos os lançamentos (já com cutoff aplicado)
  const allMaterialSkus = useMemo(
    () => Array.from(new Set(allMaterials.map((m) => m.sku))).sort(),
    [allMaterials],
  );

  // Linhas que têm pelo menos um material selecionado (pra filtrar a visão por linha)
  const linhasComMatSel = useMemo(() => {
    if (filterMats.length === 0) return null;
    const set = new Set<string>();
    for (const m of allMaterials) if (filterMats.includes(m.sku)) set.add(m.linha);
    return set;
  }, [allMaterials, filterMats]);

  // Filtros: tipo/categoria/busca + escopo de estreia + cross-filter por linha + material
  const linhaRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return allLinhas.filter(
      (l) =>
        (filterTipo === 'all' || l.tipo === filterTipo) &&
        (filterCats.length === 0 || filterCats.includes(l.categoria)) &&
        l.firstSale >= estreia.from && l.firstSale <= estreia.to &&
        (selectedLinha == null || l.linha === selectedLinha) &&
        (linhasComMatSel == null || linhasComMatSel.has(l.linha)) &&
        (q === '' || l.linha.toLocaleLowerCase('pt-BR').includes(q)),
    );
  }, [allLinhas, filterTipo, filterCats, estreia, search, selectedLinha, linhasComMatSel]);

  const materialRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    return allMaterials.filter(
      (m) =>
        (filterTipo === 'all' || m.tipo === filterTipo) &&
        (filterCats.length === 0 || filterCats.includes(m.categoria)) &&
        m.firstSale >= estreia.from && m.firstSale <= estreia.to &&
        (selectedLinha == null || m.linha === selectedLinha) &&
        (filterMats.length === 0 || filterMats.includes(m.sku)) &&
        (q === '' ||
          m.linha.toLocaleLowerCase('pt-BR').includes(q) ||
          m.sku.toLocaleLowerCase('pt-BR').includes(q) ||
          m.nomeMaterial.toLocaleLowerCase('pt-BR').includes(q)),
    );
  }, [allMaterials, filterTipo, filterCats, estreia, search, selectedLinha, filterMats]);

  // Série mensal pros gráficos: usa o WINDOW DE CONSULTA, não o de estreia
  const monthlySeries = useMemo(
    () => launchMonthlySeries(linhaRows, data, sales, consulta.from, consulta.to),
    [linhaRows, data, sales, consulta],
  );

  const totalA = linhaRows.filter((r) => r.tipo === 'A').length;
  const totalB = linhaRows.filter((r) => r.tipo === 'B').length;
  const totalReceita = linhaRows.reduce((s, r) => s + r.receitaAcum, 0);
  const successCount = linhaRows.filter((r) => classifyLancamento(r) === 'success').length;
  const concernCount = linhaRows.filter((r) => classifyLancamento(r) === 'concern').length;
  const discontinuedCount = linhaRows.filter((r) => r.status === 'Descontinuado').length;
  const successRate = linhaRows.length > 0 ? (successCount / linhaRows.length) * 100 : 0;
  const totalMaterials = materialRows.length;


  return (
    <div className="lc">
      <PageHero
        breadcrumb="Unidade de negócio: Produto Gocase · Lançamentos"
        title="Lançamentos"
        subtitle={
          <>
            Definição da squad: <strong>novas linhas</strong> + <strong>drops de cor</strong>.
            Padrão: <strong>lançados em 2026</strong> (a partir de {ymLabel(LAUNCH_CUTOFF)}) — use o picker pra
            ampliar e comparar com estreias anteriores. Visões <em>por linha</em> (agregado) e <em>por material</em> (granular).
          </>
        }
      />

      {/* Filtros */}
      <div className="lc__filters">
        <div className="lc__filter-grp">
          <span className="lc__filter-lbl mono">Visão</span>
          <div className="lc__view-toggle">
            <button
              className={`lc__view-btn ${view === 'linha' ? 'lc__view-btn--on' : ''}`}
              onClick={() => setView('linha')}
            >
              📊 Por linha
            </button>
            <button
              className={`lc__view-btn ${view === 'material' ? 'lc__view-btn--on' : ''}`}
              onClick={() => setView('material')}
            >
              🧱 Por material
            </button>
          </div>
        </div>
        <div className="lc__filter-grp">
          <span className="lc__filter-lbl mono" title="Quais lançamentos entram no escopo (por data de estreia)">Estreia</span>
          <MonthRangePicker available={availableMonths} value={estreia} onChange={setEstreia} />
        </div>
        <div className="lc__filter-grp">
          <span className="lc__filter-lbl mono" title="Período de agregação das vendas (vendas/FC desse window)">Consulta</span>
          <MonthRangePicker available={availableMonths} value={consulta} onChange={setConsulta} />
        </div>
        <div className="lc__filter-grp">
          <span className="lc__filter-lbl mono">Tipo</span>
          <button className={`lc__chip ${filterTipo === 'all' ? 'lc__chip--on' : ''}`} onClick={() => setFilterTipo('all')}>Todos</button>
          <button className={`lc__chip ${filterTipo === 'A' ? 'lc__chip--on' : ''}`} onClick={() => setFilterTipo('A')}>🆕 Novas linhas</button>
          <button className={`lc__chip ${filterTipo === 'B' ? 'lc__chip--on' : ''}`} onClick={() => setFilterTipo('B')}>🎨 Drops de cor</button>
        </div>
        <div className="lc__filter-grp">
          <span className="lc__filter-lbl mono">Categoria</span>
          <MultiSelect
            options={categorias}
            value={filterCats}
            onChange={setFilterCats}
            allLabel="Todas"
          />
        </div>
        <div className="lc__filter-grp">
          <span className="lc__filter-lbl mono">Material</span>
          <MultiSelect
            options={allMaterialSkus}
            value={filterMats}
            onChange={setFilterMats}
            allLabel="Todos"
          />
        </div>
        <div className="lc__filter-grp lc__filter-grp--grow">
          <span className="lc__filter-lbl mono">Buscar</span>
          <input
            className="lc__search"
            placeholder={view === 'linha' ? 'Filtrar por nome da linha…' : 'Filtrar por linha, SKU ou material…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="lc__chip" onClick={() => setSearch('')} title="Limpar busca">✕</button>
          )}
        </div>
      </div>

      {/* Chip de filtro ativo (cross-filter por linha) */}
      {selectedLinha && (
        <div className="lc__active-filter">
          <span className="lc__active-filter-lbl">Filtro ativo</span>
          <button
            className="lc__active-filter-chip"
            onClick={() => setSelectedLinha(null)}
            title="Remover filtro"
          >
            📌 Linha: <strong>{selectedLinha}</strong>
            <span className="lc__active-filter-x">✕</span>
          </button>
          <span className="lc__active-filter-hint">
            Tabelas e gráficos restritos a essa linha · clique no chip ou na linha da tabela pra limpar
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-5">
        <div className="lc__kpi">
          <div className="lc__kpi-lbl mono">Lançamentos no escopo</div>
          <div className="lc__kpi-val mono">{linhaRows.length}</div>
          <div className="lc__kpi-hint">{totalA} novas linhas · {totalB} drops de cor</div>
        </div>
        <div className="lc__kpi" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="lc__kpi-lbl mono">Receita no período</div>
          <div className="lc__kpi-val mono">{fmtBRL(totalReceita)}</div>
          <div className="lc__kpi-hint">{ymLabel(consulta.from)} → {ymLabel(consulta.to)} · totais por linha</div>
        </div>
        <div className="lc__kpi" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="lc__kpi-lbl mono">🟢 Acima da curva</div>
          <div className="lc__kpi-val mono">{successCount}</div>
          <div className="lc__kpi-hint">{successRate.toFixed(0)}% dos lançamentos</div>
        </div>
        <div className="lc__kpi" style={{ borderLeftColor: 'var(--red)' }}>
          <div className="lc__kpi-lbl mono">🔴 Abaixo da curva</div>
          <div className="lc__kpi-val mono">{concernCount}</div>
          <div className="lc__kpi-hint">requer ação · revisar mix/preço</div>
        </div>
        <div className="lc__kpi" style={{ borderLeftColor: 'var(--teal)' }}>
          <div className="lc__kpi-lbl mono">🧱 Materiais novos</div>
          <div className="lc__kpi-val mono">{totalMaterials}</div>
          <div className="lc__kpi-hint">{discontinuedCount} linhas descontinuadas</div>
        </div>
      </div>

      {/* Evolução mensal — sempre visível */}
      <div className="section-title">
        📈 Evolução mensal
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          {ymLabel(consulta.from)} → {ymLabel(consulta.to)} · agregado dos {linhaRows.length} lançamentos no escopo
        </span>
      </div>
      <LaunchMonthlyCharts data={monthlySeries} />

      {/* Realizado vs Forecast mês a mês */}
      <div className="section-title">
        🎯 Realizado vs Forecast
        <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
          qtd vendida vs projetado · agregado das linhas no escopo
        </span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Card
          title="Real vs Forecast · qtd mensal"
          subtitle="Barras agrupadas · azul = real, cinza = forecast · label de atingimento abaixo"
        >
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 28, right: 18, bottom: 28, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis tickFormatter={(v) => fmtNum(v)} tick={{ fill: 'var(--text-3)', fontSize: 10 }} width={56} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number, name: string) => [`${fmtNum(v, false)} un`, name]}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}
                  cursor={{ fill: 'rgba(30, 95, 184, 0.06)' }}
                />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} verticalAlign="top" align="right" />
                <Bar dataKey="qtd" name="Realizado" fill="#1e5fb8" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="qtd"
                    position="top"
                    formatter={(v: number) => (v > 0 ? fmtNum(v) : '')}
                    fill="var(--text)"
                    fontSize={11}
                    fontWeight={700}
                  />
                </Bar>
                <Bar dataKey="fcQtd" name="Forecast" fill="#cbd5e1" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="fcQtd"
                    position="top"
                    formatter={(v: number | null) => (v != null && v > 0 ? fmtNum(v) : '')}
                    fill="var(--text-2)"
                    fontSize={10}
                    fontWeight={600}
                  />
                </Bar>
                {/* Label de atingimento abaixo de cada par */}
                <Bar dataKey="qtd" name=" " stackId="hidden" fill="transparent" legendType="none">
                  <LabelList
                    dataKey="qtd"
                    content={(props: any) => {
                      const { x, y: _y, width, index } = props;
                      const point = monthlySeries[index];
                      if (!point || point.fcQtd == null || point.fcQtd <= 0) return null;
                      const at = (point.qtd / point.fcQtd - 1) * 100;
                      const color = at >= 0 ? '#059669' : at >= -15 ? '#d97706' : '#dc2626';
                      const text = (at >= 0 ? '+' : '') + at.toFixed(0) + '%';
                      return (
                        <g>
                          <text
                            x={x + width / 2}
                            y={310}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={800}
                            fill={color}
                          >
                            {text}
                          </text>
                        </g>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Mini resumo de atingimento agregado */}
          {(() => {
            const totReal = monthlySeries.reduce((s, p) => s + p.qtd, 0);
            const totFc = monthlySeries.reduce((s, p) => s + (p.fcQtd ?? 0), 0);
            const at = totFc > 0 ? (totReal / totFc - 1) * 100 : null;
            return (
              <div style={{ display: 'flex', gap: 16, padding: '12px 4px 0', borderTop: '1px solid var(--border)', marginTop: 8, fontSize: 11, fontWeight: 600 }}>
                <span style={{ color: 'var(--text-2)' }}>Real total: <strong style={{ color: 'var(--text)' }}>{fmtNum(totReal)} un</strong></span>
                <span style={{ color: 'var(--text-2)' }}>FC total: <strong style={{ color: 'var(--text)' }}>{fmtNum(totFc)} un</strong></span>
                <span style={{ color: 'var(--text-2)' }}>Atingimento agregado: {at != null ? (
                  <strong style={{ color: at >= 0 ? 'var(--green)' : at >= -15 ? 'var(--amber)' : 'var(--red)' }}>{fmtPct(at, true)}</strong>
                ) : <strong style={{ color: 'var(--text-3)' }}>—</strong>}</span>
              </div>
            );
          })()}
        </Card>
      </div>

      {view === 'linha' ? (
        <>
          <div className="section-title">
            📊 Lançamentos por linha
            <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
              novas linhas + drops de cor · {linhaRows.length} no escopo
            </span>
          </div>
          <LancamentoTable
            rows={linhaRows}
            exportTitle="lancamentos_por_linha"
            emptyMsg="Nenhum lançamento no escopo filtrado."
            selectedLinha={selectedLinha}
            onRowClick={toggleLinhaSelection}
          />
        </>
      ) : (
        <>
          <div className="section-title">
            🧱 Materiais lançados
            <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
              SKUs novas linhas + drops de cor · {materialRows.length} no escopo
            </span>
          </div>
          <MaterialTable
            rows={materialRows}
            exportTitle="materiais_lancamentos"
            emptyMsg="Nenhum material no escopo filtrado."
            selectedLinha={selectedLinha}
            onRowClick={toggleLinhaSelection}
          />
        </>
      )}

      <style>{`
        .lc__active-filter {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: linear-gradient(90deg, rgba(30, 95, 184, 0.06) 0%, transparent 100%);
          border: 1px solid var(--brand-blue-l);
          border-left: 3px solid var(--brand-blue);
          border-radius: var(--r-md);
          padding: 10px 14px;
          margin-bottom: 16px;
        }
        .lc__active-filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--brand-blue);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .lc__active-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--brand-blue-d);
          background: var(--surface);
          border: 1.5px solid var(--brand-blue);
          border-radius: 99px;
          padding: 5px 12px;
          transition: background 0.15s;
        }
        .lc__active-filter-chip:hover {
          background: var(--brand-blue-l);
        }
        .lc__active-filter-chip strong {
          color: var(--text);
        }
        .lc__active-filter-x {
          font-size: 13px;
          margin-left: 4px;
          color: var(--brand-blue);
          font-weight: 700;
        }
        .lc__active-filter-hint {
          font-size: 11px;
          color: var(--text-2);
          font-weight: 500;
        }
        @media (max-width: 700px) {
          .lc__active-filter-hint { display: none; }
        }

        .lc__filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--r-md);
          padding: 12px 14px;
          margin-bottom: 18px;
        }
        .lc__filter-grp {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .lc__filter-grp--grow {
          flex: 1;
          min-width: 220px;
        }
        .lc__filter-lbl {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-3);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .lc__chip {
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-2);
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 99px;
        }
        .lc__chip:hover {
          border-color: var(--teal);
          color: var(--teal);
        }
        .lc__chip--on {
          background: var(--accent);
          color: var(--text);
          border-color: var(--accent-d);
        }
        .lc__view-toggle {
          display: inline-flex;
          background: var(--surface-2);
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          padding: 2px;
        }
        .lc__view-btn {
          padding: 5px 12px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-2);
          border-radius: 4px;
          transition: background 0.15s, color 0.15s;
        }
        .lc__view-btn:hover { color: var(--teal); }
        .lc__view-btn--on {
          background: var(--teal);
          color: #fff;
        }
        .lc__select {
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 500;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-sans);
          cursor: pointer;
        }
        .lc__search {
          flex: 1;
          min-width: 160px;
          padding: 5px 10px;
          font-size: 12px;
          border: 1.5px solid var(--border);
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--text);
          font-family: var(--font-sans);
          outline: none;
        }
        .lc__search:focus { border-color: var(--teal); }
        .lc__kpi {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-left-width: 3px;
          border-left-color: var(--text-3);
          border-radius: var(--r-md);
          padding: 12px 14px;
        }
        .lc__kpi-lbl {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          margin-bottom: 6px;
        }
        .lc__kpi-val {
          font-size: 30px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.05;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .lc__kpi-hint {
          font-size: 10px;
          color: var(--text-3);
          margin-top: 3px;
        }
      `}</style>
    </div>
  );
}

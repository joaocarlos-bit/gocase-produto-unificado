// Importação › Controle de Importação — fonte: planilha "Controle de POs"
// (Google Sheets, abas "POs por Item" e "Controle PIs"), lida AO VIVO a cada
// carregamento da tela (sem snapshot buildado, diferente do Histórico de
// Custos — ver src/data/controleImportacao.ts).
//
// Duas tabelas:
//   1. Itens de PO — por Processo × SKU (aba "POs por Item")
//   2. PIs / Embarques — 1 linha por PI de verdade (aba "Controle PIs"), com
//      os SKUs do processo (aba "POs por Item") anexados como lista — a aba
//      Controle PIs não liga SKU a embarque específico, então quando o
//      processo tem mais de 1 SKU (a maioria dos casos) a lista cobre TODOS
//      os SKUs do processo, não só os deste embarque (ver aviso na tela).
// Ambas filtráveis por Processo, Fornecedor, SKU e Linha (filtro único, no topo).

import { useEffect, useMemo, useState } from 'react';
import { KPICard } from '../../components/KPICard';
import { MultiSelect } from '../../components/MultiSelect';
import { loadControleImportacao, type ControleImportacaoPayload, type ItemRow, type PIRow } from '../../data/controleImportacao';
import { fmtBRL, ymLabel } from '../../lib/format';

const fmtInt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('pt-BR'));
const fmtCusto = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dash = (v: string | null | undefined) => v || '—';
const skuLabel = (breakdown: { sku: string; quantidade: number }[]) => (breakdown.length === 0 ? '—' : breakdown[0].sku);
const fmtEtaMes = (ym: string | null | undefined) => (ym ? ymLabel(ym) : '—');

// "Observação" é um log de atualizações concatenado numa linha só (sem \n),
// mais recente primeiro: "19/09: Carga entregue... 18/09: SEFAZ liberado...
// 16/07: Documentação recebida". Quebra em entradas por "DD/MM: " — a
// entrada [0] é sempre a mais recente (usada na prévia da tabela, completa).
function splitObservacao(text: string): string[] {
  return text.split(/(?=\d{2}\/\d{2}:\s)/).map((s) => s.trim()).filter(Boolean);
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ControleImportacaoPayload };

type ItemSortKey = 'processo' | 'linha' | 'skuUnico' | 'fornecedor' | 'quantidade' | 'custoFornecedor' | 'qty1stBatch' | 'eta1stBatchYm';
type PISortKey = 'processo' | 'embarque' | 'noDaPI' | 'sku' | 'status' | 'quantidade' | 'valorTotalPI' | 'etdChina' | 'etaSantos' | 'diasDesembaraco' | 'entregaGocase' | 'observacao' | 'tipo' | 'supplier';
type SortDir = 'asc' | 'desc';

const csvCell = (v: string | number | null | undefined) =>
  v == null || (typeof v === 'number' && !Number.isFinite(v)) ? ''
    : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function downloadCsv(filename: string, header: string[], lines: string[]) {
  const csv = [header.map((h) => `"${h}"`).join(','), ...lines].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function ControleImportacao() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const [processoFilter, setProcessoFilter] = useState<string[]>([]);
  const [fornecedorFilter, setFornecedorFilter] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState<string[]>([]);
  const [linhaFilter, setLinhaFilter] = useState<string[]>([]);

  const [itemSort, setItemSort] = useState<{ key: ItemSortKey; dir: SortDir }>({ key: 'processo', dir: 'asc' });
  const [piSort, setPiSort] = useState<{ key: PISortKey; dir: SortDir }>({ key: 'processo', dir: 'asc' });
  const [obsModal, setObsModal] = useState<{ processo: string; noDaPI: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadControleImportacao(reloadKey > 0)
      .then((data) => { if (!cancelled) setState({ kind: 'ready', data }); })
      .catch((e) => { if (!cancelled) setState({ kind: 'error', message: String(e?.message || e) }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const itens = data?.itens ?? [];
  const pis = data?.pis ?? [];

  const options = useMemo(() => {
    const processo = new Set<string>(), fornecedor = new Set<string>(), sku = new Set<string>(), linha = new Set<string>();
    itens.forEach((it) => {
      processo.add(it.processo);
      if (it.fornecedor) fornecedor.add(it.fornecedor);
      if (it.skuUnico) sku.add(it.skuUnico);
      if (it.linha) linha.add(it.linha);
    });
    pis.forEach((p) => {
      processo.add(p.processo);
      if (p.supplier) fornecedor.add(p.supplier);
    });
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { processo: sort(processo), fornecedor: sort(fornecedor), sku: sort(sku), linha: sort(linha) };
  }, [itens, pis]);

  const matchesItem = (it: ItemRow) => (
    (!processoFilter.length || processoFilter.includes(it.processo))
    && (!fornecedorFilter.length || (it.fornecedor != null && fornecedorFilter.includes(it.fornecedor)))
    && (!skuFilter.length || (it.skuUnico != null && skuFilter.includes(it.skuUnico)))
    && (!linhaFilter.length || (it.linha != null && linhaFilter.includes(it.linha)))
  );
  const matchesPI = (p: PIRow) => (
    (!processoFilter.length || processoFilter.includes(p.processo))
    && (!fornecedorFilter.length || (p.supplier != null && fornecedorFilter.includes(p.supplier)))
    && (!skuFilter.length || p.skuBreakdown.some((b) => skuFilter.includes(b.sku)))
    && (!linhaFilter.length || p.linhas.some((l) => linhaFilter.includes(l)))
  );

  const filteredItens = useMemo(() => itens.filter(matchesItem), [itens, processoFilter, fornecedorFilter, skuFilter, linhaFilter]);
  const filteredPIs = useMemo(() => pis.filter(matchesPI), [pis, processoFilter, fornecedorFilter, skuFilter, linhaFilter]);

  const kpis = useMemo(() => ({
    processos: new Set(filteredItens.map((it) => it.processo)).size,
    skus: new Set(filteredItens.map((it) => it.skuUnico).filter(Boolean)).size,
    quantidade: filteredItens.reduce((s, it) => s + it.quantidade, 0),
    valorPIs: filteredPIs.reduce((s, p) => s + (p.valorTotalPI ?? 0), 0),
  }), [filteredItens, filteredPIs]);

  const sortedItens = useMemo(() => {
    const val = (it: ItemRow): string | number => {
      switch (itemSort.key) {
        case 'processo': return it.processo.toLocaleLowerCase('pt-BR');
        case 'linha': return (it.linha || '').toLocaleLowerCase('pt-BR');
        case 'skuUnico': return (it.skuUnico || '').toLocaleLowerCase('pt-BR');
        case 'fornecedor': return (it.fornecedor || '').toLocaleLowerCase('pt-BR');
        case 'quantidade': return it.quantidade;
        case 'custoFornecedor': return it.custoFornecedor ?? -Infinity;
        case 'qty1stBatch': return it.qty1stBatch ?? -Infinity;
        case 'eta1stBatchYm': return it.eta1stBatchYm ?? '';
      }
    };
    return [...filteredItens].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return itemSort.dir === 'asc' ? -1 : 1;
      if (va > vb) return itemSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItens, itemSort]);

  const sortedPIs = useMemo(() => {
    const val = (p: PIRow): string | number => {
      switch (piSort.key) {
        case 'processo': return p.processo.toLocaleLowerCase('pt-BR');
        case 'embarque': return p.embarque.toLocaleLowerCase('pt-BR');
        case 'noDaPI': return p.noDaPI.toLocaleLowerCase('pt-BR');
        case 'sku': return skuLabel(p.skuBreakdown).toLocaleLowerCase('pt-BR');
        case 'status': return (p.status || '').toLocaleLowerCase('pt-BR');
        case 'quantidade': return p.quantidade;
        case 'valorTotalPI': return p.valorTotalPI ?? -Infinity;
        case 'etdChina': return p.etdChina.ts ?? -Infinity;
        case 'etaSantos': return p.etaSantos.ts ?? -Infinity;
        case 'diasDesembaraco': return p.diasDesembaraco ?? -Infinity;
        case 'entregaGocase': return p.entregaGocase.ts ?? -Infinity;
        case 'observacao': return (p.observacao || '').toLocaleLowerCase('pt-BR');
        case 'tipo': return (p.tipo || '').toLocaleLowerCase('pt-BR');
        case 'supplier': return (p.supplier || '').toLocaleLowerCase('pt-BR');
      }
    };
    return [...filteredPIs].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return piSort.dir === 'asc' ? -1 : 1;
      if (va > vb) return piSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredPIs, piSort]);

  function toggleItemSort(key: ItemSortKey) {
    setItemSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  function togglePiSort(key: PISortKey) {
    setPiSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function exportItens() {
    const header = ['Processo', 'Linha', 'SKU único', 'Fornecedor', 'Quantidade', 'Custo Fornecedor', 'Qty 1st Batch', 'ETA 1st Batch'];
    const lines = sortedItens.map((it) => [
      it.processo, it.linha ?? '', it.skuUnico ?? '', it.fornecedor ?? '', it.quantidade,
      it.custoFornecedor ?? '', it.qty1stBatch ?? '', it.eta1stBatchYm ? ymLabel(it.eta1stBatchYm) : '',
    ].map(csvCell).join(','));
    downloadCsv(`controle-importacao-itens_${new Date().toISOString().slice(0, 10)}.csv`, header, lines);
  }
  function exportPIs() {
    const header = ['Processo', 'Embarque', 'No da PI', 'SKU(s) — quantidade', 'Status', 'Quantidade', 'Valor Total PI', 'ETD China', 'ETA Santos', 'Dias Desembaraço', 'Entrega Gocase', 'Observação', 'Tipo', 'Supplier'];
    const lines = sortedPIs.map((p) => [
      p.processo, p.embarque, p.noDaPI, p.skuBreakdown.map((b) => `${b.sku} (${b.quantidade})`).join('; '), p.status ?? '', p.quantidade, p.valorTotalPI ?? '',
      p.etdChina.label ?? '', p.etaSantos.label ?? '', p.diasDesembaraco ?? '', p.entregaGocase.label ?? '',
      p.observacao ?? '', p.tipo ?? '', p.supplier ?? '',
    ].map(csvCell).join(','));
    downloadCsv(`controle-importacao-pis_${new Date().toISOString().slice(0, 10)}.csv`, header, lines);
  }

  if (state.kind === 'loading') {
    return <div className="hc-status"><span className="spinner" /> Carregando Controle de Importação…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="hc-status hc-status--err">
        ⚠ Erro ao carregar: {state.message}
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
          Dado lido ao vivo da planilha "Controle de POs" (Google Sheets, abas "POs por Item" e "Controle PIs").
        </div>
        <button className="hc-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button>
      </div>
    );
  }

  const skuJoinCount = filteredPIs.filter((p) => p.skuBreakdown.length > 1).length;
  const anyFilter = processoFilter.length > 0 || fornecedorFilter.length > 0 || skuFilter.length > 0 || linhaFilter.length > 0;

  const ITEM_COLS: [ItemSortKey, string, string][] = [
    ['processo', 'Processo', ''],
    ['linha', 'Linha', ''],
    ['skuUnico', 'SKU único', ''],
    ['fornecedor', 'Fornecedor', ''],
    ['quantidade', 'Quantidade', 'right'],
    ['custoFornecedor', 'Custo Fornecedor', 'right'],
    ['qty1stBatch', 'Qty 1st Batch', 'right'],
    ['eta1stBatchYm', 'ETA 1st Batch', 'right'],
  ];
  const PI_COLS: [PISortKey, string, string][] = [
    ['processo', 'Processo', ''],
    ['embarque', 'Embarque', ''],
    ['noDaPI', 'Nº da PI', ''],
    ['sku', 'SKU único', ''],
    ['status', 'Status', ''],
    ['quantidade', 'Quantidade', 'right'],
    ['valorTotalPI', 'Valor Total PI', 'right'],
    ['etdChina', 'ETD China', ''],
    ['etaSantos', 'ETA Santos', ''],
    ['diasDesembaraco', 'Dias Desembaraço', 'right'],
    ['entregaGocase', 'Entrega Gocase', ''],
    ['observacao', 'Observação', ''],
    ['tipo', 'Tipo', ''],
    ['supplier', 'Supplier', ''],
  ];

  return (
    <div className="hc">
      <div className="hc__hero">
        <div className="hc__crumb">IMPORTAÇÃO</div>
        <div className="hc__hero-row">
          <div>
            <h1 className="hc__title">Controle de Importação</h1>
            <div className="hc__sub">
              Itens de PO (por Processo × SKU) e PIs/embarques (por Processo × Embarque) — lido ao vivo da planilha
              <strong> Controle de POs</strong>.
            </div>
          </div>
          <div className="hc__hero-right">
            <span className="hc__updated">
              Fonte: Controle de POs › POs por Item + Controle PIs<br />
              Atualizado: {new Date(data!.collectedAt).toLocaleString('pt-BR')}
            </span>
            <button className="hc-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
          </div>
        </div>
      </div>

      <div className="hc__kpis">
        <KPICard label="Processos" value={kpis.processos} icon="📦" accent="blue" />
        <KPICard label="SKUs" value={kpis.skus} icon="🏷️" accent="purple" />
        <KPICard label="Quantidade total (POs)" value={fmtInt(kpis.quantidade)} icon="🔢" accent="blue" />
        <KPICard label="Valor total (PIs)" value={fmtBRL(kpis.valorPIs)} icon="💵" accent="green" hint={`${filteredPIs.length} PI${filteredPIs.length !== 1 ? 's' : ''}`} />
      </div>

      <div className="hc__controls">
        <div className="hc__filters">
          <div className="hc__ctl">
            <span className="hc__ctl-label">Processo</span>
            <MultiSelect options={options.processo} value={processoFilter} onChange={setProcessoFilter} allLabel="Todos" placeholder="Filtrar por processo" />
          </div>
          <div className="hc__ctl">
            <span className="hc__ctl-label">Fornecedor</span>
            <MultiSelect options={options.fornecedor} value={fornecedorFilter} onChange={setFornecedorFilter} allLabel="Todos" placeholder="Filtrar por fornecedor" />
          </div>
          <div className="hc__ctl">
            <span className="hc__ctl-label">SKU</span>
            <MultiSelect options={options.sku} value={skuFilter} onChange={setSkuFilter} allLabel="Todos" placeholder="Filtrar por SKU" />
          </div>
          <div className="hc__ctl">
            <span className="hc__ctl-label">Linha</span>
            <MultiSelect options={options.linha} value={linhaFilter} onChange={setLinhaFilter} allLabel="Todas" placeholder="Filtrar por linha" />
          </div>
          {anyFilter && (
            <button className="hc-retry" style={{ alignSelf: 'flex-end' }} onClick={() => { setProcessoFilter([]); setFornecedorFilter([]); setSkuFilter([]); setLinhaFilter([]); }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabela 1 — Itens de PO */}
      <div className="hc__tbl-wrap">
        <div className="tbl">
          <div className="tbl__topbar">
            <span className="tbl__count">
              Itens de PO
              <span className="tbl__count-sub">· {sortedItens.length} item{sortedItens.length !== 1 ? 'ns' : ''} · aba "POs por Item"</span>
            </span>
            <button className="tbl__export" onClick={exportItens} title="Baixar como CSV">⤓ Exportar CSV</button>
          </div>
          <div className="tbl__wrap">
            <table className="tbl__table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th className="num-col" style={{ width: 32 }}>#</th>
                  {ITEM_COLS.map(([key, label, align]) => (
                    <th key={key} className={`${align === 'right' ? 'right' : ''} ${itemSort.key === key ? 'on' : ''}`} onClick={() => toggleItemSort(key)}>
                      {label}
                      {itemSort.key === key && <span className="tbl__sort">{itemSort.dir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedItens.map((it, i) => (
                  <tr key={`${it.processo}|${it.skuUnico ?? it.itemSupplier}|${i}`}>
                    <td className="tbl__num">{i + 1}.</td>
                    <td className="tbl__primary" title={it.processo}>{it.processo}</td>
                    <td className="tbl__muted">{dash(it.linha)}</td>
                    <td className="tbl__secondary" title={it.skuUnico || it.itemSupplier}>{dash(it.skuUnico)}</td>
                    <td className="tbl__muted">{dash(it.fornecedor)}</td>
                    <td className="right tbl__strong">{fmtInt(it.quantidade)}</td>
                    <td className="right tbl__muted">{fmtCusto(it.custoFornecedor)}</td>
                    <td className="right tbl__muted">{fmtInt(it.qty1stBatch)}</td>
                    <td className="right tbl__muted">{fmtEtaMes(it.eta1stBatchYm)}</td>
                  </tr>
                ))}
                {sortedItens.length === 0 && (
                  <tr><td colSpan={9} className="tbl__muted" style={{ textAlign: 'center', padding: 16 }}>Nenhum item com esse filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="tbl__note">Custo Fornecedor = coluna "Custo" da planilha (por unidade, moeda conforme lançada na PO). ETA 1st Batch = mês estimado de chegada do 1º lote (a planilha guarda como código de mês, não como data exata).</div>
        </div>
      </div>

      {/* Tabela 2 — PIs / Embarques */}
      <div className="hc__tbl-wrap">
        <div className="tbl">
          <div className="tbl__topbar">
            <span className="tbl__count">
              PIs / Embarques
              <span className="tbl__count-sub">· {sortedPIs.length} PI{sortedPIs.length !== 1 ? 's' : ''} · aba "Controle PIs"</span>
            </span>
            <button className="tbl__export" onClick={exportPIs} title="Baixar como CSV">⤓ Exportar CSV</button>
          </div>
          <div className="tbl__wrap">
            <table className="tbl__table tbl--sticky-2col" style={{ minWidth: 1500 }}>
              <thead>
                <tr>
                  <th className="num-col" style={{ width: 32 }}>#</th>
                  {PI_COLS.map(([key, label, align]) => (
                    <th key={key} className={`${align === 'right' ? 'right' : ''} ${piSort.key === key ? 'on' : ''}`} onClick={() => togglePiSort(key)}>
                      {label}
                      {piSort.key === key && <span className="tbl__sort">{piSort.dir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPIs.map((p, i) => (
                  <tr key={`${p.noDaPI}|${i}`}>
                    <td className="tbl__num">{i + 1}.</td>
                    <td className="tbl__primary" title={p.processo}>{p.processo}</td>
                    <td className="tbl__muted">{dash(p.embarque)}</td>
                    <td className="tbl__secondary" title={p.noDaPI}>{dash(p.noDaPI)}</td>
                    <td className="tbl__muted ci-sku-cell">
                      {p.skuBreakdown.length <= 1 ? skuLabel(p.skuBreakdown) : (
                        <div className="ci-sku-list">
                          {p.skuBreakdown.map((b) => (
                            <div key={b.sku} className="ci-sku-list__row">
                              <span className="ci-sku-list__name">{b.sku}</span>
                              <span className="ci-sku-list__qty">{fmtInt(b.quantidade)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="tbl__muted">{dash(p.status)}</td>
                    <td className="right tbl__strong">{fmtInt(p.quantidade)}</td>
                    <td className="right tbl__strong">{fmtBRL(p.valorTotalPI, false)}</td>
                    <td className="tbl__muted">{p.etdChina.label ?? '—'}</td>
                    <td className="tbl__muted">{p.etaSantos.label ?? '—'}</td>
                    <td className="right tbl__muted">{fmtInt(p.diasDesembaraco)}</td>
                    <td className="tbl__muted">{p.entregaGocase.label ?? '—'}</td>
                    <td className="tbl__secondary ci-obs-cell">
                      {p.observacao ? (
                        <>
                          <span className="ci-obs-latest">{splitObservacao(p.observacao)[0]}</span>
                          <button
                            className="ci-obs-more"
                            onClick={(ev) => { ev.stopPropagation(); setObsModal({ processo: p.processo, noDaPI: p.noDaPI, text: p.observacao! }); }}
                          >
                            Ver tudo
                          </button>
                        </>
                      ) : '—'}
                    </td>
                    <td className="tbl__muted">{dash(p.tipo)}</td>
                    <td className="tbl__muted">{dash(p.supplier)}</td>
                  </tr>
                ))}
                {sortedPIs.length === 0 && (
                  <tr><td colSpan={15} className="tbl__muted" style={{ textAlign: 'center', padding: 16 }}>Nenhuma PI com esse filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="tbl__note">
            SKU(s) e quantidade vêm da aba "POs por Item", ligados por Processo (a aba "Controle PIs" não tem SKU próprio).
            {skuJoinCount > 0 && <> {skuJoinCount} de {sortedPIs.length} PI{sortedPIs.length !== 1 ? 's' : ''} em vista {skuJoinCount !== 1 ? 'têm' : 'tem'} mais de um SKU no processo — a lista e as quantidades cobrem TODOS os SKUs do processo, não só os deste embarque específico (a planilha não faz essa ligação).</>}
          </div>
        </div>
      </div>

      {obsModal && (
        <div className="g-modal" onClick={() => setObsModal(null)}>
          <div className="g-modal__box" style={{ maxWidth: 640, width: '92vw' }} onClick={(ev) => ev.stopPropagation()}>
            <div className="g-modal__head">
              <strong>{obsModal.processo} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>· {obsModal.noDaPI}</span></strong>
              <button className="g-modal__x" onClick={() => setObsModal(null)}>✕</button>
            </div>
            <div className="g-modal__body">
              {splitObservacao(obsModal.text).map((entry, i) => (
                <p key={i} className={`ci-obs-entry ${i === 0 ? 'ci-obs-entry--latest' : ''}`}>{entry}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Estilos hc__ e hc- duplicados de HistoricoCustos.tsx — cada tela da
          Importação é independente (sem CSS compartilhado entre elas), então
          precisa da própria cópia pra não depender da outra ter montado antes. */}
      <style>{`
        .hc__hero { margin-bottom: 20px; }
        .hc__crumb { font-size: 10px; font-weight: 700; color: var(--text-3); letter-spacing: 1.5px; margin-bottom: 8px; text-transform: uppercase; }
        .hc__hero-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .hc__title { font-size: 32px; font-weight: 900; color: var(--text); line-height: 1.05; letter-spacing: -1px; }
        .hc__sub { font-size: 13px; font-weight: 500; color: var(--text-2); margin-top: 6px; max-width: 880px; line-height: 1.5; }
        .hc__hero-right { display: flex; align-items: center; gap: 12px; }
        .hc__updated { font-size: 10px; color: var(--text-3); text-align: right; line-height: 1.5; }
        .hc-retry { font-size: 11px; font-weight: 700; padding: 6px 11px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); white-space: nowrap; }
        .hc-retry:hover { background: var(--border); color: var(--text); }

        .hc__kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }

        .hc__controls { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
        .hc__ctl { display: flex; flex-direction: column; gap: 5px; }
        .hc__filters { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
        .hc__ctl-label { font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.6px; }

        .hc__tbl-wrap { margin-top: 18px; }

        .hc-status { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 40px; color: var(--text-2); font-size: 13px; }
        .hc-status--err { color: var(--red); }
        .hc-status code { font-family: var(--font-mono); font-size: 11px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

        .ci-sku-cell { white-space: normal; vertical-align: top; padding-top: 8px; padding-bottom: 8px; }
        .ci-sku-list { display: flex; flex-direction: column; gap: 2px; min-width: 220px; }
        .ci-sku-list__row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
        .ci-sku-list__name { color: var(--text); }
        .ci-sku-list__qty { color: var(--text-3); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

        .ci-obs-cell { white-space: normal; min-width: 260px; max-width: 340px; vertical-align: top; padding-top: 8px; padding-bottom: 8px; }
        .ci-obs-latest { font-size: 11px; line-height: 1.4; }
        .ci-obs-more { display: block; margin-top: 3px; font-size: 10px; font-weight: 700; color: var(--brand-blue); }
        .ci-obs-more:hover { text-decoration: underline; }
        .ci-obs-entry { font-size: 12.5px; line-height: 1.5; color: var(--text-2); margin: 0 0 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
        .ci-obs-entry:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .ci-obs-entry--latest { color: var(--text); font-weight: 600; }

        @media (max-width: 1000px) {
          .hc__kpis { grid-template-columns: repeat(2, 1fr); }
          .hc__controls { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
}

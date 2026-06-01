import { useMemo, useState } from 'react';
import { classifyLancamento, type Lancamento, type LancamentoOutcome } from '../data/aggregates';
import { fmtBRL, fmtNum, fmtPct, ymLabel } from '../lib/format';

interface Props {
  rows: Lancamento[];
  exportTitle?: string;
  emptyMsg?: string;
  /** Cross-filter: toggled by clicking a row. */
  selectedLinha?: string | null;
  onRowClick?: (linha: string) => void;
}

type SortKey =
  | 'linha' | 'tipo' | 'categoria' | 'status' | 'firstSale' | 'monthsActive'
  | 'newSkusCount'
  | 'qtdAcum' | 'receitaAcum' | 'ticketMedio' | 'margemPct'
  | 'forecastAcum' | 'atingimento' | 'outcome';
type SortDir = 'asc' | 'desc';

const OUTCOME_META: Record<LancamentoOutcome, { label: string; cls: string; order: number }> = {
  success:      { label: 'Acima',         cls: 'tbl__pos',   order: 0 },
  watch:        { label: 'Acompanhar',    cls: 'tbl__warn',  order: 1 },
  concern:      { label: 'Abaixo',        cls: 'tbl__neg',   order: 2 },
  discontinued: { label: 'Descontinuado', cls: 'tbl__faded', order: 3 },
  unknown:      { label: 'Sem bench',     cls: 'tbl__faded', order: 4 },
};

function tipoLabel(t: 'A' | 'B'): string {
  return t === 'A' ? 'Nova linha' : 'Drop de cor';
}

function getSortVal(r: Lancamento, key: SortKey): string | number {
  switch (key) {
    case 'linha':         return r.linha.toLocaleLowerCase('pt-BR');
    case 'tipo':          return r.tipo;
    case 'categoria':     return r.categoria.toLocaleLowerCase('pt-BR');
    case 'status':        return r.status.toLocaleLowerCase('pt-BR');
    case 'firstSale':     return r.firstSale;
    case 'monthsActive':  return r.monthsActive;
    case 'newSkusCount':  return r.newSkusCount ?? 0;
    case 'qtdAcum':       return r.qtdAcum;
    case 'receitaAcum':   return r.receitaAcum;
    case 'ticketMedio':   return r.ticketMedio;
    case 'margemPct':     return r.margemPct ?? -Infinity;
    case 'forecastAcum':  return r.forecastAcum ?? -Infinity;
    case 'atingimento':   return r.atingimento ?? -Infinity;
    case 'outcome':       return OUTCOME_META[classifyLancamento(r)].order;
  }
}

function compare(a: string | number, b: string | number, dir: SortDir): number {
  if (a < b) return dir === 'asc' ? -1 : 1;
  if (a > b) return dir === 'asc' ? 1 : -1;
  return 0;
}

function toCsv(rows: Lancamento[]): string {
  const header = [
    'Tipo','Linha','Categoria','Status','Estreia','Meses ativos',
    'SKUs', 'Lista de SKUs',
    'Qtd acum.','Receita acum. (R$)','Ticket médio (R$)','Margem %',
    'Forecast acum.','Δ vs FC (%)',
    'Outcome',
  ];
  const csvCell = (v: string | number | null | undefined) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = rows.map((r) => {
    const out = OUTCOME_META[classifyLancamento(r)].label;
    const cols: (string | number)[] = [
      tipoLabel(r.tipo),
      r.linha, r.categoria, r.status,
      r.firstSale, r.monthsActive,
      r.newSkusCount ?? '',
      (r.newSkus ?? []).map((s) => `${s.sku} (${s.firstSale})`).join(' | '),
      Math.round(r.qtdAcum), r.receitaAcum.toFixed(2), r.ticketMedio.toFixed(2),
      r.margemPct != null ? r.margemPct.toFixed(1) : '',
      r.forecastAcum != null ? Math.round(r.forecastAcum) : '',
      r.atingimento != null ? r.atingimento.toFixed(1) : '',
      out,
    ];
    return cols.map(csvCell).join(',');
  });
  return [header.map((h) => `"${h}"`).join(','), ...lines].join('\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function LancamentoTable({ rows, exportTitle = 'lancamentos', emptyMsg = 'Nada por aqui.', selectedLinha, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('receitaAcum');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => compare(getSortVal(a, sortKey), getSortVal(b, sortKey), sortDir));
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      const numericKeys: SortKey[] = ['monthsActive','newSkusCount','qtdAcum','receitaAcum','ticketMedio','margemPct','forecastAcum','atingimento'];
      setSortDir(numericKeys.includes(key) ? 'desc' : 'asc');
    }
  }

  function handleExport() {
    const csv = toCsv(sorted);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `${exportTitle}_${ts}.csv`);
  }

  if (rows.length === 0) {
    return <div className="tbl__empty">{emptyMsg}</div>;
  }

  type Hdr = { key: SortKey; label: string; align?: 'right'; hint?: string };
  const headers: Hdr[] = [
    { key: 'linha',         label: 'Linha' },
    { key: 'tipo',          label: 'Tipo', hint: '"Nova linha" = linha inteira inédita; "Drop de cor" = nova cor/variação de linha existente' },
    { key: 'categoria',     label: 'Categoria' },
    { key: 'status',        label: 'Status' },
    { key: 'firstSale',     label: 'Estreia' },
    { key: 'monthsActive',  label: 'Meses', align: 'right', hint: 'Meses desde a estreia (inclusive)' },
    { key: 'newSkusCount',  label: 'SKUs', align: 'right', hint: 'Nº de SKUs/cores novos. Tipo A = SKUs da linha; Tipo B = SKUs do drop.' },
    { key: 'qtdAcum',       label: 'Qtd', align: 'right' },
    { key: 'receitaAcum',   label: 'Receita', align: 'right' },
    { key: 'ticketMedio',   label: 'TM', align: 'right', hint: 'Ticket médio acumulado' },
    { key: 'margemPct',     label: 'Margem %', align: 'right', hint: '(TM − custo) ÷ TM × 100. Custo unitário da linha (TicketSense).' },
    { key: 'forecastAcum',  label: 'FC', align: 'right', hint: 'Forecast acumulado no período pós-estreia' },
    { key: 'atingimento',   label: 'vs FC', align: 'right', hint: 'Realizado ÷ Forecast − 1' },
    { key: 'outcome',       label: 'Sinal' },
  ];

  const clickable = !!onRowClick;
  return (
    <div className={`tbl tbl--sticky-2col ${clickable ? 'tbl--clickable' : ''}`}>
      <div className="tbl__topbar">
        <span className="tbl__count">
          {rows.length} lançamento{rows.length !== 1 ? 's' : ''}
          {clickable && <span className="tbl__count-sub">· clique para filtrar</span>}
        </span>
        <button className="tbl__export" onClick={handleExport} title="Baixar como CSV">⤓ Exportar CSV</button>
      </div>
      <div className="tbl__wrap">
        <table className="tbl__table" style={{ minWidth: 1280 }}>
          <thead>
            <tr>
              <th className="num-col" style={{ width: 32 }}>#</th>
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`${h.align === 'right' ? 'right' : ''} ${sortKey === h.key ? 'on' : ''}`}
                  onClick={() => toggleSort(h.key)}
                  title={h.hint}
                >
                  {h.label}
                  {sortKey === h.key && <span className="tbl__sort">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const out = classifyLancamento(r);
              const meta = OUTCOME_META[out];
              const isSelected = selectedLinha === r.linha;
              return (
                <tr
                  key={i}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={onRowClick ? () => onRowClick(r.linha) : undefined}
                >
                  <td className="tbl__num">{i + 1}.</td>
                  <td className="tbl__primary" title={r.linha}>{r.linha}</td>
                  <td className={r.tipo === 'A' ? 'tbl__info' : 'tbl__warn'} style={{ fontWeight: 600 }}>{tipoLabel(r.tipo)}</td>
                  <td className="tbl__muted">{r.categoria}</td>
                  <td className="tbl__muted">{r.status}</td>
                  <td className="tbl__muted">{ymLabel(r.firstSale)}</td>
                  <td className="right tbl__muted">{r.monthsActive}</td>
                  <td
                    className="right"
                    title={r.newSkus?.map((s) => `${s.sku} (${ymLabel(s.firstSale)})`).join('\n')}
                  >
                    {r.newSkusCount ?? '—'}
                  </td>
                  <td className="right">{fmtNum(r.qtdAcum)}</td>
                  <td className="right tbl__strong">{fmtBRL(r.receitaAcum)}</td>
                  <td className="right tbl__muted">R$ {r.ticketMedio.toFixed(2)}</td>
                  <td className={`right ${r.margemPct == null ? 'tbl__faded' : r.margemPct >= 50 ? 'tbl__pos' : r.margemPct >= 30 ? 'tbl__warn' : 'tbl__neg'}`}>
                    {r.margemPct != null ? `${r.margemPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="right tbl__muted">{r.forecastAcum != null ? fmtNum(r.forecastAcum) : '—'}</td>
                  <td className={`right ${r.atingimento == null ? 'tbl__faded' : r.atingimento >= 0 ? 'tbl__pos' : 'tbl__neg'}`}>
                    {r.atingimento == null ? '—' : fmtPct(r.atingimento, true)}
                  </td>
                  <td className={meta.cls}>{meta.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

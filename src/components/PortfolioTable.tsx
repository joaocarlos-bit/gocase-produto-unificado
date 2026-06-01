import { useMemo, useState } from 'react';
import type { PortfolioLinha } from '../data/aggregates';
import { fmtBRL, fmtNum, fmtPct } from '../lib/format';

interface Props {
  rows: PortfolioLinha[];
  exportTitle?: string;
  emptyMsg?: string;
  selectedLinha?: string | null;
  onRowClick?: (linha: string) => void;
}

type SortKey =
  | 'linha' | 'categoria' | 'status'
  | 'receita' | 'qtd' | 'ticketMedio' | 'margemPct'
  | 'share' | 'shareAcum' | 'yoyPct' | 'atingimento';
type SortDir = 'asc' | 'desc';

function getSortVal(r: PortfolioLinha, key: SortKey): string | number {
  switch (key) {
    case 'linha':        return r.linha.toLocaleLowerCase('pt-BR');
    case 'categoria':    return r.categoria.toLocaleLowerCase('pt-BR');
    case 'status':       return r.status.toLocaleLowerCase('pt-BR');
    case 'receita':      return r.receita;
    case 'qtd':          return r.qtd;
    case 'ticketMedio':  return r.ticketMedio;
    case 'margemPct':    return r.margemPct ?? -Infinity;
    case 'share':        return r.share;
    case 'shareAcum':    return r.shareAcum;
    case 'yoyPct':       return r.yoyPct ?? -Infinity;
    case 'atingimento':  return r.atingimento ?? -Infinity;
  }
}

function compare(a: string | number, b: string | number, dir: SortDir): number {
  if (a < b) return dir === 'asc' ? -1 : 1;
  if (a > b) return dir === 'asc' ? 1 : -1;
  return 0;
}

function toCsv(rows: PortfolioLinha[]): string {
  const header = [
    'Linha', 'Categoria', 'Status',
    'Receita (R$)', 'Qtd', 'Ticket médio (R$)', 'Margem %',
    'Share %', 'Share acum. %', 'YoY %', 'vs FC %',
  ];
  const csvCell = (v: string | number | null | undefined) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.linha, r.categoria, r.status,
      r.receita.toFixed(2), Math.round(r.qtd), r.ticketMedio.toFixed(2),
      r.margemPct != null ? r.margemPct.toFixed(1) : '',
      r.share.toFixed(2), r.shareAcum.toFixed(2),
      r.yoyPct != null ? r.yoyPct.toFixed(1) : '',
      r.atingimento != null ? r.atingimento.toFixed(1) : '',
    ].map(csvCell).join(','),
  );
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

export function PortfolioTable({ rows, exportTitle = 'portfolio', emptyMsg = 'Sem dados no escopo.', selectedLinha, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('receita');
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
      const numericKeys: SortKey[] = ['receita','qtd','ticketMedio','margemPct','share','shareAcum','yoyPct','atingimento'];
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
    { key: 'linha',        label: 'Linha' },
    { key: 'categoria',    label: 'Categoria' },
    { key: 'status',       label: 'Status' },
    { key: 'receita',      label: 'Receita', align: 'right' },
    { key: 'share',        label: 'Share', align: 'right', hint: 'Participação na receita total do período' },
    { key: 'shareAcum',    label: 'Share acum.', align: 'right', hint: 'Pareto: % cumulativa ordenando por receita desc' },
    { key: 'qtd',          label: 'Qtd', align: 'right' },
    { key: 'ticketMedio',  label: 'TM', align: 'right' },
    { key: 'margemPct',    label: 'Margem %', align: 'right' },
    { key: 'yoyPct',       label: 'YoY %', align: 'right', hint: 'Crescimento vs mesmo período do ano anterior' },
    { key: 'atingimento',  label: 'vs FC', align: 'right', hint: 'Realizado ÷ Forecast − 1' },
  ];

  const clickable = !!onRowClick;
  return (
    <div className={`tbl tbl--sticky-2col ${clickable ? 'tbl--clickable' : ''}`}>
      <div className="tbl__topbar">
        <span className="tbl__count">
          {rows.length} linha{rows.length !== 1 ? 's' : ''}
          {clickable && <span className="tbl__count-sub">· clique para filtrar</span>}
        </span>
        <button className="tbl__export" onClick={handleExport} title="Baixar como CSV">⤓ Exportar CSV</button>
      </div>
      <div className="tbl__wrap">
        <table className="tbl__table" style={{ minWidth: 1100 }}>
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
              const isSelected = selectedLinha === r.linha;
              return (
                <tr
                  key={i}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={onRowClick ? () => onRowClick(r.linha) : undefined}
                >
                  <td className="tbl__num">{i + 1}.</td>
                  <td className="tbl__primary" title={r.linha}>{r.linha}</td>
                  <td className="tbl__muted">{r.categoria}</td>
                  <td className="tbl__muted">{r.status}</td>
                  <td className="right tbl__strong">{fmtBRL(r.receita)}</td>
                  <td className="right">{r.share.toFixed(1)}%</td>
                  <td className="right tbl__muted">{r.shareAcum.toFixed(1)}%</td>
                  <td className="right">{fmtNum(r.qtd)}</td>
                  <td className="right tbl__muted">R$ {r.ticketMedio.toFixed(2)}</td>
                  <td className={`right ${r.margemPct == null ? 'tbl__faded' : r.margemPct >= 50 ? 'tbl__pos' : r.margemPct >= 30 ? 'tbl__warn' : 'tbl__neg'}`}>
                    {r.margemPct != null ? `${r.margemPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`right ${r.yoyPct == null ? 'tbl__faded' : r.yoyPct >= 0 ? 'tbl__pos' : 'tbl__neg'}`}>
                    {r.yoyPct == null ? '—' : fmtPct(r.yoyPct, true)}
                  </td>
                  <td className={`right ${r.atingimento == null ? 'tbl__faded' : r.atingimento >= 0 ? 'tbl__pos' : 'tbl__neg'}`}>
                    {r.atingimento == null ? '—' : fmtPct(r.atingimento, true)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

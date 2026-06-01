import { useMemo, useState } from 'react';
import type { CoberturaBand, EstoqueRow, SugestaoAcao } from '../data/aggregates';
import { BAND_LABEL } from '../data/aggregates';
import { fmtBRL, fmtNum } from '../lib/format';

interface Props {
  rows: EstoqueRow[];
  exportTitle?: string;
  emptyMsg?: string;
  selectedLinha?: string | null;
  onRowClick?: (linha: string) => void;
}

type SortKey =
  | 'sku' | 'linha' | 'categoria' | 'status' | 'curva'
  | 'estoque' | 'custo' | 'capital' | 'saida7d' | 'coberturaDias' | 'band' | 'sugestao';
type SortDir = 'asc' | 'desc';

const BAND_CLS: Record<CoberturaBand, string> = {
  ruptura: 'tbl__neg',
  critica: 'tbl__neg',
  baixa:   'tbl__warn',
  boa:     'tbl__pos',
  excesso: 'tbl__info',
};
const SUGESTAO_CLS: Record<SugestaoAcao, string> = {
  'Repor urgente': 'tbl__neg',
  'Repor':         'tbl__neg',
  'Monitorar':     'tbl__warn',
  'Manter':        'tbl__pos',
  'Promover':      'tbl__info',
  'Liquidar':      'tbl__neg',
};

const CURVA_ORDER: Record<string, number> = { 'AA': 0, 'A': 1, 'B': 2, 'C': 3, 'Não Classificado': 4 };
const BAND_ORDER: Record<CoberturaBand, number> = { ruptura: 0, critica: 1, baixa: 2, boa: 3, excesso: 4 };

function getSortVal(r: EstoqueRow, key: SortKey): string | number {
  switch (key) {
    case 'sku':           return r.sku.toLocaleLowerCase('pt-BR');
    case 'linha':         return r.linha.toLocaleLowerCase('pt-BR');
    case 'categoria':     return r.categoria.toLocaleLowerCase('pt-BR');
    case 'status':        return r.status.toLocaleLowerCase('pt-BR');
    case 'curva':         return CURVA_ORDER[r.curva] ?? 99;
    case 'estoque':       return r.estoque;
    case 'custo':         return r.custo;
    case 'capital':       return r.capitalImobilizado;
    case 'saida7d':       return r.saida7d;
    case 'coberturaDias': return r.coberturaDias ?? Infinity;
    case 'band':          return BAND_ORDER[r.band];
    case 'sugestao':      return r.sugestao.toLocaleLowerCase('pt-BR');
  }
}

function compare(a: string | number, b: string | number, dir: SortDir): number {
  if (a < b) return dir === 'asc' ? -1 : 1;
  if (a > b) return dir === 'asc' ? 1 : -1;
  return 0;
}

function toCsv(rows: EstoqueRow[]): string {
  const header = [
    'SKU','Linha','Categoria','Status','Curva ABC',
    'Estoque (un)','Custo (R$)','Capital imobilizado (R$)',
    'Saída 7d (un/dia)','Cobertura (dias)','Banda','Sugestão',
  ];
  const csvCell = (v: string | number | null | undefined) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.sku, r.linha, r.categoria, r.status, r.curva,
      Math.round(r.estoque), r.custo.toFixed(2), r.capitalImobilizado.toFixed(2),
      r.saida7d.toFixed(2),
      r.coberturaDias != null ? r.coberturaDias.toFixed(1) : '',
      BAND_LABEL[r.band], r.sugestao,
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

export function EstoqueTable({ rows, exportTitle = 'estoque', emptyMsg = 'Sem dados.', selectedLinha, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('capital');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => compare(getSortVal(a, sortKey), getSortVal(b, sortKey), sortDir));
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      const numericKeys: SortKey[] = ['estoque','custo','capital','saida7d','coberturaDias','curva','band'];
      setSortDir(numericKeys.includes(key) ? 'desc' : 'asc');
    }
  }

  function handleExport() {
    const csv = toCsv(sorted);
    const ts = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `${exportTitle}_${ts}.csv`);
  }

  if (rows.length === 0) return <div className="tbl__empty">{emptyMsg}</div>;

  type Hdr = { key: SortKey; label: string; align?: 'right'; hint?: string };
  const headers: Hdr[] = [
    { key: 'sku',           label: 'SKU' },
    { key: 'linha',         label: 'Linha' },
    { key: 'categoria',     label: 'Categoria' },
    { key: 'curva',         label: 'Curva' },
    { key: 'estoque',       label: 'Estoque', align: 'right' },
    { key: 'custo',         label: 'Custo', align: 'right' },
    { key: 'capital',       label: 'Capital R$', align: 'right', hint: 'Estoque × custo unitário (capital imobilizado)' },
    { key: 'saida7d',       label: 'Saída/dia', align: 'right' },
    { key: 'coberturaDias', label: 'Cobertura', align: 'right' },
    { key: 'band',          label: 'Banda' },
    { key: 'sugestao',      label: 'Sugestão' },
  ];

  const clickable = !!onRowClick;
  return (
    <div className={`tbl tbl--sticky-2col ${clickable ? 'tbl--clickable' : ''}`}>
      <div className="tbl__topbar">
        <span className="tbl__count">
          {rows.length} SKU{rows.length !== 1 ? 's' : ''}
          {clickable && <span className="tbl__count-sub">· clique para filtrar pela linha</span>}
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
              const isSelected = selectedLinha === r.linha;
              return (
                <tr
                  key={i}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={onRowClick ? () => onRowClick(r.linha) : undefined}
                >
                  <td className="tbl__num">{i + 1}.</td>
                  <td className="tbl__primary" title={r.sku}>{r.sku}</td>
                  <td className="tbl__muted">{r.linha}</td>
                  <td className="tbl__muted">{r.categoria}</td>
                  <td className={r.curva === 'Não Classificado' ? 'tbl__faded' : 'tbl__strong'}>{r.curva}</td>
                  <td className="right tbl__strong">{fmtNum(r.estoque)}</td>
                  <td className="right tbl__muted">R$ {r.custo.toFixed(2)}</td>
                  <td className="right tbl__strong">{fmtBRL(r.capitalImobilizado)}</td>
                  <td className="right tbl__muted">{r.saida7d.toFixed(1)}</td>
                  <td className={`right ${BAND_CLS[r.band]}`}>{r.coberturaDias != null ? `${Math.round(r.coberturaDias)}d` : '—'}</td>
                  <td className={BAND_CLS[r.band]}>{BAND_LABEL[r.band]}</td>
                  <td className={SUGESTAO_CLS[r.sugestao]}>{r.sugestao}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

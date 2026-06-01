import { useMemo, useState } from 'react';
import { classifyMaterialHealth, type MaterialHealth, type MaterialLancamento } from '../data/aggregates';
import { fmtBRL, fmtNum, ymLabel } from '../lib/format';

interface Props {
  rows: MaterialLancamento[];
  exportTitle?: string;
  emptyMsg?: string;
  /** Cross-filter: linha selecionada (recebe destaque). */
  selectedLinha?: string | null;
  /** Clique numa row dispara o filtro pela linha. */
  onRowClick?: (linha: string) => void;
}

type SortKey =
  | 'tipo' | 'material' | 'linha' | 'categoria' | 'firstSale'
  | 'qtdAcum' | 'receitaAcum' | 'ticketMedio' | 'custo' | 'margemPct'
  | 'estoque' | 'coberturaDias';
type SortDir = 'asc' | 'desc';

const HEALTH_CLS: Record<MaterialHealth, string> = {
  critical: 'tbl__neg',
  low:      'tbl__warn',
  good:     'tbl__pos',
  high:     'tbl__info',
  unknown:  'tbl__faded',
};

/** Display name: strip " / <Linha>" suffix when it duplicates the Linha column. */
function displayMaterial(r: MaterialLancamento): string {
  const suffix = ` / ${r.linha}`;
  if (r.nomeMaterial.endsWith(suffix)) {
    return r.nomeMaterial.slice(0, -suffix.length);
  }
  return r.nomeMaterial;
}

function getSortVal(r: MaterialLancamento, key: SortKey): string | number {
  switch (key) {
    case 'tipo':           return r.tipo;
    case 'material':       return displayMaterial(r).toLocaleLowerCase('pt-BR');
    case 'linha':          return r.linha.toLocaleLowerCase('pt-BR');
    case 'categoria':      return r.categoria.toLocaleLowerCase('pt-BR');
    case 'firstSale':      return r.firstSale;
    case 'qtdAcum':        return r.qtdAcum ?? -Infinity;
    case 'receitaAcum':    return r.receitaAcum ?? -Infinity;
    case 'ticketMedio':    return r.ticketMedio ?? -Infinity;
    case 'custo':          return r.custo ?? -Infinity;
    case 'margemPct':      return r.margemPct ?? -Infinity;
    case 'estoque':        return r.estoque ?? -Infinity;
    case 'coberturaDias':  return r.coberturaDias ?? -Infinity;
  }
}

function tipoLabel(t: 'A' | 'B'): string {
  return t === 'A' ? 'Nova linha' : 'Drop de cor';
}

function compare(a: string | number, b: string | number, dir: SortDir): number {
  if (a < b) return dir === 'asc' ? -1 : 1;
  if (a > b) return dir === 'asc' ? 1 : -1;
  return 0;
}

function toCsv(rows: MaterialLancamento[]): string {
  const header = [
    'Tipo','Material','SKU','Linha','Categoria',
    'Estreia',
    'Qtd acumulada','Receita acumulada (R$)','Ticket médio (R$)','Custo (R$)','Margem %',
    'Estoque (un)','Saída 7d (un/dia)','Cobertura (dias)',
  ];
  const csvCell = (v: string | number | null | undefined) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = rows.map((r) => {
    return [
      r.tipo === 'A' ? 'Nova linha' : 'Drop de cor',
      displayMaterial(r), r.sku, r.linha, r.categoria,
      r.firstSale,
      r.qtdAcum != null ? Math.round(r.qtdAcum) : '',
      r.receitaAcum != null ? r.receitaAcum.toFixed(2) : '',
      r.ticketMedio != null ? r.ticketMedio.toFixed(2) : '',
      r.custo != null ? r.custo.toFixed(2) : '',
      r.margemPct != null ? r.margemPct.toFixed(1) : '',
      r.estoque != null ? Math.round(r.estoque) : '',
      r.saida7d != null ? r.saida7d.toFixed(2) : '',
      r.coberturaDias != null ? r.coberturaDias.toFixed(1) : '',
    ].map(csvCell).join(',');
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

export function MaterialTable({ rows, exportTitle = 'materiais_lancamentos', emptyMsg = 'Nada por aqui.', selectedLinha, onRowClick }: Props) {
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
      const numericKeys: SortKey[] = ['qtdAcum','receitaAcum','ticketMedio','custo','margemPct','estoque','coberturaDias'];
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
    { key: 'material',         label: 'Material' },
    { key: 'tipo',             label: 'Tipo', hint: '"Nova linha" = linha inteira inédita; "Drop de cor" = nova cor/variação de linha existente' },
    { key: 'linha',            label: 'Linha' },
    { key: 'categoria',        label: 'Categoria' },
    { key: 'firstSale',        label: 'Estreia' },
    { key: 'qtdAcum',          label: 'Qtd', align: 'right', hint: 'Quantidade real acumulada desde a estreia' },
    { key: 'receitaAcum',      label: 'Receita', align: 'right', hint: 'Receita real acumulada desde a estreia' },
    { key: 'ticketMedio',      label: 'TM', align: 'right', hint: 'Ticket médio real (receita ÷ qtd) por SKU' },
    { key: 'custo',            label: 'Custo', align: 'right', hint: 'Custo unitário do SKU (TicketSense)' },
    { key: 'margemPct',        label: 'Margem %', align: 'right', hint: '(TM − custo) ÷ TM × 100 · TM e custo são por SKU' },
    { key: 'estoque',          label: 'Estoque', align: 'right' },
    { key: 'coberturaDias',    label: 'Cobertura', align: 'right', hint: 'Estoque ÷ saída diária 7d' },
  ];

  const withSalesCount = rows.filter((r) => r.receitaAcum != null && r.receitaAcum > 0).length;
  const clickable = !!onRowClick;

  return (
    <div className={`tbl tbl--sticky-2col ${clickable ? 'tbl--clickable' : ''}`}>
      <div className="tbl__topbar">
        <span className="tbl__count">
          {rows.length} material{rows.length !== 1 ? 'is' : ''}
          {withSalesCount < rows.length && (
            <span className="tbl__count-sub">· {withSalesCount} com vendas registradas</span>
          )}
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
              const matName = displayMaterial(r);
              const health = classifyMaterialHealth(r);
              const cobCls = HEALTH_CLS[health];
              const isSelected = selectedLinha === r.linha;
              return (
                <tr
                  key={i}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={onRowClick ? () => onRowClick(r.linha) : undefined}
                >
                  <td className="tbl__num">{i + 1}.</td>
                  <td className="tbl__primary" title={r.sku !== matName ? `SKU: ${r.sku}` : undefined}>{matName}</td>
                  <td className={r.tipo === 'A' ? 'tbl__info' : 'tbl__warn'} style={{ fontWeight: 600 }}>{tipoLabel(r.tipo)}</td>
                  <td className="tbl__muted">{r.linha}</td>
                  <td className="tbl__muted">{r.categoria}</td>
                  <td className="tbl__muted">{ymLabel(r.firstSale)}</td>
                  <td className={`right ${r.qtdAcum == null ? 'tbl__faded' : ''}`}>
                    {r.qtdAcum != null ? fmtNum(r.qtdAcum) : '—'}
                  </td>
                  <td className={`right ${r.receitaAcum == null ? 'tbl__faded' : 'tbl__strong'}`}>
                    {r.receitaAcum != null ? fmtBRL(r.receitaAcum) : '—'}
                  </td>
                  <td className={`right ${r.ticketMedio == null ? 'tbl__faded' : 'tbl__muted'}`}>
                    {r.ticketMedio != null ? `R$ ${r.ticketMedio.toFixed(2)}` : '—'}
                  </td>
                  <td className={`right ${r.custo == null ? 'tbl__faded' : 'tbl__muted'}`}>
                    {r.custo != null ? `R$ ${r.custo.toFixed(2)}` : '—'}
                  </td>
                  <td className={`right ${r.margemPct == null ? 'tbl__faded' : r.margemPct >= 50 ? 'tbl__pos' : r.margemPct >= 30 ? 'tbl__warn' : 'tbl__neg'}`}>
                    {r.margemPct != null ? `${r.margemPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`right ${r.estoque == null ? 'tbl__faded' : 'tbl__strong'}`}>
                    {r.estoque != null ? fmtNum(r.estoque) : '—'}
                  </td>
                  <td className={`right ${r.coberturaDias == null ? 'tbl__faded' : cobCls}`}>
                    {r.coberturaDias != null ? `${Math.round(r.coberturaDias)}d` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tbl__note">
        Todas as métricas são <strong>reais por SKU</strong>, acumuladas desde a estreia do material.
        Cobertura colorida: vermelho &lt;7d, âmbar 7–30d, verde 30–90d, azul &gt;90d.
      </div>
    </div>
  );
}

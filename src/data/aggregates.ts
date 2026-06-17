import type {
  CanalGrupo,
  Categoria,
  CurvaABC,
  LinhaAgg,
  ProcessedData,
  SalesBySkuPayload,
  Status,
  Ym,
} from './types';
import { maxYm as pickMaxYm, shiftYm } from '../lib/format';

// ────────────────────────────────────────────────────────────
// CANAIS — filtro aplicado antes da agregação
// ────────────────────────────────────────────────────────────

/**
 * Devolve uma cópia shallow-rasa do ProcessedData com `cell.qtd`/`cell.receita`
 * reescritos como soma dos canais selecionados. Demais campos (COST_MAP,
 * FC_MAP, STOCK_MAP, typeA/B, etc.) ficam intactos — esses não têm dimensão
 * de canal por enquanto. `null`/`undefined`/array vazio = retorna `data` intacto.
 */
export function applyChannelFilter(data: ProcessedData, canais: CanalGrupo[] | null | undefined): ProcessedData {
  if (!canais || canais.length === 0) return data;
  const newSalesByLinha: ProcessedData['salesByLinha'] = {};
  for (const [linha, sd] of Object.entries(data.salesByLinha)) {
    const newMonths: typeof sd.months = {};
    for (const [ym, cell] of Object.entries(sd.months)) {
      if (!cell.byCanal) {
        newMonths[ym] = cell;
        continue;
      }
      let qtd = 0, receita = 0;
      for (const c of canais) {
        const cc = cell.byCanal[c];
        if (cc) { qtd += cc.qtd; receita += cc.receita; }
      }
      if (qtd === 0 && receita === 0) continue;
      newMonths[ym] = { ...cell, qtd, receita };
    }
    newSalesByLinha[linha] = { ...sd, months: newMonths };
  }
  return { ...data, salesByLinha: newSalesByLinha };
}

export function applyChannelFilterToSales(sales: SalesBySkuPayload, canais: CanalGrupo[] | null | undefined): SalesBySkuPayload {
  if (!canais || canais.length === 0) return sales;
  const newSalesBySku: SalesBySkuPayload['salesBySku'] = {};
  for (const [sku, sd] of Object.entries(sales.salesBySku)) {
    const newMonths: typeof sd.months = {};
    let totQtd = 0, totRec = 0;
    for (const [ym, cell] of Object.entries(sd.months)) {
      if (!cell.byCanal) {
        newMonths[ym] = cell;
        totQtd += cell.qtd; totRec += cell.receita;
        continue;
      }
      let qtd = 0, receita = 0;
      for (const c of canais) {
        const cc = cell.byCanal[c];
        if (cc) { qtd += cc.qtd; receita += cc.receita; }
      }
      if (qtd === 0 && receita === 0) continue;
      newMonths[ym] = { ...cell, qtd, receita };
      totQtd += qtd; totRec += receita;
    }
    newSalesBySku[sku] = { ...sd, months: newMonths, totalQtd: totQtd, totalReceita: totRec };
  }
  return { ...sales, salesBySku: newSalesBySku };
}

/** Totais por grupo de canal — usado na tela Canais. */
export interface CanalTotal {
  canal: CanalGrupo;
  qtd: number;
  receita: number;
  ticketMedio: number;
  share: number;       // % da receita
  linhasCount: number;
  skusCount: number;
}

export function totalsByCanal(data: ProcessedData, from: Ym, to: Ym): CanalTotal[] {
  const accs: Record<CanalGrupo, { qtd: number; receita: number; linhas: Set<string> }> = {
    D2C:     { qtd: 0, receita: 0, linhas: new Set() },
    B2B:     { qtd: 0, receita: 0, linhas: new Set() },
    Lojas:   { qtd: 0, receita: 0, linhas: new Set() },
    Brindes: { qtd: 0, receita: 0, linhas: new Set() },
  };
  for (const [linha, sd] of Object.entries(data.salesByLinha)) {
    for (const [ym, cell] of Object.entries(sd.months)) {
      if (ym < from || ym > to) continue;
      if (!cell.byCanal) continue;
      for (const c of Object.keys(cell.byCanal) as CanalGrupo[]) {
        const cc = cell.byCanal[c]!;
        if (cc.qtd === 0 && cc.receita === 0) continue;
        accs[c].qtd += cc.qtd;
        accs[c].receita += cc.receita;
        accs[c].linhas.add(linha);
      }
    }
  }
  const total = (['D2C', 'B2B', 'Lojas', 'Brindes'] as CanalGrupo[])
    .reduce((s, c) => s + accs[c].receita, 0);
  return (['D2C', 'B2B', 'Lojas', 'Brindes'] as CanalGrupo[]).map((c) => ({
    canal: c,
    qtd: accs[c].qtd,
    receita: accs[c].receita,
    ticketMedio: accs[c].qtd > 0 ? accs[c].receita / accs[c].qtd : 0,
    share: total > 0 ? (accs[c].receita / total) * 100 : 0,
    linhasCount: accs[c].linhas.size,
    skusCount: 0, // calculado abaixo se sales for fornecido
  }));
}

export interface SkuByCanalRow {
  sku: string;
  linha: string;
  categoria: Categoria;
  qtd: number;
  receita: number;
  ticketMedio: number;
  share: number; // % dentro do canal
}

/**
 * Top SKUs por canal no período. Usa o sales-by-sku.json (com byCanal por mês)
 * cruzando com STOCK_MAP pra resolver linha/categoria.
 */
export function topSkusByCanal(
  data: ProcessedData,
  sales: SalesBySkuPayload,
  canal: CanalGrupo,
  from: Ym,
  to: Ym,
  limit = 50,
): SkuByCanalRow[] {
  const rows: SkuByCanalRow[] = [];
  let totRec = 0;
  for (const [sku, sd] of Object.entries(sales.salesBySku)) {
    let qtd = 0, receita = 0;
    for (const [ym, cell] of Object.entries(sd.months)) {
      if (ym < from || ym > to) continue;
      if (!cell.byCanal) continue;
      const cc = cell.byCanal[canal];
      if (cc) { qtd += cc.qtd; receita += cc.receita; }
    }
    if (qtd === 0 && receita === 0) continue;
    const stock = data.STOCK_MAP[sku];
    rows.push({
      sku,
      linha: stock?.linha || '—',
      categoria: stock?.categoria || '—',
      qtd,
      receita,
      ticketMedio: qtd > 0 ? receita / qtd : 0,
      share: 0,
    });
    totRec += receita;
  }
  for (const r of rows) r.share = totRec > 0 ? (r.receita / totRec) * 100 : 0;
  rows.sort((a, b) => b.receita - a.receita);
  return rows.slice(0, limit);
}

export function totalsByCanalWithSkus(
  data: ProcessedData,
  sales: SalesBySkuPayload,
  from: Ym,
  to: Ym,
): CanalTotal[] {
  const base = totalsByCanal(data, from, to);
  const skuSets: Record<CanalGrupo, Set<string>> = {
    D2C: new Set(), B2B: new Set(), Lojas: new Set(), Brindes: new Set(),
  };
  for (const [sku, sd] of Object.entries(sales.salesBySku)) {
    for (const [ym, cell] of Object.entries(sd.months)) {
      if (ym < from || ym > to) continue;
      if (!cell.byCanal) continue;
      for (const c of Object.keys(cell.byCanal) as CanalGrupo[]) {
        const cc = cell.byCanal[c]!;
        if (cc.qtd > 0 || cc.receita > 0) skuSets[c].add(sku);
      }
    }
  }
  return base.map((b) => ({ ...b, skusCount: skuSets[b.canal].size }));
}

/** All months present across the dataset, sorted ascending. */
export function allMonths(data: ProcessedData): Ym[] {
  const set = new Set<Ym>();
  for (const linha of Object.values(data.salesByLinha)) {
    for (const ym of Object.keys(linha.months)) set.add(ym);
  }
  return [...set].sort();
}

/**
 * `allMonths(data)` estendido até o mês corrente do calendário —
 * inclui meses pós-snapshot ainda sem dados pra permitir seleção no picker.
 * Útil quando o snapshot é antigo e o usuário quer recortar até hoje.
 */
export function allMonthsWithCurrent(data: ProcessedData): Ym[] {
  const yms = allMonths(data);
  const now = new Date();
  // Fallback quando salesByLinha está vazio (ex: filtro de canal muito restrito):
  // usa meta.period para garantir que o picker sempre tenha opções.
  if (yms.length === 0) {
    const currentYm: Ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const start = data.meta.period.from;
    const end: Ym = currentYm > data.meta.period.to ? currentYm : data.meta.period.to;
    const out: Ym[] = [];
    let [y, m] = start.split('-').map(Number);
    while (true) {
      const ym: Ym = `${y}-${String(m).padStart(2, '0')}`;
      out.push(ym);
      if (ym >= end) break;
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }
  const currentYm: Ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const last = yms[yms.length - 1];
  if (currentYm <= last) return yms;
  const out = [...yms];
  let [y, m] = last.split('-').map(Number);
  // Adiciona meses sequenciais até alcançar o mês corrente
  while (true) {
    m++;
    if (m > 12) { m = 1; y++; }
    const ym: Ym = `${y}-${String(m).padStart(2, '0')}`;
    if (ym > currentYm) break;
    out.push(ym);
  }
  return out;
}

/** Most recent month with data — used as default "atual". */
export function latestMonth(data: ProcessedData): Ym | null {
  return pickMaxYm(allMonths(data));
}

export interface PeriodTotals {
  receita: number;
  qtd: number;
  ticketMedio: number;
  margemRS: number;
  margemPct: number | null;
  forecastQtd: number;
  atingimento: number | null; // % realizado/forecast - 1
  linhasCount: number;
}

/** Aggregate revenue + qty + margin for an inclusive [from, to] month range. */
export function totalsForRange(
  data: ProcessedData,
  from: Ym,
  to: Ym,
): PeriodTotals {
  let receita = 0;
  let qtd = 0;
  let margemRS = 0;
  let forecastQtd = 0;
  let linhasCount = 0;
  let hasCostForAny = false;

  for (const [linha, linhaData] of Object.entries(data.salesByLinha)) {
    let linhaQtd = 0;
    let linhaRec = 0;
    for (const [ym, cell] of Object.entries(linhaData.months)) {
      if (ym >= from && ym <= to) {
        linhaQtd += cell.qtd;
        linhaRec += cell.receita;
      }
    }
    if (linhaQtd > 0 || linhaRec > 0) {
      qtd += linhaQtd;
      receita += linhaRec;
      linhasCount += 1;
      const custo = data.COST_MAP[linha];
      if (custo != null && linhaQtd > 0) {
        const tm = linhaRec / linhaQtd;
        const mgUnit = tm - custo;
        margemRS += mgUnit * linhaQtd;
        hasCostForAny = true;
      }
      const fcMap = data.FC_MAP[linha] || {};
      for (const [ym, fc] of Object.entries(fcMap)) {
        if (ym >= from && ym <= to) forecastQtd += fc;
      }
    }
  }

  const ticketMedio = qtd > 0 ? receita / qtd : 0;
  const margemPct = hasCostForAny && receita > 0 ? (margemRS / receita) * 100 : null;
  const atingimento = forecastQtd > 0 ? (qtd / forecastQtd - 1) * 100 : null;

  return { receita, qtd, ticketMedio, margemRS, margemPct, forecastQtd, atingimento, linhasCount };
}

/** Monthly metric series: receita, qtd, TM, margem%, margem R$. */
export interface MonthlyMetric {
  ym: Ym;
  label: string;
  receita: number;
  qtd: number;
  ticketMedio: number;       // receita ÷ qtd no mês
  margemPct: number | null;  // (TM − custo) ponderado por qtd / receita total · só linhas com custo conhecido
  margemRS: number | null;
}

/**
 * Per-month metrics computed honestly:
 * - TM mensal = soma(receita) ÷ soma(qtd) (não é média de TMs por linha)
 * - Margem mensal = soma((tm_linha − custo_linha) × qtd_linha) ÷ soma(receita_linha das linhas com custo)
 *   (linhas sem custo conhecido são excluídas do denominador também, evitando viés)
 */
export function monthlyMetrics(data: ProcessedData, from?: Ym, to?: Ym): MonthlyMetric[] {
  const M = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const yms = allMonths(data).filter((ym) => (!from || ym >= from) && (!to || ym <= to));
  return yms.map((ym) => {
    let receita = 0;
    let qtd = 0;
    let receitaWithCost = 0;
    let margemRS = 0;
    let hasAnyCost = false;
    for (const [linha, linhaData] of Object.entries(data.salesByLinha)) {
      const cell = linhaData.months[ym];
      if (!cell) continue;
      receita += cell.receita;
      qtd += cell.qtd;
      const custo = data.COST_MAP[linha];
      if (custo != null && cell.qtd > 0) {
        const tmLinha = cell.receita / cell.qtd;
        margemRS += (tmLinha - custo) * cell.qtd;
        receitaWithCost += cell.receita;
        hasAnyCost = true;
      }
    }
    const [y, m] = ym.split('-');
    return {
      ym,
      label: `${M[+m]}/${y.slice(2)}`,
      receita,
      qtd,
      ticketMedio: qtd > 0 ? receita / qtd : 0,
      margemPct: hasAnyCost && receitaWithCost > 0 ? (margemRS / receitaWithCost) * 100 : null,
      margemRS: hasAnyCost ? margemRS : null,
    };
  });
}

/** Monthly revenue series for charts. Returns one entry per month present in dataset. */
export interface MonthSeries {
  ym: Ym;
  receita: number;
  qtd: number;
  byCategoria: Record<Categoria, number>;
}

export function monthlySeries(data: ProcessedData): MonthSeries[] {
  const yms = allMonths(data);
  const series: MonthSeries[] = yms.map((ym) => ({
    ym,
    receita: 0,
    qtd: 0,
    byCategoria: {},
  }));
  const idx: Record<Ym, number> = {};
  yms.forEach((ym, i) => (idx[ym] = i));

  for (const linha of Object.values(data.salesByLinha)) {
    for (const [ym, cell] of Object.entries(linha.months)) {
      const i = idx[ym];
      if (i == null) continue;
      series[i].receita += cell.receita;
      series[i].qtd += cell.qtd;
      const cat = linha.categoria || '—';
      series[i].byCategoria[cat] = (series[i].byCategoria[cat] || 0) + cell.receita;
    }
  }
  return series;
}

/** Aggregate one row per linha, for the inclusive [from, to] range. */
export function linhasAggregate(
  data: ProcessedData,
  from: Ym,
  to: Ym,
  totalReceita: number,
): LinhaAgg[] {
  const result: LinhaAgg[] = [];
  for (const [linha, linhaData] of Object.entries(data.salesByLinha)) {
    let receita = 0;
    let qtd = 0;
    for (const [ym, cell] of Object.entries(linhaData.months)) {
      if (ym >= from && ym <= to) {
        receita += cell.receita;
        qtd += cell.qtd;
      }
    }
    if (receita === 0 && qtd === 0) continue;

    const custo = data.COST_MAP[linha] ?? null;
    const tm = qtd > 0 ? receita / qtd : 0;
    const margemPct = custo != null && tm > 0 ? ((tm - custo) / tm) * 100 : null;
    const margemRS = custo != null ? (tm - custo) * qtd : null;

    const fcMap = data.FC_MAP[linha] || {};
    let forecastQtd: number | null = null;
    for (const [ym, fc] of Object.entries(fcMap)) {
      if (ym >= from && ym <= to) {
        forecastQtd = (forecastQtd ?? 0) + fc;
      }
    }
    const atingimento = forecastQtd && forecastQtd > 0 ? (qtd / forecastQtd - 1) * 100 : null;
    const firstSale = data.linhaFirstSale[linha] ?? null;

    // Lançamento = estreia a partir de LAUNCH_CUTOFF (jan/2026)
    // - typeA: linha inteira com firstSale >= cutoff
    // - typeB: ao menos um SKU/drop com firstSale >= cutoff
    let isLancamento = false;
    if (firstSale && firstSale >= LAUNCH_CUTOFF) isLancamento = true;
    const typeB = data.typeB_extensions[linha];
    if (typeB && typeB.skus.some((s) => s.firstSale >= LAUNCH_CUTOFF)) {
      isLancamento = true;
    }

    result.push({
      linha,
      categoria: linhaData.categoria,
      status: linhaData.status,
      receita,
      qtd,
      ticketMedio: tm,
      custo,
      margemPct,
      margemRS,
      forecastQtd,
      atingimento,
      share: totalReceita > 0 ? (receita / totalReceita) * 100 : 0,
      firstSale,
      isLancamento,
    });
  }
  result.sort((a, b) => b.receita - a.receita);
  return result;
}

/** Top N linhas by revenue. */
export function topLinhas(rows: LinhaAgg[], n = 10): LinhaAgg[] {
  return rows.slice(0, n);
}

// ────────────────────────────────────────────────────────────
// PORTFÓLIO — visão estratégica de catálogo
// LinhaAgg + crescimento YoY + share/Pareto
// ────────────────────────────────────────────────────────────

export interface PortfolioLinha extends LinhaAgg {
  /** Receita no mesmo período do ano anterior (shifted -12m). */
  receitaLy: number;
  /** Crescimento % vs LY. null se LY = 0 ou sem dado comparável. */
  yoyPct: number | null;
  /** Share acumulado (Pareto) — ordem por receita desc. */
  shareAcum: number;
}

/** Shift YM by N months (cópia local pra evitar dependência circular). */
function _shiftYm(ym: Ym, deltaMonths: number): Ym {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/**
 * Build the portfolio view: every linha in the period with YoY growth and
 * cumulative share (Pareto). Sorted by revenue desc.
 */
export function portfolioAggregate(
  data: ProcessedData,
  from: Ym,
  to: Ym,
): PortfolioLinha[] {
  const totalsCur = totalsForRange(data, from, to);
  const rows = linhasAggregate(data, from, to, totalsCur.receita);
  const lyFrom = _shiftYm(from, -12);
  const lyTo = _shiftYm(to, -12);

  // Receita LY por linha
  const lyByLinha: Record<string, number> = {};
  for (const [linha, linhaData] of Object.entries(data.salesByLinha)) {
    let r = 0;
    for (const [ym, cell] of Object.entries(linhaData.months)) {
      if (ym >= lyFrom && ym <= lyTo) r += cell.receita;
    }
    lyByLinha[linha] = r;
  }

  let acum = 0;
  return rows.map((r) => {
    const receitaLy = lyByLinha[r.linha] ?? 0;
    const yoyPct = receitaLy > 0 ? (r.receita / receitaLy - 1) * 100 : null;
    acum += r.share;
    return {
      ...r,
      receitaLy,
      yoyPct,
      shareAcum: Math.min(100, acum),
    };
  });
}

export interface ParetoBreakpoint {
  pct: number;        // ex.: 80
  linhasCount: number;
  pctOfCatalog: number;
}

/**
 * Monthly series for a single linha, with receita/qtd/margem % per month.
 * Used in the cross-filter drill-down on Portfolio.
 */
export interface LinhaMonthlyPoint {
  ym: Ym;
  label: string;
  receita: number;
  qtd: number;
  ticketMedio: number;
  margemPct: number | null;
}

export function linhaMonthlySeries(
  data: ProcessedData,
  linha: string,
  from?: Ym,
  to?: Ym,
): LinhaMonthlyPoint[] {
  const M = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const sd = data.salesByLinha[linha];
  if (!sd) return [];
  const custo = data.COST_MAP[linha] ?? null;
  const yms = Object.keys(sd.months)
    .filter((ym) => (!from || ym >= from) && (!to || ym <= to))
    .sort();
  return yms.map((ym) => {
    const cell = sd.months[ym];
    const tm = cell.qtd > 0 ? cell.receita / cell.qtd : 0;
    const margemPct = custo != null && tm > 0 ? ((tm - custo) / tm) * 100 : null;
    const [y, m] = ym.split('-');
    return {
      ym,
      label: `${M[+m]}/${y.slice(2)}`,
      receita: cell.receita,
      qtd: cell.qtd,
      ticketMedio: tm,
      margemPct,
    };
  });
}

// ────────────────────────────────────────────────────────────
// STACKED MONTHLY SERIES — pra charts empilhados de categoria/subcategoria
// ────────────────────────────────────────────────────────────

export interface StackedMonthlyPoint {
  ym: Ym;
  label: string;
  total: number;
  /** Receita por chave (categoria ou subcategoria). */
  [seriesKey: string]: number | string;
}

export interface StackedMonthlySeries {
  points: StackedMonthlyPoint[];
  keys: string[];          // ordem das séries (top N por total · "Outros" no final se aplicável)
  colors: Record<string, string>;
}

/**
 * Receita mensal empilhada por categoria.
 * `subcategoriaFilter` opcional: limita as linhas àquelas cuja subcategoria
 * (heurística) é a passada — usado quando o usuário filtra por subcategoria
 * nos charts e o cat chart deve refletir apenas as categorias que contêm
 * essa subcategoria.
 */
export function categoriaMonthlyStack(
  data: ProcessedData,
  from?: Ym,
  to?: Ym,
  subcategoriaFilter?: string,
): StackedMonthlySeries {
  const M = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthSet = new Set<Ym>();
  const totals: Record<string, number> = {};

  for (const [linha, sd] of Object.entries(data.salesByLinha)) {
    if (subcategoriaFilter && getSubcategoria(linha) !== subcategoriaFilter) continue;
    const cat = sd.categoria || '—';
    for (const [ym, cell] of Object.entries(sd.months)) {
      if ((from && ym < from) || (to && ym > to)) continue;
      monthSet.add(ym);
      totals[cat] = (totals[cat] ?? 0) + cell.receita;
    }
  }
  const yms = Array.from(monthSet).sort();
  const keys = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const points: StackedMonthlyPoint[] = yms.map((ym) => {
    const row: StackedMonthlyPoint = { ym, label: '', total: 0 };
    keys.forEach((k) => (row[k] = 0));
    const [y, m] = ym.split('-');
    row.label = `${M[+m]}/${y.slice(2)}`;
    return row;
  });
  const idx: Record<Ym, number> = {};
  yms.forEach((ym, i) => (idx[ym] = i));

  for (const [linha, sd] of Object.entries(data.salesByLinha)) {
    if (subcategoriaFilter && getSubcategoria(linha) !== subcategoriaFilter) continue;
    const cat = sd.categoria || '—';
    for (const [ym, cell] of Object.entries(sd.months)) {
      const i = idx[ym];
      if (i == null) continue;
      const row = points[i];
      row[cat] = (row[cat] as number) + cell.receita;
      row.total += cell.receita;
    }
  }

  const colors: Record<string, string> = {};
  keys.forEach((k) => (colors[k] = categoriaHex(k)));
  return { points, keys, colors };
}

/**
 * Receita mensal empilhada por subcategoria · Top N + Outros.
 * `categoriaFilter` opcional: limita às linhas dessa categoria (usado pra
 * filtrar o chart quando o usuário seleciona uma categoria).
 */
export function subcategoriaMonthlyStack(
  data: ProcessedData,
  topN = 8,
  from?: Ym,
  to?: Ym,
  categoriaFilter?: string,
): StackedMonthlySeries {
  const M = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthSet = new Set<Ym>();
  const totals: Record<string, number> = {};

  for (const [linha, sd] of Object.entries(data.salesByLinha)) {
    if (categoriaFilter && sd.categoria !== categoriaFilter) continue;
    const sub = getSubcategoria(linha);
    for (const [ym, cell] of Object.entries(sd.months)) {
      if ((from && ym < from) || (to && ym > to)) continue;
      monthSet.add(ym);
      totals[sub] = (totals[sub] ?? 0) + cell.receita;
    }
  }
  const sortedSubs = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const topKeys = sortedSubs.slice(0, topN);
  const restKeys = new Set(sortedSubs.slice(topN));
  const hasOutros = restKeys.size > 0;
  const keys = hasOutros ? [...topKeys, 'Outros'] : topKeys;

  const yms = Array.from(monthSet).sort();
  const points: StackedMonthlyPoint[] = yms.map((ym) => {
    const row: StackedMonthlyPoint = { ym, label: '', total: 0 };
    keys.forEach((k) => (row[k] = 0));
    const [y, m] = ym.split('-');
    row.label = `${M[+m]}/${y.slice(2)}`;
    return row;
  });
  const idx: Record<Ym, number> = {};
  yms.forEach((ym, i) => (idx[ym] = i));

  for (const [linha, sd] of Object.entries(data.salesByLinha)) {
    if (categoriaFilter && sd.categoria !== categoriaFilter) continue;
    const sub = getSubcategoria(linha);
    const bucket = restKeys.has(sub) ? 'Outros' : sub;
    for (const [ym, cell] of Object.entries(sd.months)) {
      const i = idx[ym];
      if (i == null) continue;
      const row = points[i];
      row[bucket] = (row[bucket] as number) + cell.receita;
      row.total += cell.receita;
    }
  }

  // Atribui cores por ÍNDICE (ordem do top N) pra garantir unicidade — o hash
  // dava colisão (ex.: Garrafa e Totebag caíam na mesma cor).
  const colors: Record<string, string> = {};
  let palIdx = 0;
  keys.forEach((k) => {
    if (k === 'Outros') {
      colors[k] = '#94A3B8';
    } else {
      colors[k] = SUBCAT_PALETTE[palIdx % SUBCAT_PALETTE.length];
      palIdx++;
    }
  });
  return { points, keys, colors };
}

/**
 * Aggregated monthly series across multiple linhas — soma receita/qtd e
 * calcula margem ponderada (só linhas com custo conhecido entram no denominador).
 * Útil pra ver a evolução do escopo filtrado quando nenhuma linha específica está selecionada.
 */
export function aggregatedMonthlySeries(
  data: ProcessedData,
  linhas: string[],
  from?: Ym,
  to?: Ym,
): LinhaMonthlyPoint[] {
  const M = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  // Coleta todos os meses presentes nas linhas selecionadas
  const monthSet = new Set<Ym>();
  for (const linha of linhas) {
    const sd = data.salesByLinha[linha];
    if (!sd) continue;
    Object.keys(sd.months).forEach((ym) => {
      if ((!from || ym >= from) && (!to || ym <= to)) monthSet.add(ym);
    });
  }
  const yms = Array.from(monthSet).sort();

  return yms.map((ym) => {
    let receita = 0, qtd = 0;
    let margemRS = 0, receitaComCusto = 0;
    let hasCusto = false;
    for (const linha of linhas) {
      const cell = data.salesByLinha[linha]?.months[ym];
      if (!cell) continue;
      receita += cell.receita;
      qtd += cell.qtd;
      const custo = data.COST_MAP[linha];
      if (custo != null && cell.qtd > 0) {
        margemRS += cell.receita - custo * cell.qtd;
        receitaComCusto += cell.receita;
        hasCusto = true;
      }
    }
    const tm = qtd > 0 ? receita / qtd : 0;
    const margemPct = hasCusto && receitaComCusto > 0 ? (margemRS / receitaComCusto) * 100 : null;
    const [y, m] = ym.split('-');
    return {
      ym,
      label: `${M[+m]}/${y.slice(2)}`,
      receita,
      qtd,
      ticketMedio: tm,
      margemPct,
    };
  });
}

/** Quantas linhas geram X% da receita acumulada. */
export function paretoBreak(rows: PortfolioLinha[], targetPct: number): ParetoBreakpoint {
  const idx = rows.findIndex((r) => r.shareAcum >= targetPct);
  const count = idx >= 0 ? idx + 1 : rows.length;
  return {
    pct: targetPct,
    linhasCount: count,
    pctOfCatalog: rows.length > 0 ? (count / rows.length) * 100 : 0,
  };
}

// ────────────────────────────────────────────────────────────
// ESTOQUE — visão operacional do catálogo
// ────────────────────────────────────────────────────────────

export type CoberturaBand = 'ruptura' | 'critica' | 'baixa' | 'boa' | 'excesso';

export interface EstoqueRow {
  sku: string;
  linha: string;
  categoria: Categoria;
  status: Status;
  curva: CurvaABC;
  estoque: number;
  custo: number;
  saida3d: number;
  saida7d: number;
  coberturaDias: number | null; // null se saida7d == 0 e estoque > 0 (parado)
  capitalImobilizado: number;   // estoque × custo
  band: CoberturaBand;
  sugestao: SugestaoAcao;
}

export type SugestaoAcao = 'Repor urgente' | 'Repor' | 'Monitorar' | 'Manter' | 'Promover' | 'Liquidar';

const BAND_TO_SUGESTAO: Record<CoberturaBand, SugestaoAcao> = {
  ruptura: 'Repor urgente',
  critica: 'Repor',
  baixa:   'Monitorar',
  boa:     'Manter',
  excesso: 'Promover',
};

export function classifyCoberturaBand(estoque: number, saida7d: number): CoberturaBand {
  if (estoque <= 0) return 'ruptura';
  if (saida7d <= 0) return 'excesso'; // parado, mas tem estoque
  const cob = estoque / saida7d;
  if (cob <= 7)  return 'critica';
  if (cob <= 30) return 'baixa';
  if (cob <= 90) return 'boa';
  return 'excesso';
}

export function buildEstoqueRows(data: ProcessedData): EstoqueRow[] {
  const out: EstoqueRow[] = [];
  for (const [sku, s] of Object.entries(data.STOCK_MAP)) {
    const cob = s.saida7d > 0 ? s.estoqueTotal / s.saida7d : null;
    const band = classifyCoberturaBand(s.estoqueTotal, s.saida7d);
    // Sugestão acionável: refina baseado em métricas
    let sugestao = BAND_TO_SUGESTAO[band];
    if (band === 'excesso' && cob != null && cob > 365) sugestao = 'Liquidar';
    out.push({
      sku,
      linha: s.linha,
      categoria: s.categoria,
      status: s.status,
      curva: s.curva,
      estoque: s.estoqueTotal,
      custo: s.custo,
      saida3d: s.saida3d,
      saida7d: s.saida7d,
      coberturaDias: cob,
      capitalImobilizado: s.estoqueTotal * s.custo,
      band,
      sugestao,
    });
  }
  return out;
}

export interface EstoqueKpis {
  skusCount: number;
  capitalTotal: number;
  rupturaCount: number;
  rupturaCapital: number;
  riscoCount: number;        // band == 'critica' ou 'ruptura'
  riscoCapital: number;
  slowCount: number;         // band == 'excesso'
  slowCapital: number;
  obsoletoCount: number;     // > 365d cobertura
  obsoletoCapital: number;
}

export function estoqueKpis(rows: EstoqueRow[]): EstoqueKpis {
  let capitalTotal = 0;
  let rupturaCount = 0, rupturaCapital = 0;
  let riscoCount = 0, riscoCapital = 0;
  let slowCount = 0, slowCapital = 0;
  let obsoletoCount = 0, obsoletoCapital = 0;
  for (const r of rows) {
    capitalTotal += r.capitalImobilizado;
    if (r.band === 'ruptura') {
      rupturaCount++; rupturaCapital += r.capitalImobilizado;
      riscoCount++; riscoCapital += r.capitalImobilizado;
    } else if (r.band === 'critica') {
      riscoCount++; riscoCapital += r.capitalImobilizado;
    } else if (r.band === 'excesso') {
      slowCount++; slowCapital += r.capitalImobilizado;
      if (r.coberturaDias != null && r.coberturaDias > 365) {
        obsoletoCount++; obsoletoCapital += r.capitalImobilizado;
      }
    }
  }
  return {
    skusCount: rows.length,
    capitalTotal,
    rupturaCount, rupturaCapital,
    riscoCount, riscoCapital,
    slowCount, slowCapital,
    obsoletoCount, obsoletoCapital,
  };
}

/** Matriz ABC × Cobertura. Retorna celulas indexadas por curva e band. */
export interface ABCGiroCell {
  curva: CurvaABC;
  band: CoberturaBand;
  count: number;
  capital: number;
}

export const CURVAS_ORDER: CurvaABC[] = ['AA', 'A', 'B', 'C', 'Não Classificado'];
export const BANDS_ORDER: CoberturaBand[] = ['ruptura', 'critica', 'baixa', 'boa', 'excesso'];

export const BAND_LABEL: Record<CoberturaBand, string> = {
  ruptura: 'Ruptura',
  critica: 'Crítica',
  baixa:   'Baixa',
  boa:     'Saudável',
  excesso: 'Excesso',
};
export const BAND_HINT: Record<CoberturaBand, string> = {
  ruptura: 'Estoque = 0',
  critica: '≤ 7 dias',
  baixa:   '7-30 dias',
  boa:     '30-90 dias',
  excesso: '> 90 dias ou parado',
};

export function abcGiroMatrix(rows: EstoqueRow[]): ABCGiroCell[] {
  const map: Record<string, ABCGiroCell> = {};
  for (const curva of CURVAS_ORDER) {
    for (const band of BANDS_ORDER) {
      map[`${curva}|${band}`] = { curva, band, count: 0, capital: 0 };
    }
  }
  for (const r of rows) {
    const key = `${r.curva}|${r.band}`;
    if (!map[key]) map[key] = { curva: r.curva, band: r.band, count: 0, capital: 0 };
    map[key].count++;
    map[key].capital += r.capitalImobilizado;
  }
  return Object.values(map);
}

/** Categoria aggregates for the period. */
export interface CategoriaAgg {
  categoria: Categoria;
  receita: number;
  qtd: number;
  share: number;
  linhasCount: number;
}
export function categoriasAggregate(rows: LinhaAgg[], total: number): CategoriaAgg[] {
  const map: Record<string, CategoriaAgg> = {};
  for (const r of rows) {
    const c = r.categoria || '—';
    if (!map[c]) map[c] = { categoria: c, receita: 0, qtd: 0, share: 0, linhasCount: 0 };
    map[c].receita += r.receita;
    map[c].qtd += r.qtd;
    map[c].linhasCount += 1;
  }
  return Object.values(map)
    .map((c) => ({ ...c, share: total > 0 ? (c.receita / total) * 100 : 0 }))
    .sort((a, b) => b.receita - a.receita);
}

/** Color token by categoria name. */
export const CATEGORIA_COLOR: Record<string, string> = {
  'Têxtil': 'var(--cat-textil)',
  'Térmico': 'var(--cat-termico)',
  'UV': 'var(--cat-uv)',
  'Gift': 'var(--cat-gift)',
  'Spare Part': 'var(--cat-spare)',
  'Tech': 'var(--cat-tech)',
};

export function categoriaColor(c: string): string {
  return CATEGORIA_COLOR[c] ?? 'var(--text-3)';
}

/** Resolve actual CSS color value (since recharts doesn't accept CSS vars in some props). */
const CATEGORIA_HEX: Record<string, string> = {
  'Têxtil':     '#A855F7',  // roxo
  'Térmico':    '#F59E0B',  // âmbar
  'UV':         '#22C55E',  // verde
  'Gift':       '#EC4899',  // rosa
  'Spare Part': '#3B82F6',  // azul
  'Tech':       '#06B6D4',  // ciano
};

export function categoriaHex(c: string): string {
  return CATEGORIA_HEX[c] ?? '#9aaabb';
}

// ────────────────────────────────────────────────────────────
// SUBCATEGORIA — heurística pelo primeiro token do nome da linha
// ────────────────────────────────────────────────────────────

/**
 * Mapeamento de tokens iniciais → subcategoria amigável (fallback).
 * Usado APÓS os patterns de substring abaixo.
 */
const SUBCAT_OVERRIDES: Record<string, string> = {
  Tote: 'Totebag',
  Totebag: 'Totebag',
  Capa: 'Capa de notebook',
  Slim: 'Case',
  Guard: 'Case',
  Skin: 'Acessorios para cases',
  Espelho: 'Acessorios para cases',
  Magsafe: 'Acessorios Magsafe para case',
  Charms: 'Mimo',
};

/**
 * Patterns por substring — têm prioridade sobre o primeiro token.
 * Resolve casos como "Mini Tote" (primeiro token "Mini") que precisam cair em Totebag.
 * Ordem importa: padrões mais específicos primeiro.
 */
const SUBCAT_PATTERNS: { pattern: RegExp; sub: string }[] = [
  { pattern: /\btote(bag)?\b/i,    sub: 'Totebag' },
  { pattern: /\bgarrafa\b/i,        sub: 'Garrafa' },
  { pattern: /\bcopo\b/i,           sub: 'Copo' },
  { pattern: /\bmochila\b/i,        sub: 'Mochila' },
  { pattern: /\bmala\b/i,           sub: 'Mala' },
  { pattern: /\bbolsa\b/i,          sub: 'Bolsa' },
  { pattern: /\bnecessaire\b/i,     sub: 'Necessaire' },
  { pattern: /\blancheira\b/i,      sub: 'Lancheira' },
  { pattern: /\bestojo\b/i,         sub: 'Estojo' },
  { pattern: /\bcapa\b/i,           sub: 'Capa de notebook' },
  { pattern: /\bpowerbank\b/i,      sub: 'Powerbank' },
  { pattern: /\bcase\b/i,           sub: 'Case' },
  { pattern: /\bal[çc]a\b/i,        sub: 'Alça' },
  { pattern: /\btampa\b/i,          sub: 'Tampa' },
  { pattern: /\bbase\b/i,           sub: 'Base de silicone' },
];

const SUBCAT_PALETTE = [
  '#A855F7','#F59E0B','#22C55E','#EC4899','#3B82F6',
  '#0EA5E9','#14B8A6','#F97316','#84CC16','#EF4444',
  '#6366F1','#EAB308','#06B6D4','#D946EF','#A78BFA',
];

export function getSubcategoria(linha: string): string {
  // 1) Patterns de substring têm prioridade (lida com "Mini Tote", "Garrafa Mini" etc)
  for (const { pattern, sub } of SUBCAT_PATTERNS) {
    if (pattern.test(linha)) return sub;
  }
  // 2) Fallback: primeiro token + overrides
  const token = linha.trim().split(/\s+/)[0];
  return SUBCAT_OVERRIDES[token] ?? token;
}

export function subcategoriaColor(sub: string, fallbackIndex = 0): string {
  // Hash determinístico simples pra cor consistente entre renders
  let hash = 0;
  for (let i = 0; i < sub.length; i++) hash = ((hash << 5) - hash + sub.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % SUBCAT_PALETTE.length;
  return SUBCAT_PALETTE[idx] || SUBCAT_PALETTE[fallbackIndex];
}

// ────────────────────────────────────────────────────────────
// LANÇAMENTOS — definição da squad:
//   - novas linhas (typeA) + drops de cor (typeB)
//   - `LAUNCH_CUTOFF` é o DEFAULT do filtro de período (jan/26).
//     buildLancamentos não aplica cutoff hardcoded — a filtragem
//     ocorre na UI via picker; assim o usuário pode ampliar a janela
//     pra incluir estreias anteriores se quiser comparar.
// ────────────────────────────────────────────────────────────

export const LAUNCH_CUTOFF: Ym = '2026-01';

export type LancamentoTipo = 'A' | 'B';

export interface LancamentoTrajetoria {
  ym: Ym;
  qtd: number;
  receita: number;
  monthIndex: number; // 0 = mês de lançamento, 1 = mês seguinte, ...
}

export interface Lancamento {
  tipo: LancamentoTipo;
  linha: string;
  categoria: Categoria;
  status: string;
  firstSale: Ym;
  monthsActive: number;
  qtdAcum: number;
  receitaAcum: number;
  ticketMedio: number;
  /** Custo unitário da linha (TicketSense), quando disponível. */
  custo: number | null;
  /** Margem bruta % = (TM − custo) ÷ TM × 100. */
  margemPct: number | null;
  trajectory: LancamentoTrajetoria[];
  /** quantidade de SKUs novos no caso de drops de cor */
  newSkusCount?: number;
  newSkus?: { sku: string; firstSale: Ym; nomeMaterial: string }[];
  forecastAcum: number | null;
  atingimento: number | null;
  /** Comparado à média acumulada de lançamentos da mesma categoria no mesmo nº de meses */
  benchmarkPct: number | null;
}

/**
 * Build the list of all "lançamentos" (squad definition):
 *   - typeA: new lines (whole line is new)
 *   - typeB: color drops (new SKUs within an existing line)
 *
 * For each, compute trajectory since firstSale, cumulative metrics
 * and benchmark vs category peers.
 */
/** Optional consulta window: limits the aggregation period (default = since launch to latest). */
export interface ConsultaRange {
  from: Ym;
  to: Ym;
}

export function buildLancamentos(
  data: ProcessedData,
  sales?: SalesBySkuPayload,
  consulta?: ConsultaRange,
): Lancamento[] {
  // Fallback para meta.period.to quando salesByLinha está vazio (canal muito restrito).
  const latest = latestMonth(data) ?? data.meta.period.to;
  if (!latest) return [];

  const all: Lancamento[] = [];

  /** Trajectory between `[max(firstSale, fromYm), min(latest, toYm)]`. */
  function trajectoryFor(linha: string, firstSale: Ym): LancamentoTrajetoria[] {
    const sd = data.salesByLinha[linha];
    if (!sd) return [];
    const lower = consulta && consulta.from > firstSale ? consulta.from : firstSale;
    const upper = consulta ? consulta.to : latest!;
    const entries = Object.entries(sd.months)
      .filter(([ym]) => ym >= lower && ym <= upper)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([ym, cell], i) => ({
      ym,
      qtd: cell.qtd,
      receita: cell.receita,
      monthIndex: i,
    }));
  }

  function monthsBetween(from: Ym, to: Ym): number {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    return ty * 12 + tm - (fy * 12 + fm) + 1;
  }

  /** Returns the effective window bounds for FC aggregation. */
  function effectiveBounds(firstSale: Ym): { from: Ym; to: Ym } {
    const lower = consulta && consulta.from > firstSale ? consulta.from : firstSale;
    const upper = consulta ? consulta.to : latest!;
    return { from: lower, to: upper };
  }

  // ── Type A: novas linhas ─────────────────────────────────────
  // Só conta como lançamento as linhas que estrearam a partir de LAUNCH_CUTOFF
  // (alinhado com a definição da squad — linhas pré-cutoff são "catálogo existente").
  for (const item of data.typeA_newLines) {
    if (item.firstSale < LAUNCH_CUTOFF) continue;
    const traj = trajectoryFor(item.linha, item.firstSale);
    const bounds = effectiveBounds(item.firstSale);
    // SKUs novos: total de SKUs da linha em STOCK_MAP (a linha inteira é nova)
    const newSkusOfLine = Object.entries(data.STOCK_MAP)
      .filter(([, s]) => s.linha === item.linha)
      .map(([sku, s]) => ({ sku, firstSale: data.skuFirstSale[sku] ?? item.firstSale, nomeMaterial: sku }));
    void newSkusOfLine[0]?.firstSale; // suppress unused
    const qtdAcum = traj.reduce((s, t) => s + t.qtd, 0);
    const receitaAcum = traj.reduce((s, t) => s + t.receita, 0);
    const fcMap = data.FC_MAP[item.linha] || {};
    const fcAcum = Object.entries(fcMap)
      .filter(([ym]) => ym >= bounds.from && ym <= bounds.to)
      .reduce((s, [, v]) => s + v, 0);
    const forecastAcum = fcAcum > 0 ? fcAcum : null;
    const atingimento = forecastAcum ? (qtdAcum / forecastAcum - 1) * 100 : null;
    const tmA = qtdAcum > 0 ? receitaAcum / qtdAcum : 0;
    const custoA = data.COST_MAP[item.linha] ?? null;
    const margemPctA = custoA != null && tmA > 0 ? ((tmA - custoA) / tmA) * 100 : null;
    all.push({
      tipo: 'A',
      linha: item.linha,
      categoria: item.categoria,
      status: item.status,
      firstSale: item.firstSale,
      monthsActive: monthsBetween(item.firstSale, latest),
      qtdAcum,
      receitaAcum,
      ticketMedio: tmA,
      custo: custoA,
      margemPct: margemPctA,
      trajectory: traj,
      newSkusCount: newSkusOfLine.length || undefined,
      newSkus: newSkusOfLine.length ? newSkusOfLine : undefined,
      forecastAcum,
      atingimento,
      benchmarkPct: null, // computed below
    });
  }

  // ── Type B: drops de cor (SKUs novos em linhas existentes) ──
  // Só conta SKUs que estrearam a partir de LAUNCH_CUTOFF — drops antigos
  // viraram catálogo existente e não inflam mais o KPI de lançamentos.
  // qtdAcum/receitaAcum agregados POR SKU (não pela linha inteira) — a linha
  // tem SKUs antigos de catálogo que não fazem parte do drop.
  for (const [linha, ext] of Object.entries(data.typeB_extensions)) {
    const skusInScope = ext.skus.filter((s) => s.firstSale >= LAUNCH_CUTOFF);
    if (!skusInScope.length) continue;
    const newest = skusInScope.reduce((a, b) => (a.firstSale > b.firstSale ? a : b));
    const firstSale = newest.firstSale; // drop mais recente dentro do escopo
    const bounds = effectiveBounds(firstSale);

    // Trajetória mensal agregando os SKUs do drop (cada SKU conta a partir de seu firstSale)
    const monthAgg: Record<Ym, { qtd: number; receita: number }> = {};
    for (const ns of skusInScope) {
      const skuData = sales?.salesBySku[ns.sku];
      if (!skuData) continue;
      const lower = consulta && consulta.from > ns.firstSale ? consulta.from : ns.firstSale;
      const upper = consulta ? consulta.to : latest;
      for (const [ym, cell] of Object.entries(skuData.months)) {
        if (ym < lower || ym > upper) continue;
        if (!monthAgg[ym]) monthAgg[ym] = { qtd: 0, receita: 0 };
        monthAgg[ym].qtd += cell.qtd;
        monthAgg[ym].receita += cell.receita;
      }
    }
    const traj: LancamentoTrajetoria[] = Object.entries(monthAgg)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, cell], i) => ({ ym, qtd: cell.qtd, receita: cell.receita, monthIndex: i }));
    const qtdAcum = traj.reduce((s, t) => s + t.qtd, 0);
    const receitaAcum = traj.reduce((s, t) => s + t.receita, 0);

    const fcMap = data.FC_MAP[linha] || {};
    const fcAcum = Object.entries(fcMap)
      .filter(([ym]) => ym >= bounds.from && ym <= bounds.to)
      .reduce((s, [, v]) => s + v, 0);
    const forecastAcum = fcAcum > 0 ? fcAcum : null;
    const atingimento = forecastAcum ? (qtdAcum / forecastAcum - 1) * 100 : null;

    const sd = data.salesByLinha[linha];
    const tmB = qtdAcum > 0 ? receitaAcum / qtdAcum : 0;
    const custoB = data.COST_MAP[linha] ?? null;
    const margemPctB = custoB != null && tmB > 0 ? ((tmB - custoB) / tmB) * 100 : null;
    all.push({
      tipo: 'B',
      linha,
      categoria: ext.categoria,
      status: sd?.status ?? '—',
      firstSale,
      monthsActive: monthsBetween(firstSale, latest),
      qtdAcum,
      receitaAcum,
      ticketMedio: tmB,
      custo: custoB,
      margemPct: margemPctB,
      trajectory: traj,
      newSkusCount: skusInScope.length,
      newSkus: skusInScope,
      forecastAcum,
      atingimento,
      benchmarkPct: null,
    });
  }

  // ── Benchmark: % vs peer médio da MESMA categoria no MESMO nº de meses ──
  //
  // Para cada lançamento L com monthsActive=N, calcula a média de receita
  // acumulada de OUTROS lançamentos da MESMA categoria nos seus primeiros N meses.
  for (const l of all) {
    const peers = all.filter(
      (p) => p !== l && p.categoria === l.categoria && p.trajectory.length >= l.monthsActive,
    );
    if (peers.length === 0) continue;
    const peerReceitas = peers.map((p) =>
      p.trajectory.slice(0, l.monthsActive).reduce((s, t) => s + t.receita, 0),
    );
    const avg = peerReceitas.reduce((s, v) => s + v, 0) / peerReceitas.length;
    if (avg > 0) l.benchmarkPct = (l.receitaAcum / avg - 1) * 100;
  }

  return all.sort((a, b) => b.firstSale.localeCompare(a.firstSale));
}

/**
 * Monthly series of receita / qtd / TM aggregated across the launches in scope.
 * Splits receita and qtd between Tipo A (nova linha) and Tipo B (drop de cor)
 * for stacked-chart rendering. For each launch, sales since firstSale are
 * counted (pre-launch months ignored).
 */
export interface LaunchMonthlyPoint {
  ym: Ym;
  label: string;
  receita: number;       // total = receitaA + receitaB
  receitaA: number;      // Nova linha
  receitaB: number;      // Drop de cor
  qtd: number;
  qtdA: number;
  qtdB: number;
  ticketMedio: number;
  margemRS: number | null;   // soma (cell.receita − custo × cell.qtd) dos lançamentos c/ custo
  margemPct: number | null;  // margemRS ÷ receita ponderada pelos com custo
  fcQtd: number | null;       // forecast acumulado mês a mês das linhas no escopo
}

export function launchMonthlySeries(
  launches: Lancamento[],
  data: ProcessedData,
  sales: SalesBySkuPayload | undefined,
  from: Ym,
  to: Ym,
): LaunchMonthlyPoint[] {
  const M = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const months = allMonths(data).filter((ym) => ym >= from && ym <= to);
  return months.map((ym) => {
    let receitaA = 0, receitaB = 0;
    let qtdA = 0, qtdB = 0;
    let margemRS = 0;
    let receitaComCusto = 0;
    let hasCusto = false;
    let fcQtd = 0;
    let hasFc = false;
    for (const l of launches) {
      let receitaSku = 0, qtdSku = 0;
      if (l.tipo === 'A') {
        // Linha inteira é nova → soma receita da linha desde firstSale
        if (l.firstSale > ym) continue;
        const cell = data.salesByLinha[l.linha]?.months[ym];
        if (cell) {
          receitaA += cell.receita; qtdA += cell.qtd;
          receitaSku = cell.receita; qtdSku = cell.qtd;
        }
      } else {
        // Tipo B (drop de cor) → soma apenas a receita dos SKUs novos
        // (não da linha inteira, pois a linha tem SKUs antigos do catálogo).
        if (sales && l.newSkus) {
          for (const ns of l.newSkus) {
            if (ns.firstSale > ym) continue;
            const cell = sales.salesBySku[ns.sku]?.months[ym];
            if (cell) { receitaSku += cell.receita; qtdSku += cell.qtd; }
          }
        } else if (l.firstSale <= ym) {
          // Fallback (sem payload de SKU): usa receita da linha — sobrestima.
          const cell = data.salesByLinha[l.linha]?.months[ym];
          if (cell) { receitaSku = cell.receita; qtdSku = cell.qtd; }
        }
        receitaB += receitaSku; qtdB += qtdSku;
      }
      // Margem mensal ponderada (só linhas com custo conhecido)
      if (l.custo != null && qtdSku > 0) {
        margemRS += receitaSku - l.custo * qtdSku;
        receitaComCusto += receitaSku;
        hasCusto = true;
      }
      // FC só faz sentido pra Tipo A (FC da linha = forecast do catálogo, inclui SKUs antigos).
      if (l.tipo === 'A') {
        const fcVal = data.FC_MAP[l.linha]?.[ym];
        if (fcVal != null && fcVal > 0) { fcQtd += fcVal; hasFc = true; }
      }
    }
    const receita = receitaA + receitaB;
    const qtd = qtdA + qtdB;
    const margemPct = hasCusto && receitaComCusto > 0 ? (margemRS / receitaComCusto) * 100 : null;
    const [y, m] = ym.split('-');
    return {
      ym,
      label: `${M[+m]}/${y.slice(2)}`,
      receita, receitaA, receitaB,
      qtd, qtdA, qtdB,
      ticketMedio: qtd > 0 ? receita / qtd : 0,
      margemRS: hasCusto ? margemRS : null,
      margemPct,
      fcQtd: hasFc ? fcQtd : null,
    };
  });
}

/** Classify the launch outcome based on FC + benchmark + activity. */
export type LancamentoOutcome = 'success' | 'watch' | 'concern' | 'discontinued' | 'unknown';

export function classifyLancamento(l: Lancamento): LancamentoOutcome {
  if (l.status === 'Descontinuado') return 'discontinued';
  // Prefer FC signal when available
  if (l.atingimento != null) {
    if (l.atingimento >= 0) return 'success';
    if (l.atingimento >= -25) return 'watch';
    return 'concern';
  }
  // Fallback to benchmark
  if (l.benchmarkPct != null) {
    if (l.benchmarkPct >= 0) return 'success';
    if (l.benchmarkPct >= -30) return 'watch';
    return 'concern';
  }
  return 'unknown';
}

// ────────────────────────────────────────────────────────────
// LANÇAMENTOS — visão por MATERIAL (SKU)
// Cada linha vira N rows (uma por SKU/material). Enriquecida com
// dados de estoque (STOCK_MAP) quando o SKU é encontrado.
// ────────────────────────────────────────────────────────────

export interface MaterialLancamento {
  tipo: LancamentoTipo;
  sku: string;
  nomeMaterial: string;
  linha: string;
  categoria: Categoria;
  status: Status;
  firstSale: Ym;
  monthsActive: number;
  // Estoque (do STOCK_MAP, quando disponível)
  curva: CurvaABC | null;
  estoque: number | null;
  custo: number | null;
  saida3d: number | null;  // unidades por dia (média 3 dias)
  saida7d: number | null;  // unidades por dia (média 7 dias)
  coberturaDias: number | null;
  // Métricas REAIS por SKU (acumuladas desde a estreia)
  qtdAcum: number | null;      // unidades vendidas desde firstSale
  receitaAcum: number | null;  // receita real acumulada desde firstSale
  ticketMedio: number | null;  // receita ÷ qtd (real, por SKU)
  margemPct: number | null;    // (TM − custo SKU) ÷ TM · custo é por SKU
}

function monthsBetweenYm(from: Ym, to: Ym): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ty * 12 + tm - (fy * 12 + fm) + 1;
}

function enrichFromStock(
  sku: string,
  data: ProcessedData,
): Pick<MaterialLancamento, 'curva' | 'estoque' | 'custo' | 'saida3d' | 'saida7d' | 'coberturaDias'> {
  const s = data.STOCK_MAP[sku];
  if (!s) {
    return { curva: null, estoque: null, custo: null, saida3d: null, saida7d: null, coberturaDias: null };
  }
  // Cobertura: estoque ÷ (saida7d), pois saida7d já está em un/dia
  const cob = s.saida7d > 0 ? s.estoqueTotal / s.saida7d : null;
  return {
    curva: s.curva,
    estoque: s.estoqueTotal,
    custo: s.custo,
    saida3d: s.saida3d,
    saida7d: s.saida7d,
    coberturaDias: cob,
  };
}

/** Compute real per-SKU metrics from the SKU-level sales data. */
function computeRealFromSku(
  sku: string,
  firstSale: Ym,
  custo: number | null,
  sales?: SalesBySkuPayload,
  consulta?: ConsultaRange,
): { qtdAcum: number | null; receitaAcum: number | null; ticketMedio: number | null; margemPct: number | null } {
  if (!sales || !sales.salesBySku[sku]) {
    return { qtdAcum: null, receitaAcum: null, ticketMedio: null, margemPct: null };
  }
  const data = sales.salesBySku[sku];
  const lower = consulta && consulta.from > firstSale ? consulta.from : firstSale;
  const upper = consulta?.to ?? '9999-99';
  let qtd = 0, receita = 0;
  for (const [ym, cell] of Object.entries(data.months)) {
    if (ym >= lower && ym <= upper) {
      qtd += cell.qtd;
      receita += cell.receita;
    }
  }
  const tm = qtd > 0 ? receita / qtd : null;
  const margemPct = custo != null && tm != null && tm > 0 ? ((tm - custo) / tm) * 100 : null;
  return { qtdAcum: qtd, receitaAcum: receita, ticketMedio: tm, margemPct };
}

/**
 * Build material-level rows for all "lançamentos" (squad definition).
 *   - Tipo A: para cada nova linha, expande a lista de SKUs via STOCK_MAP
 *             (filtrados por stock.linha === linha do lançamento)
 *   - Tipo B: cada SKU dentro de typeB_extensions[linha].skus é uma linha
 */
export function buildMaterialLancamentos(
  data: ProcessedData,
  sales?: SalesBySkuPayload,
  consulta?: ConsultaRange,
): MaterialLancamento[] {
  const latest = latestMonth(data) ?? data.meta.period.to;
  if (!latest) return [];

  const out: MaterialLancamento[] = [];

  function withReal(
    base: Omit<MaterialLancamento, 'qtdAcum' | 'receitaAcum' | 'ticketMedio' | 'margemPct'>,
  ): MaterialLancamento {
    const real = computeRealFromSku(base.sku, base.firstSale, base.custo, sales, consulta);
    return { ...base, ...real };
  }

  // ── Tipo A — expande cada nova linha em N SKUs via STOCK_MAP ──
  // Só conta como Tipo A os SKUs que estrearam JUNTO com a linha; SKUs que
  // estrearam depois são drops de cor e aparecem no loop Tipo B abaixo.
  // Linhas pré-LAUNCH_CUTOFF são "catálogo existente" — não entram como lançamento.
  for (const item of data.typeA_newLines) {
    if (item.firstSale < LAUNCH_CUTOFF) continue;
    const skusOfLinha = Object.entries(data.STOCK_MAP)
      .filter(([, s]) => s.linha === item.linha);
    if (skusOfLinha.length === 0) {
      out.push(withReal({
        tipo: 'A',
        sku: item.linha,
        nomeMaterial: item.linha,
        linha: item.linha,
        categoria: item.categoria,
        status: item.status,
        firstSale: item.firstSale,
        monthsActive: monthsBetweenYm(item.firstSale, latest),
        curva: null, estoque: null, custo: null, saida3d: null, saida7d: null, coberturaDias: null,
      }));
      continue;
    }
    for (const [sku, stock] of skusOfLinha) {
      const firstSale = data.skuFirstSale[sku] ?? item.firstSale;
      if (firstSale > item.firstSale) continue; // drop posterior → cai em Tipo B
      out.push(withReal({
        tipo: 'A',
        sku,
        nomeMaterial: sku,
        linha: item.linha,
        categoria: item.categoria,
        status: stock.status || item.status,
        firstSale,
        monthsActive: monthsBetweenYm(firstSale, latest),
        ...enrichFromStock(sku, data),
      }));
    }
  }

  // ── Tipo B — cada SKU dentro do drop ──
  // Só conta SKUs que estrearam a partir de LAUNCH_CUTOFF.
  for (const [linha, ext] of Object.entries(data.typeB_extensions)) {
    const sd = data.salesByLinha[linha];
    const status = sd?.status ?? '—';
    for (const item of ext.skus) {
      if (item.firstSale < LAUNCH_CUTOFF) continue;
      out.push(withReal({
        tipo: 'B',
        sku: item.sku,
        nomeMaterial: item.nomeMaterial || item.sku,
        linha,
        categoria: ext.categoria,
        status,
        firstSale: item.firstSale,
        monthsActive: monthsBetweenYm(item.firstSale, latest),
        ...enrichFromStock(item.sku, data),
      }));
    }
  }

  return out.sort((a, b) => b.firstSale.localeCompare(a.firstSale));
}

/** Cobertura-based health classification for a material row. */
export type MaterialHealth = 'critical' | 'low' | 'good' | 'high' | 'unknown';

export function classifyMaterialHealth(m: MaterialLancamento): MaterialHealth {
  if (m.coberturaDias == null) return 'unknown';
  if (m.coberturaDias < 7) return 'critical';
  if (m.coberturaDias < 30) return 'low';
  if (m.coberturaDias <= 90) return 'good';
  return 'high';
}


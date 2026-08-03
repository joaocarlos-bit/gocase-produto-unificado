import type { ProcessedData, SalesBySkuPayload, Ym } from './types';
import overrides from './launch-overrides.json';

/**
 * Mapa de lançamentos (uma entrada por SKU).
 *
 * DATA DE LANÇAMENTO — duas fontes, nesta ordem (pedido do João, 2026-07-13):
 *  1) CALENDÁRIO OFICIAL (Monday "⭐️ lançamentos 2025", escopo Novidade+Novas
 *     Cores) → `launch-overrides.json > calendar2025` mapeia LINHA → mês oficial
 *     de estreia. É a fonte de verdade: a base de vendas começa em jan/25 e não
 *     tem data de lançamento, então um lançamento real de 2025 e catálogo antigo
 *     ficam indistinguíveis pela 1ª venda. O calendário resolve isso.
 *  2) 1ª VENDA (fallback) → para o que NÃO está no calendário 2025 (ex.: estreias
 *     de 2026), usa o mês da 1ª venda, com corte em `since` (fev/25) pra descartar
 *     catálogo censurado em jan/25.
 *
 * Regenerar o calendar2025: `node scripts/gen-launch-overrides.cjs`.
 * Fonte de dados: skuFirstSale + STOCK_MAP + salesBySku (snapshot; não re-roda refresh).
 * CAVEAT: jun/26 pode faltar no grão SKU dependendo da base — zera métrica de quem só vendeu nesse mês.
 */

export const LAUNCH_MAP_SINCE: Ym = overrides.since as Ym;

const CALENDAR_2025: Record<string, Ym> = overrides.calendar2025 as Record<string, Ym>;
const MANUAL_SKUS: Record<string, Ym> = (overrides.manualSkus ?? {}) as Record<string, Ym>;
const EXCLUDE_CATEGORIES = new Set<string>(overrides.excludeCategories);
const EXCLUDE_LINES = new Set<string>(overrides.excludeLines ?? []);
const COLLAB_RE = new RegExp(overrides.excludeCollabTerms.map((t) => `\\b${t}\\b`).join('|'));

/** Estampas/coleções temáticas (collab/licenciado) — não são linha nova. */
function isThemedCollab(name: string): boolean {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return COLLAB_RE.test(n);
}

export interface LaunchEntry {
  sku: string;
  linha: string;
  categoria: string;
  status: string;
  curva: string;
  firstSale: Ym;
  monthsSinceLaunch: number; // meses corridos da estreia até o fim do snapshot
  monthsActive: number;      // nº de meses com venda > 0
  lastSale: Ym | null;
  totalQtd: number;
  totalReceita: number;
  ticketMedio: number;
  estoqueTotal: number;
  custo: number;
}

function ymIndex(ym: Ym): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}

/**
 * Constrói o mapa de lançamentos (uma entrada por SKU) com 1ª venda >= `since`.
 * Ordenado por data de estreia (mais recente primeiro) e, no empate, por receita.
 */
export function buildLaunchMap(
  data: ProcessedData,
  sales: SalesBySkuPayload,
  since: Ym = LAUNCH_MAP_SINCE,
): LaunchEntry[] {
  const periodTo = data.meta.period.to;
  const toIdx = ymIndex(periodTo);
  const out: LaunchEntry[] = [];

  for (const [sku, firstSale] of Object.entries(data.skuFirstSale)) {
    if (!firstSale) continue;
    // Estampas/coleções temáticas (collab/licenciado) não são linha nova.
    if (isThemedCollab(sku)) continue;

    const stock = data.STOCK_MAP[sku];
    // Categorias / linhas ocultadas (Spare Part; Skins).
    if (stock && EXCLUDE_CATEGORIES.has(stock.categoria)) continue;
    if (stock && EXCLUDE_LINES.has(stock.linha)) continue;

    // Data de estreia, por precedência:
    //  1) override por SKU (drop de cor censurado em jan/25);
    //  2) calendário oficial da linha (linha nova 2025);
    //  3) 1ª venda (estreias 2026+ ou mid-2025 fora do calendário).
    const manualSku = MANUAL_SKUS[sku];
    const calMonth = stock ? CALENDAR_2025[stock.linha] : undefined;
    let launchMonth: Ym;
    if (manualSku) launchMonth = manualSku;
    else if (calMonth) launchMonth = calMonth;
    else if (firstSale >= since) launchMonth = firstSale;
    else continue;                                     // 1ª venda em jan/25 sem calendário/override = catálogo

    const sd = sales.salesBySku[sku];

    let totalQtd = 0;
    let totalReceita = 0;
    let monthsActive = 0;
    let lastSale: Ym | null = null;
    if (sd) {
      totalQtd = sd.totalQtd;
      totalReceita = sd.totalReceita;
      for (const [ym, cell] of Object.entries(sd.months)) {
        if (cell.qtd > 0) {
          monthsActive++;
          if (!lastSale || ym > lastSale) lastSale = ym;
        }
      }
    }

    out.push({
      sku,
      linha: stock?.linha ?? '—',
      categoria: stock?.categoria ?? '—',
      status: stock?.status ?? '—',
      curva: stock?.curva ?? '—',
      firstSale: launchMonth,
      monthsSinceLaunch: toIdx - ymIndex(launchMonth) + 1,
      monthsActive,
      lastSale,
      totalQtd,
      totalReceita,
      ticketMedio: totalQtd > 0 ? totalReceita / totalQtd : 0,
      estoqueTotal: stock?.estoqueTotal ?? 0,
      custo: stock?.custo ?? 0,
    });
  }

  out.sort((a, b) => (a.firstSale < b.firstSale ? 1 : a.firstSale > b.firstSale ? -1 : b.totalReceita - a.totalReceita));
  return out;
}

/** Coorte por mês de estreia: nº de SKUs + receita/qtd acumuladas. */
export function launchCohortsByMonth(entries: LaunchEntry[]): Array<{ ym: Ym; count: number; receita: number; qtd: number }> {
  const map = new Map<Ym, { count: number; receita: number; qtd: number }>();
  for (const e of entries) {
    const cur = map.get(e.firstSale) ?? { count: 0, receita: 0, qtd: 0 };
    cur.count++;
    cur.receita += e.totalReceita;
    cur.qtd += e.totalQtd;
    map.set(e.firstSale, cur);
  }
  return Array.from(map.entries())
    .map(([ym, v]) => ({ ym, ...v }))
    .sort((a, b) => (a.ym < b.ym ? -1 : 1));
}

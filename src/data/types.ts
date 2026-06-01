/** Canonical types for processed-data.json (snapshot pipeline output). */

export type Categoria = 'Têxtil' | 'Térmico' | 'UV' | 'Gift' | 'Spare Part' | 'Tech' | string;
export type Status = 'Lançamento' | 'Linha/Recompra' | 'Descontinuado' | string;
export type CurvaABC = 'AA' | 'A' | 'B' | 'C' | 'Não Classificado' | string;
export type Ym = string; // 'YYYY-MM'

/** Grupos de canal — agregação aplicada no refresh-snapshot.cjs. */
export type CanalGrupo = 'D2C' | 'B2B' | 'Lojas' | 'Brindes';
export const CANAL_GRUPOS: CanalGrupo[] = ['D2C', 'B2B', 'Lojas', 'Brindes'];
export interface CanalCell { qtd: number; receita: number; }

export interface RawMeta {
  collectedAt: string;
  period: { from: Ym; to: Ym; fromDay: string | null; toDay: string | null };
  qualityScore: number;
  apiStatus: { sales: boolean; ticketsense: boolean; slowmoving: boolean; forecast: boolean };
  apisLoaded: number;
  totalSalesRows: number;
  filteredRows: number;
  linhasInPeriod: number;
  skusInPeriod: number;
  linhasWithCost: number;
  costCoverage: string;
  linhasWithFC: number;
  fcCoverage: string;
  linhasNoCost: string[];
  linhasNoFC: string[];
}

export interface MonthCell {
  qtd: number;
  receita: number;
  ticketSum: number;
  ticketCount: number;
  /** Breakdown opcional por grupo de canal. Ausente em snapshots pré-canal. */
  byCanal?: Partial<Record<CanalGrupo, CanalCell>>;
}

export interface LinhaSales {
  categoria: Categoria;
  status: Status;
  months: Record<Ym, MonthCell>;
}

export interface TypeANewLine {
  linha: string;
  categoria: Categoria;
  firstSale: Ym;
  status: Status;
}

export interface TypeBSkuExtension {
  sku: string;
  firstSale: Ym;
  nomeMaterial: string;
}

export interface TypeBExtension {
  categoria: Categoria;
  linhaFirst: Ym;
  skus: TypeBSkuExtension[];
}

export interface StockSku {
  categoria: Categoria;
  linha: string;
  status: Status;
  curva: CurvaABC;
  estoqueTotal: number;
  custo: number;
  saida3d: number;
  saida7d: number;
}

export interface StockLinha {
  categoria: Categoria;
  estoqueTotal: number;
  curvas: Record<CurvaABC, number>;
  skusCount: number;
  saida3dTotal: number;
  saida7dTotal: number;
  dominanteCurva: CurvaABC;
  coberturaDias: number;
}

export interface TicketSense {
  status: string;
  totalForecast: number;
  salesAccumulated: number;
  ticketAtual: string;
  ticketHistorico: string;
  ticketOrcado: string;
  custo: number;
  faturamentoRealizado: number;
  markupPlanejado: string;
  markupAtual: string;
}

export interface ProcessedData {
  meta: RawMeta;
  COST_MAP: Record<string, number>;
  TICKET_MAP: Record<string, TicketSense>;
  FC_MAP: Record<string, Record<Ym, number>>;
  salesByLinha: Record<string, LinhaSales>;
  linhaFirstSale: Record<string, Ym>;
  skuFirstSale: Record<string, Ym>;
  typeA_newLines: TypeANewLine[];
  typeB_extensions: Record<string, TypeBExtension>;
  existingLines: Record<string, { categoria: Categoria; firstSale: Ym; status: Status }>;
  STOCK_LINHA_MAP: Record<string, StockLinha>;
  STOCK_MAP: Record<string, StockSku>;
}

/** SKU-level monthly sales extracted from the raw snapshot. */
export interface SkuMonthCell {
  qtd: number;
  receita: number;
  byCanal?: Partial<Record<CanalGrupo, CanalCell>>;
}

// ────────────────────────────────────────────────────────────
// STAMPED — reviews snapshot (output do scripts/refresh-stamped.cjs)
// ────────────────────────────────────────────────────────────

export interface StampedRating { 1: number; 2: number; 3: number; 4: number; 5: number; }

export interface StampedProductAgg {
  productId: number;
  productName: string;
  /** Linha-mãe derivada do nome (prefixo antes de " - "). Opcional pra back-compat. */
  linhaMae?: string;
  count: number;
  avgRating: number;
  dist: StampedRating;
}

export interface StampedMonthAgg {
  ym: Ym;
  count: number;
  avgRating: number;
  dist: StampedRating;
}

export interface StampedReviewRow {
  id: number;
  author: string;
  title: string;
  message: string;
  rating: number;
  date: string; // ISO
  productId: number;
  productName: string;
  location: string;
  verified: boolean;
}

/** Cell compacta por produto × mês: [count, sumRating, dist1, dist2, dist3, dist4, dist5] */
export type StampedProductMonthCell = [number, number, number, number, number, number, number];

export interface StampedPayload {
  meta: {
    collectedAt: string;
    dateFrom: string;
    total: number;
    ratingMedio: number;
    ratingAllTime: number | null;
    totalAllTime: number;
  };
  byProduct: StampedProductAgg[];
  /** Granularidade produto×mês — opcional pra back-compat. Quando ausente, filtros de período não funcionam. */
  byProductMonth?: Record<string, Record<string, StampedProductMonthCell>>;
  byMonth: StampedMonthAgg[];
  recent: StampedReviewRow[];
}
export interface SkuSales {
  totalQtd: number;
  totalReceita: number;
  months: Record<Ym, SkuMonthCell>;
}
export interface SalesBySkuPayload {
  ts: string;
  sourceRows: number;
  validRows: number;
  skippedRows: number;
  skuCount: number;
  salesBySku: Record<string, SkuSales>;
}

/** Aggregated view ready for screens. */
export interface LinhaAgg {
  linha: string;
  categoria: Categoria;
  status: Status;
  receita: number;       // total period
  qtd: number;
  ticketMedio: number;
  custo: number | null;
  margemPct: number | null;   // (TM - custo)/TM
  margemRS: number | null;
  forecastQtd: number | null;
  atingimento: number | null; // realizado/forecast - 1, in %
  share: number;              // % of total period revenue
  firstSale: Ym | null;
  isLancamento: boolean;      // typeA or typeB in last 90d
}

// Tipos + loader do snapshot de custos de importação (public/data/import-costs.json).
// Gerado por scripts/refresh-import-costs.cjs a partir da planilha
// "Controle de Importações.xlsx" (aba "Controle PLs"). Recorte: histórico de
// custos POR LINHA de produto ao longo dos meses de embarque.

export type ImportMetric = 'fob' | 'bbSemIpi' | 'bbComIpi' | 'gocom';

export interface ImportCostPoint {
  ym: string;             // 'YYYY-MM' (mês de entrega/embarque)
  qtd: number;
  nPLs: number;           // PLs distintas no mês
  fob: number | null;     // Custo FOB — US$/un
  bbSemIpi: number | null; // Custo BB s/ IPI — R$/un
  bbComIpi: number | null; // Custo BB c/ IPI — R$/un
  gocom: number | null;    // Custo Gocom — R$/un
}

// Custos agregados de UM fornecedor dentro de uma linha (histórico inteiro,
// média ponderada por quantidade). Alimenta a tabela "Custo por fornecedor".
export interface ImportSupplierAgg {
  fornecedor: string;
  qtd: number;
  nPLs: number;
  firstYm: string | null;
  lastYm: string | null;
  fob: number | null;
  bbSemIpi: number | null;
  bbComIpi: number | null;
  gocom: number | null;
}

export interface ImportLinha {
  linha: string;
  fornecedores: string[];
  totalQtd: number;
  nEmbarques: number;     // PLs distintas no histórico inteiro
  series: ImportCostPoint[]; // ordenado por ym asc
  bySupplier?: ImportSupplierAgg[]; // custo por fornecedor (desc por qtd)
}

export interface ImportCostsMeta {
  collectedAt: string;
  sourceFile: string;
  sheet: string;
  totalRows: number;
  usedRows: number;
  skippedNoLinha: number;
  skippedNoDate: number;
  linhasCount: number;
  fornecedoresCount: number;
  embarquesCount: number;
  period: { from: string | null; to: string | null };
  months: string[];
}

export interface ImportCostsPayload {
  meta: ImportCostsMeta;
  byLinha: Record<string, ImportLinha>;
}

export const IMPORT_METRICS: {
  key: ImportMetric;
  label: string;
  unit: 'US$' | 'R$';
}[] = [
  { key: 'fob',      label: 'FOB',       unit: 'US$' },
  { key: 'bbSemIpi', label: 'BB s/ IPI', unit: 'R$' },
  { key: 'bbComIpi', label: 'BB c/ IPI', unit: 'R$' },
  { key: 'gocom',    label: 'GOCOM',     unit: 'R$' },
];

let _cache: Promise<ImportCostsPayload> | null = null;
export function loadImportCosts(): Promise<ImportCostsPayload> {
  if (_cache) return _cache;
  _cache = fetch('/data/import-costs.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar custos de importação: HTTP ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      _cache = null;
      throw e;
    });
  return _cache;
}

// ── Helpers de série ───────────────────────────────────────────────────────

/** Primeiro e último valor não-nulo da métrica (cronológico). */
export function firstLast(
  series: ImportCostPoint[],
  metric: ImportMetric,
): { first: number | null; last: number | null; firstYm: string | null; lastYm: string | null } {
  let first: number | null = null, last: number | null = null;
  let firstYm: string | null = null, lastYm: string | null = null;
  for (const p of series) {
    const v = p[metric];
    if (v == null) continue;
    if (first == null) { first = v; firstYm = p.ym; }
    last = v; lastYm = p.ym;
  }
  return { first, last, firstYm, lastYm };
}

/** Variação % entre o primeiro e o último ponto não-nulo da métrica. */
export function deltaPct(series: ImportCostPoint[], metric: ImportMetric): number | null {
  const { first, last } = firstLast(series, metric);
  if (first == null || last == null || first === 0) return null;
  return (last / first - 1) * 100;
}

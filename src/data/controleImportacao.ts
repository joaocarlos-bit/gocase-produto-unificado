// Planilha "Controle de POs" (Google Sheets) — abas "POs por Item" e
// "Controle PIs". Lida AO VIVO via Sheets API v4 com chave pública (mesmo
// padrão de sheetsLancamentos.ts) — sem OAuth, planilha compartilhada por
// link, sem snapshot buildado (diferente do Histórico de Custos).
// https://docs.google.com/spreadsheets/d/12W-3sAQy2kczgm--8zhUO7R2g2-tKewFT2kFfnfC3Bg/edit

const SHEET_ID = '12W-3sAQy2kczgm--8zhUO7R2g2-tKewFT2kFfnfC3Bg';
const API_KEY = 'AIzaSyC6g4xMmecyJjQlJcWkGtjODF_9TWMqc3w';
const TAB_ITENS = 'POs por Item';
const TAB_PIS = 'Controle PIs';

// Índices de coluna (0-based), resolvidos pelo cabeçalho real das abas.
const COL_ITEM = {
  processo: 0, itemSupplier: 1, quantidade: 2, custo: 3, custoTotal: 4,
  skuUnico: 5, fornecedor: 10, qty1stBatch: 12, eta1stBatch: 17, linha: 40,
};
const COL_PI = {
  processo: 0, embarque: 1, noDaPI: 2, status: 5, quantidade: 6, valorTotalPI: 7,
  etdChina: 10, etaSantos: 11, diasDesembaraco: 12, entregaGocase: 13,
  observacao: 35, tipo: 36, supplier: 39,
};

interface DateVal { label: string | null; ts: number | null }
const NO_DATE: DateVal = { label: null, ts: null };
// Piso de sanidade pro serial (40000 ≈ 2009) — mesmo critério usado em
// sheetsLancamentos.ts. Sem isso, uma célula com lixo (ex.: alguém digitou
// "34" em vez de uma data) vira silenciosamente "04/02/1900" em vez de "—".
const MIN_VALID_SERIAL = 40000;
/** Serial de data do Sheets/Excel (dia 0 = 30/12/1899) → data formatada + epoch (pra ordenar). */
function parseDate(v: unknown): DateVal {
  if (typeof v !== 'number' || v < MIN_VALID_SERIAL) return NO_DATE;
  const ts = Date.UTC(1899, 11, 30) + v * 86400000;
  return { label: new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' }), ts };
}
const str = (v: unknown): string | null => { const s = String(v ?? '').trim(); return s || null; };
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// "ETA 1st/2nd/3rd/4th Batch" não guardam data nem semana — é um código de MÊS
// interno da planilha (confirmado com o time de Supply): 25=Jan/2026,
// 26=Fev/2026, …, 36=Dez/2026, 37=Jan/2027, 38=Fev/2027 → código 1 = Jan/2024.
// Convertido pra 'YYYY-MM' pra reaproveitar o mesmo ymLabel() usado no resto
// do dashboard (Histórico de Custos etc.) em vez de formatar na mão aqui.
function monthCodeToYm(code: number): string {
  const idx = Math.round(code) - 1;
  const year = 2024 + Math.floor(idx / 12);
  const month = (((idx % 12) + 12) % 12) + 1; // 1-based, robusto a code<1
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface ItemRow {
  processo: string;
  itemSupplier: string;
  linha: string | null;
  skuUnico: string | null;
  fornecedor: string | null;
  quantidade: number;
  custoFornecedor: number | null; // "Custo" — por unidade
  custoTotal: number | null;
  qty1stBatch: number | null;
  /** 'YYYY-MM' (ver monthCodeToYm acima) — formatar com ymLabel() de lib/format. */
  eta1stBatchYm: string | null;
}

export interface PIRow {
  processo: string;
  embarque: string;
  noDaPI: string;
  status: string | null;
  quantidade: number;
  valorTotalPI: number | null;
  etdChina: DateVal;
  etaSantos: DateVal;
  diasDesembaraco: number | null;
  entregaGocase: DateVal;
  observacao: string | null;
  tipo: string | null;
  supplier: string | null;
  // A aba "Controle PIs" não tem SKU próprio (só um "Item Supplier" genérico,
  // ex. "Thermal Bottles '23", cobrindo várias cores/SKUs de uma vez) — os
  // SKUs (e quantidade por SKU) abaixo vêm de "POs por Item" ligados por
  // Processo. Na prática quase todo processo tem várias SKUs (chega a 34 num
  // processo só), então isso é uma lista, não um valor único: não dá pra
  // saber, só com esses dados, qual SKU (e quanto dele) foi em qual embarque
  // específico do mesmo processo — skuBreakdown.length > 1 sinaliza esse caso
  // pro aviso na tela. Ordenado por quantidade desc.
  skuBreakdown: { sku: string; quantidade: number }[];
  linhas: string[];
}

export interface ControleImportacaoPayload {
  itens: ItemRow[];
  pis: PIRow[];
  collectedAt: string; // ISO — hora do fetch no navegador (dado ao vivo, não é snapshot)
}

async function fetchControleImportacao(): Promise<ControleImportacaoPayload> {
  const ranges = [
    `${encodeURIComponent(TAB_ITENS)}!A1:AR4000`,
    `${encodeURIComponent(TAB_PIS)}!A1:BB1500`,
  ].map((r) => `ranges=${r}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${ranges}&key=${API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar planilha de Controle de POs`);
  const json = await res.json();
  const valueRanges: { values?: unknown[][] }[] = json.valueRanges || [];
  const itemRows = (valueRanges[0]?.values || []).slice(1);
  const piRowsRaw = (valueRanges[1]?.values || []).slice(1);

  const itens: ItemRow[] = itemRows
    .map((r): ItemRow | null => {
      const processo = str(r[COL_ITEM.processo]);
      if (!processo) return null;
      return {
        processo,
        itemSupplier: str(r[COL_ITEM.itemSupplier]) || '',
        linha: str(r[COL_ITEM.linha]),
        skuUnico: str(r[COL_ITEM.skuUnico]),
        fornecedor: str(r[COL_ITEM.fornecedor]),
        quantidade: num(r[COL_ITEM.quantidade]) ?? 0,
        custoFornecedor: num(r[COL_ITEM.custo]),
        custoTotal: num(r[COL_ITEM.custoTotal]),
        qty1stBatch: num(r[COL_ITEM.qty1stBatch]),
        eta1stBatchYm: (() => { const c = num(r[COL_ITEM.eta1stBatch]); return c != null ? monthCodeToYm(c) : null; })(),
      };
    })
    .filter((r): r is ItemRow => r !== null);

  const skusByProcesso = new Map<string, ItemRow[]>();
  itens.forEach((it) => {
    if (!it.skuUnico) return; // sem SKU único preenchido — não entra no join
    if (!skusByProcesso.has(it.processo)) skusByProcesso.set(it.processo, []);
    skusByProcesso.get(it.processo)!.push(it);
  });

  const pis: PIRow[] = piRowsRaw
    .map((r): PIRow | null => {
      const processo = str(r[COL_PI.processo]);
      if (!processo) return null;
      const matched = skusByProcesso.get(processo) || [];
      return {
        processo,
        embarque: str(r[COL_PI.embarque]) || '',
        noDaPI: str(r[COL_PI.noDaPI]) || '',
        status: str(r[COL_PI.status]),
        quantidade: num(r[COL_PI.quantidade]) ?? 0,
        valorTotalPI: num(r[COL_PI.valorTotalPI]),
        etdChina: parseDate(r[COL_PI.etdChina]),
        etaSantos: parseDate(r[COL_PI.etaSantos]),
        diasDesembaraco: num(r[COL_PI.diasDesembaraco]),
        entregaGocase: parseDate(r[COL_PI.entregaGocase]),
        observacao: str(r[COL_PI.observacao]),
        tipo: str(r[COL_PI.tipo]),
        supplier: str(r[COL_PI.supplier]),
        skuBreakdown: (() => {
          const bySku = new Map<string, number>();
          matched.forEach((it) => bySku.set(it.skuUnico!, (bySku.get(it.skuUnico!) || 0) + it.quantidade));
          return [...bySku.entries()].map(([sku, quantidade]) => ({ sku, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
        })(),
        linhas: [...new Set(matched.map((it) => it.linha).filter((l): l is string => !!l))],
      };
    })
    .filter((r): r is PIRow => r !== null);

  return { itens, pis, collectedAt: new Date().toISOString() };
}

let _cache: Promise<ControleImportacaoPayload> | null = null;
/** `force=true` ignora o cache em memória e busca de novo na planilha (usado
 *  pelo botão "Atualizar" — os dados aqui são ao vivo, não um snapshot). */
export function loadControleImportacao(force = false): Promise<ControleImportacaoPayload> {
  if (_cache && !force) return _cache;
  _cache = fetchControleImportacao().catch((e) => { _cache = null; throw e; });
  return _cache;
}

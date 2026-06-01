import type { ProcessedData, SalesBySkuPayload, StampedPayload } from './types';

let _cacheMain: Promise<ProcessedData> | null = null;
let _cacheSku: Promise<SalesBySkuPayload> | null = null;
let _cacheStamped: Promise<StampedPayload | null> | null = null;

export function loadProcessedData(): Promise<ProcessedData> {
  if (_cacheMain) return _cacheMain;
  _cacheMain = fetch('/data/processed-data.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar dados: HTTP ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      _cacheMain = null;
      throw e;
    });
  return _cacheMain;
}

export function loadSalesBySku(): Promise<SalesBySkuPayload> {
  if (_cacheSku) return _cacheSku;
  _cacheSku = fetch('/data/sales-by-sku.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar sales por SKU: HTTP ${r.status}`);
      return r.json();
    })
    .catch((e) => {
      _cacheSku = null;
      throw e;
    });
  return _cacheSku;
}

/** Reviews Stamped — snapshot opcional. Se ausente, retorna null (aba Clientes fica vazia). */
export function loadStamped(): Promise<StampedPayload | null> {
  if (_cacheStamped) return _cacheStamped;
  _cacheStamped = fetch('/data/stamped.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return _cacheStamped;
}

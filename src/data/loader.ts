import type { ProcessedData, SalesBySkuPayload, StampedPayload } from './types';

declare global {
  interface Window {
    __GOCASE_PROCESSED__?: ProcessedData;
    __GOCASE_SKU__?: SalesBySkuPayload;
    __GOCASE_STAMPED__?: StampedPayload | null;
  }
}

let _cacheMain: Promise<ProcessedData> | null = null;
let _cacheSku: Promise<SalesBySkuPayload> | null = null;
let _cacheStamped: Promise<StampedPayload | null> | null = null;

export function loadProcessedData(): Promise<ProcessedData> {
  if (_cacheMain) return _cacheMain;
  if (window.__GOCASE_PROCESSED__) return (_cacheMain = Promise.resolve(window.__GOCASE_PROCESSED__));
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
  if (window.__GOCASE_SKU__) return (_cacheSku = Promise.resolve(window.__GOCASE_SKU__));
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
  if ('__GOCASE_STAMPED__' in window) return (_cacheStamped = Promise.resolve(window.__GOCASE_STAMPED__ ?? null));
  _cacheStamped = fetch('/data/stamped.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return _cacheStamped;
}

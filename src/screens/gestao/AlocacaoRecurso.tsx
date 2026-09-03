// Gestão › Alocação de Recurso — cruza o organograma do time de Produto
// (estático, ver data/team.ts) com:
//  - Projetos de IA/RPA e OKRs 26.2 em andamento (board 04 - Project
//    Portfolio Management, grupos "Projetos de IA/Tech" e "OKRs 26.2")
//  - Lançamentos ainda não lançados dos boards ⭐️ Launches 2026 e 2027
// para mostrar quantas frentes ativas cada pessoa/squad está tocando agora.
//
// Organizado em 3 abas — Alocação por pessoa, Lançamentos, Projetos IA/OKR —
// com métricas no mesmo espírito do relatório de alocação de recursos (base
// 30/07/2026): índice de carga ponderado por dificuldade, distribuição de
// status dos lançamentos e dificuldade como preditor de atraso, calculados
// ao vivo a partir do Monday (não são os números estáticos do relatório).

import { useEffect, useState } from 'react';
import { Card } from '../../components/Card';
import { KPICard } from '../../components/KPICard';
import { MultiSelect } from '../../components/MultiSelect';
import { TokenPrompt } from '../../components/TokenPrompt';
import {
  MONDAY, getMondayToken, fetchPortfolio, fetchLaunchAllocation, isPendingLaunch, parseGroupMonth, MONTH_PT,
  categoriaDoLancamento, stripCategoryTag, SEM_CATEGORIA,
  type MondayItem, type LaunchAllocItem,
} from '../../data/monday';
import { TEAM, matchTeamKey, teamMemberByKey, hasLeftTeam, type TeamMember } from '../../data/team';
import { fetchSheetLancamentos, buildSheetIndex, matchSheetRow, type SheetLancRow, type SheetIndex } from '../../data/sheetsLancamentos';

const FOCUS_GROUPS = ['OKRs 26.2', 'Projetos de IA/Tech'];

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; projects: MondayItem[]; pending2026: LaunchAllocItem[]; pending2027: LaunchAllocItem[]; sheetRows: SheetLancRow[]; updatedAt: string };

interface AllocRow {
  key: string; name: string; role: string; squad: string; manager: string | null;
  okr: number; ia: number; lanc2026: number; lanc2027: number; total: number;
}

type MainTab = 'alocacao' | 'lancamentos' | 'categorias' | 'projetos';

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const splitNames = (text: string) => (text || '').split(',').map((s) => s.trim()).filter(Boolean);
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

// Atrasos conhecidos informados manualmente ("de"/"para" — o Monday não
// guarda histórico de mudança de grupo/mês via API, então não dá pra saber
// pelo board quando um lançamento "deveria" ter saído nem pra onde foi
// reagendado; group só mostra o mês vigente, que às vezes nem chega a ser
// atualizado quando o atraso é só previsto internamente). A partir daqui,
// "Meses de atraso" e a perda em R$ do card "Impacto de atrasos" são
// calculados automaticamente (ver paraEfetivo/delayInfoDoLancamento e
// DELAY_EVENTS mais abaixo) — não precisa mais digitar os dois à mão.
// Lançamento fora dessa lista mostra "—" em "Data inicial"/"Meses de atraso".
interface CalendarDelay { name: string; de: string; para: string; prefix?: boolean }
const CALENDAR_DELAYS: CalendarDelay[] = [
  { name: 'Copo Flow (Vibe Facelift)', de: 'Junho', para: 'Outubro' },
  // prefix: true casa qualquer variante do produto (ex.: "Copo Moove 420ml (Café)").
  { name: 'Copo Moove', de: 'Junho', para: 'Outubro', prefix: true },
  { name: 'Go Clip - Novas Cores', de: 'Setembro', para: 'Janeiro' },
  { name: 'Garrafa Fun Tricolor + Alça', de: 'Outubro', para: 'Novembro' },
  { name: 'Food Jar', de: 'Outubro', para: 'Dezembro', prefix: true },
  { name: 'Copo Life - Tampa PP', de: 'Março/2027', para: 'Maio/2027' },
  { name: 'Garrafa Pro - Facelift', de: 'Abril/2027', para: 'Junho/2027' },
  { name: 'Garrafa Magsafe - Facelift', de: 'Abril/2027', para: 'Julho/2027' },
  { name: 'Garrafa GoClip', de: 'Setembro', para: 'Janeiro' },
  { name: 'Marmita Fun', de: 'Outubro', para: 'Novembro' },
  { name: 'Tampa Copo Flow - Feminina', de: 'Janeiro/2027', para: 'Maio/2027' },
];
function findCalendarDelay(name: string): CalendarDelay | undefined {
  const n = norm(name);
  return CALENDAR_DELAYS.find((e) => (e.prefix ? n.startsWith(norm(e.name)) : n === norm(e.name)));
}
function dataInicialDoLancamento(name: string): string {
  return findCalendarDelay(name)?.de || '—';
}

// ── Aritmética de mês (ano, mês 0-based) — atraso e perda estimada ────────
interface YM { year: number; month: number }
const ymKey = (ym: YM) => ym.year * 12 + ym.month;
const ymCompare = (a: YM, b: YM) => ymKey(a) - ymKey(b);
const ymAdd = (ym: YM, delta: number): YM => {
  const total = ymKey(ym) + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
};
const ymDiff = (a: YM, b: YM) => ymKey(b) - ymKey(a);
const ymLabel = (ym: YM) => `${MONTH_PT[ym.month]}/${ym.year}`;

/** Interpreta "Junho" ou "Março/2027" (formato do CALENDAR_DELAYS) num
 *  {year,month} — sem ano explícito, assume o ano do próprio board (2026/2027)
 *  do lançamento. */
function parseDelayMonth(text: string, fallbackYear: number): YM | null {
  const parsed = parseGroupMonth(text.replace('/', ' '));
  if (!parsed) return null;
  return { year: parsed.year ?? fallbackYear, month: parsed.month };
}

const HOJE = new Date();
const HOJE_YM: YM = { year: HOJE.getFullYear(), month: HOJE.getMonth() };
/** Regra do dia 15: se o mês gravado em "para" já virou, ou já passou do dia
 *  15 dele, considera que esse mês também já era perdido e empurra o atraso
 *  pro mês seguinte — sem esperar alguém atualizar o CALENDAR_DELAYS nem
 *  depender do Monday ter mudado o group. */
function paraEfetivo(paraYM: YM): YM {
  const cmp = ymCompare(paraYM, HOJE_YM);
  const jaPassou = cmp < 0 || (cmp === 0 && HOJE.getDate() > 15);
  return jaPassou ? ymAdd(paraYM, 1) : paraYM;
}

interface DelayInfo { de: YM; para: YM; paraEfetivo: YM; mesesAtraso: number }
function delayInfoDoLancamento(name: string, fallbackYear: number): DelayInfo | null {
  const entry = findCalendarDelay(name);
  if (!entry) return null;
  const de = parseDelayMonth(entry.de, fallbackYear);
  const para = parseDelayMonth(entry.para, fallbackYear);
  if (!de || !para) return null;
  const efetivo = paraEfetivo(para);
  return { de, para, paraEfetivo: efetivo, mesesAtraso: Math.max(0, ymDiff(de, efetivo)) };
}
function mesesAtrasoDoLancamento(name: string, fallbackYear: number): string {
  const info = delayInfoDoLancamento(name, fallbackYear);
  return info ? String(info.mesesAtraso) : '—';
}

// Cores fixas pras categorias mais comuns (o texto exato varia um pouco entre
// os boards 2026/2027 — ex. "Mala de bordo" vs "Malas" — por isso o match é
// por substring). Categorias fora dessa lista (Kit, Embalagem, Óculos, etc.)
// caem no hash abaixo, pra sempre terem uma cor estável sem precisar mapear tudo.
const CATEGORY_COLOR_RULES: [RegExp, string][] = [
  [/texti/, '#c2410c'], [/mala/, '#7c3aed'], [/termic/, '#0891b2'], [/tech/, '#2563eb'],
  [/mimo/, '#db2777'], [/acessorio/, '#ca8a04'], [/^pet$/, '#16a34a'],
];
const CATEGORY_FALLBACK_PALETTE = ['#0e7490', '#b45309', '#4d7c0f', '#be123c', '#0369a1', '#a21caf', '#166534', '#9333ea'];
function categoryColor(categoria: string): string {
  if (categoria === SEM_CATEGORIA) return '#64748b';
  const n = norm(categoria);
  const rule = CATEGORY_COLOR_RULES.find(([re]) => re.test(n));
  if (rule) return rule[1];
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  return CATEGORY_FALLBACK_PALETTE[hash % CATEGORY_FALLBACK_PALETTE.length];
}
function CategoriaBadge({ categoria }: { categoria: string }) {
  const color = categoryColor(categoria);
  return <span className="ar-cat" style={{ color, background: `${color}1a`, borderColor: `${color}55` }}>{categoria}</span>;
}

function riscoBadge(risco: string | null): { cls: string; label: string } | null {
  if (!risco || risco === '—') return null;
  const r = norm(risco);
  if (r.includes('atrasad')) return { cls: 'ar-risco-red', label: '🔴 ' + risco };
  if (r.includes('com risco')) return { cls: 'ar-risco-amber', label: '⚠ ' + risco };
  if (r.includes('finaliz') || r.includes('conclu')) return { cls: 'ar-risco-muted', label: risco };
  if (r.includes('prazo')) return { cls: 'ar-risco-green', label: '✅ ' + risco };
  return { cls: 'ar-risco-muted', label: risco };
}

function priorityBadge(raw: string | null): { cls: string; label: string } | null {
  if (!raw || raw === '—') return null;
  const p = norm(raw);
  if (p === 'p1') return { cls: 'ar-prio--p1', label: raw };
  if (p === 'p2') return { cls: 'ar-prio--p2', label: raw };
  if (p === 'p3') return { cls: 'ar-prio--p3', label: raw };
  if (p === 'okr') return { cls: 'ar-prio--okr', label: raw };
  return { cls: 'ar-prio--outra', label: raw };
}

// ── Dificuldade (peso) e saúde do lançamento ──────────────────────────────
type Dif = 'Crítico' | 'Alto' | 'Médio' | 'Baixo';
type DifKey = Dif | 'sem';
const DIF_ORDER: Dif[] = ['Crítico', 'Alto', 'Médio', 'Baixo'];
const DIF_WEIGHT: Record<Dif, number> = { Crítico: 4, Alto: 3, Médio: 2, Baixo: 1 };
const DIF_CLASS: Record<DifKey, string> = { Crítico: 'ar-dif--critico', Alto: 'ar-dif--alto', Médio: 'ar-dif--medio', Baixo: 'ar-dif--baixo', sem: 'ar-dif--sem' };

function normDif(raw: string | null): Dif | null {
  const n = norm(raw || '');
  if (!n) return null;
  if (n.includes('critic')) return 'Crítico';
  if (n.includes('alto')) return 'Alto';
  if (n.includes('medio')) return 'Médio';
  if (n.includes('baixo')) return 'Baixo';
  return null;
}

type Health = 'delayed' | 'atrisk' | 'attention' | 'ontrack' | 'other' | 'none';
const HEALTH_ORDER: Health[] = ['delayed', 'atrisk', 'attention', 'ontrack', 'other', 'none'];
const HEALTH_LABEL: Record<Health, string> = {
  delayed: 'Delayed', atrisk: 'At risk', attention: 'Attention', ontrack: 'On track', other: 'Não iniciado', none: 'Sem status',
};
const HEALTH_CLASS: Record<Health, string> = {
  delayed: 'ar-pill--delayed', atrisk: 'ar-pill--atrisk', attention: 'ar-pill--attention', ontrack: 'ar-pill--ontrack', other: 'ar-pill--other', none: 'ar-pill--none',
};
const OUT_OF_HEALTH: Health[] = ['delayed', 'atrisk', 'attention'];

function healthOf(raw: string | null): Health {
  const n = norm(raw || '');
  if (!n) return 'none';
  if (n.includes('delay')) return 'delayed';
  if (n.includes('risk')) return 'atrisk';
  if (n.includes('attention')) return 'attention';
  if (n.includes('track') || n.includes('ahead')) return 'ontrack';
  return 'other';
}

interface OwnerLoad { key: string; name: string; itens: number; dif: Record<DifKey, number>; points: number; }
interface MonthBucket { label: string; order: number; total: number; outHealth: number; altosCrit: number; }
interface YearMetrics {
  total: number;
  healthCounts: Record<Health, number>;
  difCounts: Record<DifKey, { total: number; outHealth: number }>;
  byMonth: MonthBucket[];
  byOwner: OwnerLoad[];
}

const emptyDifCounts = (): Record<DifKey, { total: number; outHealth: number }> => ({
  Crítico: { total: 0, outHealth: 0 }, Alto: { total: 0, outHealth: 0 }, Médio: { total: 0, outHealth: 0 }, Baixo: { total: 0, outHealth: 0 }, sem: { total: 0, outHealth: 0 },
});
const emptyDifMap = (): Record<DifKey, number> => ({ Crítico: 0, Alto: 0, Médio: 0, Baixo: 0, sem: 0 });

function buildYearMetrics(items: LaunchAllocItem[]): YearMetrics {
  const healthCounts: Record<Health, number> = { delayed: 0, atrisk: 0, attention: 0, ontrack: 0, other: 0, none: 0 };
  const difCounts = emptyDifCounts();
  const monthMap = new Map<string, MonthBucket>();
  const ownerMap = new Map<string, OwnerLoad>();

  items.forEach((it) => {
    const h = healthOf(it.launchStatus);
    healthCounts[h] += 1;
    const out = OUT_OF_HEALTH.includes(h);
    const d: DifKey = normDif(it.dificuldade) || 'sem';
    difCounts[d].total += 1;
    if (out) difCounts[d].outHealth += 1;

    const gm = parseGroupMonth(it.group);
    let mEntry = monthMap.get(it.group);
    if (!mEntry) {
      mEntry = { label: it.group, order: gm ? (gm.year || 0) * 12 + gm.month : -1, total: 0, outHealth: 0, altosCrit: 0 };
      monthMap.set(it.group, mEntry);
    }
    mEntry.total += 1;
    if (out) mEntry.outHealth += 1;
    if (d === 'Alto' || d === 'Crítico') mEntry.altosCrit += 1;

    it.people.forEach((rawName) => {
      if (hasLeftTeam(rawName)) return;
      const key = matchTeamKey(rawName) || `unmapped:${norm(rawName)}`;
      let row = ownerMap.get(key);
      if (!row) {
        const member = teamMemberByKey(key);
        row = { key, name: member?.name || rawName, itens: 0, dif: emptyDifMap(), points: 0 };
        ownerMap.set(key, row);
      }
      row.itens += 1;
      row.dif[d] += 1;
      row.points += d === 'sem' ? 0 : DIF_WEIGHT[d];
    });
  });

  const byMonth = [...monthMap.values()].sort((a, b) => a.order - b.order);
  const byOwner = [...ownerMap.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'pt-BR'));
  return { total: items.length, healthCounts, difCounts, byMonth, byOwner };
}

interface ConsolidatedLoad { key: string; name: string; itens: number; critAlto: number; points: number; index: number; }

function mergeOwnerLoads(a: OwnerLoad[], b: OwnerLoad[]): ConsolidatedLoad[] {
  const map = new Map<string, { key: string; name: string; itens: number; critAlto: number; points: number }>();
  [...a, ...b].forEach((row) => {
    let m = map.get(row.key);
    if (!m) { m = { key: row.key, name: row.name, itens: 0, critAlto: 0, points: 0 }; map.set(row.key, m); }
    m.itens += row.itens;
    m.critAlto += row.dif.Crítico + row.dif.Alto;
    m.points += row.points;
  });
  const list = [...map.values()].sort((x, y) => y.points - x.points || x.name.localeCompare(y.name, 'pt-BR'));
  const positivePoints = list.filter((r) => r.points > 0).map((r) => r.points);
  const base = positivePoints.length ? Math.min(...positivePoints) : 1;
  return list.map((r) => ({ ...r, index: r.points / base }));
}

interface OwnerCount { name: string; count: number; }
function countByOwner(list: MondayItem[]): OwnerCount[] {
  const map = new Map<string, number>();
  list.forEach((p) => {
    const personText = p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.owner)?.text || '';
    splitNames(personText).forEach((n) => map.set(n, (map.get(n) || 0) + 1));
  });
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

function DifBadge({ level }: { level: DifKey }) {
  const label = level === 'sem' ? 'Sem nível' : level;
  return <span className={`ar-dif ${DIF_CLASS[level]}`}>{label}</span>;
}

function Bar({ label, value, max, tip, crit, onClick, color, unit, active, valueLabel, valueWidth = 52 }: {
  label: string; value: number; max: number; tip?: string; crit?: boolean; onClick?: () => void; color?: string; unit?: string; active?: boolean; valueLabel?: string; valueWidth?: number;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`ar-bar ${onClick ? 'ar-bar--click' : ''} ${active ? 'ar-bar--active' : ''}`}
      style={{ gridTemplateColumns: `132px 1fr ${valueWidth}px` }}
      title={tip}
      onClick={onClick}
    >
      <span className="ar-bar__label">{label}</span>
      <div className="ar-bar__track">
        <div
          className={`ar-bar__fill ${!color && crit ? 'ar-bar__fill--crit' : ''}`}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
        />
      </div>
      <span className="ar-bar__value">{valueLabel ?? (Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',') + '×')}{unit}</span>
    </div>
  );
}

interface DifSeg { health: Health; count: number; items: LaunchAllocItem[] }

/** Segmento de uma barra empilhada por status — sempre com o rótulo de dado
 *  (contagem) visível, além do hover/click pra ver os lançamentos daquela fatia. */
function StackSeg({ health, count, pct, items, onClick }: { health: Health; count: number; pct: number; items: LaunchAllocItem[]; onClick: () => void }) {
  const lightBg = health === 'other' || health === 'none';
  return (
    <span
      className="ar-clickseg ar-seg"
      style={{ width: `${pct}%`, background: healthColorVar(health) }}
      title={`${HEALTH_LABEL[health]} — ${count} (${pct}%)\n${namesList(items)}`}
      onClick={onClick}
    >
      <em style={{ color: lightBg ? 'var(--text)' : '#fff' }}>{count}</em>
    </span>
  );
}

/** Barra empilhada com um segmento por status real (Delayed/At risk/On track/…),
 *  cada segmento clicável/com hover mostrando os lançamentos daquela combinação.
 *  Reaproveitada tanto por nível de dificuldade quanto por mês. */
function StackRow({
  label, segments, total, right, onSegmentClick, labelWidth = 132, wrapLabel = false,
}: {
  label: string; segments: DifSeg[]; total: number; right: string;
  onSegmentClick: (health: Health, items: LaunchAllocItem[]) => void;
  labelWidth?: number; wrapLabel?: boolean;
}) {
  return (
    <div className="ar-bar" style={{ gridTemplateColumns: `${labelWidth}px 1fr auto` }}>
      <span
        className="ar-bar__label"
        title={wrapLabel ? label : undefined}
        style={wrapLabel ? { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.3 } : undefined}
      >
        {label}
      </span>
      <div className="ar-stack ar-stack--rate">
        {segments.map((s) => {
          const pct = Math.round((s.count / total) * 100);
          return <StackSeg key={s.health} health={s.health} count={s.count} pct={pct} items={s.items} onClick={() => onSegmentClick(s.health, s.items)} />;
        })}
      </div>
      <span className="ar-bar__value">{right}</span>
    </div>
  );
}

/** Lista de nomes para tooltip nativo (título) — trunca pra não virar um bloco gigante. */
function namesList(items: LaunchAllocItem[], limit = 12): string {
  if (items.length === 0) return 'Nenhum lançamento.';
  const names = items.map((it) => `· ${it.name}`);
  if (names.length <= limit) return names.join('\n');
  return names.slice(0, limit).join('\n') + `\n… +${names.length - limit} mais (clique para ver a lista completa)`;
}

function healthColorVar(h: Health): string {
  if (h === 'delayed') return 'var(--red)';
  if (h === 'atrisk') return 'var(--amber)';
  if (h === 'attention') return 'var(--ar-attention)';
  if (h === 'ontrack') return 'var(--green)';
  if (h === 'other') return 'var(--border-2)';
  return 'var(--text-3)';
}

function semNivelOf(dif: Record<DifKey, number>, itens: number): number {
  return Math.max(0, itens - (dif.Crítico + dif.Alto + dif.Médio + dif.Baixo));
}

function Stack({ dif, itens }: { dif: Record<DifKey, number>; itens: number }) {
  const semNivel = semNivelOf(dif, itens);
  const parts: { key: string; n: number; color: string }[] = [
    { key: 'Crítico', n: dif.Crítico, color: '#3f37a3' },
    { key: 'Alto', n: dif.Alto, color: '#6f66d6' },
    { key: 'Médio', n: dif.Médio, color: '#c2bff5' },
    { key: 'Baixo', n: dif.Baixo, color: '#e6e5fb' },
    { key: 'Sem nível', n: semNivel, color: 'var(--border-2)' },
  ].filter((p) => p.n > 0);
  return (
    <div className="ar-stackwrap">
      <div className="ar-stack" style={{ width: 130, height: 10 }}>
        {parts.map((p) => <span key={p.key} style={{ width: `${(p.n / (itens || 1)) * 100}%`, background: p.color }} title={`${p.key}: ${p.n} de ${itens}`} />)}
      </div>
    </div>
  );
}

export function AlocacaoRecurso() {
  const [state, setState] = useState<State>(() => (getMondayToken() ? { kind: 'loading' } : { kind: 'no-token' }));
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<MainTab>('alocacao');
  const [lancYear, setLancYear] = useState<'2026' | '2027'>('2026');
  const [sortBy, setSortBy] = useState<'total' | 'nome'>('total');
  const [modal, setModal] = useState<{ title: string; accent: string; items: LaunchAllocItem[] } | null>(null);
  const [delayDetail, setDelayDetail] = useState<{ name: string; mesOriginal: string; mesNovo: string; splitNota?: string; meses: { label: string; qty: number; receita: number }[]; total: number } | null>(null);
  const [allocSearch, setAllocSearch] = useState('');
  const [allocSquads, setAllocSquads] = useState<string[]>([]);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [lancPersonFilter, setLancPersonFilter] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string[]>([]);
  const [catYear, setCatYear] = useState<'todos' | '2026' | '2027'>('todos');
  const [catPersonFilter, setCatPersonFilter] = useState<string[]>([]);
  const [catStatusFilter, setCatStatusFilter] = useState<Health | null>(null);
  const [catNameFilter, setCatNameFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const token = getMondayToken();
        const [projects, launches2026, launches2027, sheetRows] = await Promise.all([
          fetchPortfolio(token),
          fetchLaunchAllocation(token, MONDAY.boards.lancamentos2026, MONDAY.columns.launches2026),
          fetchLaunchAllocation(token, MONDAY.boards.lancamentos2027, MONDAY.columns.launches2027),
          // Planilha de receita é best-effort — se falhar (ex.: fora do ar), a
          // aba Categorias ainda funciona, só sem os números de receita.
          fetchSheetLancamentos().catch(() => [] as SheetLancRow[]),
        ]);
        if (cancelled) return;
        setState({
          kind: 'ready',
          projects,
          pending2026: launches2026.filter(isPendingLaunch),
          pending2027: launches2027.filter(isPendingLaunch),
          sheetRows,
          updatedAt: new Date().toLocaleString('pt-BR'),
        });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (state.kind === 'no-token') return <TokenPrompt tab="Alocação de Recurso" onSaved={() => setReloadKey((k) => k + 1)} />;
  if (state.kind === 'loading') {
    return <div className="g-status"><span className="spinner" /> Carregando alocação do time (Monday)…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="g-status g-status--err">
        ⚠ Erro ao carregar: {state.message}
        <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button>
      </div>
    );
  }

  const { projects, pending2026, pending2027, sheetRows, updatedAt } = state;

  const focusProjects = projects.filter((p) => FOCUS_GROUPS.includes(p.group?.title || ''));
  const iaProjects = focusProjects.filter((p) => (p.group?.title || '') === 'Projetos de IA/Tech');
  const okrProjects = focusProjects.filter((p) => (p.group?.title || '') === 'OKRs 26.2');

  // ── Alocação por pessoa (contagem simples, já existia) ─────────────────
  const allocMap = new Map<string, AllocRow>();
  const getRow = (key: string, fallbackName: string): AllocRow => {
    let row = allocMap.get(key);
    if (!row) {
      const member = teamMemberByKey(key);
      row = {
        key,
        name: member?.name || fallbackName,
        role: member?.role || '—',
        squad: member?.squad || 'Não mapeado',
        manager: member?.manager || null,
        okr: 0, ia: 0, lanc2026: 0, lanc2027: 0, total: 0,
      };
      allocMap.set(key, row);
    }
    return row;
  };
  const bump = (rawName: string, field: 'okr' | 'ia' | 'lanc2026' | 'lanc2027') => {
    if (hasLeftTeam(rawName)) return;
    const key = matchTeamKey(rawName) || `unmapped:${norm(rawName)}`;
    const row = getRow(key, rawName);
    row[field] += 1;
    row.total += 1;
  };

  focusProjects.forEach((p) => {
    const field = (p.group?.title || '') === 'OKRs 26.2' ? 'okr' : 'ia';
    const personText = p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.owner)?.text || '';
    splitNames(personText).forEach((n) => bump(n, field));
  });
  pending2026.forEach((it) => it.people.forEach((n) => bump(n, 'lanc2026')));
  pending2027.forEach((it) => it.people.forEach((n) => bump(n, 'lanc2027')));

  // Garante que todo mundo do organograma aparece na tabela, mesmo com 0 alocações.
  TEAM.forEach((m) => getRow(m.key, m.name));

  const allocRows = [...allocMap.values()].sort((a, b) => (
    sortBy === 'total' ? (b.total - a.total || a.name.localeCompare(b.name, 'pt-BR')) : a.name.localeCompare(b.name, 'pt-BR')
  ));

  const pessoasAtivas = allocRows.filter((r) => !r.key.startsWith('unmapped:') && r.total > 0).length;

  // ── Estrutura do time (organograma simplificado) ──────────────────────
  const rollup = (key: string): number => {
    const own = allocMap.get(key)?.total || 0;
    const children = TEAM.filter((m) => m.manager === key);
    return own + children.reduce((s, c) => s + rollup(c.key), 0);
  };

  const topLevel = TEAM.filter((m) => m.manager === null);

  interface OrgRow { row: AllocRow; depth: number }
  interface OrgGroup { label: string; rows: OrgRow[] }

  const childrenOf = (managerKey: string | null) => TEAM
    .filter((m) => m.manager === managerKey)
    .sort((a, b) => (sortBy === 'total'
      ? (rollup(b.key) - rollup(a.key) || a.name.localeCompare(b.name, 'pt-BR'))
      : a.name.localeCompare(b.name, 'pt-BR')));

  function collectSubtree(memberKey: string, depth: number, acc: OrgRow[]) {
    const row = allocMap.get(memberKey);
    if (row) acc.push({ row, depth });
    childrenOf(memberKey).forEach((c) => collectSubtree(c.key, depth + 1, acc));
  }

  const rootsBySquad = new Map<string, TeamMember[]>();
  childrenOf(null).forEach((m) => {
    const list = rootsBySquad.get(m.squad) || [];
    list.push(m);
    rootsBySquad.set(m.squad, list);
  });

  const orgGroups: OrgGroup[] = [...rootsBySquad.entries()].map(([squad, roots]) => {
    const rows: OrgRow[] = [];
    roots.forEach((m) => collectSubtree(m.key, 0, rows));
    return { label: squad, rows };
  });

  const unmappedRows = allocRows.filter((r) => r.key.startsWith('unmapped:'));
  if (unmappedRows.length) {
    orgGroups.push({ label: 'Não mapeado', rows: unmappedRows.map((row) => ({ row, depth: 0 })) });
  }

  const groupTotal = (g: OrgGroup) => g.rows.reduce((s, r) => s + r.row.total, 0);
  orgGroups.sort((a, b) => {
    if (a.label === 'Não mapeado') return 1;
    if (b.label === 'Não mapeado') return -1;
    return groupTotal(b) - groupTotal(a) || a.label.localeCompare(b.label, 'pt-BR');
  });

  // ── Filtro dinâmico da tabela "Alocação por pessoa" (nome/papel + squad) ──
  const squadOptions = [...new Set(orgGroups.map((g) => g.label))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const allocSearchNorm = norm(allocSearch);
  const filteredOrgGroups = orgGroups
    .map((g) => ({
      ...g,
      rows: g.rows.filter(({ row }) => {
        if (allocSquads.length > 0 && !allocSquads.includes(g.label)) return false;
        if (!allocSearchNorm) return true;
        return norm(row.name).includes(allocSearchNorm) || norm(row.role).includes(allocSearchNorm);
      }),
    }))
    .filter((g) => g.rows.length > 0);

  function TeamNode({ member, depth }: { member: TeamMember; depth: number }) {
    const children = TEAM.filter((m) => m.manager === member.key);
    const own = allocMap.get(member.key)?.total || 0;
    const total = rollup(member.key);
    return (
      <div className="ar-tree__node" style={{ marginLeft: depth * 22 }}>
        <div className="ar-tree__row">
          <span className="ar-tree__name">{member.name}</span>
          <span className="ar-tree__role">{member.role}</span>
          <span className="ar-tree__squad">{member.squad}</span>
          <span className="ar-tree__badge" title={children.length ? `${own} própria(s) + ${total - own} do time` : undefined}>
            {total}
          </span>
        </div>
        {children.map((c) => <TeamNode key={c.key} member={c} depth={depth + 1} />)}
      </div>
    );
  }

  // ── Métricas ponderadas por dificuldade (lançamentos) ──────────────────
  const metrics2026 = buildYearMetrics(pending2026);
  const metrics2027 = buildYearMetrics(pending2027);
  const consolidated = mergeOwnerLoads(metrics2026.byOwner, metrics2027.byOwner);
  const consolidatedMaxIndex = Math.max(1, ...consolidated.map((r) => r.index));

  // Filtro dinâmico por pessoa (clique numa barra do Índice de carga filtra
  // Status, Dificuldade × saúde, Visão por mês, Carga por dono e a lista de
  // lançamentos pendentes — todos derivam de `pendingList`/`lancMetrics`).
  const toggleLancPersonFilter = (key: string) => setLancPersonFilter((cur) => (cur === key ? null : key));
  const matchesLancPersonFilter = (it: LaunchAllocItem) => {
    if (!lancPersonFilter) return true;
    return it.people.some((rawName) => {
      if (hasLeftTeam(rawName)) return false;
      const key = matchTeamKey(rawName) || `unmapped:${norm(rawName)}`;
      return key === lancPersonFilter;
    });
  };
  const lancPersonName = consolidated.find((r) => r.key === lancPersonFilter)?.name || lancPersonFilter;

  const lancMetricsRaw = lancYear === '2026' ? metrics2026 : metrics2027;
  const pendingListRaw = lancYear === '2026' ? pending2026 : pending2027;
  const pendingList = pendingListRaw.filter(matchesLancPersonFilter);
  const lancMetrics = lancPersonFilter ? buildYearMetrics(pendingList) : lancMetricsRaw;
  const pendingSorted = [...pendingList].sort((a, b) => a.group.localeCompare(b.group, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const difRateRows = DIF_ORDER
    .map((d) => ({ level: d, ...lancMetrics.difCounts[d] }))
    .filter((r) => r.total > 0)
    .sort((a, b) => (b.outHealth / b.total) - (a.outHealth / a.total));
  const semNivelCount = lancMetrics.difCounts.sem.total;

  const iaOwnerCounts = countByOwner(iaProjects);
  const okrOwnerCounts = countByOwner(okrProjects);
  const iaMax = Math.max(1, ...iaOwnerCounts.map((r) => r.count));
  const okrMax = Math.max(1, ...okrOwnerCounts.map((r) => r.count));

  // ── Filtro dinâmico por pessoa (clique numa barra filtra as duas tabelas) ──
  const togglePersonFilter = (name: string) => setPersonFilter((cur) => (cur === name ? null : name));
  const ownerOf = (p: MondayItem) => p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.owner)?.text || '';
  const matchesPersonFilter = (p: MondayItem) => !personFilter || splitNames(ownerOf(p)).includes(personFilter);
  const iaProjectsFiltered = iaProjects.filter(matchesPersonFilter);
  const okrProjectsFiltered = okrProjects.filter(matchesPersonFilter);

  // ── Categorias (têxtil/mala/térmicos/…) × status × receita ─────────────
  // Categoria vem da coluna "Tipo" do próprio board de Lançamentos (com
  // fallback pra tag no nome do item, ex. "[TÉRMICO]", quando "Tipo" tá vazio).
  // Receita: o board 2027 tem coluna "Receita" nativa; o 2026 não tem, então
  // usa a planilha de Projeções, casada pelo nome do lançamento.
  const sheetIndex = buildSheetIndex(sheetRows);
  interface CatRow { key: string; name: string; categoria: string; health: Health; statusRaw: string | null; receita: number; hasReceita: boolean; group: string; mesAno: string; dataInicial: string; mesesAtraso: string; year: '2026' | '2027'; people: string[] }
  const peopleOf = (rawNames: string[]): string[] => {
    const names = new Set<string>();
    rawNames.forEach((rawName) => {
      if (hasLeftTeam(rawName)) return;
      const key = matchTeamKey(rawName);
      names.add(key ? teamMemberByKey(key)?.name || rawName : rawName);
    });
    return [...names];
  };
  const buildCatRows = (items: LaunchAllocItem[], year: '2026' | '2027'): CatRow[] => items.map((it) => {
    const categoria = it.categoria?.trim() || categoriaDoLancamento(it.name);
    const people = peopleOf(it.people);
    const name = stripCategoryTag(it.name);
    const mesAno = parseGroupMonth(it.group)?.label || it.group;
    const dataInicial = dataInicialDoLancamento(name);
    const mesesAtraso = mesesAtrasoDoLancamento(name, Number(year));
    if (it.receita != null) {
      return { key: `${year}:${it.id}`, name, categoria, health: healthOf(it.launchStatus), statusRaw: it.launchStatus, receita: it.receita, hasReceita: true, group: it.group, mesAno, dataInicial, mesesAtraso, year, people };
    }
    const sheetMatch = matchSheetRow(name, sheetIndex);
    return {
      key: `${year}:${it.id}`,
      name,
      categoria,
      health: healthOf(it.launchStatus),
      statusRaw: it.launchStatus,
      receita: sheetMatch?.receitaTotal || 0,
      hasReceita: !!sheetMatch,
      group: it.group,
      mesAno,
      dataInicial,
      mesesAtraso,
      year,
      people,
    };
  });
  const catRows: CatRow[] = [...buildCatRows(pending2026, '2026'), ...buildCatRows(pending2027, '2027')];

  const catOptions = [...new Set(catRows.map((r) => r.categoria))].sort((a, b) => {
    if (a === SEM_CATEGORIA) return 1;
    if (b === SEM_CATEGORIA) return -1;
    return a.localeCompare(b, 'pt-BR');
  });
  const catPersonOptions = [...new Set(catRows.flatMap((r) => r.people))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // Base = categoria/ano/responsável/lançamento, SEM o filtro de status — usada
  // pros cards "por status" (senão o clique num status faria o próprio gráfico
  // de status colapsar pra 1 barra só). Os demais cards usam catFilteredRows,
  // que já inclui o status — clicar num status filtra o resto da aba inteira.
  const catBaseRows = catRows.filter((r) => (
    (catFilter.length === 0 || catFilter.includes(r.categoria))
    && (catYear === 'todos' || r.year === catYear)
    && (catPersonFilter.length === 0 || r.people.some((p) => catPersonFilter.includes(p)))
    && (catNameFilter === null || r.name === catNameFilter)
  ));
  const catFilteredRows = catBaseRows.filter((r) => catStatusFilter === null || r.health === catStatusFilter);
  const toggleCatStatusFilter = (h: Health) => setCatStatusFilter((cur) => (cur === h ? null : h));
  const toggleCatNameFilter = (name: string) => setCatNameFilter((cur) => (cur === name ? null : name));

  const catHealthCounts: Record<Health, number> = { delayed: 0, atrisk: 0, attention: 0, ontrack: 0, other: 0, none: 0 };
  const catHealthRevenue: Record<Health, number> = { delayed: 0, atrisk: 0, attention: 0, ontrack: 0, other: 0, none: 0 };
  catBaseRows.forEach((r) => { catHealthCounts[r.health] += 1; catHealthRevenue[r.health] += r.receita; });
  const catBaseReceitaTotal = catBaseRows.reduce((s, r) => s + r.receita, 0);
  const catStatusOptions = HEALTH_ORDER.filter((h) => catHealthCounts[h] > 0).map((h) => HEALTH_LABEL[h]);
  const catStatusFilterLabel = catStatusFilter ? HEALTH_LABEL[catStatusFilter] : null;

  const catReceitaTotal = catFilteredRows.reduce((s, r) => s + r.receita, 0);
  const catSemReceita = catFilteredRows.filter((r) => !r.hasReceita).length;
  const catMaxReceita = Math.max(1, ...Object.values(catHealthRevenue));

  const catTableSorted = [...catFilteredRows].sort((a, b) => b.receita - a.receita || a.name.localeCompare(b.name, 'pt-BR'));

  // ── Lançamentos Delayed sem "de"/"para" no CALENDAR_DELAYS ──────────────
  // Sem uma entrada lá a gente não sabe o mês original, então nem "Meses de
  // atraso" nem "Impacto de atrasos" conseguem calcular nada pra eles.
  const delayedSemDataInicial = catBaseRows
    .filter((r) => r.health === 'delayed' && !findCalendarDelay(r.name))
    .sort((a, b) => a.mesAno.localeCompare(b.mesAno, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));

  // ── Impacto de atrasos (receita potencialmente perdida) ────────────────
  // Perda = soma da receita mensal (Qtd × Preço) que a planilha de Projeções
  // projeta pros meses entre "de" e "paraEfetivo" (CALENDAR_DELAYS + regra do
  // dia 15, ver acima) — lida automaticamente da curva mensal da aba
  // "Projeções (v4)" (SheetLancRow.receitaMensal). Só entram aqui lançamentos
  // com pelo menos 1 mês de receita preenchida nessa janela; a planilha às
  // vezes já reflete o plano NOVO (pós-atraso) e os meses perdidos aparecem
  // como "-"/0 em vez de guardar o que teria vendido — nesse caso não dá pra
  // estimar a perda e o item cai em `delayImpactExcluidos` abaixo.
  interface SheetAlias { sheetName: string; splitEntre: number }
  // Duas variantes do Monday que dividem UMA linha só na planilha (o nome de
  // lá junta as duas, ex. "Garrafa Pro/Magsafe - Facelift") — a receita
  // mensal dessa linha é dividida igualmente entre elas pra não contar a
  // mesma receita duas vezes. Único ponto que ainda precisa de mapa manual:
  // não dá pra inferir isso só pelo nome.
  const SHEET_NAME_ALIASES: Record<string, SheetAlias> = {
    [norm('Garrafa Pro - Facelift')]: { sheetName: 'Garrafa Pro/Magsafe - Facelift', splitEntre: 2 },
    [norm('Garrafa Magsafe - Facelift')]: { sheetName: 'Garrafa Pro/Magsafe - Facelift', splitEntre: 2 },
    [norm('Tampa Copo Flow - Feminina')]: { sheetName: 'Tampa Copo Flow', splitEntre: 2 },
    [norm('Tampa Copo Flow - Masculino')]: { sheetName: 'Tampa Copo Flow', splitEntre: 2 },
  };
  function findSheetRowForDelay(name: string, index: SheetIndex): { row: SheetLancRow; splitEntre: number } | null {
    const alias = SHEET_NAME_ALIASES[norm(name)];
    if (alias) {
      const row = index.byExact.get(norm(alias.sheetName));
      return row ? { row, splitEntre: alias.splitEntre } : null;
    }
    const exact = index.byExact.get(norm(name));
    if (exact) return { row: exact, splitEntre: 1 };
    // Fallback conservador: só casa se um nome for prefixo literal do outro
    // (ex. Monday "Copo Moove 420ml (Café)" × planilha "Copo Moove"). Não usa
    // o fallback por prefixo-até-o-hífen do matchSheetRow porque esse soma
    // TODAS as variantes com o mesmo prefixo — o que aqui misturaria receita
    // de lançamentos diferentes (ex. várias linhas "Copo Life - …").
    const n = norm(name);
    for (const row of index.byExact.values()) {
      const nRow = norm(row.lancamento);
      if (nRow.length > 3 && (n.startsWith(nRow) || nRow.startsWith(n))) return { row, splitEntre: 1 };
    }
    return null;
  }

  interface DelayMonthDetail { label: string; qty: number; receita: number }
  interface DelayImpactRow {
    name: string; year: '2026' | '2027'; mesOriginal: string; mesNovo: string; mesesAtraso: number;
    perdaEstimada: number; splitNota?: string; row: CatRow | undefined; meses: DelayMonthDetail[];
  }
  const delayImpactAll: DelayImpactRow[] = catRows
    .map((r): DelayImpactRow | null => {
      const info = delayInfoDoLancamento(r.name, Number(r.year));
      if (!info || info.mesesAtraso <= 0) return null;
      const match = findSheetRowForDelay(r.name, sheetIndex);
      if (!match) return null;
      const qtyByYm = new Map(match.row.quantidadeMensal.map((mv) => [ymKey(mv), mv.value]));
      const meses: DelayMonthDetail[] = [];
      let perda = 0;
      let mesesComDados = 0;
      match.row.receitaMensal.forEach((mv) => {
        const ym: YM = { year: mv.year, month: mv.month };
        if (ymCompare(ym, info.de) >= 0 && ymCompare(ym, info.paraEfetivo) < 0) {
          const receita = mv.value / match.splitEntre;
          const qty = (qtyByYm.get(ymKey(ym)) || 0) / match.splitEntre;
          meses.push({ label: ymLabel(ym), qty, receita });
          if (mv.value > 0) { perda += mv.value; mesesComDados += 1; }
        }
      });
      if (mesesComDados === 0) return null;
      // `meses` já sai em ordem cronológica — receitaMensal é lido na mesma
      // ordem das colunas do cabeçalho da planilha (crescente no tempo).
      return {
        name: r.name, year: r.year, mesOriginal: ymLabel(info.de), mesNovo: ymLabel(info.para), mesesAtraso: info.mesesAtraso,
        perdaEstimada: perda / match.splitEntre,
        splitNota: match.splitEntre > 1
          ? `Divide a linha "${match.row.lancamento}" da planilha de Projeções com outra variante do Monday — receita mensal (e quantidade) dividida igualmente entre elas.`
          : undefined,
        row: r,
        meses,
      };
    })
    .filter((e): e is DelayImpactRow => e !== null);
  // "row" só fica visível se o lançamento também passa nos filtros atuais da
  // aba (categoria/ano/responsável/status) — mesmo comportamento de antes.
  const delayImpact = delayImpactAll.map((e) => ({ ...e, row: catFilteredRows.includes(e.row!) ? e.row : undefined }));
  const delayImpactVisible = delayImpact.filter((e) => e.row);
  const delayTotal = delayImpactVisible.reduce((s, e) => s + e.perdaEstimada, 0);
  // Atrasos conhecidos (têm "de"/"para") mas sem curva mensal utilizável na
  // janela perdida — ficam de fora da tabela, listados na nota abaixo dela.
  const delayImpactExcluidos = catRows.filter((r) => {
    const info = delayInfoDoLancamento(r.name, Number(r.year));
    if (!info || info.mesesAtraso <= 0) return false;
    return !delayImpactAll.some((e) => e.name === r.name && e.year === r.year);
  });

  return (
    <div className="g-eng">
      <div className="g-eng__head">
        <h1 className="g-eng__title">Alocação de Recurso</h1>
        <div className="g-eng__meta">
          <span>Atualizado: {updatedAt}</span>
          <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
        </div>
      </div>

      <div className="g-eng__kpis">
        <KPICard label="Projetos IA/RPA + OKRs 26.2" value={focusProjects.length} icon="🤖" accent="blue" />
        <KPICard label="Lançamentos pendentes 2026" value={pending2026.length} icon="🚀" accent="yellow" />
        <KPICard label="Lançamentos pendentes 2027" value={pending2027.length} icon="🛫" accent="purple" />
        <KPICard label="Pessoas com alocação ativa" value={`${pessoasAtivas} / ${TEAM.length}`} icon="👥" accent="green" />
      </div>

      <div className="ar-tabs">
        <button className={`ar-tab ${tab === 'alocacao' ? 'ar-tab--on' : ''}`} onClick={() => setTab('alocacao')}>Alocação por pessoa</button>
        <button className={`ar-tab ${tab === 'lancamentos' ? 'ar-tab--on' : ''}`} onClick={() => setTab('lancamentos')}>Lançamentos</button>
        <button className={`ar-tab ${tab === 'categorias' ? 'ar-tab--on' : ''}`} onClick={() => setTab('categorias')}>Categorias</button>
        <button className={`ar-tab ${tab === 'projetos' ? 'ar-tab--on' : ''}`} onClick={() => setTab('projetos')}>Projetos IA/OKR</button>
      </div>

      {tab === 'alocacao' && (
        <>
          <Card
            title="Alocação por pessoa"
            subtitle="Projetos de IA/RPA + OKRs 26.2 e lançamentos ainda não lançados, por responsável"
            right={
              <div className="g-wl__period" style={{ marginBottom: 0 }}>
                <button className={`g-chip ${sortBy === 'total' ? 'g-chip--on' : ''}`} onClick={() => setSortBy('total')}>Por alocação</button>
                <button className={`g-chip ${sortBy === 'nome' ? 'g-chip--on' : ''}`} onClick={() => setSortBy('nome')}>Por nome</button>
              </div>
            }
          >
            <div className="ar-filterbar">
              <input
                className="ar-input ar-input--search"
                placeholder="Buscar por nome ou papel…"
                value={allocSearch}
                onChange={(e) => setAllocSearch(e.target.value)}
              />
              <div className="ar-filterbar__grp">
                <span className="ar-filterbar__lbl">Squad</span>
                <MultiSelect options={squadOptions} value={allocSquads} onChange={setAllocSquads} allLabel="Todas" placeholder="Selecionar squad" />
              </div>
            </div>
            <div className="g-tablewrap">
              <table className="g-table ar-alloc-table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Papel</th>
                    <th className="c">OKR 26.2</th>
                    <th className="c">Projetos IA</th>
                    <th className="c">Lanç. 2026</th>
                    <th className="c">Lanç. 2027</th>
                    <th className="c">Total</th>
                  </tr>
                </thead>
                {filteredOrgGroups.length === 0 && (
                  <tbody>
                    <tr><td colSpan={7} className="g-empty">Nenhuma pessoa encontrada com esse filtro.</td></tr>
                  </tbody>
                )}
                {filteredOrgGroups.map((g) => (
                  <tbody key={g.label}>
                    <tr className="ar-group-row">
                      <td colSpan={7}>
                        <span className="ar-group-row__label">{g.label}</span>
                        <span className="ar-group-row__count">
                          {g.rows.length} pessoa{g.rows.length !== 1 ? 's' : ''} · {g.rows.reduce((s, r) => s + r.row.total, 0)} total
                        </span>
                      </td>
                    </tr>
                    {g.rows.map(({ row: r, depth }) => (
                      <tr key={r.key}>
                        <td className="g-name">
                          <span className="g-name__text" style={{ paddingLeft: depth * 18 }}>
                            {depth > 0 && <span className="ar-alloc-indent">└</span>}
                            {r.name}
                          </span>
                        </td>
                        <td className="m">{r.role}</td>
                        <td className="c">{r.okr || '—'}</td>
                        <td className="c">{r.ia || '—'}</td>
                        <td className="c">{r.lanc2026 || '—'}</td>
                        <td className="c">{r.lanc2027 || '—'}</td>
                        <td className="c b">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Card>

          <Card title="Estrutura do time" subtitle="Organograma de Produto — número = total de projetos/lançamentos ativos (próprios + do time, quando houver squad)" className="ar-tree-card">
            <div className="ar-tree">
              {topLevel.map((m) => <TeamNode key={m.key} member={m} depth={0} />)}
            </div>
          </Card>
        </>
      )}

      {tab === 'lancamentos' && (
        <>
          <Card
            title="Índice de carga — lançamentos 2026 + 2027"
            subtitle="Pontuação ponderada por dificuldade (Baixo=1 · Médio=2 · Alto=3 · Crítico=4). O índice usa a menor carga ativa do time como base 1,0× · clique numa pessoa pra filtrar"
          >
            {consolidated.filter((r) => r.itens > 0).length === 0 ? (
              <div className="g-empty">Nenhum lançamento pendente com pessoa atribuída.</div>
            ) : (
              <div className="ar-barlist">
                {consolidated.filter((r) => r.itens > 0).map((r) => (
                  <Bar
                    key={r.key}
                    label={r.name}
                    value={r.index}
                    max={consolidatedMaxIndex}
                    crit={r.index >= consolidatedMaxIndex * 0.8}
                    tip={`${r.itens} itens · ${r.critAlto} Crítico+Alto · ${r.points} pontos`}
                    active={lancPersonFilter === r.key}
                    onClick={() => toggleLancPersonFilter(r.key)}
                  />
                ))}
              </div>
            )}
          </Card>

          {lancPersonFilter && (
            <div className="ar-personfilter">
              <span>Filtrando por <strong>{lancPersonName}</strong></span>
              <button className="ar-personfilter__clear" onClick={() => setLancPersonFilter(null)}>✕ Limpar filtro</button>
            </div>
          )}

          <div className="g-wl__period">
            <button className={`g-chip ${lancYear === '2026' ? 'g-chip--on' : ''}`} onClick={() => setLancYear('2026')}>2026 ({pending2026.length})</button>
            <button className={`g-chip ${lancYear === '2027' ? 'g-chip--on' : ''}`} onClick={() => setLancYear('2027')}>2027 ({pending2027.length})</button>
          </div>

          <div className="ar-grid2">
            <Card title={`Status — ${lancYear}`} subtitle="Distribuição dos lançamentos ainda não lançados">
              {lancMetrics.total === 0 ? <div className="g-empty">Nenhum lançamento pendente {lancPersonFilter ? `de ${lancPersonName} ` : ''}em {lancYear}.</div> : (
                <>
                  <div className="ar-stack ar-stack--rate" style={{ width: '100%', marginBottom: 12 }}>
                    {HEALTH_ORDER.filter((h) => lancMetrics.healthCounts[h] > 0).map((h) => {
                      const items = pendingList.filter((it) => healthOf(it.launchStatus) === h);
                      const pct = Math.round((lancMetrics.healthCounts[h] / lancMetrics.total) * 100);
                      return (
                        <StackSeg key={h} health={h} count={lancMetrics.healthCounts[h]} pct={pct} items={items} onClick={() => setModal({ title: `${HEALTH_LABEL[h]} — ${lancYear}`, accent: healthColorVar(h), items })} />
                      );
                    })}
                  </div>
                  <div className="g-tablewrap">
                    <table className="g-table">
                      <thead><tr><th>Status</th><th className="c">Itens</th><th className="c">%</th></tr></thead>
                      <tbody>
                        {HEALTH_ORDER.filter((h) => lancMetrics.healthCounts[h] > 0).map((h) => {
                          const items = pendingList.filter((it) => healthOf(it.launchStatus) === h);
                          const pct = Math.round((lancMetrics.healthCounts[h] / lancMetrics.total) * 100);
                          return (
                            <tr
                              key={h}
                              className="ar-clickrow"
                              title={namesList(items)}
                              onClick={() => setModal({ title: `${HEALTH_LABEL[h]} — ${lancYear}`, accent: healthColorVar(h), items })}
                            >
                              <td><span className={`ar-pill ${HEALTH_CLASS[h]}`}>{HEALTH_LABEL[h]}</span></td>
                              <td className="c b">{lancMetrics.healthCounts[h]}</td>
                              <td className="c">{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card title="Dificuldade × saúde" subtitle="% dos itens em Delayed / At risk / Attention, por nível">
              {difRateRows.length === 0 ? <div className="g-empty">Sem itens com nível de dificuldade preenchido.</div> : (
                <div className="ar-barlist">
                  {difRateRows.map((r) => {
                    const levelItems = pendingList.filter((it) => (normDif(it.dificuldade) || 'sem') === r.level);
                    const segments: DifSeg[] = HEALTH_ORDER
                      .map((h) => ({ health: h, items: levelItems.filter((it) => healthOf(it.launchStatus) === h) }))
                      .filter((s) => s.items.length > 0)
                      .map((s) => ({ ...s, count: s.items.length }));
                    const rate = Math.round((r.outHealth / r.total) * 100);
                    return (
                      <StackRow
                        key={r.level}
                        label={`${r.level} (${r.total})`}
                        segments={segments}
                        total={r.total}
                        right={`${rate}% fora`}
                        onSegmentClick={(h, items) => setModal({ title: `${r.level} · ${HEALTH_LABEL[h]} — ${lancYear}`, accent: healthColorVar(h), items })}
                      />
                    );
                  })}
                </div>
              )}
              <div className="ar-legend">
                {HEALTH_ORDER.filter((h) => lancMetrics.healthCounts[h] > 0).map((h) => (
                  <span key={h} className={`ar-pill ${HEALTH_CLASS[h]}`}>{HEALTH_LABEL[h]}</span>
                ))}
              </div>
              {semNivelCount > 0 && <p className="ar-note">+ {semNivelCount} item{semNivelCount !== 1 ? 's' : ''} sem nível de dificuldade preenchido.</p>}
            </Card>
          </div>

          <Card title={`Visão por mês — ${lancYear}`} subtitle="Itens pendentes por status, mês a mês">
            {lancMetrics.byMonth.length === 0 ? <div className="g-empty">Nenhum lançamento pendente {lancPersonFilter ? `de ${lancPersonName} ` : ''}em {lancYear}.</div> : (
              <div className="ar-barlist">
                {lancMetrics.byMonth.map((mb) => {
                  const monthItems = pendingList.filter((it) => it.group === mb.label);
                  const segments: DifSeg[] = HEALTH_ORDER
                    .map((h) => ({ health: h, items: monthItems.filter((it) => healthOf(it.launchStatus) === h) }))
                    .filter((s) => s.items.length > 0)
                    .map((s) => ({ ...s, count: s.items.length }));
                  return (
                    <StackRow
                      key={mb.label}
                      label={mb.label}
                      segments={segments}
                      total={mb.total}
                      right={`${mb.total} itens${mb.altosCrit ? ` · ${mb.altosCrit} alto/crít.` : ''}`}
                      labelWidth={220}
                      wrapLabel
                      onSegmentClick={(h, items) => setModal({ title: `${mb.label} · ${HEALTH_LABEL[h]} — ${lancYear}`, accent: healthColorVar(h), items })}
                    />
                  );
                })}
              </div>
            )}
            <div className="ar-legend">
              {HEALTH_ORDER.filter((h) => lancMetrics.healthCounts[h] > 0).map((h) => (
                <span key={h} className={`ar-pill ${HEALTH_CLASS[h]}`}>{HEALTH_LABEL[h]}</span>
              ))}
            </div>
          </Card>

          <Card title={`Carga por dono — ${lancYear}`} subtitle="Composição por dificuldade e pontuação ponderada, por responsável">
            {lancMetrics.byOwner.length === 0 ? <div className="g-empty">Nenhum responsável com lançamentos pendentes {lancPersonFilter ? `de ${lancPersonName} ` : ''}em {lancYear}.</div> : (
              <>
                <div className="ar-legend" style={{ marginBottom: 12 }}>
                  <span className="ar-legend__lbl">Composição —</span>
                  <DifBadge level="Crítico" />
                  <DifBadge level="Alto" />
                  <DifBadge level="Médio" />
                  <DifBadge level="Baixo" />
                  <DifBadge level="sem" />
                </div>
                <div className="g-tablewrap">
                  <table className="g-table">
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th className="c">Itens</th>
                        <th className="c">Crítico</th>
                        <th className="c">Alto</th>
                        <th className="c">Médio</th>
                        <th className="c">Baixo</th>
                        <th className="c">Sem nível</th>
                        <th>Composição</th>
                        <th className="c">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancMetrics.byOwner.map((r) => (
                        <tr key={r.key}>
                          <td className="g-name"><span className="g-name__text">{r.name}</span></td>
                          <td className="c b">{r.itens}</td>
                          <td className="c">{r.dif.Crítico || '—'}</td>
                          <td className="c">{r.dif.Alto || '—'}</td>
                          <td className="c">{r.dif.Médio || '—'}</td>
                          <td className="c">{r.dif.Baixo || '—'}</td>
                          <td className="c">{semNivelOf(r.dif, r.itens) || '—'}</td>
                          <td><Stack dif={r.dif} itens={r.itens} /></td>
                          <td className="c b">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card title="Lançamentos pendentes" subtitle="Ainda não lançados (exclui cancelados)">
            {pendingSorted.length === 0 ? (
              <div className="g-empty">Nenhum lançamento pendente {lancPersonFilter ? `de ${lancPersonName} ` : ''}em {lancYear}.</div>
            ) : (
              <div className="g-tablewrap">
                <table className="g-table">
                  <thead>
                    <tr>
                      <th>Lançamento</th>
                      <th>Mês/Grupo</th>
                      <th>Responsável(is)</th>
                      <th>Dificuldade</th>
                      <th>Launch status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSorted.map((it) => {
                      const d: DifKey = normDif(it.dificuldade) || 'sem';
                      const h = healthOf(it.launchStatus);
                      return (
                        <tr key={it.id}>
                          <td className="g-name"><span className="g-name__text">{it.name}</span></td>
                          <td className="m">{it.group}</td>
                          <td className="m">{it.people.join(', ') || '—'}</td>
                          <td><DifBadge level={d} /></td>
                          <td>{it.launchStatus ? <span className={`ar-pill ${HEALTH_CLASS[h]}`}>{it.launchStatus}</span> : <span className="g-mut">Sem status</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'categorias' && (
        <>
          <div className="ar-cat-head">
            <div>
              <h3 className="ar-cat-head__title">Categorias</h3>
              <p className="ar-cat-head__sub">Lançamentos pendentes (2026 + 2027) por categoria de produto — status vindo do Monday, receita projetada vindo do Monday (2027) e da planilha de Projeções (2026)</p>
            </div>
            <div className="ar-filterbar">
              <div className="ar-filterbar__grp">
                <span className="ar-filterbar__lbl">Ano</span>
                <div className="g-wl__period" style={{ marginBottom: 0 }}>
                  <button className={`g-chip ${catYear === 'todos' ? 'g-chip--on' : ''}`} onClick={() => setCatYear('todos')}>Todos</button>
                  <button className={`g-chip ${catYear === '2026' ? 'g-chip--on' : ''}`} onClick={() => setCatYear('2026')}>2026 ({catRows.filter((r) => r.year === '2026').length})</button>
                  <button className={`g-chip ${catYear === '2027' ? 'g-chip--on' : ''}`} onClick={() => setCatYear('2027')}>2027 ({catRows.filter((r) => r.year === '2027').length})</button>
                </div>
              </div>
              <div className="ar-filterbar__grp">
                <span className="ar-filterbar__lbl">Categoria</span>
                <MultiSelect options={catOptions} value={catFilter} onChange={setCatFilter} allLabel="Todas" placeholder="Selecionar categoria" />
              </div>
              <div className="ar-filterbar__grp">
                <span className="ar-filterbar__lbl">Status</span>
                <MultiSelect
                  options={catStatusOptions}
                  value={catStatusFilterLabel ? [catStatusFilterLabel] : []}
                  onChange={(next) => {
                    const label = next[next.length - 1] as string | undefined;
                    setCatStatusFilter(label ? HEALTH_ORDER.find((h) => HEALTH_LABEL[h] === label) ?? null : null);
                  }}
                  allLabel="Todos"
                  placeholder="Selecionar status"
                  singleSelect
                />
              </div>
              <div className="ar-filterbar__grp">
                <span className="ar-filterbar__lbl">Responsável</span>
                <MultiSelect options={catPersonOptions} value={catPersonFilter} onChange={setCatPersonFilter} allLabel="Todos" placeholder="Selecionar responsável" />
              </div>
              {(catFilter.length > 0 || catPersonFilter.length > 0 || catStatusFilterLabel) && (
                <div className="ar-cat-chips">
                  {catFilter.map((c) => <CategoriaBadge key={c} categoria={c} />)}
                  {catStatusFilter && <span className={`ar-pill ${HEALTH_CLASS[catStatusFilter]}`}>{catStatusFilterLabel}</span>}
                  {catPersonFilter.map((p) => <span key={p} className="ar-cat" style={{ color: 'var(--brand-blue)', background: 'var(--brand-blue-l)', borderColor: 'var(--brand-blue)' }}>{p}</span>)}
                </div>
              )}
            </div>
          </div>

          <div className="ar-cat-kpis" style={{ marginBottom: 14 }}>
            <KPICard label="Quantidade de projetos" value={catFilteredRows.length} icon="📦" accent="blue" />
            <KPICard label="Receita projetada (2026+2027)" value={fmtBRL(catReceitaTotal)} icon="💰" accent="green" />
            <KPICard
              label="No prazo / adiantado"
              value={`${catFilteredRows.filter((r) => r.health === 'ontrack').length} (${catFilteredRows.length ? Math.round((catFilteredRows.filter((r) => r.health === 'ontrack').length / catFilteredRows.length) * 100) : 0}%)`}
              icon="✅"
              accent="purple"
            />
            <KPICard
              label="Atrasado ou em risco"
              value={(() => {
                const n = catFilteredRows.filter((r) => r.health === 'delayed' || r.health === 'atrisk' || r.health === 'attention').length;
                return `${n} (${catFilteredRows.length ? Math.round((n / catFilteredRows.length) * 100) : 0}%)`;
              })()}
              icon="⚠️"
              accent="red"
            />
            <KPICard
              label="Não iniciado"
              value={(() => {
                const n = catFilteredRows.filter((r) => r.health === 'other').length;
                return `${n} (${catFilteredRows.length ? Math.round((n / catFilteredRows.length) * 100) : 0}%)`;
              })()}
              icon="⏳"
              accent="yellow"
            />
          </div>

          {delayImpactVisible.length > 0 && (
            <Card
              title="Impacto de atrasos"
              subtitle="Receita dos meses perdidos (mês original até o mês novo), lida da curva mensal da planilha de Projeções · clique numa linha pra ver o detalhe mês a mês"
              right={<span className="ar-delay-total">{fmtBRL(delayTotal)}</span>}
            >
              <div className="g-tablewrap">
                <table className="g-table">
                  <thead>
                    <tr>
                      <th>Lançamento</th>
                      <th>Categoria</th>
                      <th>De → Para</th>
                      <th className="c">Meses de atraso</th>
                      <th className="c">Receita projetada</th>
                      <th className="c">Perda estimada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delayImpactVisible.map((e) => (
                      <tr
                        key={e.name}
                        className="ar-clickrow"
                        onClick={() => setDelayDetail({ name: e.name, mesOriginal: e.mesOriginal, mesNovo: e.mesNovo, splitNota: e.splitNota, meses: e.meses, total: e.perdaEstimada })}
                      >
                        <td className="g-name"><span className="g-name__text">{e.name}</span></td>
                        <td>{e.row && <CategoriaBadge categoria={e.row.categoria} />}</td>
                        <td className="m">{e.mesOriginal} → {e.mesNovo}</td>
                        <td className="c b">{e.mesesAtraso}</td>
                        <td className="c">{e.row?.receita != null ? fmtBRL(e.row.receita) : <span className="g-mut">—</span>}</td>
                        <td className="c b ar-delay-loss">
                          {fmtBRL(e.perdaEstimada)}
                          {e.splitNota && <span className="ar-note-inline" title={e.splitNota}>*</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {delayImpactVisible.some((e) => e.splitNota) && (
                <p className="ar-note">* linha da planilha de Projeções compartilhada entre duas variantes do Monday — receita mensal dividida 50/50 entre elas.</p>
              )}
              {delayImpactExcluidos.length > 0 && (
                <p className="ar-note">Só entram aqui lançamentos com receita mensal preenchida na planilha pros meses perdidos — {delayImpactExcluidos.length} atraso{delayImpactExcluidos.length !== 1 ? 's' : ''} conhecido{delayImpactExcluidos.length !== 1 ? 's' : ''} sem essa curva ainda fica{delayImpactExcluidos.length !== 1 ? 'm' : ''} de fora da estimativa: {delayImpactExcluidos.map((r) => r.name).join(', ')}.</p>
              )}
              {delayImpact.length > delayImpactVisible.length && (
                <p className="ar-note">{delayImpact.length - delayImpactVisible.length} lançamento(s) atrasado(s) fora do filtro atual (categoria/ano/responsável) não aparecem na tabela acima.</p>
              )}
            </Card>
          )}

          {delayedSemDataInicial.length > 0 && (
            <Card
              title="Atrasados sem data inicial cadastrada"
              subtitle={`${delayedSemDataInicial.length} lançamento(s) com status Delayed no Monday mas sem entrada em CALENDAR_DELAYS — adicione o mês original (de) e o novo mês (para) no código pra eles ganharem "Meses de atraso" e, se a planilha tiver a curva mensal, entrarem em "Impacto de atrasos"`}
            >
              <div className="g-tablewrap">
                <table className="g-table">
                  <thead><tr><th>Lançamento</th><th>Categoria</th><th>Mês/Grupo atual</th><th>Ano</th></tr></thead>
                  <tbody>
                    {delayedSemDataInicial.map((r) => (
                      <tr key={r.key}>
                        <td className="g-name"><span className="g-name__text">{r.name}</span></td>
                        <td><CategoriaBadge categoria={r.categoria} /></td>
                        <td className="m">{r.mesAno}</td>
                        <td className="m">{r.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {catFilteredRows.length === 0 ? (
            <Card title="Categorias"><div className="g-empty">Nenhum lançamento pendente {catFilter.length ? 'nessa(s) categoria(s)' : ''}.</div></Card>
          ) : (
            <>
              {catStatusFilter && (
                <div className="ar-personfilter">
                  <span>Filtrando por status <strong>{HEALTH_LABEL[catStatusFilter]}</strong></span>
                  <button className="ar-personfilter__clear" onClick={() => setCatStatusFilter(null)}>✕ Limpar filtro</button>
                </div>
              )}
              {catNameFilter && (
                <div className="ar-personfilter">
                  <span>Filtrando por lançamento <strong>{catNameFilter}</strong></span>
                  <button className="ar-personfilter__clear" onClick={() => setCatNameFilter(null)}>✕ Limpar filtro</button>
                </div>
              )}

              <div className="ar-grid2">
                <Card title="Quantidade de projetos por status" subtitle="Lançamentos pendentes, por status do Monday — clique num status pra filtrar a aba inteira">
                  <div className="ar-stack ar-stack--rate" style={{ width: '100%', marginBottom: 12 }}>
                    {HEALTH_ORDER.filter((h) => catHealthCounts[h] > 0).map((h) => {
                      const items = catBaseRows.filter((r) => r.health === h);
                      const pct = Math.round((catHealthCounts[h] / catBaseRows.length) * 100);
                      const lightBg = h === 'other' || h === 'none';
                      const active = catStatusFilter === h;
                      return (
                        <span
                          key={h}
                          className={`ar-seg ar-clickseg ${active ? 'ar-seg--active' : ''}`}
                          style={{ width: `${pct}%`, background: healthColorVar(h) }}
                          title={`${HEALTH_LABEL[h]} — ${catHealthCounts[h]} (${pct}%)\n${items.slice(0, 12).map((it) => `· ${it.name}${(h === 'other' || h === 'none') && it.statusRaw ? ` (${it.statusRaw})` : ''}`).join('\n')}${items.length > 12 ? `\n… +${items.length - 12} mais` : ''}`}
                          onClick={() => toggleCatStatusFilter(h)}
                        >
                          <em style={{ color: lightBg ? 'var(--text)' : '#fff' }}>{catHealthCounts[h]}</em>
                        </span>
                      );
                    })}
                  </div>
                  <div className="g-tablewrap">
                    <table className="g-table">
                      <thead><tr><th>Status</th><th className="c">Projetos</th><th className="c">%</th></tr></thead>
                      <tbody>
                        {HEALTH_ORDER.filter((h) => catHealthCounts[h] > 0).map((h) => (
                          <tr key={h} className="ar-clickrow" onClick={() => toggleCatStatusFilter(h)} style={catStatusFilter === h ? { background: 'var(--brand-blue-l)' } : undefined}>
                            <td><span className={`ar-pill ${HEALTH_CLASS[h]}`}>{HEALTH_LABEL[h]}</span></td>
                            <td className="c b">{catHealthCounts[h]}</td>
                            <td className="c">{Math.round((catHealthCounts[h] / catBaseRows.length) * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Status × receita" subtitle="Receita projetada em risco — soma de receita por status · clique num status pra filtrar a aba inteira">
                  {catBaseReceitaTotal === 0 ? (
                    <div className="g-empty">Nenhum lançamento filtrado tem receita casada com a planilha.</div>
                  ) : (
                    <>
                      <div className="ar-barlist">
                        {HEALTH_ORDER.filter((h) => catHealthRevenue[h] > 0).map((h) => (
                          <Bar
                            key={h}
                            label={HEALTH_LABEL[h]}
                            value={catHealthRevenue[h]}
                            max={catMaxReceita}
                            color={healthColorVar(h)}
                            tip={fmtBRL(catHealthRevenue[h])}
                            valueLabel={fmtBRL(catHealthRevenue[h])}
                            valueWidth={110}
                            active={catStatusFilter === h}
                            onClick={() => toggleCatStatusFilter(h)}
                          />
                        ))}
                      </div>
                      <div className="g-tablewrap" style={{ marginTop: 12 }}>
                        <table className="g-table">
                          <thead><tr><th>Status</th><th className="c">Receita</th><th className="c">%</th></tr></thead>
                          <tbody>
                            {HEALTH_ORDER.filter((h) => catHealthRevenue[h] > 0).map((h) => (
                              <tr key={h} className="ar-clickrow" onClick={() => toggleCatStatusFilter(h)} style={catStatusFilter === h ? { background: 'var(--brand-blue-l)' } : undefined}>
                                <td><span className={`ar-pill ${HEALTH_CLASS[h]}`}>{HEALTH_LABEL[h]}</span></td>
                                <td className="c b">{fmtBRL(catHealthRevenue[h])}</td>
                                <td className="c">{Math.round((catHealthRevenue[h] / catBaseReceitaTotal) * 100)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {catSemReceita > 0 && (
                    <p className="ar-note">+ {catSemReceita} lançamento{catSemReceita !== 1 ? 's' : ''} sem receita casada na planilha de Projeções.</p>
                  )}
                </Card>
              </div>

              <Card title="Lançamentos por categoria" subtitle={`${catTableSorted.length} lançamentos pendentes — ordenados por receita · clique numa linha pra filtrar a aba inteira por ela`}>
                <div className="g-tablewrap">
                  <table className="g-table">
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th>Lançamento</th>
                        <th>Data inicial</th>
                        <th>Mês/Grupo</th>
                        <th>Meses de atraso</th>
                        <th>Ano</th>
                        <th>Status</th>
                        <th className="c">Receita projetada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catTableSorted.map((r) => {
                        const pct = catReceitaTotal > 0 ? Math.round((r.receita / catReceitaTotal) * 100) : 0;
                        return (
                          <tr
                            key={r.key}
                            className="ar-clickrow"
                            onClick={() => toggleCatNameFilter(r.name)}
                            style={catNameFilter === r.name ? { background: 'var(--brand-blue-l)' } : undefined}
                          >
                            <td><CategoriaBadge categoria={r.categoria} /></td>
                            <td className="g-name"><span className="g-name__text">{r.name}</span></td>
                            <td className="m">{r.dataInicial}</td>
                            <td className="m">{r.mesAno}</td>
                            <td className="m">{r.mesesAtraso}</td>
                            <td className="m">{r.year}</td>
                            <td>
                              <span className={`ar-pill ${HEALTH_CLASS[r.health]}`} title={r.statusRaw || undefined}>{HEALTH_LABEL[r.health]}</span>
                              {(r.health === 'other' || r.health === 'none') && r.statusRaw && <span className="ar-status-raw">{r.statusRaw}</span>}
                            </td>
                            <td className="c">
                              {r.hasReceita ? (
                                <div className="ar-rowbar">
                                  <div className="ar-rowbar__track">
                                    <div className="ar-rowbar__fill" style={{ width: `${Math.max(4, pct)}%`, background: healthColorVar(r.health) }} />
                                  </div>
                                  <span className="ar-rowbar__value">{fmtBRL(r.receita)}</span>
                                  <span className="ar-rowbar__pct">{pct}%</span>
                                </div>
                              ) : <span className="g-mut">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {tab === 'projetos' && (
        <>
          <Card title="🌙 Score do time — gomoon" subtitle="Ranking de uso de Claude / Claude Code">
            <div className="ar-gomoon-cta">
              <div>
                <p className="ar-gomoon-cta__goal">Meta: todo mundo do time acima de <strong>31 pontos</strong></p>
                <p className="ar-gomoon-cta__note">O ranking completo, por pessoa, fica no próprio gomoon (login restrito a @gocase.com / @gobeaute.com.br).</p>
              </div>
              <a className="ar-gomoon-cta__btn" href="https://gomoon-dash.vercel.app/ranking" target="_blank" rel="noopener noreferrer">
                Ver ranking no gomoon ↗
              </a>
            </div>
          </Card>

          {personFilter && (
            <div className="ar-personfilter">
              <span>Filtrando por <strong>{personFilter}</strong></span>
              <button className="ar-personfilter__clear" onClick={() => setPersonFilter(null)}>✕ Limpar filtro</button>
            </div>
          )}

          <div className="ar-grid2">
            <Card title="Projetos de IA/RPA por pessoa" subtitle={`${iaProjects.length} projetos em andamento · clique numa pessoa pra filtrar`}>
              {iaOwnerCounts.length === 0 ? <div className="g-empty">Nenhum projeto de IA/RPA encontrado.</div> : (
                <div className="ar-barlist">
                  {iaOwnerCounts.map((r) => (
                    <Bar
                      key={r.name}
                      label={r.name}
                      value={r.count}
                      max={iaMax}
                      active={personFilter === r.name}
                      onClick={() => togglePersonFilter(r.name)}
                    />
                  ))}
                </div>
              )}
            </Card>
            <Card title="OKRs 26.2 por owner" subtitle={`${okrProjects.length} objetivos do ciclo · clique numa pessoa pra filtrar`}>
              {okrOwnerCounts.length === 0 ? <div className="g-empty">Nenhum OKR 26.2 encontrado.</div> : (
                <div className="ar-barlist">
                  {okrOwnerCounts.map((r) => (
                    <Bar
                      key={r.name}
                      label={r.name}
                      value={r.count}
                      max={okrMax}
                      crit={r.count === 0}
                      active={personFilter === r.name}
                      onClick={() => togglePersonFilter(r.name)}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title="Projetos de IA/RPA" subtitle={personFilter ? `${iaProjectsFiltered.length} de ${iaProjects.length} projetos` : `${iaProjects.length} projetos`}>
            {iaProjectsFiltered.length === 0 ? (
              <div className="g-empty">{personFilter ? `Nenhum projeto de ${personFilter} nesse grupo.` : 'Nenhum projeto encontrado nesse grupo.'}</div>
            ) : (
              <div className="g-tablewrap">
                <table className="g-table">
                  <thead><tr><th>Priority</th><th>Projeto</th><th>Responsável(is)</th><th>Status</th><th>Risco</th></tr></thead>
                  <tbody>
                    {iaProjectsFiltered.map((p) => {
                      const status = p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.status)?.text || '—';
                      const risco = riscoBadge(p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.color)?.text || null);
                      const prioridade = priorityBadge(p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.priority)?.text || null);
                      const owner = p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.owner)?.text || '—';
                      return (
                        <tr key={p.id}>
                          <td>{prioridade ? <span className={`ar-prio ${prioridade.cls}`}>{prioridade.label}</span> : <span className="g-mut">—</span>}</td>
                          <td className="g-name"><span className="g-name__text">{p.name}</span></td>
                          <td className="m">{owner}</td>
                          <td className="m">{status}</td>
                          <td>{risco ? <span className={risco.cls}>{risco.label}</span> : <span className="g-mut">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="OKRs 26.2" subtitle={personFilter ? `${okrProjectsFiltered.length} de ${okrProjects.length} objetivos` : `${okrProjects.length} objetivos`}>
            {okrProjectsFiltered.length === 0 ? (
              <div className="g-empty">{personFilter ? `Nenhum OKR de ${personFilter} nesse grupo.` : 'Nenhum OKR encontrado nesse grupo.'}</div>
            ) : (
              <div className="g-tablewrap">
                <table className="g-table">
                  <thead><tr><th>Priority</th><th>Objetivo</th><th>Responsável(is)</th><th>Status</th><th>Risco</th></tr></thead>
                  <tbody>
                    {okrProjectsFiltered.map((p) => {
                      const status = p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.status)?.text || '—';
                      const risco = riscoBadge(p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.color)?.text || null);
                      const prioridade = priorityBadge(p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.priority)?.text || null);
                      const owner = p.column_values?.find((c) => c.id === MONDAY.columns.portfolio.owner)?.text || '—';
                      return (
                        <tr key={p.id}>
                          <td>{prioridade ? <span className={`ar-prio ${prioridade.cls}`}>{prioridade.label}</span> : <span className="g-mut">—</span>}</td>
                          <td className="g-name"><span className="g-name__text">{p.name}</span></td>
                          <td className="m">{owner}</td>
                          <td className="m">{status}</td>
                          <td>{risco ? <span className={risco.cls}>{risco.label}</span> : <span className="g-mut">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {delayDetail && (
        <div className="g-modal" onClick={() => setDelayDetail(null)}>
          <div className="g-modal__box ar-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="g-modal__head">
              <strong>{delayDetail.name} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>({delayDetail.mesOriginal} → {delayDetail.mesNovo})</span></strong>
              <button className="g-modal__x" onClick={() => setDelayDetail(null)}>✕</button>
            </div>
            <div className="g-modal__body">
              <div className="g-tablewrap">
                <table className="g-table">
                  <thead><tr><th>Mês</th><th className="c">Quantidade</th><th className="c">Receita perdida</th></tr></thead>
                  <tbody>
                    {delayDetail.meses.map((m) => (
                      <tr key={m.label}>
                        <td className="m">{m.label}</td>
                        <td className="c">{m.qty > 0 ? Math.round(m.qty).toLocaleString('pt-BR') : <span className="g-mut">—</span>}</td>
                        <td className="c">{m.receita > 0 ? fmtBRL(m.receita) : <span className="g-mut">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="b">Total</td>
                      <td className="c b">{Math.round(delayDetail.meses.reduce((s, m) => s + m.qty, 0)).toLocaleString('pt-BR')}</td>
                      <td className="c b ar-delay-loss">{fmtBRL(delayDetail.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {delayDetail.splitNota && <p className="ar-note" style={{ marginTop: 10 }}>{delayDetail.splitNota}</p>}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="g-modal" onClick={() => setModal(null)}>
          <div className="g-modal__box ar-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="g-modal__head">
              <strong>{modal.title} <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>({modal.items.length})</span></strong>
              <button className="g-modal__x" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="g-modal__body">
              {modal.items.length === 0 ? <div className="g-empty">Nenhum lançamento.</div> : modal.items.map((it) => (
                <div key={it.id} className="g-modal__item" style={{ borderLeftColor: modal.accent }}>
                  <div className="g-modal__nome">{it.name}</div>
                  <div className="g-modal__motivo">{it.group}{it.launchStatus ? ` · ${it.launchStatus}` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ar-filterbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 0 0 12px; }
        .ar-input { font-size: 12px; padding: 7px 10px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--surface); color: var(--text); outline: none; font-family: var(--font-sans); }
        .ar-input:focus { border-color: var(--brand-blue); }
        .ar-input--search { flex: 1; min-width: 200px; }
        .ar-filterbar__grp { display: inline-flex; align-items: center; gap: 6px; }
        .ar-filterbar__lbl { font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; }
        .ar-group-row td { background: var(--surface-2); padding: 7px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .ar-group-row__label { font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text); }
        .ar-group-row__count { font-size: 11px; color: var(--text-3); margin-left: 10px; }
        .ar-alloc-table tbody:first-of-type .ar-group-row td { border-top: none; }
        .ar-alloc-indent { color: var(--text-3); margin-right: 6px; }
        .ar-risco-red { color: var(--red); font-weight: 700; }
        .ar-risco-amber { color: var(--amber); font-weight: 700; }
        .ar-risco-green { color: var(--green); font-weight: 700; }
        .ar-risco-muted { color: var(--text-3); }
        .ar-tree { display: flex; flex-direction: column; gap: 4px; }
        .ar-tree__node { border-left: 2px solid var(--border); padding-left: 12px; }
        .ar-tree__row { display: flex; align-items: center; gap: 10px; padding: 6px 0; flex-wrap: wrap; }
        .ar-tree__name { font-weight: 700; color: var(--text); font-size: 13px; min-width: 150px; }
        .ar-tree__role { font-size: 11px; color: var(--text-2); min-width: 160px; }
        .ar-tree__squad { font-size: 11px; color: var(--text-3); flex: 1; }
        .ar-tree__badge { font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 999px; background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }

        .ar-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
        .ar-tab { font-size: 12.5px; font-weight: 700; color: var(--text-2); padding: 10px 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        .ar-tab:hover { color: var(--text); }
        .ar-tab--on { color: var(--text); border-bottom-color: var(--accent-d); }

        .ar-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .ar-grid2 > .card { margin-bottom: 0; }
        @media (max-width: 1000px) { .ar-grid2 { grid-template-columns: 1fr; } }
        .g-eng > .card { margin-bottom: 14px; }

        .ar-barlist { display: flex; flex-direction: column; gap: 9px; }
        .ar-bar { display: grid; grid-template-columns: 132px 1fr 52px; align-items: center; gap: 10px; }
        .ar-bar__label { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ar-bar__track { height: 14px; background: var(--surface-2); border-radius: 5px; overflow: hidden; }
        .ar-bar__fill { height: 100%; border-radius: 5px; background: var(--brand-blue); }
        .ar-bar__fill--crit { background: var(--red); }
        .ar-bar__value { font-size: 11.5px; font-weight: 700; color: var(--text-2); text-align: right; font-variant-numeric: tabular-nums; }
        .ar-bar--click { cursor: pointer; }
        .ar-bar--click:hover .ar-bar__label { color: var(--brand-blue); }
        .ar-bar--active .ar-bar__label { color: var(--brand-blue); font-weight: 800; }
        .ar-bar--active .ar-bar__track { outline: 2px solid var(--brand-blue); outline-offset: 1px; }

        .ar-personfilter { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--brand-blue-l); border: 1.5px solid var(--brand-blue); border-radius: var(--r-md); padding: 8px 14px; margin-bottom: 14px; font-size: 12.5px; color: var(--text); }
        .ar-personfilter strong { color: var(--brand-blue); }
        .ar-personfilter__clear { font-size: 11.5px; font-weight: 700; color: var(--brand-blue); flex-shrink: 0; }
        .ar-personfilter__clear:hover { text-decoration: underline; }
        .ar-clickrow { cursor: pointer; }
        .ar-clickseg { cursor: pointer; }
        .ar-clickseg:hover { filter: brightness(0.92); }
        .ar-seg--active { outline: 2px solid var(--text); outline-offset: -2px; }
        .ar-modal--wide { max-width: 720px; width: 92vw; }

        .ar-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
        .ar-pill--delayed { background: var(--red-l); color: var(--red); }
        .ar-pill--atrisk { background: var(--amber-l); color: var(--amber); }
        .ar-pill--attention { background: var(--ar-attention-l); color: var(--ar-attention); }
        .ar-pill--ontrack { background: var(--green-l); color: var(--green); }
        .ar-pill--other, .ar-pill--none { background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border); }

        .ar-dif { display: inline-flex; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 5px; white-space: nowrap; }
        .ar-dif--baixo { background: #e6e5fb; color: #4c46b3; }
        .ar-dif--medio { background: #c2bff5; color: #3d3796; }
        .ar-dif--alto { background: #6f66d6; color: #fff; }
        .ar-dif--critico { background: #3f37a3; color: #fff; }
        .ar-dif--sem { background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border); }

        .ar-prio { display: inline-flex; font-size: 10.5px; font-weight: 800; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
        .ar-prio--p1 { background: var(--red-l); color: var(--red); }
        .ar-prio--p2 { background: var(--amber-l); color: var(--amber); }
        .ar-prio--p3 { background: var(--brand-blue-l); color: var(--brand-blue); }
        .ar-prio--okr { background: var(--purple-l); color: var(--purple); }
        .ar-prio--outra { background: var(--surface-2); color: var(--text-3); border: 1px solid var(--border); }

        .ar-cat { display: inline-flex; font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; border: 1px solid; }
        .ar-cat-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ar-cat-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
        .ar-cat-head__title { font-size: 13px; font-weight: 700; color: var(--text); letter-spacing: -0.01em; }
        .ar-cat-head__sub { font-size: 11px; color: var(--text-3); margin-top: 2px; max-width: 620px; }
        .ar-cat-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
        @media (max-width: 1100px) { .ar-cat-kpis { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 700px) { .ar-cat-kpis { grid-template-columns: repeat(2, 1fr); } }
        .ar-delay-total { font-size: 18px; font-weight: 900; color: var(--red); font-variant-numeric: tabular-nums; }
        .ar-delay-loss { color: var(--red); }
        .ar-note-inline { color: var(--text-3); margin-left: 3px; cursor: help; }
        .ar-status-raw { display: block; font-size: 10px; color: var(--text-3); margin-top: 2px; }

        .ar-rowbar { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
        .ar-rowbar__track { width: 70px; height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; flex-shrink: 0; }
        .ar-rowbar__fill { height: 100%; border-radius: 4px; }
        .ar-rowbar__value { font-weight: 700; white-space: nowrap; }
        .ar-rowbar__pct { font-size: 10.5px; color: var(--text-3); min-width: 32px; text-align: right; font-variant-numeric: tabular-nums; }

        .ar-stack { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--surface-2); gap: 1px; }
        .ar-stack span { display: block; height: 100%; }
        .ar-stack--rate { height: 20px; border-radius: 5px; gap: 2px; }
        .ar-stack .ar-seg { display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ar-seg em { font-style: normal; font-size: 10px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ar-stackwrap { display: flex; align-items: center; gap: 8px; }

        .ar-gomoon-cta { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .ar-gomoon-cta__goal { font-size: 13px; color: var(--text); }
        .ar-gomoon-cta__goal strong { color: var(--brand-blue); }
        .ar-gomoon-cta__note { font-size: 11.5px; color: var(--text-3); margin-top: 4px; }
        .ar-gomoon-cta__btn { flex-shrink: 0; font-size: 12.5px; font-weight: 700; color: #fff; background: var(--brand-blue); padding: 9px 16px; border-radius: 8px; white-space: nowrap; }
        .ar-gomoon-cta__btn:hover { filter: brightness(1.08); }
        .ar-note { font-size: 11px; color: var(--text-3); margin-top: 10px; }
        .ar-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
        .ar-legend__lbl { font-size: 11px; font-weight: 700; color: var(--text-3); margin-right: 2px; }

        :root { --ar-attention: #c2410c; --ar-attention-l: #ffedd5; }
      `}</style>
    </div>
  );
}

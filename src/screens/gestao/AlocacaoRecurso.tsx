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
  MONDAY, getMondayToken, fetchPortfolio, fetchLaunchAllocation, isPendingLaunch, parseGroupMonth,
  type MondayItem, type LaunchAllocItem,
} from '../../data/monday';
import { TEAM, matchTeamKey, teamMemberByKey, hasLeftTeam, type TeamMember } from '../../data/team';

const FOCUS_GROUPS = ['OKRs 26.2', 'Projetos de IA/Tech'];

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; projects: MondayItem[]; pending2026: LaunchAllocItem[]; pending2027: LaunchAllocItem[]; updatedAt: string };

interface AllocRow {
  key: string; name: string; role: string; squad: string; manager: string | null;
  okr: number; ia: number; lanc2026: number; lanc2027: number; total: number;
}

type MainTab = 'alocacao' | 'lancamentos' | 'projetos';

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const splitNames = (text: string) => (text || '').split(',').map((s) => s.trim()).filter(Boolean);

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
  delayed: 'Delayed', atrisk: 'At risk', attention: 'Attention', ontrack: 'On track', other: 'Outros / parado', none: 'Sem status',
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

function Bar({ label, value, max, tip, crit, onClick, color, unit, active }: {
  label: string; value: number; max: number; tip?: string; crit?: boolean; onClick?: () => void; color?: string; unit?: string; active?: boolean;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`ar-bar ${onClick ? 'ar-bar--click' : ''} ${active ? 'ar-bar--active' : ''}`} title={tip} onClick={onClick}>
      <span className="ar-bar__label">{label}</span>
      <div className="ar-bar__track">
        <div
          className={`ar-bar__fill ${!color && crit ? 'ar-bar__fill--crit' : ''}`}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
        />
      </div>
      <span className="ar-bar__value">{Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',') + '×'}{unit}</span>
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
  const [allocSearch, setAllocSearch] = useState('');
  const [allocSquads, setAllocSquads] = useState<string[]>([]);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [lancPersonFilter, setLancPersonFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const token = getMondayToken();
        const c26 = MONDAY.columns.launches2026;
        const c27 = MONDAY.columns.launches2027;
        const [projects, launches2026, launches2027] = await Promise.all([
          fetchPortfolio(token),
          fetchLaunchAllocation(token, MONDAY.boards.lancamentos2026, c26.people, c26.launchStatus, c26.dificuldade),
          fetchLaunchAllocation(token, MONDAY.boards.lancamentos2027, c27.people, c27.launchStatus, c27.dificuldade),
        ]);
        if (cancelled) return;
        setState({
          kind: 'ready',
          projects,
          pending2026: launches2026.filter(isPendingLaunch),
          pending2027: launches2027.filter(isPendingLaunch),
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

  const { projects, pending2026, pending2027, updatedAt } = state;

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

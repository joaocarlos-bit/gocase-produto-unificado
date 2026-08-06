// Gestão › Engenharia — fonte: Monday.com, board "03 - Warehouse Samples",
// grupo "Samples 2026". Cada item = uma amostra testada; o mês é definido pela
// coluna "Date Tested" e o SLA (dias úteis) é calculado entre "Date Received"
// e "Date Tested" (mesma lógica da coluna fórmula "SLA Teste" do board).
// 4 KPIs (Total testes YTD, SLA médio, Testes do mês, SLA do mês) + 2 gráficos
// (barras de testes/mês, linha de SLA com meta ≤7 dias).

import { useEffect, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { Card } from '../../components/Card';
import { KPICard, Delta } from '../../components/KPICard';
import { TokenPrompt } from '../../components/TokenPrompt';
import { MONDAY, getMondayToken, fetchWarehouseSamples, businessDaysInclusive } from '../../data/monday';
import { loadReportImage, reportImagesConfigured } from '../../data/reportImages';

interface TesteRow { mes: string; aprovado: number; reprovado: number; outros: number; total: number; }
interface SlaRow { mes: string; dias: number; }
interface RazaoRow { motivo: string; qtd: number; }
interface ReprovadoItem { id: string; name: string; dateTested: string | null; }
interface Reprovacoes { total: number; semMotivo: number; motivos: RazaoRow[]; itensPorMotivo: Record<string, ReprovadoItem[]>; }
interface TesteConsulta { id: string; codigo: string; nome: string; status: string | null; dateReceived: string | null; dateTested: string | null; relatorioUrl: string | null; }
interface CategoriaRow { categoria: string; aprovado: number; reprovado: number; outros: number; total: number; }

function ReasonTooltip({ active, payload, itensPorMotivo }: any) {
  if (!active || !payload?.length) return null;
  const { motivo, qtd } = payload[0].payload;
  const itens: ReprovadoItem[] = itensPorMotivo[motivo] || [];
  const preview = itens.slice(0, 8);
  return (
    <div className="g-reason-tip">
      <div className="g-reason-tip__title">{motivo} <span>· {qtd}</span></div>
      <ul>
        {preview.map((it) => (
          <li key={it.id}>{it.name}{it.dateTested ? <span> — {formatDateBR(it.dateTested)}</span> : null}</li>
        ))}
      </ul>
      {itens.length > preview.length && <div className="g-reason-tip__more">+{itens.length - preview.length} outros — clique na barra para ver todos</div>}
    </div>
  );
}

const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeMes = (key?: string) => {
  const idx = MES_ABREV.indexOf((key || '').split('/')[0]);
  return idx >= 0 ? MES_NOME[idx] : (key || '');
};

// Separa o código de transportadora/rastreio do nome do item, ex.:
// "FEDEX1235456789 NOME DO PRODUTO" → { codigo: "FEDEX1235456789", nome: "NOME DO PRODUTO" }.
const splitItemName = (name: string): { codigo: string; nome: string } => {
  const m = name.match(/^((?:[A-Za-z]+\d+|\d+[A-Za-z]*))\s+(.+)$/);
  if (m && m[2].trim()) return { codigo: m[1], nome: m[2].trim() };
  return { codigo: '—', nome: name };
};
const cleanItemName = (name: string) => splitItemName(name).nome;

// Categoria de produto inferida pelo nome do teste — não existe coluna
// dedicada no Monday, então classificamos por palavra-chave (mesma ideia do
// splitItemName acima). Regras verificadas em ordem, a mais específica primeiro.
const CATEGORIA_RULES: [RegExp, string][] = [
  [/BACKPACK/, 'Mochilas'],
  [/SUITCASE/, 'Malas'],
  [/TUMBLER/, 'Tumblers'],
  [/BOTTLE/, 'Garrafas'],
  [/\bCUPS?\b/, 'Copos'],
  [/JARS?/, 'Potes'],
  [/TOTE|\bBAGS?\b/, 'Bolsas'],
];
const inferCategoria = (nome: string): string => {
  const upper = nome.toUpperCase();
  const hit = CATEGORIA_RULES.find(([re]) => re.test(upper));
  return hit ? hit[1] : 'Outros';
};

// Formata data ISO ("YYYY-MM-DD...") vinda do Monday para dd/mm/aa.
const formatDateBR = (date: string | null) => {
  if (!date) return null;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : date;
};

// Cor inline (não classe) — a regra ".tbl__table tbody td" do tables.css tem
// mais especificidade que ".tbl__pos/.tbl__neg/..." e sobrescreveria a cor.
const STATUS_COLOR: Record<string, string> = {
  'Approved': 'var(--green)',
  'Approved w/ Restriction': 'var(--amber)',
  'Not Approved': 'var(--red)',
  'Waiting': 'var(--amber)',
};
const statusColor = (status: string | null) => STATUS_COLOR[status || ''] || 'var(--text-3)';

// Miniatura da foto do produto — carregada sob demanda (IntersectionObserver)
// quando a linha entra na viewport, não em massa ao montar a tabela.
// Clicar na miniatura já carregada abre o zoom (via onZoom, controlado pela tela).
function ReportThumb({ url, nome, onZoom }: { url: string | null; nome: string; onZoom: (src: string, nome: string) => void }) {
  const [thumb, setThumb] = useState<{ src: string | null; loading: boolean; error?: string }>({ src: null, loading: false });
  const elRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!url || !reportImagesConfigured()) return;
    const el = elRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        setThumb({ src: null, loading: true });
        loadReportImage(url)
          .then((src) => setThumb({ src, loading: false }))
          .catch((e: Error) => setThumb({ src: null, loading: false, error: e.message }));
        obs.disconnect();
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [url]);

  if (!url || !reportImagesConfigured()) return <span className="tbl__faded">—</span>;

  return (
    <div ref={elRef} className="g-eng-thumb" title={thumb.error || undefined}>
      {thumb.loading ? (
        <span className="spinner" />
      ) : thumb.src ? (
        <button type="button" className="g-eng-thumb__zoom" onClick={() => onZoom(thumb.src!, nome)} title="Ver foto maior">
          <img src={thumb.src} alt="" referrerPolicy="no-referrer" />
        </button>
      ) : (
        <span className="g-eng-thumb__empty">🖼️</span>
      )}
    </div>
  );
}

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'; testes: TesteRow[]; sla: SlaRow[]; slaMediaGeral: number | null; reprovacoes: Reprovacoes;
      testesList: TesteConsulta[]; categorias: CategoriaRow[]; totalAprovados: number; totalReprovados: number; updatedAt: string;
    };

export function Engenharia() {
  const [state, setState] = useState<State>(() => (getMondayToken() ? { kind: 'loading' } : { kind: 'no-token' }));
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedMotivo, setSelectedMotivo] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [zoom, setZoom] = useState<{ src: string; nome: string } | null>(null);

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const token = getMondayToken();
        const items = await fetchWarehouseSamples(token, MONDAY.boards.warehouseSamples, MONDAY.groups.warehouseSamples2026);

        const year = new Date().getFullYear();
        const testesPorMes = new Map<number, { aprovado: number; reprovado: number; outros: number }>();
        const slaSomaPorMes = new Map<number, { soma: number; n: number }>();
        const categoriaPorStatus = new Map<string, { aprovado: number; reprovado: number; outros: number }>();

        // Média geral do ano (item a item, todos os itens testados em `year`
        // com SLA calculável) — mesma lógica de dias úteis da coluna "SLA
        // Teste" do Monday, mas restrita ao ano corrente.
        let slaSomaGeral = 0, slaNGeral = 0;
        let totalAprovados = 0, totalReprovados = 0;
        const testesList: TesteConsulta[] = [];

        items.forEach((it) => {
          if (!it.dateTested) return;
          const d = new Date(it.dateTested + 'T00:00:00');
          if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
          const mes = d.getMonth();
          const bucket = testesPorMes.get(mes) || { aprovado: 0, reprovado: 0, outros: 0 };
          if (it.approval === 'Approved' || it.approval === 'Approved w/ Restriction') { bucket.aprovado += 1; totalAprovados += 1; }
          else if (it.approval === 'Not Approved') { bucket.reprovado += 1; totalReprovados += 1; }
          else bucket.outros += 1;
          testesPorMes.set(mes, bucket);
          const { codigo, nome } = splitItemName(it.name);
          testesList.push({ id: it.id, codigo, nome, status: it.approval, dateReceived: it.dateReceived, dateTested: it.dateTested, relatorioUrl: it.relatorioUrl });
          const categoria = inferCategoria(nome);
          const catBucket = categoriaPorStatus.get(categoria) || { aprovado: 0, reprovado: 0, outros: 0 };
          if (it.approval === 'Approved' || it.approval === 'Approved w/ Restriction') catBucket.aprovado += 1;
          else if (it.approval === 'Not Approved') catBucket.reprovado += 1;
          else catBucket.outros += 1;
          categoriaPorStatus.set(categoria, catBucket);
          if (it.dateReceived) {
            const dias = businessDaysInclusive(it.dateReceived, it.dateTested);
            if (dias != null) {
              const acc = slaSomaPorMes.get(mes) || { soma: 0, n: 0 };
              acc.soma += dias; acc.n += 1;
              slaSomaPorMes.set(mes, acc);
              slaSomaGeral += dias; slaNGeral += 1;
            }
          }
        });

        const mesesOrdenados = [...testesPorMes.keys()].sort((a, b) => a - b);
        const testes: TesteRow[] = mesesOrdenados.map((m) => {
          const b = testesPorMes.get(m) || { aprovado: 0, reprovado: 0, outros: 0 };
          return { mes: `${MES_ABREV[m]}/${String(year).slice(-2)}`, aprovado: b.aprovado, reprovado: b.reprovado, outros: b.outros, total: b.aprovado + b.reprovado + b.outros };
        });
        const sla: SlaRow[] = mesesOrdenados
          .filter((m) => slaSomaPorMes.has(m))
          .map((m) => { const acc = slaSomaPorMes.get(m)!; return { mes: `${MES_ABREV[m]}/${String(year).slice(-2)}`, dias: acc.soma / acc.n }; });
        const slaMediaGeral = slaNGeral ? slaSomaGeral / slaNGeral : null;

        // Principais motivos de reprovação (coluna "Razão", multi-select) —
        // apenas itens com Approval = "Not Approved" testados em `year`.
        const naoAprovados = items.filter((it) => {
          if (it.approval !== 'Not Approved' || !it.dateTested) return false;
          const d = new Date(it.dateTested + 'T00:00:00');
          return !isNaN(d.getTime()) && d.getFullYear() === year;
        });
        const motivoCounts = new Map<string, number>();
        const motivoItems = new Map<string, ReprovadoItem[]>();
        let semMotivo = 0;
        naoAprovados.forEach((it) => {
          if (!it.razao.length) { semMotivo += 1; return; }
          it.razao.forEach((r) => {
            motivoCounts.set(r, (motivoCounts.get(r) || 0) + 1);
            const arr = motivoItems.get(r) || [];
            arr.push({ id: it.id, name: cleanItemName(it.name), dateTested: it.dateTested });
            motivoItems.set(r, arr);
          });
        });
        const motivos: RazaoRow[] = [...motivoCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([motivo, qtd]) => ({ motivo, qtd }));
        const itensPorMotivo: Record<string, ReprovadoItem[]> = {};
        motivoItems.forEach((itens, motivo) => {
          itensPorMotivo[motivo] = itens.sort((a, b) => (b.dateTested || '').localeCompare(a.dateTested || ''));
        });
        const reprovacoes: Reprovacoes = { total: naoAprovados.length, semMotivo, motivos, itensPorMotivo };
        testesList.sort((a, b) => (b.dateReceived || '').localeCompare(a.dateReceived || ''));

        const categorias: CategoriaRow[] = [...categoriaPorStatus.entries()]
          .map(([categoria, b]) => ({ categoria, aprovado: b.aprovado, reprovado: b.reprovado, outros: b.outros, total: b.aprovado + b.reprovado + b.outros }))
          .sort((a, b) => b.total - a.total);

        if (!testes.length) throw new Error(`Sem itens testados em ${year} no grupo "Samples ${year}"`);
        if (cancelled) return;
        setState({ kind: 'ready', testes, sla, slaMediaGeral, reprovacoes, testesList, categorias, totalAprovados, totalReprovados, updatedAt: new Date().toLocaleString('pt-BR') });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (state.kind === 'no-token') return <TokenPrompt tab="Engenharia" onSaved={() => setReloadKey((k) => k + 1)} />;
  if (state.kind === 'loading') {
    return <div className="g-status"><span className="spinner" /> Carregando dados de Engenharia do Monday…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="g-status g-status--err">
        ⚠ Erro ao carregar: {state.message}
        <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button>
      </div>
    );
  }

  const { testes, sla, slaMediaGeral: slaMedia, reprovacoes, testesList, categorias, totalAprovados, totalReprovados, updatedAt } = state;
  const totalYTD = testes.reduce((s, d) => s + d.total, 0);
  const lastTestes = [...testes].reverse().find((d) => d.total > 0) || null;
  const prevTestes = lastTestes ? [...testes].reverse().find((d) => d.total > 0 && d.mes !== lastTestes.mes) || null : null;
  const lastSla = sla.length ? sla[sla.length - 1] : null;
  const prevSla = sla.length > 1 ? sla[sla.length - 2] : null;

  const pctDelta = (val?: number, ref?: number | null) =>
    ref == null || ref === 0 || val == null ? null : ((val - ref) / ref) * 100;
  const diasDelta = (val?: number, ref?: number | null) =>
    ref == null || val == null ? null : val - ref;

  // SLA: menor é melhor → invertemos o sinal pra Delta colorir certo (queda = verde)
  const slaMesDelta = diasDelta(lastSla?.dias, prevSla?.dias);

  const chartTestes = testes.map((d) => ({ mes: d.mes, aprovado: d.aprovado, reprovado: d.reprovado, outros: d.outros, total: d.total }));
  const chartSla = sla.map((d) => ({ mes: d.mes, dias: Math.round(d.dias * 10) / 10 }));

  const concluidos = totalAprovados + totalReprovados;
  const taxaAprovacao = concluidos ? (totalAprovados / concluidos) * 100 : null;

  const buscaNorm = busca.trim().toLocaleLowerCase('pt-BR');
  const testesFiltrados = buscaNorm
    ? testesList.filter((t) =>
        t.codigo.toLocaleLowerCase('pt-BR').includes(buscaNorm) ||
        t.nome.toLocaleLowerCase('pt-BR').includes(buscaNorm) ||
        (t.status || '').toLocaleLowerCase('pt-BR').includes(buscaNorm))
    : testesList;

  return (
    <div className="g-eng">
      <div className="g-eng__head">
        <h1 className="g-eng__title">Engenharia</h1>
        <div className="g-eng__meta">
          <span>Atualizado: {updatedAt}</span>
          <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Atualizar</button>
        </div>
      </div>

      <div className="g-eng__kpis">
        <KPICard label="Total de Testes (YTD)" value={totalYTD} icon="⚡" accent="blue"
          delta={<Delta value={pctDelta(lastTestes?.total, prevTestes?.total)} />} />
        <KPICard label="SLA Médio" unit="dias" icon="📅" accent="green"
          value={slaMedia !== null ? slaMedia.toFixed(1).replace('.', ',') : '—'} />
        <KPICard label={`Testes em ${nomeMes(lastTestes?.mes)}`} value={lastTestes?.total ?? '—'} icon="📦" accent="yellow"
          delta={<Delta value={pctDelta(lastTestes?.total, prevTestes?.total)} />} />
        <KPICard label={`SLA ${nomeMes(lastSla?.mes)}`} unit="dias" icon="🎯" accent="green"
          value={lastSla ? Math.round(lastSla.dias) : '—'}
          delta={<Delta value={slaMesDelta == null ? null : -slaMesDelta} suffix=" d" />} />
      </div>

      <div className="g-eng__charts">
        <Card title="Testes por mês" subtitle={`Total acumulado: ${totalYTD} testes em ${new Date().getFullYear()} · ${totalAprovados} aprovados · ${totalReprovados} reprovados`}>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartTestes} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={36} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(value: number, name: string) => [value, name === 'aprovado' ? 'Aprovado' : name === 'reprovado' ? 'Reprovado' : 'Outros']} />
                <Legend
                  formatter={(value: string) => (value === 'aprovado' ? 'Aprovado' : value === 'reprovado' ? 'Reprovado' : 'Outros')}
                  wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="aprovado" stackId="testes" fill="var(--green)" maxBarSize={50} />
                <Bar dataKey="reprovado" stackId="testes" fill="var(--red)" maxBarSize={50} />
                <Bar dataKey="outros" stackId="testes" fill="var(--text-3)" radius={[6, 6, 0, 0]} maxBarSize={50}>
                  <LabelList dataKey="total" position="top" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--text)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="SLA em dias" subtitle={`Média: ${slaMedia !== null ? slaMedia.toFixed(1).replace('.', ',') : '—'} dias · Meta: ≤ 7 dias`}>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSla} margin={{ top: 24, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={36} />
                <Tooltip formatter={(v: number) => [`${v} dias`, 'SLA']} />
                <ReferenceLine y={7} stroke="var(--text-3)" strokeDasharray="6 6" label={{ value: 'Meta 7d', position: 'right', fontSize: 10, fill: 'var(--text-3)' }} />
                <Line type="monotone" dataKey="dias" stroke="var(--green)" strokeWidth={3}
                  dot={{ r: 4, fill: 'var(--green)', strokeWidth: 2, stroke: '#fff' }}>
                  <LabelList dataKey="dias" position="top" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--text)' }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="g-eng__reasons">
        <Card title="Principais motivos de reprovação"
          subtitle={`${reprovacoes.total} reprovações em ${new Date().getFullYear()}${reprovacoes.semMotivo ? ` · ${reprovacoes.semMotivo} sem motivo registrado` : ''}`}>
          {reprovacoes.motivos.length === 0 ? (
            <div className="g-status">Nenhuma reprovação com motivo registrado no período.</div>
          ) : (
            <div style={{ height: Math.min(Math.max(140, reprovacoes.motivos.length * 22), 260), overflowY: 'auto' }}>
              <ResponsiveContainer width="100%" height={Math.max(140, reprovacoes.motivos.length * 22)}>
                <BarChart data={reprovacoes.motivos} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--text-2)' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="motivo" tickLine={false} axisLine={false} width={200}
                    tick={{ fontSize: 10, fill: 'var(--text-2)' }} />
                  <Tooltip content={<ReasonTooltip itensPorMotivo={reprovacoes.itensPorMotivo} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="qtd" fill="var(--red)" radius={[0, 6, 6, 0]} maxBarSize={16}
                    onClick={(data: any) => setSelectedMotivo((prev) => (prev === data.motivo ? null : data.motivo))}>
                    <LabelList dataKey="qtd" position="right" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--text)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {selectedMotivo && (
            <div className="g-reason-panel">
              <div className="g-reason-panel__head">
                <strong>{selectedMotivo}</strong>
                <span className="g-reason-panel__count">{(reprovacoes.itensPorMotivo[selectedMotivo] || []).length} teste(s)</span>
                <button className="g-reason-panel__close" onClick={() => setSelectedMotivo(null)}>✕</button>
              </div>
              <ul className="g-reason-panel__list">
                {(reprovacoes.itensPorMotivo[selectedMotivo] || []).map((it) => (
                  <li key={it.id}>
                    <span className="g-reason-panel__name">{it.name}</span>
                    {it.dateTested && <span className="g-reason-panel__date">{formatDateBR(it.dateTested)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Testes por categoria" subtitle={`${categorias.length} categorias · aprovado/reprovado/outros no ano`}>
          {categorias.length === 0 ? (
            <div className="g-status">Sem categorias identificadas no período.</div>
          ) : (
            <div style={{ height: Math.max(140, categorias.length * 26) }}>
              <ResponsiveContainer width="100%" height={Math.max(140, categorias.length * 26)}>
                <BarChart data={categorias} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--text-2)' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="categoria" tickLine={false} axisLine={false} width={80} interval={0}
                    tick={{ fontSize: 10, fill: 'var(--text-2)' }} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(value: number, name: string) => [value, name === 'aprovado' ? 'Aprovado' : name === 'reprovado' ? 'Reprovado' : 'Outros']} />
                  <Legend
                    formatter={(value: string) => (value === 'aprovado' ? 'Aprovado' : value === 'reprovado' ? 'Reprovado' : 'Outros')}
                    wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="aprovado" stackId="cat" fill="var(--green)" maxBarSize={18} />
                  <Bar dataKey="reprovado" stackId="cat" fill="var(--red)" maxBarSize={18} />
                  <Bar dataKey="outros" stackId="cat" fill="var(--text-3)" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="g-eng__consulta">
        <Card title="Consulta de testes" subtitle={`${testesList.length} testes em ${new Date().getFullYear()}`}>
          <div className="g-approval-rate">
            <span className="g-approval-rate__value" style={{ color: taxaAprovacao == null ? 'var(--text-3)' : taxaAprovacao >= 80 ? 'var(--green)' : taxaAprovacao >= 60 ? 'var(--amber)' : 'var(--red)' }}>
              {taxaAprovacao != null ? `${taxaAprovacao.toFixed(1).replace('.', ',')}%` : '—'}
            </span>
            <span className="g-approval-rate__label">Taxa de aprovação · {totalAprovados} de {concluidos} testes concluídos</span>
          </div>
          <input
            className="g-eng-search"
            type="text"
            placeholder="Buscar por código, teste ou status…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {testesFiltrados.length === 0 ? (
            <div className="g-status">Nenhum teste encontrado.</div>
          ) : (
            <div className="tbl">
              <div className="tbl__wrap">
                <table className="tbl__table">
                  <thead>
                    <tr>
                      <th className="num-col" style={{ width: 32 }}>#</th>
                      {reportImagesConfigured() && <th style={{ width: 76 }}>Foto</th>}
                      <th>Código</th>
                      <th>Teste</th>
                      <th>Status</th>
                      <th>Data de Recebimento</th>
                      <th>Data do Teste</th>
                      <th style={{ width: 40 }}>Relatório</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testesFiltrados.map((t, i) => (
                      <tr key={t.id}>
                        <td className="tbl__num">{i + 1}.</td>
                        {reportImagesConfigured() && <td><ReportThumb url={t.relatorioUrl} nome={t.nome} onZoom={(src, nome) => setZoom({ src, nome })} /></td>}
                        <td className="tbl__primary">{t.codigo}</td>
                        <td className="tbl__secondary">{t.nome}</td>
                        <td style={{ color: statusColor(t.status), fontWeight: 600 }}>{t.status || '—'}</td>
                        <td className="tbl__muted">{formatDateBR(t.dateReceived) || '—'}</td>
                        <td className="tbl__muted">{formatDateBR(t.dateTested) || '—'}</td>
                        <td>
                          {t.relatorioUrl ? (
                            <a className="g-eng-report-link" href={t.relatorioUrl} target="_blank" rel="noopener noreferrer" title="Abrir Relatório Arquivo">📄</a>
                          ) : (
                            <span className="tbl__faded" title="Sem relatório anexado">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>

      {zoom && (
        <div className="g-img-zoom__overlay" onClick={() => setZoom(null)}>
          <div className="g-img-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="g-img-zoom__head">
              <strong>{zoom.nome}</strong>
              <button className="g-img-zoom__close" onClick={() => setZoom(null)}>✕</button>
            </div>
            <img src={zoom.src} alt={zoom.nome} referrerPolicy="no-referrer" />
          </div>
        </div>
      )}

      <style>{`
        .g-eng__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
        .g-eng__title { font-size: 22px; font-weight: 800; color: var(--text); }
        .g-eng__meta { display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-3); }
        .g-eng__kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
        .g-eng__charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .g-eng__consulta { margin-top: 14px; }
        .g-eng__reasons { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .g-approval-rate { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
        .g-approval-rate__value { font-size: 26px; font-weight: 800; }
        .g-approval-rate__label { font-size: 12px; color: var(--text-2); }
        .g-eng-search { width: 100%; box-sizing: border-box; font-size: 12px; padding: 7px 10px; margin-bottom: 10px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--text); }
        .g-eng-search:focus { outline: none; border-color: var(--brand-blue); }
        .g-eng-report-link { font-size: 14px; text-decoration: none; cursor: pointer; background: none; border: none; padding: 0; color: inherit; }
        .g-eng-report-link:hover { filter: brightness(1.3); }
        .g-eng-thumb { width: 64px; height: 64px; border-radius: 8px; overflow: hidden; background: var(--surface-2); display: flex; align-items: center; justify-content: center; }
        .g-eng-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .g-eng-thumb__empty { font-size: 22px; opacity: 0.4; }
        .g-eng-thumb .spinner { width: 16px; height: 16px; }
        .g-eng-thumb__zoom { width: 100%; height: 100%; border: none; padding: 0; background: none; cursor: zoom-in; }
        .g-eng-thumb__zoom:hover img { filter: brightness(1.08); }
        .g-img-zoom__overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
        .g-img-zoom { background: var(--surface); border-radius: var(--r-md, 10px); max-width: 640px; width: 100%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
        .g-img-zoom__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
        .g-img-zoom__head strong { font-size: 13px; color: var(--text); }
        .g-img-zoom__close { border: none; background: transparent; color: var(--text-3); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; }
        .g-img-zoom__close:hover { background: var(--surface-2); color: var(--text); }
        .g-img-zoom img { max-width: 100%; max-height: 75vh; object-fit: contain; display: block; margin: 0 auto; }
        .g-retry { font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); }
        .g-retry:hover { background: var(--border); color: var(--text); }
        .g-status { display: flex; align-items: center; gap: 10px; padding: 40px; color: var(--text-2); font-size: 13px; }
        .g-status--err { color: var(--red); flex-wrap: wrap; }
        .g-eng__reasons .recharts-bar-rectangle { cursor: pointer; }
        .g-reason-tip { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); max-width: 420px; }
        .g-reason-tip__title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
        .g-reason-tip__title span { font-weight: 700; color: var(--red); }
        .g-reason-tip ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
        .g-reason-tip li { font-size: 11px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .g-reason-tip li span { color: var(--text-3); }
        .g-reason-tip__more { font-size: 10px; color: var(--text-3); margin-top: 6px; font-style: italic; }
        .g-reason-panel { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px; }
        .g-reason-panel__head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .g-reason-panel__head strong { font-size: 13px; color: var(--text); }
        .g-reason-panel__count { font-size: 11px; color: var(--text-3); }
        .g-reason-panel__close { margin-left: auto; border: none; background: transparent; color: var(--text-3); cursor: pointer; font-size: 13px; padding: 2px 6px; border-radius: 4px; }
        .g-reason-panel__close:hover { background: var(--surface-2); color: var(--text); }
        .g-reason-panel__list { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
        .g-reason-panel__list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px; color: var(--text-2); padding: 5px 8px; border-radius: 6px; background: var(--surface-2); }
        .g-reason-panel__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .g-reason-panel__date { color: var(--text-3); font-size: 11px; white-space: nowrap; flex-shrink: 0; }
        @media (max-width: 1000px) { .g-eng__kpis { grid-template-columns: repeat(2, 1fr); } .g-eng__charts { grid-template-columns: 1fr; } .g-eng__reasons { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

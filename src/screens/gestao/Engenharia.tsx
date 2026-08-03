// Gestão › Engenharia — fonte: Monday.com, board "03 - Warehouse Samples",
// grupo "Samples 2026". Cada item = uma amostra testada; o mês é definido pela
// coluna "Date Tested" e o SLA (dias úteis) é calculado entre "Date Received"
// e "Date Tested" (mesma lógica da coluna fórmula "SLA Teste" do board).
// 4 KPIs (Total testes YTD, SLA médio, Testes do mês, SLA do mês) + 2 gráficos
// (barras de testes/mês, linha de SLA com meta ≤7 dias).

import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { Card } from '../../components/Card';
import { KPICard, Delta } from '../../components/KPICard';
import { TokenPrompt } from '../../components/TokenPrompt';
import { MONDAY, getMondayToken, fetchWarehouseSamples, businessDaysInclusive } from '../../data/monday';

interface TesteRow { mes: string; valor: number; }
interface SlaRow { mes: string; dias: number; }
interface RazaoRow { motivo: string; qtd: number; }
interface Reprovacoes { total: number; semMotivo: number; motivos: RazaoRow[]; }

const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeMes = (key?: string) => {
  const idx = MES_ABREV.indexOf((key || '').split('/')[0]);
  return idx >= 0 ? MES_NOME[idx] : (key || '');
};

type State =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; testes: TesteRow[]; sla: SlaRow[]; slaMediaGeral: number | null; reprovacoes: Reprovacoes; updatedAt: string };

export function Engenharia() {
  const [state, setState] = useState<State>(() => (getMondayToken() ? { kind: 'loading' } : { kind: 'no-token' }));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!getMondayToken()) { setState({ kind: 'no-token' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const token = getMondayToken();
        const items = await fetchWarehouseSamples(token, MONDAY.boards.warehouseSamples, MONDAY.groups.warehouseSamples2026);

        const year = new Date().getFullYear();
        const testesPorMes = new Map<number, number>();
        const slaSomaPorMes = new Map<number, { soma: number; n: number }>();

        // Média geral do ano (item a item, todos os itens testados em `year`
        // com SLA calculável) — mesma lógica de dias úteis da coluna "SLA
        // Teste" do Monday, mas restrita ao ano corrente.
        let slaSomaGeral = 0, slaNGeral = 0;

        items.forEach((it) => {
          if (!it.dateTested) return;
          const d = new Date(it.dateTested + 'T00:00:00');
          if (isNaN(d.getTime()) || d.getFullYear() !== year) return;
          const mes = d.getMonth();
          testesPorMes.set(mes, (testesPorMes.get(mes) || 0) + 1);
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
        const testes: TesteRow[] = mesesOrdenados.map((m) => ({ mes: `${MES_ABREV[m]}/${String(year).slice(-2)}`, valor: testesPorMes.get(m) || 0 }));
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
        let semMotivo = 0;
        naoAprovados.forEach((it) => {
          if (!it.razao.length) { semMotivo += 1; return; }
          it.razao.forEach((r) => motivoCounts.set(r, (motivoCounts.get(r) || 0) + 1));
        });
        const motivos: RazaoRow[] = [...motivoCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([motivo, qtd]) => ({ motivo, qtd }));
        const reprovacoes: Reprovacoes = { total: naoAprovados.length, semMotivo, motivos };

        if (!testes.length) throw new Error(`Sem itens testados em ${year} no grupo "Samples ${year}"`);
        if (cancelled) return;
        setState({ kind: 'ready', testes, sla, slaMediaGeral, reprovacoes, updatedAt: new Date().toLocaleString('pt-BR') });
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

  const { testes, sla, slaMediaGeral: slaMedia, reprovacoes, updatedAt } = state;
  const totalYTD = testes.reduce((s, d) => s + d.valor, 0);
  const lastTestes = [...testes].reverse().find((d) => d.valor > 0) || null;
  const prevTestes = lastTestes ? [...testes].reverse().find((d) => d.valor > 0 && d.mes !== lastTestes.mes) || null : null;
  const lastSla = sla.length ? sla[sla.length - 1] : null;
  const prevSla = sla.length > 1 ? sla[sla.length - 2] : null;

  const pctDelta = (val?: number, ref?: number | null) =>
    ref == null || ref === 0 || val == null ? null : ((val - ref) / ref) * 100;
  const diasDelta = (val?: number, ref?: number | null) =>
    ref == null || val == null ? null : val - ref;

  // SLA: menor é melhor → invertemos o sinal pra Delta colorir certo (queda = verde)
  const slaMesDelta = diasDelta(lastSla?.dias, prevSla?.dias);

  const chartTestes = testes.map((d) => ({ mes: d.mes, valor: d.valor }));
  const chartSla = sla.map((d) => ({ mes: d.mes, dias: Math.round(d.dias * 10) / 10 }));

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
          delta={<Delta value={pctDelta(lastTestes?.valor, prevTestes?.valor)} />} />
        <KPICard label="SLA Médio" unit="dias" icon="📅" accent="green"
          value={slaMedia !== null ? slaMedia.toFixed(1).replace('.', ',') : '—'} />
        <KPICard label={`Testes em ${nomeMes(lastTestes?.mes)}`} value={lastTestes?.valor ?? '—'} icon="📦" accent="yellow"
          delta={<Delta value={pctDelta(lastTestes?.valor, prevTestes?.valor)} />} />
        <KPICard label={`SLA ${nomeMes(lastSla?.mes)}`} unit="dias" icon="🎯" accent="green"
          value={lastSla ? Math.round(lastSla.dias) : '—'}
          delta={<Delta value={slaMesDelta == null ? null : -slaMesDelta} suffix=" d" />} />
      </div>

      <div className="g-eng__charts">
        <Card title="Testes por mês" subtitle={`Total acumulado: ${totalYTD} testes em ${new Date().getFullYear()}`}>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartTestes} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={36} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="valor" fill="var(--brand-blue)" radius={[6, 6, 0, 0]} maxBarSize={50}>
                  <LabelList dataKey="valor" position="top" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--text)' }} />
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
            <div style={{ height: Math.max(180, reprovacoes.motivos.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reprovacoes.motivos} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--text-2)' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="motivo" tickLine={false} axisLine={false} width={220}
                    tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey="qtd" fill="var(--red)" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    <LabelList dataKey="qtd" position="right" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--text)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <style>{`
        .g-eng__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
        .g-eng__title { font-size: 22px; font-weight: 800; color: var(--text); }
        .g-eng__meta { display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-3); }
        .g-eng__kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
        .g-eng__charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .g-eng__reasons { margin-top: 14px; }
        .g-retry { font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); }
        .g-retry:hover { background: var(--border); color: var(--text); }
        .g-status { display: flex; align-items: center; gap: 10px; padding: 40px; color: var(--text-2); font-size: 13px; }
        .g-status--err { color: var(--red); flex-wrap: wrap; }
        @media (max-width: 1000px) { .g-eng__kpis { grid-template-columns: repeat(2, 1fr); } .g-eng__charts { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

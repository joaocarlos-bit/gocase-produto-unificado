// Gestão › Engenharia — portado do dash-produto (loadEngenhariaFromSheets).
// 4 KPIs (Total testes YTD, SLA médio, Testes do mês, SLA do mês) + 2 gráficos
// (barras de testes/mês, linha de SLA com meta ≤7 dias). Fonte: planilha
// lançamentos, aba "Mês" (gid 975326169) via gviz.

import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { Card } from '../../components/Card';
import { KPICard, Delta } from '../../components/KPICard';
import { loadSheetViaJSONP, normalizeMes, GESTAO_CONFIG } from '../../data/gviz';

interface TesteRow { mes: string; valor: number; }
interface SlaRow { mes: string; dias: number; }

const MES_NOME: Record<string, string> = {
  Jan: 'Janeiro', Fev: 'Fevereiro', Mar: 'Março', Abr: 'Abril', Mai: 'Maio', Jun: 'Junho',
  Jul: 'Julho', Ago: 'Agosto', Set: 'Setembro', Out: 'Outubro', Nov: 'Novembro', Dez: 'Dezembro',
};
const nomeMes = (key?: string) => MES_NOME[(key || '').split('/')[0]] || (key || '').split('/')[0];

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; testes: TesteRow[]; sla: SlaRow[]; updatedAt: string };

export function Engenharia() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const rows = await loadSheetViaJSONP({
          sheetId: GESTAO_CONFIG.sheets.lancamentos,
          colNames: ['Mês', 'C1', 'C2', 'C3', 'C4'],
          gid: GESTAO_CONFIG.sheets.engenhariaGid,
        });

        const seenTestes = new Map<string, number>();
        const seenSla = new Map<string, number>();
        rows.forEach((r) => {
          const mes = normalizeMes(String(r['Mês'] || '').trim());
          if (!mes || !/^[A-Za-zÀ-ÿ]{3}\/\d{2}$/.test(mes)) return;
          if (!seenTestes.has(mes)) {
            const testes = parseInt(String(r['C1'] || '').replace(/[^\d]/g, '')) || 0;
            seenTestes.set(mes, testes);
          }
          if (!seenSla.has(mes)) {
            for (const k of ['C1', 'C2', 'C3', 'C4']) {
              const v = parseFloat(String(r[k] || '').replace(',', '.').replace(/[^\d.]/g, ''));
              if (!isNaN(v) && v >= 1 && v <= 90 && v !== seenTestes.get(mes)) {
                seenSla.set(mes, v);
                break;
              }
            }
          }
        });

        const testes = [...seenTestes.entries()].map(([mes, valor]) => ({ mes, valor }));
        const sla = [...seenSla.entries()].map(([mes, dias]) => ({ mes, dias }));
        if (!testes.length) throw new Error('Sem dados na aba');
        if (cancelled) return;
        setState({ kind: 'ready', testes, sla, updatedAt: new Date().toLocaleString('pt-BR') });
      } catch (e: any) {
        if (cancelled) return;
        setState({ kind: 'error', message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (state.kind === 'loading') {
    return <div className="g-status"><span className="spinner" /> Carregando dados de Engenharia…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="g-status g-status--err">
        ⚠ Erro ao carregar: {state.message}
        <button className="g-retry" onClick={() => setReloadKey((k) => k + 1)}>↺ Tentar de novo</button>
      </div>
    );
  }

  const { testes, sla, updatedAt } = state;
  const totalYTD = testes.reduce((s, d) => s + d.valor, 0);
  const slaVals = sla.map((d) => d.dias);
  const slaMedia = slaVals.length ? slaVals.reduce((a, b) => a + b, 0) / slaVals.length : null;
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
  const chartSla = sla.map((d) => ({ mes: d.mes, dias: d.dias }));

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
        <Card title="Testes por mês" subtitle={`Total acumulado: ${totalYTD} testes em 2026`}>
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

      <style>{`
        .g-eng__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
        .g-eng__title { font-size: 22px; font-weight: 800; color: var(--text); }
        .g-eng__meta { display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-3); }
        .g-eng__kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
        .g-eng__charts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .g-retry { font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); }
        .g-retry:hover { background: var(--border); color: var(--text); }
        .g-status { display: flex; align-items: center; gap: 10px; padding: 40px; color: var(--text-2); font-size: 13px; }
        .g-status--err { color: var(--red); flex-wrap: wrap; }
        @media (max-width: 1000px) { .g-eng__kpis { grid-template-columns: repeat(2, 1fr); } .g-eng__charts { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

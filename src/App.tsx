import { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { Sidebar, type ScreenId } from './components/Sidebar';
import { Placeholder } from './screens/Placeholder';
import { Engenharia } from './screens/gestao/Engenharia';
import { Waitlists } from './screens/gestao/Waitlists';
import { LancamentosGestao } from './screens/gestao/LancamentosGestao';
import { Prazo } from './screens/gestao/Prazo';
import { Projetos } from './screens/gestao/Projetos';
import { Pulso } from './screens/Pulso';
import { Lancamentos } from './screens/Lancamentos';
import { Produto } from './screens/Produto';
import { Portfolio } from './screens/Portfolio';
import { Estoque } from './screens/Estoque';
import { Canais } from './screens/Canais';
import { Clientes } from './screens/Clientes';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { loadProcessedData, loadSalesBySku } from './data/loader';
import { applyChannelFilter, applyChannelFilterToSales } from './data/aggregates';
import type { CanalGrupo, ProcessedData, SalesBySkuPayload } from './data/types';

type AppState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ProcessedData; sales: SalesBySkuPayload };

export function App() {
  const [state, setState] = useState<AppState>({ kind: 'loading' });
  const [screen, setScreen] = useState<ScreenId>('g_waitlists');
  const [navOpen, setNavOpen] = useState<boolean>(() => localStorage.getItem('nav_open') !== '0');
  // Default: só D2C — KPIs principais ficam limpos de brindes/B2B/lojas.
  // Aba "Canais" ignora esse filtro (mostra sempre todos os canais).
  const [canais, setCanais] = useState<CanalGrupo[]>(['D2C']);

  useEffect(() => {
    Promise.all([loadProcessedData(), loadSalesBySku()])
      .then(([data, sales]) => setState({ kind: 'ready', data, sales }))
      .catch((e) => setState({ kind: 'error', message: String(e.message || e) }));
  }, []);

  // Hooks DEVEM rodar incondicionalmente em toda render. Calcula filtered* aqui;
  // se ainda estiver loading, retorna null (não vai ser usado).
  const dataRaw = state.kind === 'ready' ? state.data : null;
  const salesRaw = state.kind === 'ready' ? state.sales : null;
  const filteredData = useMemo(
    () => (dataRaw ? applyChannelFilter(dataRaw, canais) : null),
    [dataRaw, canais],
  );
  const filteredSales = useMemo(
    () => (salesRaw ? applyChannelFilterToSales(salesRaw, canais) : null),
    [salesRaw, canais],
  );

  if (state.kind === 'loading') {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Carregando snapshot…</p>
        <style>{`
          .app-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            gap: 12px;
            color: var(--text-2);
            font-size: 13px;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--border);
            border-top-color: var(--teal);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ padding: 32, color: 'var(--red)' }}>
        <strong>Falha ao carregar dados.</strong>
        <pre style={{ marginTop: 12, fontSize: 12 }}>{state.message}</pre>
      </div>
    );
  }

  const { data, sales } = state;
  if (!filteredData || !filteredSales) return null;
  return (
    <div className="app">
      <Header
        periodFrom={data.meta.period.from}
        periodTo={data.meta.period.to}
        collectedAt={data.meta.collectedAt}
        linhasCount={data.meta.linhasInPeriod}
        skusCount={data.meta.skusInPeriod}
        canais={canais}
        onChangeCanais={setCanais}
      />
      <div className="app__body">
        <Sidebar
          current={screen}
          onChange={setScreen}
          open={navOpen}
          onToggle={() => setNavOpen((o) => { localStorage.setItem('nav_open', o ? '0' : '1'); return !o; })}
        />
        <main className="app__main">
          {/* Performance — gocase-produto */}
          <ErrorBoundary key={screen} label={`Erro na tela: ${screen}`}>
            {screen === 'pulso' && <Pulso data={filteredData} />}
            {screen === 'lancamentos' && <Lancamentos data={filteredData} sales={filteredSales} />}
            {screen === 'produto' && <Produto data={filteredData} sales={filteredSales} />}
            {screen === 'portfolio' && <Portfolio data={filteredData} />}
            {screen === 'estoque' && <Estoque data={filteredData} />}
            {screen === 'canais' && <Canais data={data} sales={sales} />}
            {screen === 'clientes' && <Clientes />}
            {screen === 'roadmap' && <RoadmapScreen />}
            {/* Gestão — dash-produto (em migração) */}
            {screen === 'g_engenharia' && <Engenharia />}
            {screen === 'g_lancamentos' && <LancamentosGestao />}
            {screen === 'g_waitlists' && <Waitlists />}
            {screen === 'g_prazo' && <Prazo />}
            {screen === 'g_projetos' && <Projetos />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

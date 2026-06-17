# Gocase · Performance Dashboard v2

Redesign do dashboard de performance da squad `performance-produtos-gocase`.

> Substitui o `dashboard.html` monolítico (~11k linhas com patches v1→v26) por uma SPA modular React + TypeScript com data layer separado e roadmap de entregas visível na própria UI.

## Stack

- **Vite 5** + React 18 + TypeScript estrito
- **Recharts** para visualizações
- Dados estáticos: `public/data/processed-data.json` (snapshot do pipeline)
- Sem backend ainda — fallback offline. Backend proxy planejado em S4.

## Como rodar

```bash
npm install
npm run dev      # localhost:5173
npm run build    # produção em dist/
npm run preview  # serve o build

# Atualizar dados (puxa da Sheets API e regenera os JSONs em public/data/)
npm run refresh
```

> O `npm run refresh` substitui `public/data/processed-data.json` + `public/data/sales-by-sku.json`
> com dados frescos do Google Sheets. Roda em ~30 segundos.

## Estrutura

```
dashboard-v2/
├── public/data/processed-data.json   # snapshot do pipeline
├── src/
│   ├── main.tsx
│   ├── App.tsx                       # orquestrador + navegação
│   ├── styles/
│   │   ├── tokens.css                # design system Gocase
│   │   └── global.css
│   ├── data/
│   │   ├── types.ts                  # tipos canônicos
│   │   ├── loader.ts                 # fetch + cache
│   │   └── aggregates.ts             # totals/series/top/lançamentos
│   ├── lib/
│   │   └── format.ts                 # fmtBRL/fmtNum/fmtPct/ymLabel
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Nav.tsx
│   │   ├── KPICard.tsx
│   │   ├── Card.tsx
│   │   ├── Sparkline.tsx
│   │   ├── AlertsBanner.tsx          # detecção de sinais (S1)
│   │   └── Roadmap.tsx               # tabela de entregas
│   └── screens/
│       ├── Pulso.tsx                 # 🎯 Pulso — landing default
│       ├── Lancamentos.tsx           # 🚀 Lançamentos (Tipo A + B)
│       └── RoadmapScreen.tsx         # 🗺️ Roadmap dedicado
```

## Telas ativas

| Tab | Sprint | Conteúdo |
|---|---|---|
| 🎯 **Pulso** | S1 | Banner de alertas + 5 KPIs (período flexível) + Top 10 vs FC + Composição mensal por categoria |
| 🚀 **Lançamentos** | S2 | Filtros tipo/categoria/janela · cards de novas linhas (Tipo A) e drops de cor (Tipo B) com trajetória, vs FC, vs benchmark da categoria |
| 🗺️ **Roadmap** | S0 | Visão das entregas com progresso por sprint |

## Roadmap

Acessível sempre via aba dedicada 🗺️ Roadmap. Resumo:

- **S0 — Fundação** ✅ Setup, dados, design system, aba de Roadmap
- **S1 — Pulso** ✅ KPIs, Top 10, Composição, Alertas · 📋 Receita diária 90d
- **S2 — Lançamentos + Portfólio** ✅ Lançamentos completos · 📋 Calendário, pós-mortem, Portfólio
- **S3 — Estoque + Diário** 📋 Heatmap ABC×Giro, alertas, eventos diários
- **S4 — Hardening** 📋 Backend proxy, URL state, glossário, deploy CI/CD

## Definições adotadas (vindas da squad)

- **Lançamento** = nova linha (`typeA_newLines`) **OU** drop de cor (`typeB_extensions`) nos últimos 3 meses
- **Margem Bruta %** = (Ticket Médio − Custo) / Ticket Médio
- **Atingimento** = Realizado / Forecast − 1 (em %)

## Próximos passos imediatos

1. Validar com Sandro/Lara/Miguel/Caio se a IA dos cards do Pulso responde a pergunta semanal real
2. Banner de alertas (S1) — regra-base: variação >20% vs FC ou cobertura <7d
3. Tela Lançamentos (S2) — espelha a cadência quinzenal de Lara

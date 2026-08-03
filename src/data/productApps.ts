// Diretório central dos apps de produto (Product Apps).
// Fonte única de verdade — consumido pela Central de Links (tela) e pelo
// launcher "Product Apps" no topo à direita (estilo Google Apps).
// Pra adicionar um app, basta uma entrada aqui.

export interface ProductApp {
  title: string;
  url: string;
  description: string;
  icon: string;
  category: string;
}

export const PRODUCT_APPS: ProductApp[] = [
  {
    title: 'CTR Machine',
    url: 'https://ctrmachine-gocase.vercel.app/',
    description: 'Gerador de criativos competitivos — a partir do link de um concorrente, rebranda na identidade Gocase e gera variações de criativo.',
    icon: '🎯',
    category: 'Ferramentas',
  },
  {
    title: 'Calendário de Lançamentos',
    url: 'https://lancamentosgocase.vercel.app/',
    description: 'Galeria e calendário dos lançamentos Gocase 2026/2027 — visão de produtos por mês.',
    icon: '🗓️',
    category: 'Ferramentas',
  },
];

export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

// Organograma estático do time de Produto (Gestão › Alocação de Recurso).
// Não vem do Monday — a estrutura de squads/hierarquia foi informada
// manualmente e não muda com frequência. `aliases` cobre as variações de
// texto que o nome da pessoa pode assumir na coluna "Person"/"People" do
// Monday (nome completo, apelido, ou e-mail quando a conta não tem nome).

export interface TeamMember {
  key: string;
  name: string;
  role: string;
  squad: string;
  /** key do gestor direto, ou null para quem está no topo do organograma. */
  manager: string | null;
  aliases: string[];
}

export const TEAM: TeamMember[] = [
  // Diretoria
  { key: 'bruno-bastos', name: 'Bruno Bastos', role: 'Diretor de Produto', squad: 'Diretoria', manager: null, aliases: ['bruno bastos', 'antonio barbosa'] },
  { key: 'aurelio-furlan', name: 'Aurelio Furlan', role: 'Diretor', squad: 'Diretoria', manager: null, aliases: ['aurelio furlan'] },

  // Gerência / Coordenação — topo
  { key: 'silvia-scarabelot', name: 'Silvia Scarabelot', role: 'Gerente de Produto', squad: 'Desenvolvimento Produto Gocase', manager: null, aliases: ['silvia scarabelot'] },
  { key: 'joao-neto', name: 'João Neto', role: 'Coordenador de Projetos', squad: 'Projetos - Produto', manager: null, aliases: ['joão carlos de oliveira neto', 'joao carlos de oliveira neto', 'joão neto', 'joao neto'] },

  // Time da Silvia
  { key: 'ana-miyamatsu', name: 'Ana Miyamatsu', role: 'Especialista de Engenharia', squad: 'Engenharia Produto', manager: 'silvia-scarabelot', aliases: ['ana miyamatsu'] },
  { key: 'paloma-oliveira', name: 'Paloma Oliveira', role: 'Coordenadora de Produto', squad: 'Desenvolvimento Produto Gocase', manager: 'silvia-scarabelot', aliases: ['paloma bermudez', 'paloma oliveira'] },

  // Time da Paloma
  { key: 'bruna-mendes', name: 'Bruna Mendes', role: 'Team Leader', squad: 'Squad Térmicos e PET', manager: 'paloma-oliveira', aliases: ['bruna.mendes@gocase.com', 'bruna mendes', 'bruna'] },
  { key: 'camila-meneghello', name: 'Camila Meneghello', role: 'Designer Sênior', squad: 'Squad Têxtil - Mimos - B2B', manager: 'paloma-oliveira', aliases: ['camila meneghello', 'camila.galisa@gocase.com'] },
  { key: 'nayany-katayama', name: 'Nayany Katayama', role: 'Fashion Designer Senior', squad: 'Squad Viagem + Fitness', manager: 'paloma-oliveira', aliases: ['nayany katayama'] },

  // Squad Têxtil (reportam à Camila)
  { key: 'clara-sousa', name: 'Clara Sousa', role: 'Analista de Produto Jr', squad: 'Squad Têxtil - Mimos - B2B', manager: 'camila-meneghello', aliases: ['clara.sousa@gocase.com', 'clara sousa', 'clara'] },
  { key: 'eduarda', name: 'Eduarda', role: 'Assistente de Produto', squad: 'Squad Têxtil - Mimos - B2B', manager: 'camila-meneghello', aliases: ['eduarda', 'maria eduarda'] },

  // Squads coordenados pelo João Neto
  { key: 'emanuele-figueiredo', name: 'Emanuele Figueiredo', role: 'Estagiário Análise de Mercado', squad: 'Inteligência de Mercado', manager: 'joao-neto', aliases: ['emanuele correia estevão figueredo', 'emanuele correia estevao figueredo', 'emanuele figueiredo'] },
  { key: 'gessica-pinheiro', name: 'Gessica Pinheiro', role: 'Analista de Projetos Jr', squad: 'Processo Gocase', manager: 'joao-neto', aliases: ['antonia gessica lima pinheiro', 'gessica pinheiro', 'gessica'] },
  { key: 'artur-cajazeiras', name: 'Artur Cajazeiras', role: 'Analista de Desenvolvimento', squad: 'Processo Gocase', manager: 'joao-neto', aliases: ['artur sampaio cavalcanti cajazeiras', 'artur cajazeiras', 'artur'] },
  { key: 'rafi-mota', name: 'Rafi Mota', role: 'Designer Gráfico Jr', squad: 'Squad Waitlist', manager: 'joao-neto', aliases: ['rafí mota', 'rafi mota', 'rafi'] },
  { key: 'dimitra-carvalho', name: 'Dimitra Carvalho', role: 'Assistente de E-commerce', squad: 'Squad Waitlist', manager: 'joao-neto', aliases: ['dimitra elizabeth silveira carvalho', 'dimitra carvalho', 'dimitra'] },
];

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const ALIAS_TO_KEY = new Map<string, string>();
TEAM.forEach((m) => {
  ALIAS_TO_KEY.set(norm(m.name), m.key);
  m.aliases.forEach((a) => ALIAS_TO_KEY.set(norm(a), m.key));
});

/** Acha a key do TEAM correspondente a um texto de assignee do Monday
 *  (nome completo ou e-mail). Retorna null se a pessoa não está mapeada. */
export function matchTeamKey(mondayName: string): string | null {
  const n = norm(mondayName);
  const exact = ALIAS_TO_KEY.get(n);
  if (exact) return exact;

  // Fallback: alguns cadastros do Monday têm nome completo com sobrenomes
  // extras (ex.: nome de casada, cadeia de sobrenomes) que não batem 100%
  // com o alias cadastrado. Casa pelo maior alias que seja prefixo do nome
  // informado, desde que o alias tenha pelo menos duas palavras — evita
  // falso positivo de apelidos curtos de uma palavra só.
  let bestAlias = '';
  let bestKey: string | null = null;
  for (const [alias, key] of ALIAS_TO_KEY) {
    if (alias.includes(' ') && n.startsWith(alias + ' ') && alias.length > bestAlias.length) {
      bestAlias = alias;
      bestKey = key;
    }
  }
  return bestKey;
}

// Pessoas que já saíram do time e não devem aparecer na Alocação de Recurso,
// mesmo que ainda tenham atribuições antigas em itens do Monday.
const LEFT_TEAM = new Set(['carol estolano', 'carol'].map(norm));

export function hasLeftTeam(mondayName: string): boolean {
  return LEFT_TEAM.has(norm(mondayName));
}

export function teamMemberByKey(key: string): TeamMember | undefined {
  return TEAM.find((m) => m.key === key);
}

/** Cadeia de gestores (do mais próximo ao topo) de uma pessoa. */
export function managerChain(key: string): TeamMember[] {
  const chain: TeamMember[] = [];
  let cur = teamMemberByKey(key)?.manager;
  while (cur) {
    const m = teamMemberByKey(cur);
    if (!m) break;
    chain.push(m);
    cur = m.manager;
  }
  return chain;
}

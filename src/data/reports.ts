// Manifesto dos Relatórios (aba Gestão › Relatórios).
// Gerado a partir da pasta Drive "Relatórios" (snapshot 2026-06-23).
// Para atualizar: re-listar a pasta no Drive e regenerar este array.
// Os PDFs são servidos via EMBED do Drive (preview iframe) — a pasta precisa
// estar compartilhada com o time (@gocase) para o preview funcionar.

export const REPORTS_FOLDER_URL =
  'https://drive.google.com/drive/folders/1Rx1AbqLxdMdo_FBrEU5_eOfqLjFWzpsf';

export type ReportKind = 'pdf' | 'xlsx' | 'other';

export interface ReportFile {
  id: string;
  /** Título limpo (sem prefixo de data/extensão). */
  title: string;
  /** Categoria (= subpasta no Drive). */
  category: string;
  kind: ReportKind;
  /** Badge de data/período extraído do nome (ex.: "10/06", "Jan–Mai"). */
  badge?: string;
  sizeBytes: number;
  modifiedTime: string; // ISO
}

/** Ordem das categorias na tela. */
export const REPORT_CATEGORIES = ['Portfólio', 'Performance de Produtos', 'Canibalização'] as const;

export const REPORTS: ReportFile[] = [
  {
    id: '1voE_RAKNPIns0FsPj5sbtUHJB7h4j24E',
    title: 'Relatório de Portfólio YoY',
    category: 'Portfólio',
    kind: 'pdf',
    badge: 'Jan–Mai',
    sizeBytes: 667832,
    modifiedTime: '2026-06-23T12:56:36.673Z',
  },
  {
    id: '11mNxExsGjWKlqFCl7JyjqCBpYeilecwX',
    title: 'Performance Copa',
    category: 'Performance de Produtos',
    kind: 'pdf',
    badge: '10/06',
    sizeBytes: 528292,
    modifiedTime: '2026-06-23T13:02:36.362Z',
  },
  {
    id: '1rKTbitA8_N75XrA6-kevgGuI5hTiLf_w',
    title: 'Performance Mala Bold',
    category: 'Performance de Produtos',
    kind: 'pdf',
    badge: '10/06',
    sizeBytes: 94540,
    modifiedTime: '2026-06-23T12:59:56.311Z',
  },
  {
    id: '1cJPBOKToHOIiGFmK3gJ_QCo0u_n_UefG',
    title: 'Precificação e Performance · Linha Care',
    category: 'Performance de Produtos',
    kind: 'pdf',
    badge: '10/06',
    sizeBytes: 60707,
    modifiedTime: '2026-06-23T13:04:02.805Z',
  },
  {
    id: '1IheDjF5-eRZ59ujFVFA9wEYuTQko85yZ',
    title: 'Precificação · Linha Fitness',
    category: 'Performance de Produtos',
    kind: 'pdf',
    badge: '10/06',
    sizeBytes: 67710,
    modifiedTime: '2026-06-23T13:01:14.729Z',
  },
  {
    id: '1pjK3t9mIPcTiIPym-RLyacJyficFpjjB',
    title: 'Canibalização Portfólio',
    category: 'Canibalização',
    kind: 'pdf',
    sizeBytes: 452967,
    modifiedTime: '2026-06-23T12:57:03.356Z',
  },
  {
    id: '1vO8tl6YteTIZLSc8awlvV9HYC8F8LYNN',
    title: 'Canibalização Portfólio · Planilha',
    category: 'Canibalização',
    kind: 'xlsx',
    sizeBytes: 42958,
    modifiedTime: '2026-06-13T17:36:05Z',
  },
];

export const reportPreviewUrl = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
export const reportViewUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const reportDownloadUrl = (id: string) => `https://drive.google.com/uc?export=download&id=${id}`;

/** Tipos compartilhados entre o pipeline de dados (scripts/) e o site (src/). */

export type StreamKind = 'hls' | 'youtube' | 'http' | 'other';
export type Status = 'online' | 'offline' | 'desconhecido';
export type Source = 'free-tv' | 'iptv-org';

export interface YouTubeRef {
  type: 'video' | 'channel' | 'handle' | 'other';
  /** ID do vídeo (11 chars) ou do canal (UC…). Ausente para handles. */
  id?: string;
  /** Pode ser incorporado com o embed oficial? */
  embeddable: boolean;
}

export interface Channel {
  /** Identificador estável, seguro para usar em URL e localStorage. */
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 em maiúsculas, ou "INT" para canais internacionais. */
  country: string;
  /** IDs de categoria do iptv-org (ex.: "news", "sports"). */
  categories: string[];
  /** Códigos de idioma ISO 639-3 (ex.: "por"). */
  languages: string[];
  logo?: string;
  url: string;
  kind: StreamKind;
  status: Status;
  /** Fontes em que o canal aparece; a primeira é a que forneceu o link. */
  sources: Source[];
  quality?: string;
  /** Marcado como sujeito a bloqueio geográfico pela fonte. */
  geo?: boolean;
  /** `false` = o servidor NÃO envia cabeçalhos CORS (o navegador bloqueia o hls.js). */
  cors?: boolean;
  /** O link exige User-Agent/Referer customizados, que o navegador não consegue enviar. */
  needsHeaders?: boolean;
  youtube?: YouTubeRef;
  /** Falhas SEGUIDAS no teste diário de links (ausente = 0). Zera quando o link responde. 1–2 = instável. */
  fails?: number;
  /** Quando o link foi testado pela última vez: minutos desde a época (UTC). Ausente = nunca testado. */
  checked?: number;
  /** Tempo até a primeira resposta do servidor no teste, em ms (medido nos EUA: é uma dica, não a experiência do usuário). */
  latency?: number;
  /** Maior resolução anunciada pela lista HLS (ex.: "1080p"), quando a lista traz variantes. */
  resolution?: string;
  /** Link HTTP que também responde por HTTPS com CORS: o player toca pela versão HTTPS, sem conteúdo misto. */
  httpsOk?: true;
}

export interface CountrySummary {
  code: string;
  count: number;
  online: number;
  /** Bandeira (emoji) do iptv-org (countries.json). Ausente = a fonte não tem. */
  flag?: string;
  /** Regiões do iptv-org (regions.json) a que o país pertence, entre as de shared/regions.ts. Pode ter mais de uma ou nenhuma. */
  regions?: string[];
}

export interface FacetCount {
  id: string;
  count: number;
}

export interface DataMeta {
  schema: 1;
  generatedAt: string;
  total: number;
  bySource: Record<Source, number>;
  byStatus: Record<Status, number>;
  byKind: Record<StreamKind, number>;
  /** Canais em que as duas fontes coincidiram (contados uma vez). */
  inBothSources: number;
  sources: { name: string; url: string }[];
}

export interface DataIndex {
  /** Países com guia de programação em data/epg/<PAÍS>.json (escrito pelo build-epg; ausente = nenhum). */
  epg?: string[];
  meta: DataMeta;
  countries: CountrySummary[];
  categories: FacetCount[];
  languages: FacetCount[];
}

/**
 * Forma do arquivo data/health.json: chave = hash curto da URL.
 * [status, falhas seguidas, minutos desde a época, cors, latência em ms (0 = sem medida), altura da maior variante (0 = sem dado), HTTPS ok (0/1)]
 * As três últimas posições são opcionais: arquivos antigos têm só as quatro primeiras.
 */
export type HealthEntry = [0 | 1 | 2, number, number, 0 | 1 | 2, number?, number?, (0 | 1)?];
export type HealthFile = Record<string, HealthEntry>;

/** O canal toca dentro do navegador (HTTPS + CORS) ou por embed oficial? */
export function isBrowserPlayable(ch: Channel): boolean {
  if (ch.kind === 'youtube') return ch.youtube?.embeddable === true;
  return ch.kind === 'hls' && ch.cors !== false && !ch.needsHeaders;
}

/** Um programa do guia: [início, fim, título, categoria?]. Horários em epoch UTC, em segundos. */
export type EpgEntry = [number, number, string, string?];

/** Arquivo data/epg/<PAÍS>.json: programação por id de canal (o mesmo `Channel.id` da grade). */
export interface EpgFile {
  /** ISO 8601 do momento em que o guia foi gerado. */
  generatedAt: string;
  channels: Record<string, EpgEntry[]>;
}

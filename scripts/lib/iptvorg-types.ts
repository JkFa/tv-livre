/** Subconjunto dos formatos da API do iptv-org (https://github.com/iptv-org/api) que usamos. */
export interface OrgChannel {
  id: string;
  name: string;
  alt_names?: string[];
  country: string;
  categories: string[];
  is_nsfw: boolean;
  closed: string | null;
  replaced_by?: string | null;
}
export interface OrgFeed {
  channel: string;
  id: string;
  name: string;
  is_main: boolean;
  languages: string[];
}
export interface OrgStream {
  channel: string | null;
  feed: string | null;
  title: string;
  url: string;
  quality: string | null;
  labels: string[];
  user_agent: string | null;
  referrer: string | null;
}
export interface OrgLogo {
  channel: string;
  feed: string | null;
  in_use: boolean;
  width: number;
  url: string;
}
export interface OrgBlock {
  channel: string;
  reason: string;
}
export interface OrgCountry {
  name: string;
  code: string;
  languages: string[];
  flag?: string;
}
export interface OrgRegion {
  code: string;
  name: string;
  countries: string[];
}
export interface OrgData {
  channels: OrgChannel[];
  feeds: OrgFeed[];
  streams: OrgStream[];
  logos: OrgLogo[];
  blocklist: OrgBlock[];
  countries: OrgCountry[];
  /** Opcional: sem ele os países só não ganham região. */
  regions?: OrgRegion[];
}

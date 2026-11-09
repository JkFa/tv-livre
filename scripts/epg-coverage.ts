/**
 * Mede quantos canais da nossa grade têm guia de programação no iptv-org (guides.json).
 *
 *   npx tsx scripts/epg-coverage.ts                       # BR + os 5 países com mais canais no ar (publicação atual)
 *   npx tsx scripts/epg-coverage.ts --data-dir public/data   # usa os dados locais (data:quick não testa links: use a publicação)
 *   npx tsx scripts/epg-coverage.ts --guides guides.json     # usa uma cópia local do guides.json (25 MB)
 *   npx tsx scripts/epg-coverage.ts --countries BR,US,MX     # escolhe os países
 *
 * "No ar" = status `online` nos dados lidos. Sai com código 2 se o Brasil tiver menos de 25% (ponto de parada do plano).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Channel, DataIndex } from '../shared/types.ts';
import { fetchJson } from './lib/fetch-source.ts';
import { coverageByCountry, guidesByChannel, type OrgGuide } from './lib/epg-guides.ts';

const SITE_URL = (process.env.SITE_URL ?? 'https://jkfa.github.io/tv-livre').replace(/\/$/, '');
const GUIDES_URL = 'https://iptv-org.github.io/api/guides.json';
const MIN_BR_PCT = 25;

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function loadData(): Promise<{ index: DataIndex; country: (code: string) => Promise<Channel[]> }> {
  const dir = opt('data-dir');
  if (dir) {
    return {
      index: JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as DataIndex,
      country: async (c) => JSON.parse(readFileSync(join(dir, 'countries', `${c}.json`), 'utf8')) as Channel[],
    };
  }
  return {
    index: await fetchJson<DataIndex>(`${SITE_URL}/data/index.json`),
    country: (c) => fetchJson<Channel[]>(`${SITE_URL}/data/countries/${c}.json`),
  };
}

const { index, country } = await loadData();
const guidesFile = opt('guides');
const guides = guidesFile
  ? (JSON.parse(readFileSync(guidesFile, 'utf8')) as OrgGuide[])
  : await fetchJson<OrgGuide[]>(GUIDES_URL, { timeoutMs: 600_000 });
const byChannel = guidesByChannel(guides);

const top = [...index.countries].filter((c) => c.code !== 'BR' && c.code !== 'INT').sort((a, b) => b.online - a.online).slice(0, 5).map((c) => c.code);
const codes = opt('countries')?.split(',') ?? ['BR', ...top];
const channels = (await Promise.all(codes.map(country))).flat();
const rows = coverageByCountry(channels, byChannel, codes);

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(`Publicação lida em ${index.meta.generatedAt} · guides.json com ${guides.length} entradas (${byChannel.size} canais)\n`);
console.log('| País | Canais na grade | No ar | No ar com guia | % | Sites coletores (canais no ar cobertos) |');
console.log('|---|---:|---:|---:|---:|---|');
for (const r of rows) {
  const sites = r.sites.slice(0, 6).map((s) => `${s.site} (${s.canais})`).join(', ') + (r.sites.length > 6 ? ` +${r.sites.length - 6}` : '');
  console.log(`| ${r.country} | ${pad(r.grade, 5)} | ${pad(r.online, 5)} | ${pad(r.onlineComGuia, 5)} | ${r.pct.toFixed(1)}% | ${sites || '—'} |`);
}
const br = rows.find((r) => r.country === 'BR');
if (br && br.pct < MIN_BR_PCT) {
  console.log(`\nPARE: cobertura do Brasil (${br.pct.toFixed(1)}%) abaixo de ${MIN_BR_PCT}% dos canais no ar.`);
  process.exitCode = 2;
}

/**
 * Pipeline de dados do TV Livre.
 *
 *   npm run data                 # baixa as fontes, testa os links e grava public/data/
 *   npm run data:quick           # sem testes de rede (status = desconhecido)
 *   tsx scripts/build-data.ts --reuse-health   # não testa links de vídeo: reaproveita o status da publicação anterior (execução só do EPG)
 *   tsx scripts/build-data.ts --limit 300            # testa só 300 links (depuração)
 *   tsx scripts/build-data.ts --freetv f.m3u8 --org-dir dir   # usa arquivos locais em vez de baixar
 *
 * Termina com código 1 (e NÃO grava nada) se alguma fonte estiver fora do ar ou
 * se o total de canais cair mais de 50% em relação à última publicação.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Channel, DataMeta, HealthEntry, HealthFile, Status } from '../shared/types.ts';
import { countryGeo } from '../shared/regions.ts';
import { fetchJson, fetchText } from './lib/fetch-source.ts';
import type { OrgData } from './lib/iptvorg-types.ts';
import type { Removals } from './lib/removals.ts';
import { canonCountry } from './lib/normalize.ts';
import { assemble, buildIndex, sortChannels, toPublicChannel } from './lib/pipeline.ts';
import {
  DEFAULT_PROBE,
  fromHealthEntry,
  healthFields,
  judge,
  probeBatch,
  probeYouTubeVideo,
  toHealthEntry,
  urlHealthKey,
  type BatchItem,
  type Judged,
} from './lib/probe.ts';

const FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
const ORG_API = 'https://iptv-org.github.io/api';
const SITE_URL = (process.env.SITE_URL ?? 'https://jkfa.github.io/tv-livre').replace(/\/$/, '');
const MAX_DROP = 0.5;
/** Chave extra no lote de testes para a versão HTTPS de um link HTTP. */
const HTTPS_SUFFIX = '#https';
const REUSE_MINUTES = Number(process.env.PROBE_REUSE_MINUTES ?? 360);

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const log = (...m: unknown[]) => console.log('[dados]', ...m);

async function loadSources(): Promise<{ freeTv: string; org: OrgData }> {
  const freetvFile = opt('freetv');
  const orgDir = opt('org-dir');
  if (freetvFile && orgDir) {
    log('lendo fontes locais', freetvFile, orgDir);
    const j = <T>(n: string) => JSON.parse(readFileSync(join(orgDir, `${n}.json`), 'utf8')) as T;
    return {
      freeTv: readFileSync(freetvFile, 'utf8'),
      org: {
        channels: j('channels'), feeds: j('feeds'), streams: j('streams'),
        logos: j('logos'), blocklist: j('blocklist'), countries: j('countries'),
        regions: existsSync(join(orgDir, 'regions.json')) ? j('regions') : undefined,
      },
    };
  }
  log('baixando Free-TV e iptv-org…');
  const [freeTv, channels, feeds, streams, logos, blocklist, countries] = await Promise.all([
    fetchText(FREE_TV_URL),
    fetchJson<OrgData['channels']>(`${ORG_API}/channels.json`),
    fetchJson<OrgData['feeds']>(`${ORG_API}/feeds.json`),
    fetchJson<OrgData['streams']>(`${ORG_API}/streams.json`),
    fetchJson<OrgData['logos']>(`${ORG_API}/logos.json`),
    fetchJson<OrgData['blocklist']>(`${ORG_API}/blocklist.json`),
    fetchJson<OrgData['countries']>(`${ORG_API}/countries.json`),
  ]);
  // Regiões só agrupam países na interface: se a API falhar, publica sem elas.
  const regions = await fetchJson<NonNullable<OrgData['regions']>>(`${ORG_API}/regions.json`).catch((err: unknown) => {
    log(`aviso: regiões indisponíveis (${err instanceof Error ? err.message : err}); os países ficam sem região`);
    return undefined;
  });
  return { freeTv, org: { channels, feeds, streams, logos, blocklist, countries, regions } };
}

/** Validação mínima: uma fonte "viva" mas vazia/quebrada também deve barrar a publicação. */
function validateSources(freeTv: string, org: OrgData): void {
  const problems: string[] = [];
  const freeCount = (freeTv.match(/^#EXTINF/gm) ?? []).length;
  if (freeCount < 500) problems.push(`Free-TV com só ${freeCount} entradas (esperado ≥ 500)`);
  if (org.channels.length < 5_000) problems.push(`iptv-org: ${org.channels.length} canais (esperado ≥ 5000)`);
  if (org.streams.length < 3_000) problems.push(`iptv-org: ${org.streams.length} streams (esperado ≥ 3000)`);
  if (org.countries.length < 200) problems.push(`iptv-org: ${org.countries.length} países (esperado ≥ 200)`);
  if (problems.length) throw new Error(`Fontes inconsistentes:\n - ${problems.join('\n - ')}`);
}

async function tryFetchPrevious<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SITE_URL}/${path}`, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    log(`aviso: não foi possível ler ${path} da publicação anterior (${err instanceof Error ? err.message : err})`);
    return null;
  }
}

async function main() {
  const { freeTv, org } = await loadSources();
  validateSources(freeTv, org);

  const removals = JSON.parse(readFileSync(resolve('config/removals.json'), 'utf8')) as Removals;
  const { channels: merged, stats } = assemble(freeTv, org, new Date(), removals);
  log(`candidatos: Free-TV ${stats.fromFreeTv} + iptv-org ${stats.fromIptvOrg}`);
  log(
    `excluídos: ${stats.excludedAdult} adultos, ${stats.excludedClosed} encerrados, ` +
      `${stats.excludedNoChannel} sem canal associado, ${stats.excludedInvalid} entradas inválidas, ${stats.excludedRemoved} removidos a pedido`,
  );
  log(`duplicatas removidas: ${stats.duplicatesByUrl} por URL, ${stats.duplicatesByName} por nome+país → ${merged.length} canais`);

  // ----- verificação de queda contra a publicação anterior -----
  const prevMeta = flag('ignore-previous') ? null : await tryFetchPrevious<{ meta: DataMeta }>('data/index.json');
  const prevTotal = prevMeta?.meta?.total;
  if (prevTotal && merged.length < prevTotal * (1 - MAX_DROP)) {
    throw new Error(
      `Total de canais caiu de ${prevTotal} para ${merged.length} (> ${MAX_DROP * 100}%). Publicação abortada.`,
    );
  }
  log(prevTotal ? `total anterior: ${prevTotal} → agora ${merged.length}` : 'sem publicação anterior para comparar');

  // ----- teste de links -----
  // --reuse-health: não testa nenhum link (como --no-probe), mas mantém o status da publicação anterior
  const noNewProbes = flag('reuse-health');
  const prevHealth: HealthFile = (flag('no-probe') ? null : await tryFetchPrevious<HealthFile>('data/health.json')) ?? {};
  const nowMs = Date.now();
  const judged = new Map<string, Judged>(); // por id
  const newHealth: HealthFile = {};
  const toProbe: (BatchItem & { id: string })[] = [];
  const probeLimit = Number(opt('limit') ?? Infinity);

  for (const m of merged) {
    const hk = urlHealthKey(m.url);
    const prev = prevHealth[hk];
    const probeable = (m.kind === 'hls' || m.kind === 'http' || (m.kind === 'other' && m.url.startsWith('https:'))) && !flag('no-probe');
    if (m.kind === 'youtube' || !probeable) continue;
    const fresh = prev && (noNewProbes || nowMs / 60_000 - prev[2] < REUSE_MINUTES) && (noNewProbes || m.kind !== 'other');
    if (fresh) {
      judged.set(m.id, fromHealthEntry(prev));
      newHealth[hk] = prev;
    } else if (!noNewProbes && toProbe.length < probeLimit) {
      toProbe.push({ key: m.id, id: m.id, url: m.url, kind: m.kind, headers: m.probeHeaders });
      // link HTTP: a página é HTTPS, então o player tenta primeiro o mesmo endereço por HTTPS. Testamos essa versão também:
      // se ela responde com CORS, o canal toca no navegador sem conteúdo misto.
      if (/^http:/i.test(m.url)) toProbe.push({ key: `${m.id}${HTTPS_SUFFIX}`, id: m.id, url: m.url.replace(/^http:/i, 'https:'), kind: 'hls', headers: m.probeHeaders });
    }
  }
  log(`links a testar: ${toProbe.length} (reaproveitados do histórico: ${judged.size})`);

  const kindUpgrade = new Map<string, Channel['kind']>();
  if (toProbe.length) {
    const t0 = Date.now();
    const outcomes = await probeBatch(toProbe, { ...DEFAULT_PROBE, siteOrigin: new URL(SITE_URL).origin }, (d, t) =>
      log(`  testados ${d}/${t} (${Math.round((Date.now() - t0) / 1000)}s)`),
    );
    const byId = new Map(merged.map((m) => [m.id, m]));
    for (const [key, outcome] of outcomes) {
      if (key.endsWith(HTTPS_SUFFIX)) continue;
      const id = key;
      const m = byId.get(id)!;
      const hk = urlHealthKey(m.url);
      const j = judge(outcome, prevHealth[hk]);
      const viaHttps = outcomes.get(`${id}${HTTPS_SUFFIX}`);
      if (viaHttps?.ok && viaHttps.cors === true) j.httpsOk = true;
      judged.set(id, j);
      newHealth[hk] = toHealthEntry(j, nowMs) as HealthEntry;
      if (outcome.kind && outcome.kind !== m.kind) kindUpgrade.set(id, outcome.kind);
    }
  }

  // YouTube: só vídeos podem ser verificados (oEmbed)
  const ytStatus = new Map<string, { status: Status; embeddable: boolean }>();
  if (!flag('no-probe')) {
    const vids = merged.filter((m) => m.kind === 'youtube' && m.youtube?.type === 'video' && m.youtube.id);
    let i = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let m = vids[i++]; m; m = vids[i++]) ytStatus.set(m.id, await probeYouTubeVideo(m.youtube!.id!));
      }),
    );
    log(`vídeos do YouTube verificados: ${ytStatus.size}`);
  }

  // ----- monta saída -----
  const channels: Channel[] = merged.map((m) => {
    const j = judged.get(m.id);
    const yt = ytStatus.get(m.id);
    const status: Status = yt?.status ?? j?.status ?? 'desconhecido';
    const pub = toPublicChannel(
      { ...m, kind: kindUpgrade.get(m.id) ?? m.kind, ...(j && j.cors === false ? { cors: false } : {}) },
      status,
    );
    if (j && !yt) Object.assign(pub, healthFields(j, newHealth[urlHealthKey(m.url)]?.[2]));
    if (yt && pub.youtube) pub.youtube = { ...pub.youtube, embeddable: pub.youtube.embeddable && yt.embeddable };
    return pub;
  });

  const generatedAt = new Date().toISOString();
  const { index, byCountry } = buildIndex(sortChannels(channels), generatedAt, [
    { name: 'Free-TV/IPTV', url: 'https://github.com/Free-TV/IPTV' },
    { name: 'iptv-org/iptv', url: 'https://github.com/iptv-org/iptv' },
  ], countryGeo({
    // mesma unificação de códigos dos canais (o iptv-org chama o Reino Unido de "UK")
    countries: org.countries.map((c) => ({ ...c, code: canonCountry(c.code) })),
    regions: (org.regions ?? []).map((r) => ({ ...r, countries: r.countries.map(canonCountry) })),
  }));

  const out = resolve(opt('out') ?? 'public/data');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'countries'), { recursive: true });
  writeFileSync(join(out, 'index.json'), JSON.stringify(index));
  for (const [code, list] of byCountry) writeFileSync(join(out, 'countries', `${code}.json`), JSON.stringify(list));
  // mantém histórico dos links que ainda existem
  for (const m of merged) {
    const hk = urlHealthKey(m.url);
    if (!newHealth[hk] && prevHealth[hk]) newHealth[hk] = prevHealth[hk];
  }
  writeFileSync(join(out, 'health.json'), JSON.stringify(newHealth));

  const { meta } = index;
  log(`pronto → ${out}`);
  log(`total ${meta.total} | fontes ${JSON.stringify(meta.bySource)} (em ambas: ${meta.inBothSources})`);
  log(`status ${JSON.stringify(meta.byStatus)} | tipo ${JSON.stringify(meta.byKind)}`);
  log(`países: ${index.countries.length}`);
}

main().catch((err) => {
  console.error('\n[dados] ERRO:', err instanceof Error ? err.message : err);
  process.exit(1);
});

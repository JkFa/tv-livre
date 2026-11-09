/**
 * Guia de programação (EPG) do TV Livre. Opcional: qualquer falha aqui vira aviso, nunca bloqueia a publicação.
 *
 *   tsx scripts/build-epg.ts plan    # escolhe os canais com guia e escreve .cache/epg/channels.xml + plan.json
 *   tsx scripts/build-epg.ts convert # XMLTV (.cache/epg/guide.xml) → public/data/epg/<PAÍS>.json
 *   tsx scripts/build-epg.ts run --epg-dir DIR   # plan + coleta com o iptv-org/epg em DIR + convert
 *
 * Opções: --data-dir public/data · --guides guides.json (cópia local) · --countries BR,US · --out public/data/epg
 *         --work .cache/epg · --xmltv arquivo · --previous-dir DIR (guia anterior; padrão: o site publicado)
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Channel, DataIndex, EpgEntry, EpgFile } from '../shared/types.ts';
import { fetchJson } from './lib/fetch-source.ts';
import { buildCountryFile, BEHIND_H } from './lib/epg-compact.ts';
import { guidesByChannel, type OrgGuide } from './lib/epg-guides.ts';
import { channelsXml, planGuides, type PlanItem } from './lib/epg-plan.ts';
import { parseXmltv } from './lib/xmltv.ts';

const SITE_URL = (process.env.SITE_URL ?? 'https://jkfa.github.io/tv-livre').replace(/\/$/, '');
const GUIDES_URL = 'https://iptv-org.github.io/api/guides.json';
const MAX_AGE_H = 48;

interface EpgConfig {
  paises: string[];
  sites: string[];
  dias: number;
  conexoes: number;
  timeoutRequisicaoMs: number;
  timeoutTotalMinutos: number;
}

const args = process.argv.slice(2);
const cmd = args[0] ?? 'run';
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const config = JSON.parse(readFileSync(resolve('config/epg.json'), 'utf8')) as EpgConfig;
const countries = opt('countries')?.split(',') ?? config.paises;
const dataDir = resolve(opt('data-dir') ?? 'public/data');
const work = resolve(opt('work') ?? '.cache/epg');
const outDir = resolve(opt('out') ?? join(dataDir, 'epg'));

const warnings: string[] = [];
const log = (...m: unknown[]) => console.log('[epg]', ...m);
function warn(msg: string) {
  warnings.push(msg);
  console.log(`[epg] aviso: ${msg}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=EPG::${msg}`);
}

async function plan(): Promise<PlanItem[]> {
  const guidesFile = opt('guides');
  const guides = guidesFile ? (JSON.parse(readFileSync(guidesFile, 'utf8')) as OrgGuide[]) : await fetchJson<OrgGuide[]>(GUIDES_URL, { timeoutMs: 600_000 });
  const index = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8')) as DataIndex;
  const known = new Set(index.countries.map((c) => c.code));
  const channels: Channel[] = [];
  for (const c of countries) {
    if (!known.has(c)) {
      warn(`país ${c} não existe na grade`);
      continue;
    }
    channels.push(...(JSON.parse(readFileSync(join(dataDir, 'countries', `${c}.json`), 'utf8')) as Channel[]));
  }
  const items = planGuides(channels, guidesByChannel(guides), countries, config.sites);
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'channels.xml'), channelsXml(items));
  writeFileSync(join(work, 'plan.json'), JSON.stringify(items));
  const bySite = new Map<string, number>();
  for (const i of items) bySite.set(i.site, (bySite.get(i.site) ?? 0) + 1);
  log(`plano: ${items.length} canais com guia em ${countries.join(', ')}; sites: ${[...bySite].map(([s, n]) => `${s} (${n})`).join(', ')}`);
  return items;
}

/** Roda o grab do iptv-org/epg com tempo total limitado; devolve se terminou sem erro. */
function grab(epgDir: string): Promise<boolean> {
  return new Promise((done) => {
    const xmltv = join(work, 'guide.xml');
    rmSync(xmltv, { force: true });
    const child = spawn(
      'npm',
      ['run', 'grab', '--silent', '--', '--channels', join(work, 'channels.xml'), '--output', xmltv, '--days', String(config.dias),
        '--maxConnections', String(config.conexoes), '--timeout', String(config.timeoutRequisicaoMs)],
      { cwd: epgDir, stdio: 'inherit', detached: true },
    );
    const timer = setTimeout(() => {
      warn(`coleta passou de ${config.timeoutTotalMinutos} min e foi interrompida; usando o que já foi gravado`);
      try {
        process.kill(-child.pid!, 'SIGTERM');
      } catch {
        /* já terminou */
      }
    }, config.timeoutTotalMinutos * 60_000);
    child.on('error', (e) => {
      clearTimeout(timer);
      warn(`não foi possível iniciar a coleta: ${e.message}`);
      done(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) warn(`coleta terminou com código ${code}`);
      done(code === 0);
    });
  });
}

async function previousFile(country: string): Promise<EpgFile | null> {
  try {
    const dir = opt('previous-dir');
    const raw = dir
      ? existsSync(join(dir, `${country}.json`)) ? (JSON.parse(readFileSync(join(dir, `${country}.json`), 'utf8')) as EpgFile) : null
      : await fetchJson<EpgFile>(`${SITE_URL}/data/epg/${country}.json`, { retries: 1, timeoutMs: 30_000 });
    if (!raw?.channels || !raw.generatedAt) return null;
    return raw;
  } catch {
    return null;
  }
}

async function convert(items: PlanItem[]): Promise<void> {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const countryOf = new Map(items.map((i) => [i.id, i.country]));
  const xmltvPath = opt('xmltv') ?? join(work, 'guide.xml');
  let programmes: ReturnType<typeof parseXmltv>['programmes'] = [];
  if (existsSync(xmltvPath)) {
    const parsed = parseXmltv(readFileSync(xmltvPath, 'utf8'));
    programmes = parsed.programmes.filter((p) => countryOf.has(p.channel));
    log(`XMLTV: ${parsed.programmes.length} programas lidos, ${parsed.skipped} entradas quebradas ignoradas, ${programmes.length} nos nossos canais`);
  } else warn('a coleta não gerou XMLTV');

  mkdirSync(outDir, { recursive: true });
  const rows: string[] = [];
  for (const country of countries) {
    const mine = programmes.filter((p) => countryOf.get(p.channel) === country);
    const res = buildCountryFile(mine, now);
    const total = items.filter((i) => i.country === country).length;
    if (res.trimmed) warn(`${country}: janela cortada para ${res.aheadH} h à frente para caber em 150 KB gzip (${(res.gzipBytes / 1024).toFixed(0)} KB)`);
    if (res.overBudget) warn(`${country}: mesmo com a menor janela passou do orçamento de 150 KB gzip (${(res.gzipBytes / 1024).toFixed(0)} KB)`);

    // canais sem dado novo herdam o que ainda vale do guia anterior (se tiver menos de 48 h)
    const file = res.file;
    let inherited = 0;
    const prev = await previousFile(country);
    if (prev && (now.getTime() - Date.parse(prev.generatedAt)) / 3_600_000 <= MAX_AGE_H) {
      for (const [id, list] of Object.entries(prev.channels)) {
        if (file.channels[id] || countryOf.get(id) !== country) continue;
        const valid = (list as EpgEntry[]).filter((e) => e[1] > nowSec - BEHIND_H * 3600);
        if (valid.length) {
          file.channels[id] = valid;
          inherited++;
        }
      }
    }
    const n = Object.keys(file.channels).length;
    if (!n) {
      warn(`${country}: sem guia novo nem anterior válido; o site fica sem guia para o país`);
      rmSync(join(outDir, `${country}.json`), { force: true });
      rows.push(`| ${country} | ${total} | 0 | – | – | – |`);
      continue;
    }
    const json = inherited ? JSON.stringify(file) : res.json;
    writeFileSync(join(outDir, `${country}.json`), json);
    log(`${country}: ${n}/${total} canais (${inherited} herdados do guia anterior), janela +${res.aheadH} h, ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB bruto, ${(res.gzipBytes / 1024).toFixed(1)} KB gzip`);
    rows.push(`| ${country} | ${total} | ${n} | ${res.aheadH} h | ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB | ${(res.gzipBytes / 1024).toFixed(1)} KB |`);
  }
  // o site só pede o guia dos países que o índice lista (sem 404 à toa)
  if (outDir === join(dataDir, 'epg') && existsSync(join(dataDir, 'index.json'))) {
    const indexPath = join(dataDir, 'index.json');
    const idx = JSON.parse(readFileSync(indexPath, 'utf8')) as DataIndex;
    const available = countries.filter((c) => existsSync(join(outDir, `${c}.json`)));
    if (available.length) idx.epg = available;
    else delete idx.epg;
    writeFileSync(indexPath, JSON.stringify(idx));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## Guia de programação (EPG)\n\n| País | Canais com guia no plano | Canais com programação | Janela à frente | Bruto | Gzip |\n|---|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n${warnings.map((w) => `\n- ⚠️ ${w}`).join('')}\n`,
    );
  }
}

async function main() {
  const items = cmd === 'convert' ? (JSON.parse(readFileSync(join(work, 'plan.json'), 'utf8')) as PlanItem[]) : await plan();
  if (cmd === 'plan') return;
  if (cmd === 'run') {
    const epgDir = opt('epg-dir');
    if (!epgDir) throw new Error('informe --epg-dir (pasta do iptv-org/epg com as dependências instaladas)');
    if (items.length) await grab(resolve(epgDir));
    else warn('nenhum canal da grade tem guia nos países configurados');
  }
  await convert(items);
}

// O EPG é opcional: qualquer erro vira aviso e o processo termina com sucesso.
main().catch((err) => {
  warn(`guia não gerado (${err instanceof Error ? err.message : err})`);
  process.exit(0);
});

import { expect, test as base, type APIRequestContext, type Page, type Route } from '@playwright/test';
import type { Channel } from '../shared/types.ts';

export const COUNTER_URL = 'https://abacus.jasoncameron.dev/**';
export const COUNTER_VALUE = 128402;

/**
 * Todo teste roda com o contador simulado: nenhum teste conta ou lê o contador real
 * (o site também nunca conta em localhost nem sob automação).
 */
export const test = base.extend<{ counterCalls: string[] }>({
  counterCalls: async ({ context }, use) => {
    const calls: string[] = [];
    await context.route(COUNTER_URL, (route) => {
      calls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ value: COUNTER_VALUE }),
      });
    });
    await use(calls);
  },
  page: async ({ page, counterCalls }, use) => {
    void counterCalls;
    await use(page);
  },
});
export { expect };

export async function brChannels(request: APIRequestContext): Promise<Channel[]> {
  const res = await request.get('data/countries/BR.json');
  expect(res.ok(), 'data/countries/BR.json deve existir').toBeTruthy();
  return (await res.json()) as Channel[];
}

export const playableHls = (c: Channel) => c.kind === 'hls' && c.cors !== false && !c.needsHeaders;

export const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Buscar canal pelo nome' });

export async function search(page: Page, text: string) {
  await searchBox(page).fill(text);
}

/** Abre um canal pela busca, como o usuário faria. */
export async function openChannel(page: Page, name: string) {
  await search(page, name);
  await page.getByTestId('channel-row').filter({ hasText: name }).first().locator('.row-main').click();
  await expect(page).toHaveTitle(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

/**
 * Sintoniza por link direto e toca: a lista continua inteira (sem filtro de busca), então o canal tem vizinhos
 * para o anterior/próximo, o que não pode depender de quantos canais batem com o nome nos dados do dia.
 */
export async function tuneByLink(page: Page, ch: Pick<Channel, 'id' | 'name'>) {
  await page.goto(`./#/canal/BR/${encodeURIComponent(ch.id)}`);
  await page.getByRole('button', { name: /^Tocar / }).click();
  await expect(page).toHaveTitle(new RegExp(ch.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

/** Simula um deslizar horizontal sobre o elemento (eventos de toque sintéticos: funcionam em todos os motores). */
export async function swipe(page: Page, selector: string, dx: number, startXRatio = 0.5) {
  await page.evaluate(
    ({ selector, dx, startXRatio }) => {
      const el = document.querySelector(selector)!;
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width * startXRatio;
      const y0 = r.top + r.height / 2;
      const fire = (type: string, x: number) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        const t = { identifier: 1, target: el, clientX: x, clientY: y0, pageX: x, pageY: y0, screenX: x, screenY: y0 };
        const list = type === 'touchend' ? [] : [t];
        Object.defineProperty(ev, 'touches', { value: list });
        Object.defineProperty(ev, 'targetTouches', { value: list });
        Object.defineProperty(ev, 'changedTouches', { value: [t] });
        el.dispatchEvent(ev);
      };
      fire('touchstart', x0);
      fire('touchmove', x0 + dx / 2);
      fire('touchend', x0 + dx);
    },
    { selector, dx, startXRatio },
  );
}

/** Simula um canal fora do ar: o servidor responde 404 (com CORS liberado, como um servidor real faria). */
export const deadStream = (route: Route) =>
  route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, contentType: 'text/plain', body: 'not found' });

/** Servidor que responde, mas nunca entrega segmentos: o player fica "conectando" (sem erro). */
export const stalledStream = (route: Route) =>
  route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*' },
    contentType: 'application/vnd.apple.mpegurl',
    body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n',
  });

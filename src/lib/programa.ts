import type { Channel } from '../../shared/types.ts';

/**
 * Programa no ar agora, se o guia de programação (src/lib/epg.ts) existir. Esta tarefa não depende dele:
 * `import.meta.glob` devolve vazio quando o arquivo não existe e tudo funciona sem programa.
 */
interface Epg {
  agora?: (ch: Pick<Channel, 'id' | 'country'>, t?: number) => { title: string; stop: number } | null;
}
const mods = import.meta.glob<Epg>('./epg.ts', { eager: true });
const epg: Epg | undefined = Object.values(mods)[0];

export function programaAgora(ch: Pick<Channel, 'id' | 'country'>, t?: number): { title: string; stop: number } | null {
  try {
    return epg?.agora?.(ch, t) ?? null;
  } catch {
    return null;
  }
}

/** O guia existe neste build? (Ex.: "até o fim do programa" só aparece se houver guia.) */
export const temGuia = (): boolean => !!epg?.agora;

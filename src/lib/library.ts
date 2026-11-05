import { useCallback, useEffect, useState } from 'react';
import type { Channel } from '../../shared/types.ts';
import { readJson, writeJson } from './storage.ts';

/** Referência mínima guardada no navegador; o canal completo vem do arquivo do país. */
export interface ChannelRef {
  id: string;
  country: string;
}

const FAV_KEY = 'tvlivre:favoritos';
const RECENT_KEY = 'tvlivre:recentes';
const MAX_RECENT = 30;

function sanitize(v: unknown): ChannelRef[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is ChannelRef => !!x && typeof x.id === 'string' && typeof x.country === 'string',
  );
}

const sameRef = (a: ChannelRef, b: ChannelRef) => a.id === b.id && a.country === b.country;

function useStoredRefs(key: string) {
  const [refs, setRefs] = useState<ChannelRef[]>(() => sanitize(readJson<unknown>(key, [])));

  // mantém várias abas sincronizadas
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === key) setRefs(sanitize(readJson<unknown>(key, [])));
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [key]);

  const update = useCallback(
    (fn: (cur: ChannelRef[]) => ChannelRef[]) => {
      setRefs((cur) => {
        const next = fn(cur);
        writeJson(key, next);
        return next;
      });
    },
    [key],
  );
  return [refs, update] as const;
}

export function useFavorites() {
  const [favorites, update] = useStoredRefs(FAV_KEY);
  const isFavorite = useCallback((ch: Pick<Channel, 'id' | 'country'>) => favorites.some((f) => sameRef(f, ch)), [favorites]);
  const toggle = useCallback(
    (ch: Pick<Channel, 'id' | 'country'>) => {
      const ref = { id: ch.id, country: ch.country };
      update((cur) => (cur.some((f) => sameRef(f, ref)) ? cur.filter((f) => !sameRef(f, ref)) : [ref, ...cur]));
    },
    [update],
  );
  return { favorites, isFavorite, toggle };
}

export function useRecents() {
  const [recents, update] = useStoredRefs(RECENT_KEY);
  const push = useCallback(
    (ch: Pick<Channel, 'id' | 'country'>) => {
      const ref = { id: ch.id, country: ch.country };
      update((cur) => [ref, ...cur.filter((r) => !sameRef(r, ref))].slice(0, MAX_RECENT));
    },
    [update],
  );
  const clear = useCallback(() => update(() => []), [update]);
  return { recents, push, clear };
}

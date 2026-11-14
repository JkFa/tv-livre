/**
 * Sinal local do usuário: canais que NÃO abriram neste navegador. Ficam guardados por 7 dias (`tvlivre:falhas`) e descem na
 * lista para este usuário. Não é métrica global: nada sai do aparelho. Um canal que volta a tocar sai do registro na hora.
 */
import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage.ts';

export const LOCAL_FAILURES_KEY = 'tvlivre:falhas';
export const LOCAL_FAILURE_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_ENTRIES = 200;

export type FailureRecord = Record<string, number>;

/** Remove entradas vencidas ou inválidas e limita o tamanho (mantém as mais recentes). */
export function pruneFailures(raw: unknown, now: number): FailureRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const ok = Object.entries(raw as Record<string, unknown>).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] <= now + 60_000 && now - e[1] < LOCAL_FAILURE_TTL_MS && /^[A-Z]{2,3}\//.test(e[0]),
  );
  ok.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(ok.slice(0, MAX_ENTRIES));
}

export const withFailure = (rec: FailureRecord, key: string, now: number): FailureRecord => pruneFailures({ ...rec, [key]: now }, now);
export function withoutFailure(rec: FailureRecord, key: string): FailureRecord {
  if (!(key in rec)) return rec;
  const next = { ...rec };
  delete next[key];
  return next;
}

// ---- estado do navegador (uma cópia por página, sincronizada entre abas pelo evento `storage`) ----
let current: ReadonlyMap<string, number> | null = null;
const listeners = new Set<() => void>();

function load(): ReadonlyMap<string, number> {
  return new Map(Object.entries(pruneFailures(readJson<unknown>(LOCAL_FAILURES_KEY, {}), Date.now())));
}
function snapshot(): ReadonlyMap<string, number> {
  current ??= load();
  return current;
}
function commit(next: FailureRecord): void {
  writeJson(LOCAL_FAILURES_KEY, next);
  current = new Map(Object.entries(next));
  listeners.forEach((l) => l());
}
const asRecord = (): FailureRecord => Object.fromEntries(snapshot());

/** O canal (`PAÍS/id`) não abriu aqui. */
export function recordLocalFailure(key: string, now = Date.now()): void {
  commit(withFailure(asRecord(), key, now));
}
/** O canal tocou: deixa de contar como falha. */
export function clearLocalFailure(key: string): void {
  const rec = asRecord();
  const next = withoutFailure(rec, key);
  if (next !== rec) commit(next);
}

/** Leitura sem React (ex.: ordem da lista no início da sessão). */
export const readLocalFailures = (): ReadonlyMap<string, number> => snapshot();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== LOCAL_FAILURES_KEY) return;
    current = load();
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** Falhas locais atuais (atualiza quando um canal falha ou volta a tocar, inclusive em outra aba). */
export function useLocalFailures(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function resetLocalFailuresForTests(): void {
  current = null;
}

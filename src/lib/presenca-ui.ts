/** Ajudantes puros da interface de "assistindo agora" (sem React nem rede, para testar). */
import { useEffect, useRef, useState } from 'react';
import type { Channel } from '../../shared/types.ts';
import type { Resumo } from './presenca.ts';

/** Só mostramos a contagem de um canal a partir de 3 pessoas (o serviço já não envia menos; aqui é a segunda trava). */
export const MIN_PUBLICO = 3;
export const ANUNCIO_MIN_INTERVALO_MS = 30_000;

export const chaveTop = (pais: string, id: string): string => `${pais}/${id}`;

/** `País/id` → quantas pessoas assistem (só canais do top público). */
export function mapaMaisAssistidos(r: Resumo | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of r?.top ?? []) if (t.n >= MIN_PUBLICO) m.set(chaveTop(t.p, t.c), t.n);
  return m;
}

export interface EmAlta {
  channel: Channel;
  n: number;
}
/** "Em alta agora": os canais do top que a gente conhece (países já carregados), até `limite`. */
export function emAlta(r: Resumo | null, store: Readonly<Record<string, readonly Channel[] | undefined>>, limite = 5): EmAlta[] {
  const out: EmAlta[] = [];
  for (const t of r?.top ?? []) {
    if (t.n < MIN_PUBLICO) continue;
    const channel = store[t.p]?.find((c) => c.id === t.c);
    if (channel && channel.status !== 'offline') out.push({ channel, n: t.n });
    if (out.length >= limite) break;
  }
  return out;
}
/** Países do top que ainda não foram carregados (para a vitrine achar o canal). */
export function paisesFaltando(r: Resumo | null, store: Readonly<Record<string, unknown>>, limite = 5): string[] {
  const s = new Set<string>();
  for (const t of (r?.top ?? []).slice(0, limite)) if (!(t.p in store)) s.add(t.p);
  return [...s];
}

const nf = new Intl.NumberFormat('pt-BR');
export const fmtNum = (n: number): string => nf.format(n);

/** Texto para leitores de tela: "37 pessoas assistindo agora". */
export function textoAssistindo(n: number): string {
  return n === 1 ? '1 pessoa assistindo agora' : `${fmtNum(n)} pessoas assistindo agora`;
}
export function textoCanal(n: number): string {
  return `${fmtNum(n)} assistindo este canal`;
}

/** "9 de novembro de 2026" a partir de AAAA-MM-DD (o dia do recorde, no fuso de São Paulo). */
export function dataExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mes = meses[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : '';
}

/**
 * Devolve `texto`, mas troca no máximo uma vez a cada `minMs`: serve à região `aria-live`, para o leitor de tela
 * não anunciar cada oscilação (a tela mostra o número sempre atual).
 */
export function useAnuncio(texto: string, minMs: number = ANUNCIO_MIN_INTERVALO_MS): string {
  const [valor, setValor] = useState(texto);
  const ultimo = useRef(0);
  const alvo = useRef(texto);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alvo.current = texto;
    const aplicar = () => {
      timer.current = undefined;
      ultimo.current = Date.now();
      setValor(alvo.current);
    };
    if (timer.current) return; // já há uma troca agendada: ela usará o texto mais novo
    const espera = ultimo.current + minMs - Date.now();
    if (ultimo.current === 0 || espera <= 0) {
      if (alvo.current !== valor) aplicar();
      else ultimo.current ||= Date.now();
    } else if (alvo.current !== valor) {
      timer.current = setTimeout(aplicar, espera);
    }
  }, [texto, minMs, valor]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return valor;
}

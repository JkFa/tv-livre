import { useEffect, useRef, useState } from 'react';

interface Handlers {
  zap: (dir: 1 | -1) => void;
  shuffle: () => void;
  focusSearch: () => void;
  toggleHelp: () => void;
  tuneNumber: (n: number) => void;
  toggleTv: () => void;
}

export const sendPlayerCommand = (cmd: 'fullscreen' | 'mute' | 'pip' | 'playpause' | 'info'): void => {
  document.dispatchEvent(new CustomEvent('tvlivre:cmd', { detail: cmd }));
};

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Atalhos do desktop: ←/→/↑/↓ trocam de canal · Z zapeia · / busca · F tela cheia · M mudo · P PiP ·
 * Espaço pausa · 0–9 + Enter digitam o número do canal · ? mostra os atalhos.
 * Devolve o que o usuário está digitando (para mostrar na tela).
 */
export function useShortcuts(handlers: Handlers): string {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const [digits, setDigits] = useState('');
  const buf = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const clear = () => {
      clearTimeout(timer.current);
      buf.current = '';
      setDigits('');
    };
    const commit = () => {
      const n = Number(buf.current);
      clear();
      if (Number.isInteger(n) && n > 0) h.current.tuneNumber(n);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const key = e.key;

      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        buf.current = (buf.current + key).slice(0, 4);
        setDigits(buf.current);
        clearTimeout(timer.current);
        timer.current = setTimeout(commit, 1600);
        return;
      }
      if (key === 'Enter' && buf.current) {
        e.preventDefault();
        commit();
        return;
      }
      if (key === 'Escape' && buf.current) return clear();

      const onButton = !!(e.target as HTMLElement | null)?.closest?.('button, a, summary, [role=tab]');
      switch (key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          return h.current.zap(-1);
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          return h.current.zap(1);
        case 'z':
        case 'Z':
          return h.current.shuffle();
        case '/':
          e.preventDefault();
          return h.current.focusSearch();
        case '?':
          return h.current.toggleHelp();
        case 't':
        case 'T':
          return h.current.toggleTv();
        case 'f':
        case 'F':
          return sendPlayerCommand('fullscreen');
        case 'm':
        case 'M':
          return sendPlayerCommand('mute');
        case 'p':
        case 'P':
          return sendPlayerCommand('pip');
        case ' ':
          if (onButton) return;
          e.preventDefault();
          return sendPlayerCommand('playpause');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer.current);
    };
  }, []);

  return digits;
}

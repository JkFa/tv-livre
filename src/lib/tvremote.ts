import { useEffect, useRef } from 'react';
import { sendPlayerCommand } from './shortcuts.ts';
import { moveFocus, remoteKey } from './tvmode.ts';

interface Remote {
  enabled: boolean;
  /** Na tela inicial as setas só movem o foco entre os botões. */
  screen: 'home' | 'watch';
  guideOpen: boolean;
  /** O que o usuário está digitando (números de canal): enquanto houver, OK confirma o número. */
  digits: string;
  openGuide: () => void;
  closeGuide: () => void;
  zap: (dir: 1 | -1) => void;
  shuffle: () => void;
  toggleFavorite: () => void;
  openFilters: () => void;
  searchGuide: () => void;
}

const INTERACTIVE = 'button, a[href], input, select, summary, [role=tab]';

/**
 * Controle remoto no Modo TV (fase de captura: vem antes dos atalhos do desktop).
 *  Assistindo: ▲ ▼ ou CH+ CH- trocam de canal · OK, ◀ ou ▶ abrem a grade · 0–9 digitam o número ·
 *              vermelho favorita · verde zapeia · amarelo busca · azul filtros.
 *  Na grade:   setas movem o foco, OK escolhe, Voltar fecha.
 *  Na tela inicial: setas movem o foco, OK aciona.
 */
export function useTvRemote(r: Remote): void {
  const ref = useRef(r);
  useEffect(() => {
    ref.current = r;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = ref.current;
      if (!c.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = remoteKey(e);
      if (!k) return;
      const handled = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      const target = e.target as HTMLElement | null;
      const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));

      // folhas e diálogos: as setas andam dentro dele; Voltar fecha
      if (dialog) {
        if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
          if (typing && (k === 'left' || k === 'right')) return;
          moveFocus(k, dialog);
          return handled();
        }
        if (k === 'back') {
          dialog.close();
          return handled();
        }
        return;
      }

      // digitando na busca: ▲▼ saem do campo; Voltar também; o resto é do campo
      if (typing) {
        if (k === 'down' || k === 'up') {
          moveFocus(k, document.querySelector('.grade') ?? document);
          return handled();
        }
        if (k === 'back') {
          target.blur();
          return handled();
        }
        return;
      }

      if (k === 'chup' || k === 'chdown') {
        c.zap(k === 'chup' ? 1 : -1);
        return handled();
      }
      if (k === 'red') return (c.toggleFavorite(), handled());
      if (k === 'green') return (c.shuffle(), handled());
      if (k === 'yellow') return (c.searchGuide(), handled());
      if (k === 'blue') return (c.openFilters(), handled());
      if (k === 'info') return (sendPlayerCommand('info'), handled()); // mostra Agora / A seguir

      if (c.screen === 'home') {
        if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
          moveFocus(k, document.querySelector('.home') ?? document);
          return handled();
        }
        return; // OK aciona o botão com foco (Enter nativo); Voltar volta no histórico
      }

      if (c.guideOpen) {
        const grade = document.querySelector('.grade');
        if (k === 'back') {
          c.closeGuide();
          return handled();
        }
        if (k === 'up' || k === 'down' || k === 'left' || k === 'right') {
          if (grade) moveFocus(k, grade);
          return handled();
        }
        return; // OK: o Enter nativo aciona o botão com foco
      }

      // assistindo
      const problem = document.querySelector('.stage .problem');
      const inProblem = !!target?.closest('.problem');
      if (k === 'back') {
        if (inProblem) {
          target?.blur();
          return handled();
        }
        return;
      }
      if (inProblem && (k === 'up' || k === 'down' || k === 'left' || k === 'right')) {
        moveFocus(k, problem ?? document);
        return handled();
      }
      if (k === 'up' || k === 'down') {
        c.zap(k === 'up' ? 1 : -1);
        return handled();
      }
      if (k === 'left' || k === 'right') {
        c.openGuide();
        return handled();
      }
      if (k === 'ok') {
        if (c.digits) return; // útil para o atalho de números confirmar
        if (target?.closest(INTERACTIVE)) return; // botão com foco: Enter nativo
        const main = document.querySelector<HTMLElement>('.stage .play-big, .stage .btn-xl');
        if (main) {
          main.click();
          return handled();
        }
        const first = problem?.querySelector<HTMLElement>('button, a[href]');
        if (first) {
          first.focus();
          return handled();
        }
        c.openGuide();
        return handled();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}

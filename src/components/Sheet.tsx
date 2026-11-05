import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** "sheet" ancora embaixo em telas pequenas; "modal" centraliza. */
  variant?: 'sheet' | 'modal';
  footer?: ReactNode;
  id?: string;
}

/**
 * Folha sobre <dialog> nativo: foco preso, Esc fecha, fundo inerte e leitores de tela anunciam como diálogo.
 */
export function Sheet({ open, onClose, title, children, variant = 'sheet', footer, id }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={`sheet sheet-${variant}`}
      aria-labelledby={`${id ?? 'sheet'}-title`}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // clique no fundo
      }}
    >
      <div className="sheet-panel">
        <header className="sheet-head">
          <h2 id={`${id ?? 'sheet'}-title`}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={22} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

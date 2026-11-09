import { useEffect, useState } from 'react';
import { Copy, Send } from 'lucide-react';
import { copyText } from '../lib/clipboard.ts';
import { telegramUrl, whatsappUrl } from '../lib/share.ts';
import { Sheet } from './Sheet.tsx';

export interface ShareData {
  name: string;
  text: string;
  textNoLink: string;
  link: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: ShareData | null;
  /** Modo TV: ninguém toca em botão de WhatsApp na sala; mostra um QR code para abrir o link no celular. */
  tv: boolean;
}

/** QR code como SVG (módulos escuros viram um único <path>). Carrega a biblioteca só quando precisa. */
export function Qr({ value }: { value: string }) {
  const [svg, setSvg] = useState<{ size: number; d: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      const q = qrcode(0, 'M');
      q.addData(value);
      q.make();
      const n = q.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
      if (alive) setSvg({ size: n, d });
    });
    return () => {
      alive = false;
    };
  }, [value]);
  if (!svg) return <div className="qr qr-wait" aria-hidden="true" />;
  const m = 3; // margem ("zona silenciosa") em módulos
  return (
    <svg className="qr" role="img" aria-label="QR code do link do canal" viewBox={`${-m} ${-m} ${svg.size + m * 2} ${svg.size + m * 2}`} shapeRendering="crispEdges" data-testid="share-qr">
      <rect x={-m} y={-m} width={svg.size + m * 2} height={svg.size + m * 2} fill="#fff" />
      <path d={svg.d} fill="#000" />
    </svg>
  );
}

export function ShareSheet({ open, onClose, data, tv }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!data) return;
    const ok = await copyText(data.link);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2500);
  };
  return (
    <Sheet id="compartilhar" open={open} onClose={onClose} title={tv ? 'Abrir no celular' : 'Compartilhar canal'} variant="modal">
      {data && (
        <div className="share">
          {tv ? (
            <>
              <p>Aponte a câmera do celular para o código e abra {data.name} lá.</p>
              <Qr value={data.link} />
              <p className="share-link" data-testid="share-link">{data.link}</p>
            </>
          ) : (
            <>
              <p className="share-text" data-testid="share-text">{data.text}</p>
              <div className="btn-row">
                <a className="btn btn-accent" href={whatsappUrl(data.text)} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp">
                  <Send size={18} aria-hidden="true" /> WhatsApp
                </a>
                <a className="btn" href={telegramUrl(data.link, data.textNoLink)} target="_blank" rel="noopener noreferrer" data-testid="share-telegram">
                  <Send size={18} aria-hidden="true" /> Telegram
                </a>
                <button type="button" className="btn" onClick={copy} data-testid="share-copy">
                  <Copy size={18} aria-hidden="true" /> {copied ? 'Link copiado' : 'Copiar link'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

import { useEffect, useState } from 'react';
import { Smartphone, Unplug } from 'lucide-react';
import { formatarCodigo } from '../lib/remote/seguranca.ts';
import type { ControleRemoto } from '../lib/remote/useControleRemoto.ts';
import { formatarRestante } from '../lib/timer.ts';
import { Qr } from './ShareSheet.tsx';
import { Sheet } from './Sheet.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  controle: ControleRemoto;
  /** Modo TV: sem teclado de dicas; os botões ficam focáveis pelo controle remoto. */
  tv: boolean;
}

const quando = (agora: number, t: number) => {
  const s = Math.max(0, Math.round((agora - t) / 1000));
  return s < 10 ? 'agora' : s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`;
};

/** Controlar pelo celular: QR grande, código de 8 caracteres, celulares conectados e "Encerrar". */
export function ControleSheet({ open, onClose, controle: c, tv }: Props) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);
  const p = c.pareamento;
  const restante = p?.codigoExpiraEm ? p.codigoExpiraEm - agora : null;

  return (
    <Sheet id="controle" open={open} onClose={onClose} title="Controlar pelo celular" variant="modal">
      <div className="controle-sheet" data-testid="controle-sheet">
        {!c.ativo && !c.conectando && (
          <>
            <p>Use o celular como controle remoto deste TV Livre: trocar de canal, digitar o número, volume e mais. O vídeo continua tocando aqui.</p>
            {c.erro && <p className="controle-erro" role="alert" data-testid="controle-erro">{c.erro}</p>}
            <button type="button" className="btn btn-accent" onClick={() => void c.ativar()} data-testid="controle-ativar">
              <Smartphone size={18} aria-hidden="true" /> {c.erro ? 'Tentar de novo' : 'Ativar o controle'}
            </button>
          </>
        )}
        {c.conectando && <p role="status">Conectando ao servidor de mensagens…</p>}
        {c.ativo && p && (
          <>
            <p className="controle-passo">{tv ? 'Aponte a câmera do celular para o QR code' : '1. Aponte a câmera do celular para o QR code'}</p>
            <Qr value={p.link} />
            {p.codigo ? (
              <div className="controle-codigo" data-testid="controle-codigo-bloco">
                <p className="controle-passo">{tv ? 'Sem câmera? Abra o endereço no celular e digite o código' : '2. Sem câmera? No celular, abra o TV Livre, toque em Mais › Usar este celular como controle e digite o código'}</p>
                <span className="controle-cod num" data-testid="controle-codigo">{formatarCodigo(p.codigo)}</span>
                {restante !== null && restante > 0 && <span className="muted small" data-testid="controle-expira">Vale por mais {formatarRestante(restante)}</span>}
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => void c.novoCodigo()} data-testid="controle-novo-codigo">Gerar um código novo</button>
            )}
            <p className="muted small">Deixe esta aba aberta; o celular controla daqui. {!tv && 'Para tela cheia, aperte F11 uma vez no computador (o navegador não aceita tela cheia por comando remoto); o celular também liga um layout de janela inteira.'}</p>

            <div className="controle-lista" data-testid="controle-celulares">
              <h3>Celulares conectados ({c.celulares.length}/3)</h3>
              {c.celulares.length === 0 && <p className="muted small">Nenhum ainda.</p>}
              <ul>
                {c.celulares.map((cel) => (
                  <li key={cel.de}>
                    <span>📱 Celular conectado · {cel.nome} · {quando(agora, cel.visto)}</span>
                    <button type="button" className="btn btn-sm" onClick={() => void c.desconectar(cel.de)} aria-label={`Desconectar ${cel.nome}`} data-testid="controle-desconectar">
                      <Unplug size={16} aria-hidden="true" /> Desconectar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => void c.encerrar()} data-testid="controle-encerrar">Encerrar o controle</button>
              <button type="button" className="btn" onClick={c.desativar} data-testid="controle-desligar">Desligar</button>
            </div>
            <p className="muted small">"Encerrar" gera um QR e um código novos e desconecta todos os celulares. "Desligar" fecha a conexão.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

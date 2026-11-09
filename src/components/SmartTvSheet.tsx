import { Sheet } from './Sheet.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Número do canal atual ("07") ou null se nada está sintonizado. */
  numero: string | null;
}

/** Endereço curto para digitar no navegador da TV: sem https:// e sem barra final. */
export const enderecoCurto = (): string => `${window.location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '');

/** Sem Chromecast: o TV Livre tem Modo TV. O QR não serve aqui (a TV não lê o QR do celular), então: letras grandes. */
export function SmartTvSheet({ open, onClose, numero }: Props) {
  return (
    <Sheet id="smart-tv" open={open} onClose={onClose} title="Assistir na Smart TV" variant="modal">
      <div className="smarttv" data-testid="smarttv">
        <p>O TV Livre funciona no navegador da sua TV, com o <b>Modo TV</b> (tela cheia e controle remoto). Não precisa de Chromecast.</p>
        <ol>
          <li>Abra o navegador da TV.</li>
          <li>
            Digite o endereço:
            <span className="smarttv-url" data-testid="smarttv-url">{enderecoCurto()}</span>
          </li>
          <li>
            {numero ? 'Digite o número do canal no controle remoto:' : 'Digite o número do canal que quiser no controle remoto, por exemplo:'}
            <span className="smarttv-num num" data-testid="smarttv-num">{numero ?? '07'}</span>
          </li>
        </ol>
        <p className="muted small">O Modo TV liga sozinho em navegadores de TV (Samsung, LG, Google TV, Fire TV).</p>
      </div>
    </Sheet>
  );
}

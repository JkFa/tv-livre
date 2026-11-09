import { Cast, RotateCw, SkipForward, Square, Volume2, VolumeX } from 'lucide-react';
import type { Channel } from '../../shared/types.ts';
import { ChannelLogo } from './ChannelLogo.tsx';

export interface CastErro {
  title: string;
  text: string;
  detalhe?: string;
}

interface Props {
  canal: Channel;
  numero: string;
  /** Nome do aparelho (Chromecast); `null` quando é AirPlay ou tela remota (o sistema não informa). */
  aparelho: string | null;
  tipo: 'cast' | 'airplay' | 'remote';
  /** Só o Chromecast deixa o site controlar o volume do aparelho. */
  volume?: { valor: number; mudo: boolean; onVolume: (v: number) => void; onMudo: () => void };
  /** O canal atual não pode ser transmitido (HTTP, sem CORS…). */
  naoTransmite: boolean;
  erro: CastErro | null;
  onParar: () => void;
  onProximo: () => void;
  onTentar?: () => void;
}

/** Durante a transmissão o celular vira controle remoto: o canal em letras grandes e os controles do aparelho. */
export function CastPanel({ canal, numero, aparelho, tipo, volume, naoTransmite, erro, onParar, onProximo, onTentar }: Props) {
  const destino = tipo === 'airplay' ? 'AirPlay' : tipo === 'remote' ? 'outra tela' : (aparelho ?? 'a TV');
  return (
    <div className="cast-panel" data-testid="cast-panel" role="region" aria-label="Transmissão para a TV">
      <p className="cast-kicker"><Cast size={18} aria-hidden="true" /> Transmitindo para {destino}</p>
      <div className="cast-ch">
        <span className="cast-num num" aria-hidden="true">{numero}</span>
        <span className="cast-name">{canal.name}</span>
      </div>
      <span className="sr-only" role="status">{`Transmitindo ${canal.name}, canal ${numero}, para ${destino}`}</span>

      {(naoTransmite || erro) && (
        <div className="cast-erro" role="alert" data-testid="cast-erro">
          <ChannelLogo name={canal.name} src={canal.logo} size={28} />
          <b>{naoTransmite ? 'Esse canal não pode ser transmitido' : erro!.title}</b>
          <p>
            {naoTransmite
              ? 'Só canais HLS em HTTPS e com CORS liberado funcionam no Chromecast. Aperte Próximo para ir ao próximo canal que dá.'
              : erro!.text}
          </p>
          {erro?.detalhe && <p className="tech">Detalhe técnico: {erro.detalhe}</p>}
        </div>
      )}

      <div className="cast-ctl">
        {volume && (
          <>
            <button type="button" className="btn btn-icon" onClick={volume.onMudo} aria-pressed={volume.mudo} aria-label={volume.mudo ? 'Ativar o som da TV' : 'Silenciar a TV'}>
              {volume.mudo ? <VolumeX size={22} aria-hidden="true" /> : <Volume2 size={22} aria-hidden="true" />}
            </button>
            <input
              type="range" min={0} max={100} value={Math.round(volume.valor * 100)}
              onChange={(e) => volume.onVolume(Number(e.target.value) / 100)}
              aria-label="Volume da TV" className="cast-vol"
            />
          </>
        )}
      </div>
      <div className="btn-row">
        {(naoTransmite || erro) && (
          <button type="button" className="btn btn-accent" onClick={onProximo} data-testid="cast-proximo">
            <SkipForward size={18} aria-hidden="true" /> Próximo canal
          </button>
        )}
        {erro && onTentar && (
          <button type="button" className="btn" onClick={onTentar}><RotateCw size={18} aria-hidden="true" /> Tentar de novo</button>
        )}
        <button type="button" className="btn" onClick={onParar} data-testid="cast-parar">
          <Square size={18} aria-hidden="true" /> Parar transmissão
        </button>
      </div>
    </div>
  );
}

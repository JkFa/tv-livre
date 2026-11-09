import { useCallback, useEffect, useState, type RefObject } from 'react';

/** AirPlay (Safari no iPhone, iPad e Mac) e Remote Playback API: o <video> informa se há destino e se está transmitindo. */
type WebkitVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};
type RemoteVideo = HTMLVideoElement & {
  remote?: {
    state: 'disconnected' | 'connecting' | 'connected';
    watchAvailability: (cb: (available: boolean) => void) => Promise<number>;
    cancelWatchAvailability: (id?: number) => Promise<void>;
    prompt: () => Promise<void>;
    addEventListener: (t: string, l: () => void) => void;
    removeEventListener: (t: string, l: () => void) => void;
  };
};

export const temAirPlay = (): boolean => typeof window !== 'undefined' && 'WebKitPlaybackTargetAvailabilityEvent' in window;

/** `ligado`: só observa quando o canal está tocando. `disponivel` = há destino AirPlay na rede. */
export function useAirPlay(videoRef: RefObject<HTMLVideoElement | null>, ligado: boolean, key: string) {
  const [disponivel, setDisponivel] = useState(false);
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const v = videoRef.current as WebkitVideo | null;
    if (!v || !ligado || typeof v.webkitShowPlaybackTargetPicker !== 'function') return;
    const onAvail = (e: Event) => setDisponivel((e as Event & { availability?: string }).availability === 'available');
    const onWireless = () => setAtivo(!!v.webkitCurrentPlaybackTargetIsWireless);
    v.addEventListener('webkitplaybacktargetavailabilitychanged', onAvail);
    v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless);
    return () => {
      v.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvail);
      v.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', onWireless);
    };
  }, [videoRef, ligado, key]);
  const seletor = useCallback(() => (videoRef.current as WebkitVideo | null)?.webkitShowPlaybackTargetPicker?.(), [videoRef]);
  return { disponivel: ligado && disponivel, ativo: ligado && ativo, seletor };
}

/** Remote Playback API: só quando o canal toca por `src` nativo. Se o navegador recusar (comum com MSE), a opção some. */
export function useRemotePlayback(videoRef: RefObject<HTMLVideoElement | null>, nativoAtivo: boolean, key: string) {
  const [disponivel, setDisponivel] = useState(false);
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const r = (videoRef.current as RemoteVideo | null)?.remote;
    if (!r || !nativoAtivo) return;
    let id: number | undefined;
    let vivo = true;
    const onState = () => setAtivo(r.state === 'connected');
    r.watchAvailability((a) => vivo && setDisponivel(a)).then((n) => (id = n)).catch(() => vivo && setDisponivel(false));
    r.addEventListener('connect', onState);
    r.addEventListener('disconnect', onState);
    return () => {
      vivo = false;
      r.removeEventListener('connect', onState);
      r.removeEventListener('disconnect', onState);
      void r.cancelWatchAvailability(id).catch(() => undefined);
    };
  }, [videoRef, nativoAtivo, key]);
  const seletor = useCallback(() => (videoRef.current as RemoteVideo | null)?.remote?.prompt().catch(() => setDisponivel(false)), [videoRef]);
  return { disponivel: nativoAtivo && disponivel, ativo: nativoAtivo && ativo, seletor };
}

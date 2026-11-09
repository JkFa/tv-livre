import { useCallback, useEffect, useState } from 'react';
import { eBrave, eChromium } from './cast.ts';
import { abrirSeletor, assinar, carregarMidia, carregarSdk, definirMudo, definirVolume, FLAG_ATIVO, infoAtual, iniciarCast, parar, type InfoCast, type ResultadoCarga } from './castSdk.ts';
import type { CastMedia } from './cast.ts';
import { readString, writeString } from './storage.ts';

const INICIAL: InfoCast = { estado: 'disponivel', aparelho: null, volume: 1, mudo: false };

/**
 * Estado da transmissão para Chromecast/Google TV. O SDK só é baixado em `iniciar()` (toque do usuário) ou,
 * ao recarregar a página, se havia uma transmissão ativa (que o usuário mesmo começou) para retomar o painel.
 */
export function useCast(tv: boolean) {
  const suportado = !tv && eChromium();
  const brave = eBrave();
  const [info, setInfo] = useState<InfoCast>(INICIAL);
  const [sdkPronto, setSdkPronto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const preparar = useCallback(async (): Promise<boolean> => {
    const ok = await carregarSdk();
    if (!ok) {
      setFalhou(true);
      return false;
    }
    iniciarCast();
    setSdkPronto(true);
    setInfo(infoAtual());
    return true;
  }, []);

  useEffect(() => assinar(setInfo), []);
  useEffect(() => {
    // retoma o painel depois de recarregar: só se havia uma transmissão que o próprio usuário começou
    if (!suportado || readString(FLAG_ATIVO) !== '1') return;
    let vivo = true;
    void carregarSdk().then((ok) => {
      if (!vivo) return;
      if (!ok) return setFalhou(true);
      iniciarCast();
      setSdkPronto(true);
      setInfo(infoAtual());
    });
    return () => {
      vivo = false;
    };
  }, [suportado]);
  useEffect(() => {
    if (info.estado === 'conectado') writeString(FLAG_ATIVO, '1');
    else if (sdkPronto && info.estado !== 'conectando') writeString(FLAG_ATIVO, '0');
  }, [info.estado, sdkPronto]);

  const iniciar = useCallback(async () => {
    setFalhou(false);
    setCarregando(true);
    const ok = await preparar();
    setCarregando(false);
    if (ok) await abrirSeletor();
  }, [preparar]);

  const transmitir = useCallback((m: CastMedia): Promise<ResultadoCarga> => carregarMidia(m), []);

  return {
    suportado,
    brave,
    estado: info.estado,
    conectado: info.estado === 'conectado',
    aparelho: info.aparelho,
    volume: info.volume,
    mudo: info.mudo,
    sdkPronto,
    carregando,
    falhou,
    /** Há aparelho (ou ainda não sabemos): o botão pode aparecer. Depois do SDK, some se não houver nenhum. */
    botao: suportado && (!sdkPronto || info.estado !== 'sem-aparelho'),
    iniciar,
    transmitir,
    parar,
    definirVolume,
    definirMudo,
  };
}
export type CastController = ReturnType<typeof useCast>;

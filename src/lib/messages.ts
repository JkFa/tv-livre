import type { Cause } from './diagnose.ts';

export type UnsupportedWhy = 'format' | 'cors' | 'headers';

/** Mesmas causas, ditas para quem está transmitindo para a TV (o receptor do Chromecast é quem busca o vídeo). */
export const CAUSAS_CAST: Partial<Record<Cause, { title: string; text: string }>> = {
  cors: {
    title: 'A TV não conseguiu abrir esse canal',
    text: 'O receptor do Chromecast é mais exigente que o navegador (CORS) ou o servidor do canal está fora do ar. Tente outro canal.',
  },
  device: {
    title: 'A conexão com a TV falhou',
    text: 'O celular perdeu o contato com o aparelho. Confira se os dois estão na mesma rede Wi-Fi.',
  },
};

export const CAUSES: Record<Cause, { title: string; text: string }> = {
  offline: {
    title: 'Esse canal saiu do ar',
    text: 'O servidor disse que o endereço não existe mais ou está com defeito. Canais gratuitos mudam de endereço com frequência.',
  },
  geo: {
    title: 'Provável bloqueio por região',
    text: 'O servidor recusou o acesso. Muitos canais só abrem dentro do país de origem.',
  },
  cors: {
    title: 'O navegador bloqueou, ou o servidor não respondeu',
    text: 'Pode ser CORS (o servidor não deixa outros sites tocarem o vídeo) ou um servidor fora do ar. No VLC o mesmo link costuma funcionar.',
  },
  media: {
    title: 'Formato de vídeo que o navegador não toca',
    text: 'O navegador não conseguiu decodificar essa transmissão. Tente o VLC.',
  },
  timeout: {
    title: 'O canal demorou demais para responder',
    text: 'O servidor pode estar sobrecarregado, fora do ar ou bloqueando seu acesso.',
  },
  mixed: {
    title: 'Esse canal só transmite em HTTP',
    text: 'O navegador bloqueia vídeo sem criptografia dentro de uma página segura.',
  },
  device: {
    title: 'Você está sem internet',
    text: 'Sem conexão não dá para assistir. Seus favoritos continuam aqui; volte quando a rede voltar.',
  },
  unknown: {
    title: 'Não deu para tocar esse canal',
    text: 'A transmissão falhou e o navegador não disse por quê. Pode estar fora do ar ou bloqueada.',
  },
};

export const UNSUPPORTED: Record<UnsupportedWhy, { title: string; text: string }> = {
  format: {
    title: 'Formato que o navegador não entende',
    text: 'Esse link não é um HLS que o navegador consiga tocar. O VLC abre esse tipo de transmissão.',
  },
  cors: {
    title: 'O servidor não libera esse canal para outros sites',
    text: 'Nosso teste mostrou que o servidor não envia os cabeçalhos CORS e este navegador não toca HLS sozinho. No VLC costuma funcionar.',
  },
  headers: {
    title: 'O canal pede cabeçalhos que o navegador não envia',
    text: 'A origem exige um User-Agent ou Referer específico. Isso só dá em players como o VLC.',
  },
};

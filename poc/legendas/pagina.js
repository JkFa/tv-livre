// API para o script de medição (Playwright). Tudo acontece em Worker; a página só orquestra.
const worker = new Worker('/asr.worker.js', { type: 'module' });
const espera = (tipo) => new Promise((res, rej) => {
  const h = (ev) => {
    if (ev.data.tipo === 'erro') { worker.removeEventListener('message', h); rej(new Error(ev.data.mensagem)); }
    else if (ev.data.tipo === tipo) { worker.removeEventListener('message', h); res(ev.data); }
  };
  worker.addEventListener('message', h);
});

/** WAV PCM16 mono → Float32 em [-1, 1]. */
function lerWav(buf) {
  const dv = new DataView(buf);
  let pos = 12;
  while (pos < dv.byteLength - 8) {
    const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1), dv.getUint8(pos + 2), dv.getUint8(pos + 3));
    const tam = dv.getUint32(pos + 4, true);
    if (id === 'data') {
      const n = Math.min(tam, dv.byteLength - pos - 8) >> 1;
      const f = new Float32Array(n);
      for (let i = 0; i < n; i++) f[i] = dv.getInt16(pos + 8 + i * 2, true) / 32768;
      return f;
    }
    pos += 8 + tam + (tam & 1);
  }
  throw new Error('WAV sem bloco data');
}
const pcms = new Map();
window.poc = {
  info: async () => {
    let gpu = null;
    try {
      const a = await navigator.gpu?.requestAdapter();
      gpu = a ? { vendor: a.info?.vendor, arquitetura: a.info?.architecture, descricao: a.info?.description ?? '' } : null;
    } catch { gpu = null; }
    return { isolado: crossOriginIsolated, nucleos: navigator.hardwareConcurrency, memoriaGB: navigator.deviceMemory ?? null, webgpu: !!navigator.gpu, adaptador: gpu, ua: navigator.userAgent };
  },
  carregar: (cfg) => { worker.postMessage({ tipo: 'carregar', ...cfg }); return espera('carregado'); },
  baixarClipe: async (nome) => { const r = await fetch(`/clips/${nome}.wav`); pcms.set(nome, lerWav(await r.arrayBuffer())); return { segundos: pcms.get(nome).length / 16000 }; },
  transcrever: (nome, idioma, segundos) => {
    const pcm = pcms.get(nome);
    const fatia = segundos ? pcm.slice(0, Math.round(segundos * 16000)) : pcm.slice();
    worker.postMessage({ tipo: 'transcrever', id: nome, idioma, pcm: fatia }, [fatia.buffer]);
    return espera('transcrito').then((r) => ({ ...r, duracaoS: fatia.length / 16000 }));
  },
};
document.getElementById('log').textContent = 'pronto';

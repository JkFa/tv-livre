// Worker do reconhecimento de fala (Whisper via Transformers.js). Mede download, carga e tempo de inferência.
import { pipeline, env } from '/dist/transformers.web.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = '/dist/';

let asr = null;
self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.tipo === 'carregar') {
      env.backends.onnx.wasm.numThreads = m.threads ?? 1;
      const arquivos = new Map();
      const t0 = performance.now();
      asr = await pipeline('automatic-speech-recognition', m.modelo, {
        dtype: m.dtype,
        device: m.device,
        progress_callback: (p) => {
          if (p.file && p.total) arquivos.set(p.file, p.total);
        },
      });
      const bytes = [...arquivos.values()].reduce((a, b) => a + b, 0);
      self.postMessage({ tipo: 'carregado', ms: performance.now() - t0, bytes, arquivos: Object.fromEntries(arquivos) });
    } else if (m.tipo === 'transcrever') {
      const t0 = performance.now();
      const opts = { task: 'transcribe', return_timestamps: true, chunk_length_s: 30 };
      if (m.idioma) opts.language = m.idioma;
      const out = await asr(m.pcm, opts);
      self.postMessage({ tipo: 'transcrito', id: m.id, ms: performance.now() - t0, texto: out.text, chunks: out.chunks ?? [] });
    }
  } catch (e) {
    self.postMessage({ tipo: 'erro', mensagem: String(e?.message ?? e), pilha: String(e?.stack ?? '').slice(0, 400) });
  }
};

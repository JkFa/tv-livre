// Servidor estático da prova de conceito. Porta 8101: SEM isolamento (como o GitHub Pages, que não permite cabeçalhos
// COOP/COEP). Porta 8102: COM isolamento (crossOriginIsolated → WASM com várias threads).
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const AQUI = process.cwd();
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.wav': 'audio/wav', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.seg': 'video/mp2t', '.map': 'application/json' };
const RAIZES = [[ '/dist/', join(AQUI, 'node_modules/@huggingface/transformers/dist/') ], [ '/hls-js/', join(AQUI, '../../node_modules/hls.js/dist/') ], [ '/', AQUI + '/' ]];

function servir(isolado) {
  return createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const caminho = url === '/' ? '/pagina.html' : url;
    for (const [prefixo, dir] of RAIZES) {
      if (!caminho.startsWith(prefixo)) continue;
      const arq = normalize(join(dir, caminho.slice(prefixo.length)));
      if (!arq.startsWith(dir.replace(/\/$/, '')) || !existsSync(arq) || !statSync(arq).isFile()) continue;
      const h = { 'content-type': TIPOS[extname(arq)] ?? 'application/octet-stream', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'cache-control': 'no-store' };
      if (isolado) {
        h['cross-origin-opener-policy'] = 'same-origin';
        h['cross-origin-embedder-policy'] = 'credentialless';
      }
      res.writeHead(200, h);
      return createReadStream(arq).pipe(res);
    }
    res.writeHead(404).end('não encontrado');
  });
}
servir(false).listen(8101, '127.0.0.1');
servir(true).listen(8102, '127.0.0.1');
console.log('PoC: http://127.0.0.1:8101 (sem isolamento) e :8102 (isolado)');

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Aedes } from 'aedes';
import { createWebSocketStream, WebSocketServer } from 'ws';

/** Broker MQTT local sobre WebSocket para os testes E2E: nada sai para a internet. */
export async function iniciarBroker() {
  const aedes = await Aedes.createBroker();
  const http = createServer();
  const wss = new WebSocketServer({ server: http });
  let conexoes = 0;
  wss.on('connection', (ws) => {
    conexoes++;
    aedes.handle(createWebSocketStream(ws) as never);
  });
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
  const porta = (http.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${porta}`,
    /** Quantas conexões WebSocket já chegaram (para provar que nada conecta antes de ativar o controle). */
    conexoes: () => conexoes,
    /** Derruba todas as conexões (o cliente MQTT tenta reconectar sozinho). */
    derrubar: () => wss.clients.forEach((c) => c.terminate()),
    parar: async () => {
      wss.clients.forEach((c) => c.terminate());
      await new Promise<void>((ok) => wss.close(() => ok()));
      await new Promise<void>((ok) => aedes.close(() => ok()));
      http.close();
    },
  };
}

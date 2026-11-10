# TV Livre: guia para quem (ou o quê) vai mexer no código

Site estático de TV aberta ao vivo (React 19 + Vite 8 + TypeScript, hls.js), publicado no **GitHub Pages** em `https://jkfa.github.io/tv-livre/`. **Sem backend de vídeo, sem proxy, sem hospedar vídeo**: o navegador acessa direto a fonte de cada canal. Há só um serviço mínimo de **presença** (Cloudflare Worker em `workers/presenca`) para o "assistindo agora", opcional e sem custo. Tudo em **português do Brasil** (interface, commits, PRs, respostas). Detalhes de produto: `README.md`; sistema de design: `DESIGN.md` (número do canal em destaque, um único acento vermelho, Archivo + Atkinson, claro/escuro, respeitar `prefers-reduced-motion`).

## Comandos

| Comando | Para quê |
|---|---|
| `npm run check` | lint + tipos + testes unitários (rodar antes de todo commit) |
| `npm run dev` | servidor de desenvolvimento (`http://localhost:5173/tv-livre/`) |
| `npm run data:quick` | gera `public/data` **sem testar links** (tudo "desconhecido") |
| `npx tsx scripts/build-data.ts --reuse-health` | gera dados com o **status real** da publicação, sem testar links (necessário para E2E de SEO/home) |
| `npm run data` | pipeline completo com teste de rede (15–25 min) |
| `npm run build` | `tsc -b && vite build` → `dist/` (**apaga** o `dist/` anterior) |
| `npm run build:pages` | páginas estáticas por canal, categorias, países, prévias OG e `sitemap.xml` em `dist/` (depois do build; usa o Chromium do Playwright) |
| `npm run preview` | serve `dist/` em `:4173` |
| `npm run test:e2e` | Playwright; ver "Testes" |
| `npm run epg` / `epg:coverage` | guia de programação (precisa do clone do iptv-org/epg) / tabela de cobertura |

Node 20.19+ (recomendado 22).

## Arquitetura

- `scripts/` pipeline de dados em Node: baixa Free-TV e iptv-org, normaliza, deduplica, filtra adultos, classifica e **testa os links** (`build-data.ts` + `lib/`); `build-epg.ts` (guia), `build-pages.ts` (SEO), geradores de ativos.
- `shared/` tipos e utilitários usados pelo pipeline **e** pelo site (`types.ts`, `lineup.ts`, `youtube.ts`).
- `src/App.tsx` orquestra tudo; rotas por **hash** (`#/`, `#/canais`, `#/canal/CC/ID`, `#/sobre`, `#/instalar`, `#/controle`), mais o caminho `/canal/<pais>/<slug>/` das páginas estáticas (`lib/route-parse.ts`).
- `src/components/` Player/HlsStage (reprodução), grade, folhas (`Sheet` sobre `<dialog>`), páginas. `Controle.tsx` é um chunk separado (rota `#/controle`).
- `src/lib/playback.ts` monta a lista de tentativas de reprodução (hls.js → HLS nativo, upgrade http→https, `nativeOnly` para AirPlay); o `HlsStage` as executa em ordem.
- **Presença ("assistindo agora")**: `workers/presenca/` (Worker + Durable Object `Sala`, WebSocket com hibernação; `package.json` próprio, **Node 22**; `npm test` roda no runtime real) e, no site, `lib/presenca.ts` (lógica injetável, testável), `presenca-browser.ts` (cola/ciclo de vida/hook), `presenca-url.ts` (`VITE_PRESENCA_URL`; `tvlivre:presenca-teste` liga contra o `wrangler dev` local), `presenca-ui.ts`. O workflow `presenca.yml` é separado do `deploy.yml`. Custos em `workers/presenca/custos.mjs`; carga manual em `carga.mjs`.
- Funcionalidades por módulo: guia `lib/epg.ts`; transmitir `lib/cast*.ts`, `useCast.ts`, `transporte.ts` (AirPlay/Remote Playback); modos e timer `lib/modo.ts`, `timer.ts`; compartilhar `lib/share.ts`; **controle pelo celular** `lib/remote/` (cifra AES-GCM, protocolo validado, receptor no computador, controlador no celular, transportes MQTT e BroadcastChannel); Modo TV `lib/tvmode.ts`, `tvremote.ts`, `spatial.ts`.
- `config/`: `removals.json` (canais removidos a pedido), `seo.json` (quem ganha página indexável), `epg.json` (países com guia).
- `localStorage` sempre por `src/lib/storage.ts` (com `try/catch`); chaves `tvlivre:*` (listadas no README). `sessionStorage` só para o controle remoto.

## Regras que não mudam

- Custo zero; nada de servidor próprio; nenhum script de terceiros na abertura do site (o SDK do Cast só é baixado ao tocar em Transmitir; o `mqtt` só ao ativar o controle).
- Interface mobile primeiro, claro/escuro (**padrão claro**), alvos ≥ 44 px, Modo TV navegável só por setas/OK.
- Falha isolada de link **nunca** derruba um canal (ver regras de status no README). Falha no guia (EPG) **nunca** bloqueia o deploy.
- Não quebrar zapear, retomada, Modo TV, PiP, Media Session nem o diagnóstico de erro.

## Testes

- Unitários (Vitest, `tests/unit/`): `npm test`. Lógica pura fica em `src/lib` e `scripts/lib` justamente para ser testável sem DOM.
- E2E (Playwright, `e2e/`, 4 projetos: `chromium-desktop`, `android`, `safari-desktop`, `iphone`). **Rodar um projeto por vez com `--workers=1`** (a máquina costuma ter pouca memória): `PROJECTS=chromium-desktop npx playwright test --workers=1`.
- Pré-requisitos do E2E: `dist/` atual (`npm run build`), dados com status real (`--reuse-health`) e `npm run build:pages` (o `seo.spec.ts` precisa das páginas). O controle remoto usa um broker MQTT **local** (`e2e/broker.ts`, aedes + ws); a presença sobe o `wrangler dev` **local** (`e2e/servico-presenca.ts`, precisa de `npm ci` em `workers/presenca` e Node 22; sem isso o spec é pulado): nenhum teste sai para a internet.
- Fixtures HLS (`tests/fixtures/hls/`) vêm de `scripts/make-hls-fixtures.sh` (ffmpeg); os trechos usam extensão `.seg` para o `tsc` não os ler como TypeScript.
- Stubs de SDK/AirPlay nos testes: nunca carregar o SDK real do Google nem falar com o broker público.

## Fluxo de trabalho e publicação

- Branch por tarefa a partir da `main` (`feat/…`, `fix/…`), commits pequenos (um por etapa), PR para `main`. **Quem abre o PR não faz o merge**: o dono testa em aparelho antes. Merge sempre com squash; apagar o branch só depois.
- Todo PR de funcionalidade leva testes, documentação (README/Sobre/DESIGN), capturas e a lista do que não foi testado.
- Deploy: `.github/workflows/deploy.yml` (push na `main`, agendado 06:17 UTC completo e 18:17 UTC só o guia, e manual). Etapas: check → dados → guia (opcional) → build → páginas → E2E → Pages. ~20 min. O agendamento do GitHub atrasa horas; uma execução "failure" **sem jobs** costuma ser incidente do GitHub (ver githubstatus.com).
- O app é PWA com `registerType: 'prompt'`: a versão nova só aparece quando o usuário toca em "Atualizar".

## Armadilhas conhecidas

- O WebCrypto só existe em **HTTPS ou localhost**: o controle pelo celular não funciona por `http://IP`, e o QR usa `location.origin` (um `localhost` não abre no celular).
- O hls.js remove as variantes só de áudio de `hls.levels`; o Rádio as lê do `MANIFEST_LOADED` bruto.
- O `MANIFEST_PARSED` do hls.js dispara **antes** de handlers próprios de `MANIFEST_LOADED`.
- **Presença:** o plano gratuito da Cloudflare limita Worker e Durable Object a 100 mil requisições/dia **e 100 mil linhas gravadas/dia** (cada `setAlarm` e cada `put` contam): por isso os contadores são gravados em lote (15 s). O `/resumo` tem cache de borda de 10 s em produção (em `AMBIENTE=dev` não tem, senão os testes leem número velho). Em teste, o vídeo de fixture é um VOD que **termina** e a página passa a "navegando": ponha `video.loop = true`. `abortAllDurableObjects()` no teste enche o log de erros; limpe o objeto explicitamente.
- Eventos `close` assíncronos de `<dialog>` podem fechar a folha seguinte: use `closeSheet(nome)` (cada folha só fecha a si mesma).
- No WebKit, atribuir `audio.volume` no mesmo instante do `pause()` é ignorado.
- Não usar `pkill -f "vite preview"` (casa com o próprio shell): `pgrep -f "[v]ite preview"`.

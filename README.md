# TV Livre

Plataforma web de **TV ao vivo** com canais abertos de todo o mundo, direto no navegador.
Sem cadastro, sem anúncios, sem cobrança — e **sem hospedar vídeo**.

**Site:** <https://jkfa.github.io/tv-livre/> · **Código:** <https://github.com/JkFa/tv-livre>

## Visão geral

- Reúne as listas [Free-TV/IPTV](https://github.com/Free-TV/IPTV) e [iptv-org/iptv](https://github.com/iptv-org/iptv).
- Um pipeline em TypeScript baixa as fontes, normaliza, remove duplicatas, exclui conteúdo adulto, classifica e **testa cada link**.
- O site é 100% estático (React + Vite + TypeScript) e toca HLS com [hls.js](https://github.com/video-dev/hls.js). YouTube usa o embed oficial.
- O navegador acessa **diretamente** a fonte do vídeo: não há backend, proxy, retransmissão nem gravação.
- Interface em português do Brasil, tema escuro, responsiva, com busca, filtros (país, categoria, idioma, status), lista virtualizada, favoritos e recentes (no `localStorage`).

### Como os dados são tratados

| Etapa | O que acontece |
| --- | --- |
| Fontes | `playlist.m3u8` do Free-TV e a API do iptv-org (`channels`, `streams`, `feeds`, `logos`, `blocklist`, `countries`). |
| Normalização | Parser M3U tolerante a entradas malformadas; nomes sem acentos/qualidade; `UK` e `GB` unificados. |
| Duplicatas | Por URL (http/https tratados como iguais) e por *nome normalizado + país*. **Free-TV tem prioridade**; a origem de cada canal fica em `sources`. |
| Adultos | Excluídos por `is_nsfw`, categoria `xxx`, blocklist do iptv-org, URLs de canais adultos e palavras-chave. |
| Tipo do link | `hls` (HTTPS reproduzível), `youtube`, `http` (bloqueado pelo navegador) ou `other`. |
| Status | `online`, `offline` ou `desconhecido`. **Uma falha isolada nunca remove nem derruba um canal** (veja abaixo). |
| Saída | `public/data/index.json` (leve) + `public/data/countries/<PAÍS>.json` + `health.json`. A página só baixa o índice e o país escolhido. |

**Regras de status.** Sucesso → `online`. Falha certa (404/410, DNS, certificado) → `offline`, mas um canal que estava online
só cai para `desconhecido` na primeira falha. Falha ambígua (timeout, 403, 5xx, conteúdo estranho — comum em bloqueio
geográfico, já que o teste roda em servidores fora do Brasil) → `desconhecido`, e só vira `offline` após 3 execuções seguidas.
O pipeline também detecta se o servidor envia cabeçalhos **CORS**; sem eles o navegador não consegue tocar o canal e o site avisa.

**Salvaguardas.** O pipeline termina com erro, e portanto **não publica**, se uma fonte estiver fora do ar/inconsistente ou se o
total de canais cair mais de 50% em relação à publicação anterior.

## Executar localmente

Requisitos: Node.js 20.19+ (recomendado 22) e npm.

```bash
npm install
npm run data:quick   # gera public/data sem testar links (rápido, ~2 s)
npm run dev          # http://localhost:5173/tv-livre/
```

Outros comandos:

```bash
npm run data         # pipeline completo, com teste de rede (15–25 min)
npm run check        # lint + tipos + testes unitários
npm run build        # tsc + vite build  → dist/
npm run preview      # serve dist/ em http://localhost:4173/tv-livre/
npx playwright install chromium && npm run test:e2e
BASE_URL=https://jkfa.github.io/tv-livre/ npm run test:e2e   # testa o site publicado
```

Opções do pipeline (`tsx scripts/build-data.ts …`): `--no-probe`, `--limit N`, `--ignore-previous`, `--out DIR`,
`--freetv ARQUIVO --org-dir DIR` (usa cópias locais das fontes).

## Atualização dos dados e publicação

O workflow [`deploy.yml`](.github/workflows/deploy.yml) roda **a cada push na `main`, uma vez por dia (06:17 UTC) e manualmente**
(`workflow_dispatch`): lint → tipos → testes unitários → pipeline de dados → build → testes E2E (Playwright) → publicação
no GitHub Pages com `actions/deploy-pages`. Qualquer etapa que falhe impede a publicação.

> O GitHub desativa workflows agendados após 60 dias sem atividade no repositório; basta um push ou execução manual para reativar.

Para forçar uma atualização: *Actions → Publicar TV Livre → Run workflow*.

### Remover um canal

Abra uma [solicitação de remoção](https://github.com/JkFa/tv-livre/issues/new?template=remocao-de-canal.yml). O canal é
adicionado a [`config/removals.json`](config/removals.json) (por id, URL, host ou nome) e some na atualização seguinte.

## Estrutura

```
scripts/          pipeline de dados (build-data.ts e lib/: m3u, normalize, classify, youtube, adult, merge, probe…)
shared/           tipos e utilitários usados pelo pipeline e pelo site
src/              site React (componentes, lib/ com filtros, rotas por hash, armazenamento seguro)
tests/unit/       testes unitários (Vitest) com playlists reais e malformadas em tests/fixtures/
e2e/              testes de ponta a ponta (Playwright)
config/           lista de remoções
```

Rotas usam *hash* (`#/canal/BR/<id>`, `#/sobre`), então recarregar a página nunca gera 404 no GitHub Pages; o build ainda
copia `index.html` para `404.html` como rede de segurança.

## Créditos e licenças

- **[iptv-org/iptv](https://github.com/iptv-org/iptv)** — canais e metadados (Unlicense / domínio público).
- **[Free-TV/IPTV](https://github.com/Free-TV/IPTV)** — playlist curada. O repositório **não declara licença**: usamos apenas
  nomes e endereços públicos de transmissão, com crédito, e removemos qualquer canal a pedido.
- [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0), React, Vite, TanStack Virtual.

O código deste projeto está sob licença MIT. Os canais, nomes e logos pertencem aos respectivos titulares; o TV Livre apenas
aponta para transmissões publicadas por eles.

## Limitações

- **Link HTTP** não toca no navegador (conteúdo misto em página HTTPS): o site oferece copiar o link para abrir no **VLC**.
- **CORS:** servidores que não liberam outros sites impedem a reprodução; esses canais são sinalizados (“Só no VLC”).
- **Bloqueio geográfico:** muitos canais só funcionam no país de origem. O teste automático roda nos EUA, então o status pode
  divergir do que você vê no Brasil.
- **Canais exigindo cabeçalhos** (User-Agent/Referer) só funcionam em players como o VLC.
- **YouTube:** só vídeos e `channel/UC…` têm embed; links `@handle` abrem no YouTube.
- Links gratuitos mudam ou saem do ar sem aviso; a qualidade das fontes varia.
- Canais do iptv-org sem canal associado nos metadados são ignorados (não dá para filtrar adultos nem definir país).
- Logos são carregados dos servidores de origem e podem falhar (aparecem as iniciais do canal).

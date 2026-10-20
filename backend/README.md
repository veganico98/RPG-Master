# @rpggg/backend

API HTTP em Express 5. É a **única parte do sistema que lê segredos** (`OPENAI_API_KEY`, `N8N_WEBHOOK_URL`, `SESSION_SECRET`) — o frontend só fala com esta API via `/api/*` (proxiado pelo Vite em dev).

Toda a lógica de jogo (dado, prompts, schema, guardrails, chamadas à OpenAI) vive em [`@rpggg/ai`](../ai). Este pacote expõe isso como rotas HTTP, valida entrada, guarda o estado da partida, limita requisições por IP e trata erros.

| Arquivo | Responsabilidade |
| --- | --- |
| [src/server.ts](src/server.ts) | Rotas, validação, erros e servidor estático em produção |
| [src/session.ts](src/session.ts) | Estado da partida assinado com HMAC-SHA256 (`createSessionSigner`) |
| [src/rateLimit.ts](src/rateLimit.ts) | Limite de requisições por IP em janela fixa, em memória |
| [src/rooms.ts](src/rooms.ts) | `RoomStore`: salas do modo plateia, rodadas, votos e apuração |
| [src/roomRoutes.ts](src/roomRoutes.ts) | Rotas `/api/rooms` do modo plateia |

## Rotas

| Rota | Método | Corpo | Resposta | Descrição |
| --- | --- | --- | --- | --- |
| `/api/health` | GET | — | `{ ok: true, hasKey: boolean, hasEmail: boolean }` | Verifica se o servidor subiu e se `OPENAI_API_KEY` foi carregada. |
| `/api/game/start` | POST | `{ origin? }` | `GameResponse & { state_token }` | Cena de abertura (dado fixo 7, personagem inicial, turno 1). `origin` é `'vinganca' \| 'dever' \| 'descoberta'`; omitido, vale `'dever'`. |
| `/api/game/action` | POST | `{ action, history, state_token }` | `GameResponse & { state_token }` | Próximo turno. Personagem e turno vêm do token; o dado é rolado no servidor. |
| `/api/game/image` | POST | `{ prompt }` | `{ image }` | Ilustração da cena (data URL JPEG). |
| `/api/game/speech` | POST | `{ text, voice?, speed? }` | `{ audio }` | Narração com voz da OpenAI (data URL MP3). |
| `/api/game/send-summary` | POST | `{ email, summary, state_token }` | `{ ok: true }` | Repassa o resumo ao webhook do n8n, que envia o e-mail. |

`GameResponse`, `CharacterStatus` e `HistoryMessage` vêm de `@rpggg/ai` — ver [ai/README.md](../ai/README.md#exports).

### Modo plateia (`/api/rooms`)

| Rota | Quem chama | Corpo | Descrição |
| --- | --- | --- | --- |
| `POST /api/rooms` | Telão | — | Cria uma sala. Responde `201 { code, hostKey }`; `503` se houver 200 salas ativas. |
| `GET /api/rooms/:code?voter=<id>` | Telão e celulares | — | Estado da sala (`RoomState`). Com `voter`, conta o celular na plateia e devolve `myVote`. |
| `POST /api/rooms/:code/vote` | Celular | `{ voterId, round, optionId }` | Vota ou troca o voto na rodada atual. `409` se a votação não estiver aberta, a rodada já passou ou a opção não existe. |
| `POST /api/rooms/:code/host` | Telão | `{ hostKey, op, ... }` | `round` (`event`, `narration` até 6.000 caracteres, `dice` 1–10 e `resultType` opcionais, `options` 1–4, `durationSec` 5–300), `extend` (`seconds`), `waiting`, `close` (apura; empate sorteado) e `end` (`outcome`). `403` com chave errada. |

O código da sala tem 5 caracteres sem 0, O, 1 e I. A `hostKey` (64 hex) fica só no telão. O `voterId` é um id aleatório gerado no celular (8–64 caracteres `[A-Za-z0-9_-]`). As salas vivem em memória, com até 2.000 votantes cada, e expiram após 4 horas sem atividade do telão nem votos.

## Estado da partida (`state_token`)

O servidor não guarda partidas, mas também não confia no cliente. A cada resposta de `start` e `action`, ele devolve um token `base64url(JSON).base64url(HMAC)` com:

| Campo | Conteúdo |
| --- | --- |
| `id` | UUID da partida, gerado no `start` |
| `turn` | Último turno narrado (abertura = 1) |
| `character` | Personagem após o turno, já com os guardrails de `normalize` aplicados |
| `outcome` | `'vitoria'`, `'derrota'` ou `null` |
| `iat` | Data de emissão; o token vale 7 dias |

O cliente devolve o token no turno seguinte. Assim, editar o `localStorage` ou o payload não muda vida, ouro, inventário nem o turno (o que antes permitia fugir do fim obrigatório no turno 10). O segredo vem de `SESSION_SECRET`; sem ele, o servidor gera um aleatório a cada start e as partidas salvas deixam de valer após um restart.

## Validação de entrada

Toda validação é manual (sem lib de schema), em [src/server.ts](src/server.ts):

- Corpo JSON limitado a **64 KB**.
- `origin`: se enviado, uma chave de `HERO_ORIGINS`.
- `action`: string não vazia, até **500 caracteres**.
- `history`: no máximo **50 mensagens**, `role` `user` ou `assistant`, `content` até **8.000 caracteres**. Serve só de contexto narrativo.
- `state_token`: assinatura válida e não expirado; em `action`, a partida não pode ter terminado; em `send-summary`, precisa ter terminado e não pode ter enviado e-mail antes.
- `prompt` (imagem): até **800 caracteres**.
- `text` (voz): até **4.000 caracteres**; `voice` em `TTS_VOICES`; `speed` limitado a 0,25–4 em `@rpggg/ai`.
- `email`: formato válido, até **200 caracteres**; `summary` até **8.000 caracteres**.

## Limites por IP

| Rotas | Limite |
| --- | --- |
| `start` e `action` | 30 a cada 10 min (cada rota conta à parte) |
| `image` | 30 a cada 10 min |
| `speech` | 60 a cada 10 min |
| `send-summary` | 5 por hora, e 1 por partida |
| `POST /api/rooms` | 20 por hora |
| `POST /api/rooms/:code/host` | 600 a cada 10 min |
| `POST /api/rooms/:code/vote` | 6.000 a cada 10 min |
| `GET /api/rooms/:code` | sem limite (leitura barata em memória) |

Os limites do modo plateia são altos de propósito: numa apresentação, a plateia inteira costuma sair pelo mesmo IP (Wi-Fi do local).

Os contadores ficam em memória e valem para um único processo. Atrás de proxy reverso, defina `TRUST_PROXY` (ex.: `1`) para que `req.ip` seja o IP real do jogador.

## Tratamento de erros

| Situação | Status |
| --- | --- |
| Payload inválido | `400` |
| Token ausente, inválido ou expirado | `401` |
| Partida já terminada (`action`), ainda em andamento ou e-mail já enviado (`send-summary`) | `409` |
| Limite por IP excedido | `429`, com cabeçalho `Retry-After` |
| `OPENAI_API_KEY` ou `N8N_WEBHOOK_URL` ausente | `500` |
| Falha na OpenAI ou no n8n | `502`, com a mensagem do provedor |

Todas as respostas de erro têm o formato `{ error: "..." }`. Se o envio ao n8n falhar, a partida fica liberada para uma nova tentativa de e-mail.

## Configuração

Variáveis lidas via `process.env` (modelo em [../.env.example](../.env.example)):

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Obrigatória para jogar |
| `N8N_WEBHOOK_URL` | — | Opcional; sem ela, `hasEmail` é `false` e o resumo por e-mail fica desligado |
| `SESSION_SECRET` | aleatório | Assina o estado das partidas |
| `TRUST_PROXY` | — | Valor de `trust proxy` do Express (número de proxies, `true` ou lista de IPs) |
| `BACKEND_PORT` | `3001` | Porta do servidor; precisa bater com o proxy `/api` do `vite.config.ts` |
| `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `OPENAI_TTS_MODEL` | ver README da raiz | Lidas em `@rpggg/ai`, mas afetam este processo |

Os scripts `dev` e `start` carregam `../.env` e depois `backend/.env` (`--env-file-if-exists`); o segundo tem prioridade. Prefira manter tudo no `.env` da raiz.

## Rodando

Da **raiz** do monorepo:

```bash
pnpm install
cp .env.example .env     # preencha as variáveis obrigatórias
pnpm dev:backend         # só o backend, com watch (porta 3001)
pnpm dev:all             # frontend + backend juntos
pnpm test                # testes do núcleo (session, rateLimit, rooms, normalize)
```

Verificação rápida:

```bash
curl http://localhost:3001/api/health
# {"ok":true,"hasKey":true}
```

Docker de desenvolvimento: ver o [README da raiz](../README.md). Produção (incluindo a AWS, em https://32-192-117-236.sslip.io): ver [DEPLOY.md](../DEPLOY.md).

## Stack e dependências

- **Express 5** — única dependência de runtime além do workspace `@rpggg/ai`.
- **tsx** — executa TypeScript diretamente (dev, produção e testes com `node:test`).
- Sem banco de dados: o estado da partida viaja assinado com o cliente.

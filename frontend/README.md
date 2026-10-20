# @rpggg/frontend

Interface do jogo: React 19 + Tailwind CSS 4. Fala **somente** com o backend via `/api/*` — nunca importa `gameMaster.ts`/`imageGen.ts` de `@rpggg/ai` (que fazem chamadas autenticadas à OpenAI), só os tipos e constantes expostos pelos subpaths `@rpggg/ai/types`, `@rpggg/ai/character`, `@rpggg/ai/origins` e `@rpggg/ai/room`.

> O Vite (`vite.config.ts`, `index.html`) fica na **raiz do repositório**, não aqui, porque o Figma Make exige esse layout. Este pacote só contém o código-fonte (`src/`); build, dev server e proxy `/api` são configurados na raiz.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| [src/main.tsx](src/main.tsx) | Ponto de entrada. Em `/v` ou `/v/<CÓDIGO>` monta a página de votação do celular; nas demais rotas, o jogo (`<App />`). |
| [src/Audience.tsx](src/Audience.tsx) | Modo plateia no telão: hook `useAudience` (cria a sala, abre uma rodada por cena, cronômetro, apuração automática) e componentes do QR Code (modal grande, QR no canto, botão e barra de votação). |
| [src/VotePage.tsx](src/VotePage.tsx) | Página do celular: entrar com o código, ler a narração completa da cena, votar e acompanhar as barras de votos e o cronômetro. |
| [src/services/roomApi.ts](src/services/roomApi.ts) | Cliente HTTP das rotas `/api/rooms`. |
| [src/App.tsx](src/App.tsx) | Todas as telas e a lógica de jogo (~1500 linhas): estado do personagem, chat, dado, narração por voz, ilustração de cena, salvamento da sessão, resumo por e-mail e a integração com o modo plateia. Ver seção abaixo. |
| [src/services/gameApi.ts](src/services/gameApi.ts) | Cliente HTTP fino sobre `fetch`: `getOpeningScene(origin?)`, `callGameMaster(action, history, stateToken)`, `generateSceneImage(prompt)`, `generateSpeech(text, voice?, speed?)`, `sendStorySummary(email, summary, stateToken)` e `isEmailEnabled()` (lê `hasEmail` do `/api/health`), além do tipo `GameTurn` (`GameResponse` + `state_token`). Cada função é um `POST` para a rota correspondente do backend (ver [backend/README.md](../backend/README.md#rotas)) e lança `Error` com a mensagem de `{ error }` quando a resposta não é `ok`. |
| [src/types.ts](src/types.ts) | Tipos só de UI: `ChatMessage` (mensagens do chat, com `role: 'narrator' \| 'player' \| 'system'`, dado, tipo de resultado, caminhos, estado da imagem). Os tipos de domínio (`CharacterStatus`, `GameResponse`, `Path`) vêm de `@rpggg/ai/types`. |
| [src/index.css](src/index.css) | Estilos globais / import do Tailwind. |
| [src/vite-env.d.ts](src/vite-env.d.ts) | Tipos de ambiente do Vite. |

## `App.tsx` por dentro

Um único componente de página com três telas controladas por estado (`gameStarted`, `isGameOver`, `isVictory`):

1. **Boas-vindas** — antes de `gameStarted`; usa `INITIAL_CHARACTER` de `@rpggg/ai/character` para mostrar o personagem inicial e `HERO_ORIGINS` de `@rpggg/ai/origins` para deixar o jogador escolher a motivação do herói (Vingança, Dever ou Descoberta) antes de começar. Dois botões: **Iniciar Aventura** e **📱 Jogar com a plateia**, que já abre o QR Code. A origem escolhida é passada para `getOpeningScene(origin)` e volta em `character_status.origin` a partir da primeira cena — só afeta a narração, nunca os atributos.
2. **Jogo** — chat (mensagens `narrator`/`player`/`system`) + painel do personagem (vida, XP, ouro, nível, localização, inventário) + campo de ação livre e botões de caminho.
3. **Fim de jogo** — derrota (`isGameOver`) ou vitória (`isVictory`), cada uma com tela própria e botão de recomeçar. O formulário do resumo por e-mail só aparece se o servidor tiver o n8n configurado.

Funcionalidades relevantes implementadas ali dentro:

- **Ilustração por cena**: cada resposta do Mestre carrega uma imagem de forma assíncrona e independente da narração (não bloqueia o chat); tem retry manual e um toggle liga/desliga persistido em `localStorage` (chave de imagens ligadas/desligadas).
- **Estado assinado da partida**: cada resposta de `start`/`action` traz um `state_token`, guardado em estado (`stateToken`) e devolvido no turno seguinte e no envio do e-mail. O frontend não envia mais o personagem: quem decide vida, ouro e turno é o servidor.
- **Salvamento da sessão**: token, personagem, mensagens, histórico e flags de fim de jogo vão para o `localStorage` (chave `rpg-save`) a cada mudança. Saves antigos, sem token, são descartados.
- **Narração por voz**: voz do navegador (Web Speech API, grátis, padrão quando disponível) ou uma das 6 vozes da OpenAI via `/api/game/speech`. Com voz da OpenAI, o áudio de cada cena é pré-gerado assim que ela chega. Voz e velocidade ficam no `localStorage`; play/pause/resume.
- **Modo plateia**: com a plateia ligada, cada cena com caminhos vira uma rodada de 5 min, com o dado, o título e a narração completa enviados aos celulares; a contagem de votos aparece em cada caminho e, ao fim do tempo, a opção vencedora é executada por `handlePathChoice`. A sala fica salva no `localStorage` (`rpg-room`) para sobreviver a um recarregamento do telão. Para testar no celular em dev, abra o jogo pelo IP da rede (ex.: `http://192.168.x.x:8443`), não por `localhost`, senão o QR aponta para um endereço que o celular não alcança.
- **Dado animado**: o valor e a classe de resultado (`ruim`/`medio`/`bom`) vêm prontos do backend (que já classificou) e só são exibidos com uma animação local.
- **Tratamento de erro**: falha do Mestre vira uma mensagem `role: 'system'` no chat e devolve o controle pro jogador tentar de novo, sem travar a tela.

## Configuração / variáveis de ambiente

Este pacote não lê `process.env` diretamente — quem faz isso é o [vite.config.ts](../vite.config.ts) da raiz:

| Variável | Onde é usada | Padrão |
| --- | --- | --- |
| `PORT` | Porta do dev server / preview do Vite | `8443` |
| `BACKEND_PORT` | Alvo do proxy `/api` → `http://localhost:${BACKEND_PORT}` | `3001` |
| `FIGMA_DEV_SERVER_HOST` | Host do dev server (`0.0.0.0` é necessário para acessar de fora do container Docker) | `0.0.0.0` |

Ou seja: para o frontend falar com o backend em dev, basta que `BACKEND_PORT` no ambiente do Vite bata com a porta em que o backend realmente está escutando — o `fetch('/api/...')` em [gameApi.ts](src/services/gameApi.ts) sempre usa caminho relativo, nunca uma URL absoluta.

## Rodando

Da **raiz** do monorepo:

```bash
pnpm install
pnpm dev              # só o frontend (Vite), porta 8443 — precisa do backend rodando à parte para /api funcionar
pnpm dev:all          # frontend + backend juntos (recomendado)
```

| Script | Onde roda | Efeito |
| --- | --- | --- |
| `pnpm dev` (raiz) | raiz | Sobe o Vite com este pacote como fonte (`resolve.alias '@'` aponta para `frontend/src`) |
| `pnpm --filter @rpggg/frontend typecheck` | aqui | `tsc --noEmit` |
| `pnpm build` / `pnpm preview` (raiz) | raiz | Build de produção e preview do bundle |

Verificação rápida com o backend no ar: abra `http://localhost:8443`, clique em começar a aventura — se a cena de abertura não carregar, confira `curl http://localhost:3001/api/health` (deve retornar `hasKey: true`) antes de suspeitar do frontend.

### Rodando via Docker

O frontend sobe junto com o backend em um único container (`docker-compose.yml` na raiz):

```bash
docker compose up --build
```

Acesse `http://localhost:8443` normalmente. O bind mount do código-fonte mantém o hot reload do Vite funcionando dentro do container. Veja o [README da raiz](../README.md) para os detalhes do setup Docker (portas, variáveis, watch/polling).

## Stack

React 19 · Tailwind CSS 4 · TypeScript 5 · Vite 8 (configurado na raiz) · Web Speech API (nativa do browser) · OpenAI TTS (via backend) · qrcode.

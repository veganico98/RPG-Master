# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), adaptado: como este projeto não tem tags de versão nem repositório Git com histórico (ver `.gitignore`/setup local), as entradas são organizadas por data em vez de número de versão.

## [Não lançado]

Nada pendente no momento.

## 2026-10-12 (documentação)

### Alterado

- Documentação revisada contra o código: endereço publicado, arquitetura de produção (EC2 + Caddy), modo plateia no README da raiz e nos dos pacotes, n8n tratado como opcional (`.env.example`, READMEs, DEPLOY.md), `hasEmail` no `/api/health`, limites do modo plateia e novas limitações conhecidas.
- [DEPLOY.md](DEPLOY.md): recursos criados na AWS, como atualizar o site a cada sessão do AWS Academy, como desligar tudo e os problemas do Git Bash no Windows já tratados no script.

## 2026-10-12 (modo plateia)

### Adicionado

- **Modo plateia**: o telão mostra um QR Code e o público vota pelo celular no próximo caminho do herói; a opção mais votada é executada. Rodadas de 5 min com **+15s** e **Encerrar votação**, empate sorteado, votos ao vivo no telão e nos celulares, contador de plateia conectada.
- Backend: `RoomStore` em memória ([backend/src/rooms.ts](backend/src/rooms.ts)) e rotas `/api/rooms` ([backend/src/roomRoutes.ts](backend/src/roomRoutes.ts)), com 8 testes novos.
- Frontend: botão **📱 Jogar com a plateia** na tela inicial e na barra lateral ([frontend/src/Audience.tsx](frontend/src/Audience.tsx)); página do celular em `/v/<CÓDIGO>` ([frontend/src/VotePage.tsx](frontend/src/VotePage.tsx)).
- Dependência `qrcode` no frontend.

### Alterado

- A página do celular mostra a narração completa de cada cena, com parágrafos, em vez de um trecho de 220 caracteres, e ganhou o atalho **Ir para a votação ↓**. O campo `excerpt` da sala virou `narration` (até 6.000 caracteres).
- A página do celular mostra o dado da cena (valor e resultado: ruim, médio ou bom), com as mesmas cores do telão. Novos campos `dice` e `resultType` em `RoomState`.

## 2026-10-12

### Adicionado

- **Estado da partida assinado** ([backend/src/session.ts](backend/src/session.ts)): `start` e `action` devolvem um `state_token` (HMAC-SHA256) com id da partida, turno, personagem e desfecho. O backend usa o token, e não o corpo da requisição, como fonte do personagem e do turno. Nova variável `SESSION_SECRET`.
- **Limite de requisições por IP** ([backend/src/rateLimit.ts](backend/src/rateLimit.ts)) em todas as rotas de jogo, com `429` e `Retry-After`. Nova variável `TRUST_PROXY` para uso atrás de proxy reverso.
- **Testes** com `node:test` via `tsx` (`pnpm test`): `normalize`, estado assinado e limite por IP.
- [.env.example](.env.example) e [DEPLOY.md](DEPLOY.md), antes citados pela documentação mas inexistentes.
- **Deploy na AWS** com [deploy/aws-ec2.sh](deploy/aws-ec2.sh): EC2 `t3.small` (Amazon Linux 2023 + Docker), Elastic IP e Caddy com HTTPS automático em `<ip>.sslip.io`. Primeira publicação em https://32-192-117-236.sslip.io (conta AWS Academy, `us-east-1`).
- `/api/health` informa `hasEmail`; o formulário de resumo por e-mail só aparece quando o servidor tem `N8N_WEBHOOK_URL`.

### Alterado

- **Guardrails numéricos no servidor** (`normalize` em [ai/gameMaster.ts](ai/gameMaster.ts)): teto de 150 de ouro por turno, vida máxima até 200, vida entre 0 e o máximo, sem morte no turno com vida ≥ 20, nível sempre derivado do XP e derrota exatamente quando a vida chega a 0.
- **Resumo por e-mail** só para partida terminada, uma vez por partida e no máximo 5 por hora por IP. Desfecho e personagem vêm do token; o corpo não aceita mais `outcome` nem `character`.
- **`/api/game/action`** recebe `{ action, history, state_token }` em vez de `{ action, character, history }`.
- **Voz padrão** passa a ser a do navegador (grátis). As vozes da OpenAI, pré-geradas a cada cena, só entram se o jogador escolher.
- Saves do `localStorage` sem token (de versões anteriores) são descartados ao abrir o jogo.
- `pnpm-workspace.yaml`: `allowBuilds.esbuild` definido como `true` (antes tinha um texto de exemplo).
- READMEs da raiz e dos pacotes atualizados: campanha de 10 turnos, rotas de voz e e-mail, salvamento da sessão e novo contrato da API.

## 2026-09-28

### Adicionado

- **Reviravolta de enredo e enredo mais profundo**: o Lich Malachar tem agora uma verdade escondida — é Aldric, herói que séculos atrás selou uma entidade sem nome no Orbe do Caos e foi consumido por ela ao romper o próprio selo décadas atrás para salvar seu povo. Revelada só através do novo item de lore **Diário de Aldric** (Ruínas de Aldrath, requer o Mapa das Ruínas). Ver [ai/knowledgeBase.ts](ai/knowledgeBase.ts).
- **NPCs nomeados e recorrentes**: Conselheiro Toran (ancião), Bram Aço-Negro (ferreiro), Ysolda (boticária) e Renn Passo-Leve (Mercador Viajante), substituindo NPCs genéricos sem nome.
- **Origem do herói**: nova tela de seleção (Vingança, Dever ou Descoberta) na abertura, que dá contexto emocional persistente ao longo da campanha sem alterar nenhum atributo mecânico. Novo pacote [ai/origins.ts](ai/origins.ts), campo opcional `origin` em `CharacterStatus`/`GameResponse.character_status`, e rota `/api/game/start` aceitando `{ origin }`.
- **Final com duas variantes**: a vitória (`is_victory: true`) agora tem uma narração "verdadeira" (herói com o Diário de Aldric, liberta o espírito de Aldric) ou "sombria" (destruição por força bruta), decidida automaticamente pela IA a partir do inventário — sem exigir novo campo no schema.

### Adicionado (Docker e deploy)

- **Docker para desenvolvimento** ([Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml)): frontend e backend rodam juntos num único container (`pnpm dev:all`), com hot reload via bind mount + polling e a `OPENAI_API_KEY` injetada só em runtime (nunca copiada para a imagem).
- **Docker para produção** ([Dockerfile.prod](Dockerfile.prod), [docker-compose.prod.yml](docker-compose.prod.yml)): build multi-stage que gera o bundle do frontend (`pnpm build`) e roda o backend compilado via `tsx`, sem `devDependencies` nem código-fonte do frontend na imagem final.
- **Guia de deploy em produção** ([DEPLOY.md](DEPLOY.md)): como buildar e rodar a imagem de produção, variáveis de ambiente esperadas, HTTPS/proxy reverso, onde hospedar, operação (logs, health check, rotação de chave da OpenAI) e limitações a considerar antes de expor publicamente.
- READMEs detalhados por pacote: [ai/README.md](ai/README.md), [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md), além de uma seção de Docker no [README.md](README.md) raiz.

### Alterado

- [backend/src/server.ts](backend/src/server.ts) passa a servir o build estático do frontend (`dist/`, gerado por `pnpm build`) via `express.static`, com fallback de SPA (`index.html`) para qualquer rota fora de `/api/*` — necessário para o backend sozinho conseguir servir o app inteiro em produção, sem depender do Vite.

## Linha de base (antes desta data)

Estado do projeto ao início da documentação/dockerização, para referência:

### Adicionado

- Jogo de RPG em texto narrado por um Mestre baseado em LLM (OpenAI), com dado de 1–10 **rolado no servidor** (nunca pelo modelo) e resposta estruturada via function calling forçado (`game_response`).
- Base de conhecimento fixa (regiões, bestiário, itens, guardrails) em [ai/knowledgeBase.ts](ai/knowledgeBase.ts).
- Monorepo pnpm com três pacotes: [`@rpg-master/ai`](ai) (domínio do jogo), [`@rpg-master/backend`](backend) (API Express 5) e [`@rpg-master/frontend`](frontend) (React 19 + Tailwind 4).
- Backend com rotas `/api/health`, `/api/game/start`, `/api/game/action`, `/api/game/image`, validação de entrada e tratamento de erros (`400`/`500`/`502`).
- Frontend com telas de boas-vindas, jogo (chat + painel do personagem) e fim de jogo (derrota/vitória); ilustração de cena gerada por IA (liga/desliga persistido); narração por voz via Web Speech API.

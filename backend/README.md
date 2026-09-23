# @rpggg/backend

API Express. Única parte que conhece `ANTHROPIC_API_KEY`.

| Rota | Descrição |
| --- | --- |
| `GET /api/health` | health check |
| `POST /api/game/start` | cena de abertura |
| `POST /api/game/action` | `{ action, character, history }` → próxima cena |

```
cd backend
cp .env.example .env   # preencher ANTHROPIC_API_KEY
npm install
npm run dev             # porta 3001
```

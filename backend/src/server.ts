import express, { type NextFunction, type Request, type Response } from 'express';
import { callGameMaster, getOpeningScene } from './ai/index.js';
import type { CharacterStatus, HistoryMessage } from './ai/index.js';

const PORT = Number(process.env.BACKEND_PORT || 3001);
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.warn('[backend] ANTHROPIC_API_KEY não definida — as rotas /api/game/* vão responder 500.');
}

const app = express();
app.use(express.json({ limit: '64kb' }));

// ── Validação ──────────────────────────────────────────────────────
function isCharacter(v: unknown): v is CharacterStatus {
  const c = v as CharacterStatus;
  return (
    !!c &&
    Number.isFinite(c.health) &&
    Number.isFinite(c.maxHealth) &&
    Number.isFinite(c.gold) &&
    Number.isFinite(c.level) &&
    Number.isFinite(c.xp) &&
    typeof c.location === 'string' &&
    Array.isArray(c.inventory) &&
    c.inventory.every((i) => typeof i === 'string')
  );
}

function isHistory(v: unknown): v is HistoryMessage[] {
  return (
    Array.isArray(v) &&
    v.length <= 50 &&
    v.every(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length <= 8000,
    )
  );
}

// ── Rotas ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/game/start', async (_req, res, next) => {
  try {
    if (!API_KEY) return void res.status(500).json({ error: 'Servidor sem ANTHROPIC_API_KEY configurada.' });
    res.json(await getOpeningScene(API_KEY));
  } catch (err) {
    next(err);
  }
});

app.post('/api/game/action', async (req, res, next) => {
  try {
    if (!API_KEY) return void res.status(500).json({ error: 'Servidor sem ANTHROPIC_API_KEY configurada.' });

    const { action, character, history } = req.body ?? {};
    if (typeof action !== 'string' || !action.trim() || action.length > 500) {
      return void res.status(400).json({ error: 'Ação inválida.' });
    }
    if (!isCharacter(character)) return void res.status(400).json({ error: 'Personagem inválido.' });
    if (!isHistory(history ?? [])) return void res.status(400).json({ error: 'Histórico inválido.' });

    res.json(await callGameMaster(API_KEY, action.trim(), character, history ?? []));
  } catch (err) {
    next(err);
  }
});

// ── Erros ──────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[backend]', err);
  res.status(502).json({ error: err.message || 'Falha ao consultar o Mestre.' });
});

app.listen(PORT, () => {
  console.log(`[backend] API rodando em http://localhost:${PORT}`);
});

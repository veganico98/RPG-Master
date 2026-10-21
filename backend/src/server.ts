import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  callGameMaster,
  characterFromResponse,
  generateSceneImage,
  generateSpeech,
  getOpeningScene,
  HERO_ORIGINS,
  isTtsVoice,
} from '@rpg-master/ai';
import type { GameResponse, HeroOriginId, HistoryMessage } from '@rpg-master/ai';
import { createSessionSigner, type GameState } from './session';
import { rateLimit } from './rateLimit';
import { RoomStore } from './rooms';
import { roomRouter } from './roomRoutes';

const PORT = Number(process.env.BACKEND_PORT || 3001);
const API_KEY = process.env.OPENAI_API_KEY;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const TRUST_PROXY = process.env.TRUST_PROXY;

if (!API_KEY) {
  console.warn('[backend] OPENAI_API_KEY não definida — as rotas /api/game/* vão responder 500.');
}
if (!N8N_WEBHOOK_URL) {
  console.warn('[backend] N8N_WEBHOOK_URL não definida — /api/game/send-summary vai responder 500.');
}
if (!SESSION_SECRET) {
  console.warn('[backend] SESSION_SECRET não definida — usando um segredo aleatório; partidas salvas não sobrevivem a um restart.');
}

const sessions = createSessionSigner(SESSION_SECRET || randomBytes(32).toString('hex'));

const app = express();
// Atrás de proxy reverso (nginx, Caddy, load balancer), req.ip só reflete o
// cliente real se o Express confiar no cabeçalho X-Forwarded-For.
if (TRUST_PROXY) {
  app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY === 'true' ? true : TRUST_PROXY);
}
app.use(express.json({ limit: '64kb' }));

// ── Limites de requisição por IP ──────────────────────────────────────
const TEN_MINUTES = 10 * 60 * 1000;
const gameLimit = rateLimit({ max: 30, windowMs: TEN_MINUTES, message: 'Muitas jogadas em pouco tempo. Aguarde alguns minutos.' });
const imageLimit = rateLimit({ max: 30, windowMs: TEN_MINUTES, message: 'Muitas ilustrações em pouco tempo. Aguarde alguns minutos.' });
const speechLimit = rateLimit({ max: 60, windowMs: TEN_MINUTES, message: 'Muitas narrações em pouco tempo. Aguarde alguns minutos.' });
const summaryLimit = rateLimit({ max: 5, windowMs: 60 * 60 * 1000, message: 'Muitos e-mails enviados. Tente novamente mais tarde.' });

// ── Modo plateia (votação pelo celular) ───────────────────────────────
const rooms = new RoomStore();
setInterval(() => rooms.sweep(), TEN_MINUTES).unref();
app.use('/api/rooms', roomRouter(rooms));

// ── Validação ──────────────────────────────────────────────────────
function isOrigin(v: unknown): v is HeroOriginId {
  return typeof v === 'string' && v in HERO_ORIGINS;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Resposta do Mestre + o novo estado assinado que o cliente devolve no próximo turno. */
function withState(game: GameResponse, id: string, turn: number) {
  const state: Omit<GameState, 'iat'> = {
    id,
    turn,
    character: characterFromResponse(game.character_status),
    outcome: game.is_victory ? 'vitoria' : game.is_game_over ? 'derrota' : null,
  };
  return { ...game, state_token: sessions.sign(state) };
}

// ── Rotas ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: !!API_KEY, hasEmail: !!N8N_WEBHOOK_URL });
});

app.post('/api/game/start', gameLimit, async (req, res, next) => {
  try {
    if (!API_KEY) return void res.status(500).json({ error: 'Servidor sem OPENAI_API_KEY configurada.' });

    const { origin } = req.body ?? {};
    if (origin !== undefined && !isOrigin(origin)) {
      return void res.status(400).json({ error: 'Origem do herói inválida.' });
    }

    res.json(withState(await getOpeningScene(API_KEY, origin), randomUUID(), 1));
  } catch (err) {
    next(err);
  }
});

app.post('/api/game/action', gameLimit, async (req, res, next) => {
  try {
    if (!API_KEY) return void res.status(500).json({ error: 'Servidor sem OPENAI_API_KEY configurada.' });

    const { action, history, state_token } = req.body ?? {};
    if (typeof action !== 'string' || !action.trim() || action.length > 500) {
      return void res.status(400).json({ error: 'Ação inválida.' });
    }
    if (!isHistory(history ?? [])) return void res.status(400).json({ error: 'Histórico inválido.' });

    // Personagem e turno vêm do estado assinado, nunca do corpo da requisição.
    const state = sessions.verify(state_token);
    if (!state) return void res.status(401).json({ error: 'Partida inválida ou expirada. Comece uma nova aventura.' });
    if (state.outcome) return void res.status(409).json({ error: 'Esta aventura já terminou.' });

    const turn = state.turn + 1;
    const game = await callGameMaster(API_KEY, action.trim(), state.character, history ?? [], turn);
    res.json(withState(game, state.id, turn));
  } catch (err) {
    next(err);
  }
});

app.post('/api/game/image', imageLimit, async (req, res, next) => {
  try {
    if (!API_KEY) return void res.status(500).json({ error: 'Servidor sem OPENAI_API_KEY configurada.' });

    const { prompt } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 800) {
      return void res.status(400).json({ error: 'Descrição da cena inválida.' });
    }
    res.json({ image: await generateSceneImage(API_KEY, prompt.trim()) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/game/speech', speechLimit, async (req, res, next) => {
  try {
    if (!API_KEY) return void res.status(500).json({ error: 'Servidor sem OPENAI_API_KEY configurada.' });

    const { text, voice, speed } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
      return void res.status(400).json({ error: 'Texto para narração inválido.' });
    }
    if (voice !== undefined && !isTtsVoice(voice)) {
      return void res.status(400).json({ error: 'Voz inválida.' });
    }
    const rate = typeof speed === 'number' && Number.isFinite(speed) ? speed : 1;

    res.json({ audio: await generateSpeech(API_KEY, text.trim(), voice, rate) });
  } catch (err) {
    next(err);
  }
});

// Partidas cujo resumo já foi enviado (1 e-mail por partida). Em memória:
// some num restart, o que no pior caso permite um envio a mais.
const sentSummaries = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [id, expiresAt] of sentSummaries) if (expiresAt <= now) sentSummaries.delete(id);
}, 60 * 60 * 1000).unref();

app.post('/api/game/send-summary', summaryLimit, async (req, res, next) => {
  try {
    if (!N8N_WEBHOOK_URL) return void res.status(500).json({ error: 'Servidor sem N8N_WEBHOOK_URL configurada.' });

    const { email, summary, state_token } = req.body ?? {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 200) {
      return void res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (typeof summary !== 'string' || !summary.trim() || summary.length > 8000) {
      return void res.status(400).json({ error: 'Resumo inválido.' });
    }

    // Só uma partida terminada, emitida por este servidor, pode gerar e-mail.
    // Desfecho e personagem vêm do estado assinado.
    const state = sessions.verify(state_token);
    if (!state) return void res.status(401).json({ error: 'Partida inválida ou expirada.' });
    if (!state.outcome) return void res.status(409).json({ error: 'A aventura ainda não terminou.' });
    if (sentSummaries.has(state.id)) {
      return void res.status(409).json({ error: 'O resumo desta aventura já foi enviado.' });
    }
    sentSummaries.set(state.id, Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: email,
          outcome: state.outcome,
          summary: summary.trim(),
          character: state.character,
          sentAt: new Date().toISOString(),
        }),
      });
      if (!n8nResponse.ok) {
        throw new Error(`Falha ao acionar o n8n (status ${n8nResponse.status}).`);
      }
    } catch (err) {
      sentSummaries.delete(state.id); // libera nova tentativa
      throw err;
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Frontend estático (produção) ─────────────────────────────────────
// Em dev, o Vite serve o frontend e faz proxy de /api para este processo.
// Em produção não há Vite: se `pnpm build` já rodou (existe dist/ na raiz
// do monorepo), este mesmo servidor também serve os arquivos estáticos e
// devolve index.html para qualquer rota que não seja /api/* (SPA fallback).
const distDir = path.resolve(process.cwd(), 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ── Erros ──────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[backend]', err);
  res.status(502).json({ error: err.message || 'Falha ao consultar o Mestre.' });
});

app.listen(PORT, () => {
  console.log(`[backend] API rodando em http://localhost:${PORT}`);
});

import { Router } from 'express';
import type { Path } from '@rpg-master/ai';
import { CODE_LENGTH, type RoomStore } from './rooms';
import { rateLimit } from './rateLimit';

const TEN_MINUTES = 10 * 60 * 1000;
// Limites generosos: numa apresentação, a plateia inteira costuma sair pelo
// mesmo IP (Wi-Fi do local), então o limite vale para todos os celulares juntos.
const createLimit = rateLimit({ max: 20, windowMs: 60 * 60 * 1000, message: 'Muitas salas criadas. Tente mais tarde.' });
const hostLimit = rateLimit({ max: 600, windowMs: TEN_MINUTES, message: 'Muitas ações do telão. Aguarde um pouco.' });
const voteLimit = rateLimit({ max: 6000, windowMs: TEN_MINUTES, message: 'Muitos votos. Aguarde um pouco.' });

const CODE_RE = new RegExp(`^[A-Z2-9]{${CODE_LENGTH}}$`);

function voterIdFrom(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : undefined;
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.length <= max ? v : undefined;
}

function parseOptions(v: unknown): Path[] | undefined {
  if (!Array.isArray(v) || v.length < 1 || v.length > 4) return undefined;
  const options: Path[] = [];
  for (const o of v) {
    const title = str(o?.title, 80);
    const description = str(o?.description ?? '', 300);
    if (!Number.isInteger(o?.id) || !title?.trim() || description === undefined) return undefined;
    options.push({ id: o.id, title, description });
  }
  return new Set(options.map((o) => o.id)).size === options.length ? options : undefined;
}

/**
 * Rotas do modo plateia.
 * - Telão: cria a sala e controla as rodadas com a `hostKey` (POST /:code/host).
 * - Celulares: consultam o estado (GET /:code) e votam (POST /:code/vote).
 */
export function roomRouter(store: RoomStore): Router {
  const router = Router();
  const findRoom = (code: unknown) => (typeof code === 'string' && CODE_RE.test(code) ? store.get(code) : undefined);

  router.post('/', createLimit, (_req, res) => {
    const created = store.create();
    if (!created) return void res.status(503).json({ error: 'Limite de salas atingido. Tente mais tarde.' });
    res.status(201).json(created);
  });

  router.get('/:code', (req, res) => {
    const room = findRoom(req.params.code);
    if (!room) return void res.status(404).json({ error: 'Sala não encontrada.' });
    const voter = voterIdFrom(req.query.voter);
    if (voter) store.touch(room, voter);
    res.json(store.state(room, voter));
  });

  router.post('/:code/vote', voteLimit, (req, res) => {
    const room = findRoom(req.params.code);
    if (!room) return void res.status(404).json({ error: 'Sala não encontrada.' });

    const { voterId, round, optionId } = req.body ?? {};
    const voter = voterIdFrom(voterId);
    if (!voter || !Number.isInteger(round) || !Number.isInteger(optionId)) {
      return void res.status(400).json({ error: 'Voto inválido.' });
    }

    const result = store.vote(room, voter, round, optionId);
    store.touch(room, voter);
    if (result !== 'ok') {
      const message = {
        not_voting: 'A votação não está aberta.',
        stale_round: 'Essa rodada já passou.',
        invalid_option: 'Opção inválida.',
        full: 'A sala atingiu o limite de participantes.',
      }[result];
      return void res.status(409).json({ error: message, state: store.state(room, voter) });
    }
    res.json(store.state(room, voter));
  });

  router.post('/:code/host', hostLimit, (req, res) => {
    const room = findRoom(req.params.code);
    if (!room) return void res.status(404).json({ error: 'Sala não encontrada.' });
    const body = req.body ?? {};
    if (!store.isHost(room, body.hostKey)) return void res.status(403).json({ error: 'Chave do telão inválida.' });

    switch (body.op) {
      case 'round': {
        const options = parseOptions(body.options);
        const event = str(body.event ?? '', 100);
        const narration = str(body.narration ?? '', 6000);
        const durationSec = body.durationSec;
        const dice = body.dice ?? null;
        const resultType = body.resultType ?? null;
        const diceOk = dice === null || (Number.isInteger(dice) && dice >= 1 && dice <= 10);
        const resultOk = resultType === null || resultType === 'ruim' || resultType === 'medio' || resultType === 'bom';
        if (!options || event === undefined || narration === undefined || !diceOk || !resultOk || !Number.isInteger(durationSec) || durationSec < 5 || durationSec > 300) {
          return void res.status(400).json({ error: 'Rodada inválida.' });
        }
        store.openRound(room, { event, narration, dice, resultType, options, durationSec });
        break;
      }
      case 'extend': {
        const seconds = body.seconds;
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) return void res.status(400).json({ error: 'Tempo inválido.' });
        store.extend(room, seconds);
        break;
      }
      case 'waiting':
        store.setWaiting(room);
        break;
      case 'close':
        store.close(room);
        break;
      case 'end':
        if (body.outcome !== 'vitoria' && body.outcome !== 'derrota') return void res.status(400).json({ error: 'Desfecho inválido.' });
        store.end(room, body.outcome);
        break;
      default:
        return void res.status(400).json({ error: 'Operação inválida.' });
    }
    res.json(store.state(room));
  });

  return router;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CharacterStatus } from '@rpg-master/ai';

export type GameOutcome = 'vitoria' | 'derrota';

/**
 * Estado autoritativo de uma partida. Viaja com o cliente como token assinado
 * (HMAC-SHA256): o servidor não guarda nada em memória, mas também não aceita
 * personagem nem turno que ele mesmo não tenha emitido.
 */
export interface GameState {
  /** Identifica a partida (usado para limitar a 1 e-mail de resumo por partida). */
  id: string;
  /** Último turno já narrado (a abertura é o turno 1). */
  turn: number;
  character: CharacterStatus;
  outcome: GameOutcome | null;
  /** Emitido em (epoch ms). */
  iat: number;
}

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isState(v: unknown): v is GameState {
  const s = v as GameState;
  return (
    !!s &&
    typeof s.id === 'string' &&
    Number.isInteger(s.turn) &&
    s.turn >= 1 &&
    Number.isFinite(s.iat) &&
    (s.outcome === null || s.outcome === 'vitoria' || s.outcome === 'derrota') &&
    !!s.character &&
    Array.isArray(s.character.inventory)
  );
}

export function createSessionSigner(secret: string, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const mac = (data: string) => createHmac('sha256', secret).update(data).digest();

  return {
    sign(state: Omit<GameState, 'iat'>, now = Date.now()): string {
      const body = Buffer.from(JSON.stringify({ ...state, iat: now })).toString('base64url');
      return `${body}.${mac(body).toString('base64url')}`;
    },

    /** Devolve o estado se a assinatura confere e o token não expirou; senão, null. */
    verify(token: unknown, now = Date.now()): GameState | null {
      if (typeof token !== 'string' || token.length > 16_000) return null;
      const [body, sig, ...rest] = token.split('.');
      if (!body || !sig || rest.length) return null;

      const expected = mac(body);
      const given = Buffer.from(sig, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

      let state: unknown;
      try {
        state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      if (!isState(state) || now - state.iat > maxAgeMs) return null;
      return state;
    },
  };
}

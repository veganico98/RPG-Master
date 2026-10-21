import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { GameResponse, Path, RoomPhase, RoomState } from '@rpg-master/ai';

/** Sem 0/O/1/I, para dar para digitar o código lendo do telão. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
/** Quanto tempo depois da última consulta um celular ainda conta como "na plateia". */
const AUDIENCE_WINDOW_MS = 15_000;
/** Teto de votantes por sala, para limitar memória. */
const MAX_VOTERS = 2000;

interface Room {
  code: string;
  hostKey: string;
  round: number;
  phase: RoomPhase;
  event: string;
  narration: string;
  dice: number | null;
  resultType: GameResponse['result_type'] | null;
  options: Path[];
  votes: Map<string, number>;
  closesAt: number | null;
  winnerId: number | null;
  outcome: 'vitoria' | 'derrota' | null;
  seen: Map<string, number>;
  updatedAt: number;
}

export type VoteResult = 'ok' | 'not_voting' | 'stale_round' | 'invalid_option' | 'full';

export interface RoundInput {
  event: string;
  narration: string;
  dice?: number | null;
  resultType?: GameResponse['result_type'] | null;
  options: Path[];
  durationSec: number;
}

/**
 * Salas do modo plateia, em memória. Somem num restart e expiram depois de
 * `idleMs` sem atividade. Para várias instâncias, troque por Redis.
 */
export class RoomStore {
  private rooms = new Map<string, Room>();
  private readonly maxRooms: number;
  private readonly idleMs: number;
  private readonly now: () => number;

  constructor(opts: { maxRooms?: number; idleMs?: number; now?: () => number } = {}) {
    this.maxRooms = opts.maxRooms ?? 200;
    this.idleMs = opts.idleMs ?? 4 * 60 * 60 * 1000;
    this.now = opts.now ?? Date.now;
  }

  /** Cria uma sala vazia. Retorna null se o limite de salas foi atingido. */
  create(): { code: string; hostKey: string } | null {
    this.sweep();
    if (this.rooms.size >= this.maxRooms) return null;

    let code: string;
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));

    const hostKey = randomBytes(32).toString('hex');
    this.rooms.set(code, {
      code,
      hostKey,
      round: 0,
      phase: 'waiting',
      event: '',
      narration: '',
      dice: null,
      resultType: null,
      options: [],
      votes: new Map(),
      closesAt: null,
      winnerId: null,
      outcome: null,
      seen: new Map(),
      updatedAt: this.now(),
    });
    return { code, hostKey };
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code);
    if (room && this.now() - room.updatedAt > this.idleMs) {
      this.rooms.delete(code);
      return undefined;
    }
    return room;
  }

  isHost(room: Room, key: unknown): boolean {
    if (typeof key !== 'string' || key.length !== room.hostKey.length) return false;
    return timingSafeEqual(Buffer.from(key), Buffer.from(room.hostKey));
  }

  /** Nova rodada: troca as opções, zera os votos e liga o cronômetro. */
  openRound(room: Room, input: RoundInput): void {
    room.round++;
    room.phase = 'voting';
    room.event = input.event;
    room.narration = input.narration;
    room.dice = input.dice ?? null;
    room.resultType = input.resultType ?? null;
    room.options = input.options;
    room.votes.clear();
    room.closesAt = this.now() + input.durationSec * 1000;
    room.winnerId = null;
    room.outcome = null;
    room.updatedAt = this.now();
  }

  /** Estende o cronômetro da rodada aberta. */
  extend(room: Room, seconds: number): void {
    if (room.phase !== 'voting') return;
    room.closesAt = Math.max(room.closesAt ?? this.now(), this.now()) + seconds * 1000;
    room.updatedAt = this.now();
  }

  /** O Mestre está narrando: celulares mostram "aguarde". */
  setWaiting(room: Room): void {
    room.phase = 'waiting';
    room.closesAt = null;
    room.updatedAt = this.now();
  }

  /**
   * Encerra a rodada e apura. Empate é decidido por sorteio entre os
   * empatados; sem votos, não há vencedor (winnerId null).
   */
  close(room: Room): number | null {
    if (room.phase !== 'voting') return room.winnerId;
    const counts = this.counts(room);
    const max = Math.max(0, ...counts.values());
    const leaders = max > 0 ? room.options.filter((o) => counts.get(o.id) === max).map((o) => o.id) : [];
    room.winnerId = leaders.length ? leaders[randomInt(leaders.length)] : null;
    room.phase = 'closed';
    room.closesAt = null;
    room.updatedAt = this.now();
    return room.winnerId;
  }

  end(room: Room, outcome: 'vitoria' | 'derrota'): void {
    room.phase = 'ended';
    room.outcome = outcome;
    room.options = [];
    room.votes.clear();
    room.closesAt = null;
    room.updatedAt = this.now();
  }

  /** Registra (ou troca) o voto de um celular na rodada atual. */
  vote(room: Room, voterId: string, round: number, optionId: number): VoteResult {
    if (room.phase !== 'voting') return 'not_voting';
    if (round !== room.round) return 'stale_round';
    if (!room.options.some((o) => o.id === optionId)) return 'invalid_option';
    if (!room.votes.has(voterId) && room.votes.size >= MAX_VOTERS) return 'full';
    room.votes.set(voterId, optionId);
    room.updatedAt = this.now();
    return 'ok';
  }

  /** Marca um celular como presente (para o contador de plateia). */
  touch(room: Room, voterId: string): void {
    if (!room.seen.has(voterId) && room.seen.size >= MAX_VOTERS) return;
    room.seen.set(voterId, this.now());
  }

  state(room: Room, voterId?: string): RoomState {
    const now = this.now();
    const counts = this.counts(room);
    let audience = 0;
    for (const [id, at] of room.seen) {
      if (now - at <= AUDIENCE_WINDOW_MS) audience++;
      else room.seen.delete(id);
    }
    return {
      code: room.code,
      round: room.round,
      phase: room.phase,
      event: room.event,
      narration: room.narration,
      dice: room.dice,
      resultType: room.resultType,
      options: room.options.map((o) => ({ ...o, votes: counts.get(o.id) ?? 0 })),
      totalVotes: room.votes.size,
      closesAt: room.closesAt,
      serverNow: now,
      winnerId: room.winnerId,
      outcome: room.outcome,
      audience,
      myVote: voterId ? (room.votes.get(voterId) ?? null) : null,
    };
  }

  /** Remove salas paradas há mais de `idleMs`. */
  sweep(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) if (now - room.updatedAt > this.idleMs) this.rooms.delete(code);
  }

  private counts(room: Room): Map<number, number> {
    const counts = new Map<number, number>();
    for (const optionId of room.votes.values()) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    return counts;
  }
}

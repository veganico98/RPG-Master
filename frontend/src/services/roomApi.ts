import type { Path } from '@rpg-master/ai/types';
import type { RoomState } from '@rpg-master/ai/room';

export type { RoomState };

/** Erro de API com o status HTTP (404 = sala sumiu, por exemplo). */
export class RoomApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new RoomApiError(error?.error || `API error: ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

const post = <T>(url: string, body: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) });

// ── Telão ─────────────────────────────────────────────────────────────
export interface HostRoom {
  code: string;
  hostKey: string;
}

export function createRoom(): Promise<HostRoom> {
  return post<HostRoom>('/api/rooms', {});
}

type HostOp =
  | {
      op: 'round';
      event: string;
      narration: string;
      dice?: number | null;
      resultType?: 'ruim' | 'medio' | 'bom' | null;
      options: Path[];
      durationSec: number;
    }
  | { op: 'extend'; seconds: number }
  | { op: 'waiting' }
  | { op: 'close' }
  | { op: 'end'; outcome: 'vitoria' | 'derrota' };

export function hostRoom(room: HostRoom, op: HostOp): Promise<RoomState> {
  return post<RoomState>(`/api/rooms/${room.code}/host`, { hostKey: room.hostKey, ...op });
}

// ── Celular ───────────────────────────────────────────────────────────
export function getRoom(code: string, voterId?: string): Promise<RoomState> {
  const query = voterId ? `?voter=${encodeURIComponent(voterId)}` : '';
  return request<RoomState>(`/api/rooms/${code}${query}`);
}

export function voteInRoom(code: string, voterId: string, round: number, optionId: number): Promise<RoomState> {
  return post<RoomState>(`/api/rooms/${code}/vote`, { voterId, round, optionId });
}

/** Link que vai no QR Code. */
export function voteUrl(code: string): string {
  return `${window.location.origin}/v/${code}`;
}

/** Segundos restantes do cronômetro, corrigindo a diferença entre o relógio do aparelho e o do servidor. */
export function secondsLeft(state: RoomState, clockOffsetMs: number): number | null {
  if (state.closesAt === null) return null;
  return Math.max(0, Math.ceil((state.closesAt - (Date.now() + clockOffsetMs)) / 1000));
}

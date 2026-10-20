import type { GameResponse } from './types';

/**
 * Modo plateia: a tela principal (o "telão") abre uma sala e cada cena vira
 * uma rodada de votação; o público vota pelo celular e a opção mais votada é
 * executada. Estes são os contratos entre backend e as duas telas.
 */

/** waiting = o Mestre está narrando; voting = votação aberta; closed = rodada encerrada; ended = fim de jogo. */
export type RoomPhase = 'waiting' | 'voting' | 'closed' | 'ended';

export interface RoomOption {
  id: number;
  title: string;
  description: string;
  votes: number;
}

/** O que qualquer pessoa com o código da sala enxerga. */
export interface RoomState {
  code: string;
  round: number;
  phase: RoomPhase;
  /** Título da cena em votação. */
  event: string;
  /** Narração completa da cena (com o log de combate), para quem acompanha só pelo celular. */
  narration: string;
  /** Dado rolado pelo servidor nesta cena (1–10) e sua classificação; null antes da primeira cena. */
  dice: number | null;
  resultType: GameResponse['result_type'] | null;
  options: RoomOption[];
  totalVotes: number;
  /** Fim do cronômetro da rodada (epoch ms, relógio do servidor). */
  closesAt: number | null;
  /** Relógio do servidor no momento da resposta, para corrigir a diferença de horário do celular. */
  serverNow: number;
  winnerId: number | null;
  outcome: 'vitoria' | 'derrota' | null;
  /** Celulares que consultaram a sala nos últimos segundos. */
  audience: number;
  /** Voto de quem fez a consulta (só quando ela informa `voter`). */
  myVote: number | null;
}

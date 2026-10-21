import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Path } from '@rpg-master/ai/types';
import {
  createRoom,
  getRoom,
  hostRoom,
  RoomApiError,
  secondsLeft,
  voteUrl,
  type HostRoom,
  type RoomState,
} from './services/roomApi';

// Modo plateia, lado do telão: abre a sala, mostra o QR Code, transforma cada
// cena numa rodada de votação e, quando o tempo acaba, entrega a opção vencedora.

export const VOTE_SECONDS = 300;
const POLL_MS = 1000;
const ROOM_KEY = 'rpg-room';

function loadRoom(): HostRoom | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROOM_KEY) ?? 'null') as HostRoom | null;
    return parsed?.code && parsed?.hostKey ? parsed : null;
  } catch {
    return null;
  }
}

function saveRoom(room: HostRoom | null) {
  try {
    if (room) localStorage.setItem(ROOM_KEY, JSON.stringify(room));
    else localStorage.removeItem(ROOM_KEY);
  } catch {
    /* sem persistência */
  }
}

export interface Audience {
  room: HostRoom | null;
  state: RoomState | null;
  secondsLeft: number | null;
  error: string;
  enable: () => Promise<void>;
  disable: () => void;
  openRound: (round: {
    event: string;
    narration: string;
    dice?: number;
    resultType?: 'ruim' | 'medio' | 'bom';
    options: Path[];
  }) => void;
  setWaiting: () => void;
  end: (outcome: 'vitoria' | 'derrota') => void;
  closeNow: () => void;
  extend: (seconds: number) => void;
}

/**
 * `onWinner` é chamado uma vez por rodada, com o id da opção vencedora
 * (null se ninguém votou e a rodada foi encerrada na mão).
 */
export function useAudience(onWinner: (optionId: number | null, state: RoomState) => void): Audience {
  const [room, setRoom] = useState<HostRoom | null>(loadRoom);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const clockOffset = useRef(0);
  const closingRound = useRef(0);
  const onWinnerRef = useRef(onWinner);
  onWinnerRef.current = onWinner;

  const apply = useCallback((s: RoomState) => {
    clockOffset.current = s.serverNow - Date.now();
    setState(s);
  }, []);

  const fail = useCallback((err: unknown) => {
    if (err instanceof RoomApiError && (err.status === 404 || err.status === 403)) {
      // Sala expirou ou o servidor reiniciou: desliga a plateia em vez de insistir.
      saveRoom(null);
      setRoom(null);
      setState(null);
      setError('A sala da plateia expirou. Ative de novo para gerar um novo QR Code.');
      return;
    }
    setError(err instanceof Error ? err.message : 'Falha na sala da plateia.');
  }, []);

  const send = useCallback(
    (op: Parameters<typeof hostRoom>[1]) => {
      if (!room) return Promise.resolve(null);
      return hostRoom(room, op)
        .then((s) => {
          apply(s);
          setError('');
          return s;
        })
        .catch((err) => {
          fail(err);
          return null;
        });
    },
    [room, apply, fail],
  );

  // Estado da sala (votos chegando, plateia conectada).
  useEffect(() => {
    if (!room) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        apply(await getRoom(room.code));
      } catch (err) {
        fail(err);
        if (err instanceof RoomApiError && err.status === 404) return;
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [room, apply, fail]);

  // Cronômetro na tela.
  useEffect(() => {
    if (!room) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [room]);

  const left = state ? secondsLeft(state, clockOffset.current) : null;

  const close = useCallback(async () => {
    if (!state || state.phase !== 'voting' || closingRound.current === state.round) return;
    closingRound.current = state.round;
    const closed = await send({ op: 'close' });
    if (closed) onWinnerRef.current(closed.winnerId, closed);
  }, [state, send]);

  // Tempo esgotado com pelo menos um voto: apura sozinho. Sem votos, espera
  // (o apresentador pode clicar numa opção, dar +15s ou encerrar na mão).
  useEffect(() => {
    if (state?.phase === 'voting' && left === 0 && state.totalVotes > 0) void close();
  }, [state, left, close]);

  return {
    room,
    state,
    secondsLeft: left,
    error,
    enable: async () => {
      setError('');
      try {
        const created = await createRoom();
        saveRoom(created);
        setRoom(created);
      } catch (err) {
        fail(err);
      }
    },
    disable: () => {
      saveRoom(null);
      setRoom(null);
      setState(null);
      setError('');
    },
    openRound: (round) => void send({ op: 'round', durationSec: VOTE_SECONDS, ...round }),
    setWaiting: () => void send({ op: 'waiting' }),
    end: (outcome) => void send({ op: 'end', outcome }),
    closeNow: () => void close(),
    extend: (seconds) => void send({ op: 'extend', seconds }),
  };
}

// ── QR Code ───────────────────────────────────────────────────────────
function useQrDataUrl(text: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return setUrl(null);
    let active = true;
    QRCode.toDataURL(text, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#0d0b0e', light: '#e8dcc8' } })
      .then((u) => active && setUrl(u))
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [text]);
  return url;
}

const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

/** QR Code grande, para projetar no início da apresentação. */
export function AudienceModal({ audience, onClose }: { audience: Audience; onClose: () => void }) {
  const link = audience.room ? voteUrl(audience.room.code) : null;
  const qr = useQrDataUrl(link);
  if (!audience.room) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#0d0b0ee6' }}
      onClick={onClose}
    >
      <div
        className="rounded p-6 flex flex-col items-center gap-4 max-w-lg w-full text-center"
        style={{ background: '#161218', border: '1px solid #c9922a' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-cinzel text-2xl font-bold" style={{ color: '#c9922a' }}>
          📱 Vote pelo celular
        </h2>
        <p className="font-crimson text-lg" style={{ color: '#b8a88a' }}>
          Escaneie o QR Code e escolha o próximo passo do herói. A opção mais votada é executada.
        </p>
        {qr ? (
          <img src={qr} alt={`QR Code para ${link}`} className="rounded w-full max-w-[360px] aspect-square" />
        ) : (
          <div className="w-full max-w-[360px] aspect-square rounded animate-pulse" style={{ background: '#1e1824' }} />
        )}
        <div className="font-mono text-sm break-all" style={{ color: '#e8dcc8' }}>
          {link}
        </div>
        <div className="font-mono text-4xl font-bold tracking-[0.3em]" style={{ color: '#c9922a' }}>
          {audience.room.code}
        </div>
        <div className="font-mono text-sm" style={{ color: '#7a6e5e' }}>
          👥 {audience.state?.audience ?? 0} conectados
        </div>
        {isLocalhost() && (
          <p className="font-mono text-xs" style={{ color: '#e0a052' }}>
            Você abriu o jogo em localhost: o celular não alcança esse endereço. Abra o jogo pelo IP da rede (ex.: http://192.168.x.x:8443) ou pelo site publicado.
          </p>
        )}
        <div className="flex gap-2 w-full">
          <button
            onClick={onClose}
            className="flex-1 rounded py-3 font-cinzel font-bold uppercase tracking-wider"
            style={{ background: '#c9922a', color: '#0d0b0e' }}
          >
            Começar
          </button>
          <button
            onClick={() => {
              audience.disable();
              onClose();
            }}
            className="rounded px-4 py-3 font-mono text-xs uppercase tracking-wider"
            style={{ background: '#1a1520', color: '#7a6e5e', border: '1px solid #2a2030' }}
          >
            Desligar plateia
          </button>
        </div>
      </div>
    </div>
  );
}

/** QR pequeno no canto, para quem chegar atrasado. Clique para ampliar. */
export function AudienceCorner({ audience, onExpand }: { audience: Audience; onExpand: () => void }) {
  const link = audience.room ? voteUrl(audience.room.code) : null;
  const qr = useQrDataUrl(link);
  if (!audience.room) return null;
  return (
    <button
      onClick={onExpand}
      className="absolute top-3 right-3 z-20 rounded p-2 hidden lg:flex flex-col items-center gap-1"
      style={{ background: '#161218ee', border: '1px solid #c9922a66' }}
      title="Ampliar QR Code"
    >
      {qr && <img src={qr} alt="QR Code da plateia" className="w-24 h-24 rounded" />}
      <span className="font-mono text-xs font-bold tracking-widest" style={{ color: '#c9922a' }}>
        {audience.room.code}
      </span>
      <span className="font-mono text-[10px]" style={{ color: '#7a6e5e' }}>
        👥 {audience.state?.audience ?? 0}
      </span>
    </button>
  );
}

/** Botão de ligar/abrir a plateia (barra lateral e topo no mobile). */
export function AudienceButton({ audience, onOpen }: { audience: Audience; onOpen: () => void }) {
  const active = !!audience.room;
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => (active ? onOpen() : void audience.enable().then(onOpen))}
        className="rounded py-2 px-3 text-xs font-mono uppercase tracking-wider text-left"
        style={{
          background: active ? '#c9922a22' : '#1a1520',
          color: active ? '#c9922a' : '#b8a88a',
          border: `1px solid ${active ? '#c9922a66' : '#2a2030'}`,
        }}
      >
        {active ? `📱 Plateia ${audience.room!.code} · 👥 ${audience.state?.audience ?? 0}` : '📱 Jogar com a plateia'}
      </button>
      {audience.error && (
        <span className="font-mono text-[11px]" style={{ color: '#e05252' }}>
          {audience.error}
        </span>
      )}
    </div>
  );
}

/** Barra da votação, acima das opções da cena atual. */
export function VoteBar({ audience }: { audience: Audience }) {
  const s = audience.state;
  if (!s || s.phase !== 'voting') return null;
  const left = audience.secondsLeft;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded px-3 py-2 mb-1 font-mono text-xs"
      style={{ background: '#c9922a14', border: '1px solid #c9922a44', color: '#b8a88a' }}
    >
      <span style={{ color: '#c9922a' }}>🗳️ Plateia votando</span>
      <span>
        {s.totalVotes} {s.totalVotes === 1 ? 'voto' : 'votos'} · 👥 {s.audience}
      </span>
      <span className="font-semibold text-sm" style={{ color: left !== null && left <= 5 ? '#e05252' : '#c9922a' }}>
        {left === null ? '' : left > 0 ? `⏳ ${left}s` : s.totalVotes ? 'apurando...' : 'aguardando votos'}
      </span>
      <span className="ml-auto flex gap-2">
        <button onClick={() => audience.extend(15)} className="rounded px-2 py-1" style={{ border: '1px solid #2a2030' }}>
          +15s
        </button>
        <button
          onClick={audience.closeNow}
          className="rounded px-2 py-1"
          style={{ background: '#c9922a', color: '#0d0b0e' }}
        >
          Encerrar votação
        </button>
      </span>
    </div>
  );
}

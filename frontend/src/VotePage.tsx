import { useCallback, useEffect, useRef, useState } from 'react';
import { getRoom, RoomApiError, secondsLeft, voteInRoom, type RoomState } from './services/roomApi';

// Página do celular no modo plateia: o público escaneia o QR Code do telão,
// vê a cena atual e vota no próximo passo do herói.

const POLL_MS = 1500;
const VOTER_KEY = 'rpg-voter';
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

/** Id anônimo e estável deste celular. Usa getRandomValues (funciona também fora de HTTPS, ao contrário de randomUUID). */
function getVoterId(): string {
  try {
    const saved = localStorage.getItem(VOTER_KEY);
    if (saved && /^[a-f0-9]{32}$/.test(saved)) return saved;
  } catch {
    /* sem localStorage: id vale só nesta aba */
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(VOTER_KEY, id);
  } catch {
    /* idem */
  }
  return id;
}

function CodeEntry({ onSubmit, error }: { onSubmit: (code: string) => void; error?: string }) {
  const [value, setValue] = useState('');
  const code = value.trim().toUpperCase();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (CODE_RE.test(code)) onSubmit(code);
      }}
      className="flex flex-col gap-3 mt-10"
    >
      <label className="font-cinzel text-sm uppercase tracking-wider" style={{ color: '#b8a88a' }}>
        Código da sala
      </label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={5}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="EX.: K7Q2M"
        className="rounded px-4 py-4 font-mono text-2xl text-center tracking-[0.4em] uppercase outline-none"
        style={{ background: '#161218', border: '1px solid #2a2030', color: '#e8dcc8' }}
      />
      {error && (
        <p className="font-mono text-xs" style={{ color: '#e05252' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!CODE_RE.test(code)}
        className="rounded py-4 font-cinzel font-bold uppercase tracking-wider"
        style={{ background: CODE_RE.test(code) ? '#c9922a' : '#1a1520', color: CODE_RE.test(code) ? '#0d0b0e' : '#7a6e5e' }}
      >
        Entrar
      </button>
    </form>
  );
}

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Mesmo visual do dado no telão: verde = bom, dourado = médio, vermelho = ruim. */
function DiceBadge({ value, resultType }: { value: number; resultType: RoomState['resultType'] }) {
  const color = resultType === 'ruim' ? '#e05252' : resultType === 'bom' ? '#52e07a' : '#c9922a';
  const label = resultType === 'ruim' ? 'Ruim' : resultType === 'bom' ? 'Bom' : 'Médio';
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs uppercase tracking-wider" style={{ color: '#7a6e5e' }}>
        Dado da cena
      </span>
      <div
        className="inline-flex items-center gap-2 rounded px-3 py-1 font-mono border"
        style={{ borderColor: color, color, background: '#0d0b0ecc' }}
      >
        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{DICE_FACES[Math.min(Math.floor((value - 1) / 1.7), 5)]}</span>
        <span className="text-xl font-bold">{value}</span>
        {resultType && (
          <span className="text-xs px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: `${color}22` }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 mt-16">
      <div className="text-5xl animate-pulse">🎲</div>
      <p className="font-crimson text-xl" style={{ color: '#b8a88a' }}>
        {text}
      </p>
    </div>
  );
}

export default function VotePage({ initialCode }: { initialCode: string | null }) {
  const [code, setCode] = useState<string | null>(initialCode && CODE_RE.test(initialCode) ? initialCode : null);
  const [state, setState] = useState<RoomState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [voteError, setVoteError] = useState('');
  const [, setTick] = useState(0);
  const voterId = useRef(getVoterId()).current;
  const clockOffset = useRef(0);

  const apply = useCallback((s: RoomState) => {
    clockOffset.current = s.serverNow - Date.now();
    setState(s);
    setOffline(false);
  }, []);

  // Consulta o estado da sala a cada POLL_MS.
  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        apply(await getRoom(code, voterId));
      } catch (err) {
        if (err instanceof RoomApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setOffline(true);
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code, voterId, apply]);

  // Atualiza o cronômetro na tela.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  // Rodada nova: limpa erros de voto da rodada anterior.
  const round = state?.round;
  useEffect(() => {
    setVoteError('');
  }, [round]);

  const vote = async (optionId: number) => {
    if (!state || !code || sending !== null) return;
    setSending(optionId);
    setVoteError('');
    try {
      apply(await voteInRoom(code, voterId, state.round, optionId));
      navigator.vibrate?.(30);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Não foi possível votar.');
    } finally {
      setSending(null);
    }
  };

  const enterCode = (c: string) => {
    window.history.replaceState(null, '', `/v/${c}`);
    setNotFound(false);
    setState(null);
    setCode(c);
  };

  const left = state ? secondsLeft(state, clockOffset.current) : null;
  const myVote = state?.myVote ?? null;

  let body: React.ReactNode;
  if (!code || notFound) {
    body = <CodeEntry onSubmit={enterCode} error={notFound ? 'Sala não encontrada. Confira o código no telão.' : undefined} />;
  } else if (!state) {
    body = <Waiting text="Entrando na sala..." />;
  } else if (state.phase === 'ended') {
    const win = state.outcome === 'vitoria';
    body = (
      <div className="flex flex-col items-center text-center gap-3 mt-16">
        <div className="text-6xl">{win ? '🏆' : '💀'}</div>
        <h2 className="font-cinzel text-3xl font-bold" style={{ color: win ? '#52e07a' : '#e05252' }}>
          {win ? 'Vitória!' : 'O herói caiu'}
        </h2>
        <p className="font-crimson text-lg" style={{ color: '#b8a88a' }}>
          {win ? 'Vocês guiaram o herói até a vitória. Obrigado por jogar!' : 'As trevas venceram desta vez. Obrigado por jogar!'}
        </p>
      </div>
    );
  } else if (state.phase === 'waiting') {
    body = <Waiting text={state.round === 0 ? 'Aguardando o Mestre começar a aventura...' : 'O Mestre está narrando o que aconteceu...'} />;
  } else {
    const closed = state.phase === 'closed';
    const winner = state.options.find((o) => o.id === state.winnerId);
    const longStory = state.narration.length > 600;
    body = (
      <div className="flex flex-col gap-4 mt-4">
        <div>
          {state.dice !== null && (
            <div className="mb-3">
              <DiceBadge value={state.dice} resultType={state.resultType} />
            </div>
          )}
          <h2 className="font-cinzel text-xl font-bold leading-tight" style={{ color: '#c9922a' }}>
            {state.event}
          </h2>
          {longStory && !closed && (
            <button
              onClick={() => document.getElementById('opcoes')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-2 rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wider"
              style={{ border: '1px solid #c9922a66', color: '#c9922a' }}
            >
              Ir para a votação ↓
            </button>
          )}
          {state.narration && (
            <p className="font-crimson text-lg mt-3 leading-relaxed whitespace-pre-line" style={{ color: '#e8dcc8' }}>
              {state.narration}
            </p>
          )}
        </div>

        {closed ? (
          <div className="rounded p-4 text-center" style={{ background: '#161218', border: '1px solid #c9922a' }}>
            <div className="font-mono text-xs uppercase tracking-wider mb-1" style={{ color: '#7a6e5e' }}>
              {winner ? 'A plateia escolheu' : 'Ninguém votou'}
            </div>
            <div className="font-cinzel text-lg font-bold" style={{ color: '#c9922a' }}>
              {winner ? winner.title : 'O Mestre decide'}
            </div>
            {winner && myVote === winner.id && (
              <div className="font-crimson text-sm mt-1" style={{ color: '#52e07a' }}>
                Seu voto venceu!
              </div>
            )}
          </div>
        ) : (
          <div id="opcoes" className="flex items-center justify-between font-mono text-xs uppercase tracking-wider scroll-mt-4" style={{ color: '#7a6e5e' }}>
            <span>{myVote === null ? 'Vote no próximo passo' : 'Pode trocar o voto até o fim'}</span>
            {left !== null && (
              <span className="text-base font-semibold normal-case" style={{ color: left <= 5 ? '#e05252' : '#c9922a' }}>
                {left > 0 ? `⏳ ${left}s` : 'Apurando...'}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {state.options.map((o) => {
            const pct = state.totalVotes ? Math.round((o.votes / state.totalVotes) * 100) : 0;
            const mine = myVote === o.id;
            const isWinner = closed && state.winnerId === o.id;
            return (
              <button
                key={o.id}
                onClick={() => void vote(o.id)}
                disabled={closed || sending !== null}
                className="relative overflow-hidden text-left rounded p-4 transition-all active:scale-[0.98]"
                style={{
                  background: '#161218',
                  border: `2px solid ${isWinner || mine ? '#c9922a' : '#2a2030'}`,
                  opacity: closed && !isWinner ? 0.55 : 1,
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-500"
                  style={{ width: `${pct}%`, background: mine ? '#c9922a2e' : '#c9922a14' }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-cinzel text-base font-semibold" style={{ color: '#e8dcc8' }}>
                      {o.title}
                    </div>
                    {o.description && (
                      <div className="font-crimson text-sm mt-0.5" style={{ color: '#b8a88a' }}>
                        {o.description}
                      </div>
                    )}
                    {mine && (
                      <div className="font-mono text-xs mt-1" style={{ color: '#c9922a' }}>
                        ✓ Seu voto
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg font-semibold" style={{ color: '#c9922a' }}>
                      {pct}%
                    </div>
                    <div className="font-mono text-xs" style={{ color: '#7a6e5e' }}>
                      {o.votes} {o.votes === 1 ? 'voto' : 'votos'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {voteError && (
          <p className="font-mono text-xs" style={{ color: '#e05252' }}>
            {voteError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh parchment-bg" style={{ background: '#0d0b0e' }}>
      <div className="mx-auto max-w-md px-4 py-5">
        <header className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid #2a2030' }}>
          <h1 className="font-cinzel text-base font-bold" style={{ color: '#c9922a' }}>
            🎲 Mestre de RPG
          </h1>
          {code && !notFound && (
            <div className="text-right font-mono text-xs" style={{ color: '#7a6e5e' }}>
              <div>Sala {code}</div>
              {state && <div>👥 {state.audience} na plateia</div>}
            </div>
          )}
        </header>
        {offline && (
          <p className="font-mono text-xs mt-3" style={{ color: '#e0a052' }}>
            Conexão instável, tentando de novo...
          </p>
        )}
        {body}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, CharacterStatus, Path, GameResponse, INITIAL_CHARACTER } from './rpgData';
import { callGameMaster, getOpeningScene } from './claudeService';

// ── Dice Component ──────────────────────────────────────────────────
function DiceDisplay({ value, rolling, resultType }: { value: number; rolling: boolean; resultType?: string }) {
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const color =
    resultType === 'ruim' ? '#e05252' : resultType === 'bom' ? '#52e07a' : '#c9922a';

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded font-mono text-sm border ${rolling ? 'dice-rolling' : ''}`}
      style={{ borderColor: color, color, background: '#0d0b0ecc' }}
    >
      <span style={{ fontSize: '1.4rem' }}>
        {rolling ? faces[Math.floor(Math.random() * 6)] : faces[Math.min(Math.floor((value - 1) / 1.7), 5)]}
      </span>
      <span className="font-mono font-semibold">{rolling ? '?' : value}</span>
      {!rolling && resultType && (
        <span
          className="text-xs px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ background: color + '22', color }}
        >
          {resultType === 'ruim' ? 'RUIM' : resultType === 'bom' ? 'BOM' : 'MÉDIO'}
        </span>
      )}
    </div>
  );
}

// ── Health Bar ──────────────────────────────────────────────────────
function HealthBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 60 ? '#52e07a' : pct > 30 ? '#e0b052' : '#e05252';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1 font-mono" style={{ color: '#7a6e5e' }}>
        <span>VIDA</span>
        <span style={{ color }}>
          {current}/{max}
        </span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: '#1a1520' }}>
        <div
          className="h-2 rounded-full health-bar-fill"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
        />
      </div>
    </div>
  );
}

// ── XP Bar ──────────────────────────────────────────────────────────
function XPBar({ xp, level }: { xp: number; level: number }) {
  const xpForNext = level * 100;
  const currentXp = xp % 100;
  const pct = (currentXp / 100) * 100;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1 font-mono" style={{ color: '#7a6e5e' }}>
        <span>XP</span>
        <span style={{ color: '#c9922a' }}>
          {currentXp}/{xpForNext > 100 ? 100 : xpForNext % 100 || 100}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full" style={{ background: '#1a1520' }}>
        <div
          className="h-1.5 rounded-full health-bar-fill"
          style={{ width: `${pct}%`, background: '#c9922a', boxShadow: '0 0 4px #c9922a66' }}
        />
      </div>
    </div>
  );
}

// ── Character Panel ──────────────────────────────────────────────────
function CharacterPanel({ character, isBoss }: { character: CharacterStatus; isBoss: boolean }) {
  return (
    <div
      className={`flex flex-col gap-4 p-4 rounded border ${isBoss ? 'boss-active' : ''}`}
      style={{
        background: '#161218',
        borderColor: isBoss ? '#8b2fc9' : '#2a2030',
        minWidth: 220,
      }}
    >
      {/* Avatar */}
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded flex items-center justify-center text-3xl border shrink-0"
          style={{
            background: isBoss ? '#1a0d2e' : '#1e1824',
            borderColor: isBoss ? '#8b2fc9' : '#c9922a',
          }}
        >
          {isBoss ? '💀' : '⚔️'}
        </div>
        <div>
          <div className="font-cinzel text-sm font-semibold" style={{ color: '#e8dcc8' }}>
            Herói
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: '#c9922a22', color: '#c9922a' }}>
              Nv. {character.level}
            </span>
            {isBoss && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: '#8b2fc922', color: '#8b2fc9' }}>
                CHEFÃO
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bars */}
      <div className="flex flex-col gap-2">
        <HealthBar current={character.health} max={character.maxHealth} />
        <XPBar xp={character.xp} level={character.level} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded p-2 text-center" style={{ background: '#1a1520', border: '1px solid #2a2030' }}>
          <div className="text-xs font-mono mb-0.5" style={{ color: '#7a6e5e' }}>OURO</div>
          <div className="font-mono font-semibold text-sm" style={{ color: '#c9922a' }}>
            💰 {character.gold}
          </div>
        </div>
        <div className="rounded p-2 text-center" style={{ background: '#1a1520', border: '1px solid #2a2030' }}>
          <div className="text-xs font-mono mb-0.5" style={{ color: '#7a6e5e' }}>LOCAL</div>
          <div className="font-mono font-semibold text-xs leading-tight" style={{ color: '#b8a88a' }}>
            📍 {character.location.split(' ').slice(0, 3).join(' ')}
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div>
        <div className="text-xs font-mono mb-2 uppercase tracking-wider" style={{ color: '#7a6e5e' }}>
          Inventário
        </div>
        <div className="flex flex-col gap-1">
          {character.inventory.length === 0 ? (
            <span className="text-xs" style={{ color: '#7a6e5e' }}>
              Vazio
            </span>
          ) : (
            character.inventory.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: '#b8a88a' }}>
                <span style={{ color: '#c9922a', fontSize: '0.6rem' }}>◆</span>
                {item}
              </div>
            ))
          )}
          {character.inventory.length > 8 && (
            <div className="text-xs" style={{ color: '#7a6e5e' }}>
              +{character.inventory.length - 8} itens...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Narrator Message ─────────────────────────────────────────────────
function NarratorMessage({
  msg,
  onChoosePath,
  waitingForChoice,
}: {
  msg: ChatMessage;
  onChoosePath: (path: Path) => void;
  waitingForChoice: boolean;
}) {
  const isBoss = msg.isBoss;

  return (
    <div className="message-appear flex gap-3">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded flex items-center justify-center text-xl shrink-0 border mt-1"
        style={{
          background: isBoss ? '#1a0d2e' : '#1e1824',
          borderColor: isBoss ? '#8b2fc9' : '#c9922a33',
        }}
      >
        {isBoss ? '💀' : '🎲'}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="font-cinzel text-sm font-semibold"
            style={{ color: isBoss ? '#8b2fc9' : '#c9922a' }}
          >
            {isBoss ? 'Mestre das Sombras' : 'Mestre de RPG'}
          </span>
          {msg.dice !== undefined && (
            <DiceDisplay value={msg.dice} rolling={false} resultType={msg.resultType} />
          )}
        </div>

        {/* Content bubble */}
        <div
          className="rounded p-4"
          style={{
            background: isBoss ? '#1a0d2e' : '#161218',
            border: `1px solid ${isBoss ? '#8b2fc944' : '#2a2030'}`,
            boxShadow: isBoss ? '0 0 20px #8b2fc922' : 'none',
          }}
        >
          <p className="font-crimson text-base leading-relaxed whitespace-pre-line" style={{ color: '#e8dcc8' }}>
            {msg.content}
          </p>
        </div>

        {/* Path choices */}
        {msg.paths && msg.paths.length > 0 && waitingForChoice && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: '#7a6e5e' }}>
              — Escolha seu caminho —
            </div>
            {msg.paths.map((path) => (
              <button
                key={path.id}
                onClick={() => onChoosePath(path)}
                className="path-card text-left rounded p-3 w-full cursor-pointer"
                style={{ background: '#0d0b0e' }}
              >
                <div className="font-cinzel text-sm font-semibold mb-1" style={{ color: '#c9922a' }}>
                  {path.id}. {path.title}
                </div>
                <div className="font-crimson text-sm" style={{ color: '#b8a88a' }}>
                  {path.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Player Message ────────────────────────────────────────────────────
function PlayerMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="message-appear flex gap-3 flex-row-reverse">
      <div
        className="w-10 h-10 rounded flex items-center justify-center text-xl shrink-0 border mt-1"
        style={{ background: '#1e2a1e', borderColor: '#52e07a33' }}
      >
        🧙
      </div>
      <div className="flex-1 min-w-0 flex flex-col items-end">
        <span className="font-cinzel text-sm font-semibold mb-2" style={{ color: '#52e07a' }}>
          Jogador
        </span>
        <div
          className="rounded p-3 max-w-[80%]"
          style={{ background: '#1e2a1e', border: '1px solid #52e07a22' }}
        >
          <p className="font-crimson text-base" style={{ color: '#e8dcc8' }}>
            {msg.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── System Message ────────────────────────────────────────────────────
function SystemMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="message-appear flex justify-center my-2">
      <div
        className="text-xs font-mono px-4 py-1.5 rounded-full border"
        style={{ background: '#1a1520', color: '#7a6e5e', borderColor: '#2a2030' }}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ── Typing Indicator ─────────────────────────────────────────────────
function TypingIndicator({ rolling }: { rolling: boolean }) {
  return (
    <div className="message-appear flex gap-3">
      <div
        className="w-10 h-10 rounded flex items-center justify-center text-xl shrink-0 border"
        style={{ background: '#1e1824', borderColor: '#c9922a33' }}
      >
        🎲
      </div>
      <div className="flex-1">
        <div className="font-cinzel text-sm font-semibold mb-2" style={{ color: '#c9922a' }}>
          Master RPG
        </div>
        <div
          className="rounded p-4 inline-flex items-center gap-3"
          style={{ background: '#161218', border: '1px solid #2a2030' }}
        >
          {rolling ? (
            <>
              <span className="font-mono text-sm" style={{ color: '#c9922a' }}>
                🎲 Rolando dados...
              </span>
              <div className="flex gap-1">
                <div className="typing-dot w-2 h-2 rounded-full" style={{ background: '#c9922a' }} />
                <div className="typing-dot w-2 h-2 rounded-full" style={{ background: '#c9922a' }} />
                <div className="typing-dot w-2 h-2 rounded-full" style={{ background: '#c9922a' }} />
              </div>
            </>
          ) : (
            <>
              <span className="font-mono text-sm" style={{ color: '#7a6e5e' }}>
                O Mestre narra...
              </span>
              <div className="flex gap-1">
                <div className="typing-dot w-2 h-2 rounded-full" style={{ background: '#7a6e5e' }} />
                <div className="typing-dot w-2 h-2 rounded-full" style={{ background: '#7a6e5e' }} />
                <div className="typing-dot w-2 h-2 rounded-full" style={{ background: '#7a6e5e' }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Welcome Screen ─────────────────────────────────────────────────────
function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 parchment-bg"
      style={{ background: '#0d0b0e' }}
    >
      <div className="w-full max-w-lg text-center">
        <div className="text-7xl mb-6">🎲</div>
        <h1 className="font-cinzel text-4xl font-bold mb-3" style={{ color: '#c9922a' }}>
          Master RPG
        </h1>
        <p className="font-cinzel text-sm tracking-widest uppercase mb-6" style={{ color: '#7a6e5e' }}>
          Inteligente
        </p>

        <div
          className="rounded p-6 mb-8 text-left"
          style={{ background: '#161218', border: '1px solid #2a2030' }}
        >
          <p className="font-crimson text-lg leading-relaxed mb-4" style={{ color: '#b8a88a' }}>
            Um herói recebe a missão de atravessar a{' '}
            <span style={{ color: '#c9922a' }}>Região das Sombras Eternas</span> para destruir o{' '}
            <span style={{ color: '#8b2fc9' }}>Orbe do Caos</span>, guardado pelo terrível{' '}
            <span style={{ color: '#e05252' }}>Lich Malachar</span> em sua Torre da Perdição.
          </p>
          <div className="flex flex-col gap-2">
            {[
              '🎲 Dado 1–10 rola a cada decisão',
              '🗺️ 6 regiões para explorar até o chefão',
              '⚔️ Combates, itens e escolhas que importam',
              '🧠 IA narra cada cena de forma única',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 font-crimson text-base" style={{ color: '#7a6e5e' }}>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onStart}
          className="px-10 py-4 rounded font-cinzel font-bold text-base uppercase tracking-wider transition-all glow-gold"
          style={{ background: '#c9922a', color: '#0d0b0e' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#d9a23a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#c9922a')}
        >
          ⚔️ Iniciar Aventura
        </button>
      </div>
    </div>
  );
}

// ── Game Over / Victory Screen ────────────────────────────────────────
function EndScreen({ isVictory, onRestart }: { isVictory: boolean; onRestart: () => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center p-8"
      style={{
        background: isVictory ? '#0a150a' : '#150a0a',
        border: `2px solid ${isVictory ? '#52e07a' : '#e05252'}`,
      }}
    >
      <div className="text-7xl mb-6">{isVictory ? '🏆' : '💀'}</div>
      <h2
        className="font-cinzel text-4xl font-bold mb-4"
        style={{ color: isVictory ? '#52e07a' : '#e05252' }}
      >
        {isVictory ? 'VITÓRIA ÉPICA!' : 'O HERÓI CAIU'}
      </h2>
      <p className="font-crimson text-xl mb-8" style={{ color: '#b8a88a' }}>
        {isVictory
          ? 'O Orbe do Caos foi destruído. A Região das Sombras está salva!'
          : 'As trevas consumiram o herói. A jornada chegou ao fim.'}
      </p>
      <button
        onClick={onRestart}
        className="px-8 py-3 rounded font-cinzel font-semibold text-sm uppercase tracking-wider"
        style={{
          background: isVictory ? '#52e07a' : '#e05252',
          color: '#0d0b0e',
        }}
      >
        Nova Aventura
      </button>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rollingDice, setRollingDice] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [character, setCharacter] = useState<CharacterStatus>(INITIAL_CHARACTER);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [waitingForChoice, setWaitingForChoice] = useState(false);
  const [isBossFight, setIsBossFight] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...msg, id: crypto.randomUUID(), timestamp: Date.now() };
    setMessages((prev) => [...prev, full]);
    return full;
  }, []);

  const applyGameResponse = useCallback(
    (response: GameResponse) => {
      // Update character
      const cs = response.character_status;
      setCharacter({
        health: cs.health,
        maxHealth: cs.max_health,
        gold: cs.gold,
        inventory: cs.inventory,
        location: cs.location,
        level: cs.level,
        xp: cs.xp,
      });

      setIsBossFight(response.is_boss_fight);

      const narratorMsg: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'narrator',
        content: response.description + (response.combat_log ? `\n\n${response.combat_log}` : ''),
        dice: response.dice,
        resultType: response.result_type,
        paths: response.is_game_over || response.is_victory ? [] : response.paths,
        isBoss: response.is_boss_fight,
      };

      setMessages((prev) => [...prev, { ...narratorMsg, id: crypto.randomUUID(), timestamp: Date.now() }]);
      setWaitingForChoice(!(response.is_game_over || response.is_victory));

      if (response.is_game_over) setIsGameOver(true);
      if (response.is_victory) setIsVictory(true);

      // Update history
      setConversationHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.description,
        },
      ]);
    },
    [],
  );

  const startGame = useCallback(
    async () => {
      setGameStarted(true);
      setLoading(true);
      setRollingDice(true);

      try {
        addMessage({ role: 'system', content: '⚔️ A aventura começa...' });
        const response = await getOpeningScene();
        setRollingDice(false);
        applyGameResponse(response);
        setConversationHistory([
          { role: 'assistant', content: response.description },
        ]);
      } catch (err) {
        setRollingDice(false);
        addMessage({
          role: 'system',
          content: `Erro ao conectar com o Mestre: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [addMessage, applyGameResponse],
  );

  const handlePathChoice = useCallback(
    async (path: Path) => {
      if (loading || isGameOver || isVictory) return;
      setWaitingForChoice(false);

      const playerMsg: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'player',
        content: `${path.title} — ${path.description}`,
      };
      setMessages((prev) => [...prev, { ...playerMsg, id: crypto.randomUUID(), timestamp: Date.now() }]);
      setConversationHistory((prev) => [...prev, { role: 'user', content: path.title }]);

      setLoading(true);
      setRollingDice(true);

      try {
        await new Promise((r) => setTimeout(r, 800));
        setRollingDice(false);
        const response = await callGameMaster(path.title, character, conversationHistory);
        applyGameResponse(response);
      } catch (err) {
        setRollingDice(false);
        addMessage({
          role: 'system',
          content: `O Mestre falhou: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
        });
        setWaitingForChoice(true);
      } finally {
        setLoading(false);
      }
    },
    [loading, isGameOver, isVictory, character, conversationHistory, applyGameResponse, addMessage],
  );

  const handleCustomAction = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const action = customInput.trim();
      if (!action || loading || isGameOver || isVictory || !waitingForChoice) return;
      setCustomInput('');
      setWaitingForChoice(false);

      const playerMsg: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'player',
        content: action,
      };
      setMessages((prev) => [...prev, { ...playerMsg, id: crypto.randomUUID(), timestamp: Date.now() }]);
      setConversationHistory((prev) => [...prev, { role: 'user', content: action }]);

      setLoading(true);
      setRollingDice(true);

      try {
        await new Promise((r) => setTimeout(r, 600));
        setRollingDice(false);
        const response = await callGameMaster(action, character, conversationHistory);
        applyGameResponse(response);
      } catch (err) {
        setRollingDice(false);
        addMessage({
          role: 'system',
          content: `O Mestre falhou: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
        });
        setWaitingForChoice(true);
      } finally {
        setLoading(false);
      }
    },
    [customInput, loading, isGameOver, isVictory, waitingForChoice, character, conversationHistory, applyGameResponse, addMessage],
  );

  const handleRestart = useCallback(() => {
    setMessages([]);
    setCharacter(INITIAL_CHARACTER);
    setConversationHistory([]);
    setWaitingForChoice(false);
    setIsBossFight(false);
    setIsGameOver(false);
    setIsVictory(false);
    setGameStarted(false);
    setLoading(false);
    setRollingDice(false);
  }, []);

  if (!gameStarted) {
    return <WelcomeScreen onStart={startGame} />;
  }

  return (
    <div
      className="min-h-screen flex parchment-bg"
      style={{ background: '#0d0b0e' }}
    >
      {/* Left: Character Panel */}
      <aside
        className="hidden lg:flex flex-col gap-4 p-4 shrink-0 overflow-y-auto"
        style={{
          width: 260,
          borderRight: '1px solid #2a2030',
          background: '#0d0b0e',
        }}
      >
        {/* Title */}
        <div className="pt-2 pb-4" style={{ borderBottom: '1px solid #2a2030' }}>
          <h1 className="font-cinzel text-lg font-bold" style={{ color: '#c9922a' }}>
            🎲 Master RPG
          </h1>
          <p className="font-cinzel text-xs uppercase tracking-widest mt-0.5" style={{ color: '#7a6e5e' }}>
            Inteligente
          </p>
        </div>

        <CharacterPanel character={character} isBoss={isBossFight} />

        {/* Location path */}
        <div
          className="rounded p-3"
          style={{ background: '#161218', border: '1px solid #2a2030' }}
        >
          <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: '#7a6e5e' }}>
            Região Atual
          </div>
          <div className="font-crimson text-sm" style={{ color: '#b8a88a' }}>
            📍 {character.location}
          </div>
        </div>

        <button
          onClick={handleRestart}
          className="mt-auto rounded py-2 text-xs font-mono uppercase tracking-wider transition-all"
          style={{ background: '#1a1520', color: '#7a6e5e', border: '1px solid #2a2030' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#e05252')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#7a6e5e')}
        >
          ↩ Nova Aventura
        </button>
      </aside>

      {/* Main: Chat */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile header */}
        <div
          className="flex lg:hidden items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid #2a2030', background: '#0d0b0e' }}
        >
          <div>
            <h1 className="font-cinzel text-base font-bold" style={{ color: '#c9922a' }}>
              🎲 Master RPG
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: '#7a6e5e' }}>
            <span style={{ color: '#e05252' }}>♥ {character.health}</span>
            <span style={{ color: '#c9922a' }}>💰 {character.gold}</span>
            <span style={{ color: '#b8a88a' }}>Nv.{character.level}</span>
          </div>
        </div>

        {/* Chat scroll area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5" style={{ paddingBottom: '1rem' }}>
          {messages.map((msg) => {
            if (msg.role === 'system') return <SystemMessage key={msg.id} msg={msg} />;
            if (msg.role === 'player') return <PlayerMessage key={msg.id} msg={msg} />;
            return (
              <NarratorMessage
                key={msg.id}
                msg={msg}
                onChoosePath={handlePathChoice}
                waitingForChoice={waitingForChoice && msg.id === messages.filter((m) => m.role === 'narrator').at(-1)?.id}
              />
            );
          })}

          {loading && <TypingIndicator rolling={rollingDice} />}

          {(isGameOver || isVictory) && (
            <EndScreen isVictory={isVictory} onRestart={handleRestart} />
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Custom input bar */}
        <div
          className="shrink-0 p-3"
          style={{ borderTop: '1px solid #2a2030', background: '#0d0b0e' }}
        >
          <form onSubmit={handleCustomAction} className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder={
                !waitingForChoice
                  ? 'Aguarde o Mestre...'
                  : 'Ou escreva uma ação personalizada...'
              }
              disabled={!waitingForChoice || loading}
              className="flex-1 rounded px-3 py-2.5 font-crimson text-base outline-none"
              style={{
                background: '#161218',
                border: '1px solid #2a2030',
                color: '#e8dcc8',
                opacity: !waitingForChoice ? 0.5 : 1,
              }}
            />
            <button
              type="submit"
              disabled={!waitingForChoice || loading || !customInput.trim()}
              className="px-4 py-2.5 rounded font-cinzel text-sm font-semibold uppercase tracking-wider transition-all shrink-0"
              style={{
                background: waitingForChoice && customInput.trim() ? '#c9922a' : '#1a1520',
                color: waitingForChoice && customInput.trim() ? '#0d0b0e' : '#7a6e5e',
                border: '1px solid #2a2030',
                cursor: !waitingForChoice || !customInput.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Agir
            </button>
          </form>
          <p className="text-xs font-mono mt-1.5" style={{ color: '#7a6e5e' }}>
            Clique em um caminho acima ou escreva uma ação livre
          </p>
        </div>
      </div>
    </div>
  );
}

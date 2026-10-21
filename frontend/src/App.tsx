import { useState, useRef, useEffect, useCallback } from 'react';
import { characterFromResponse, INITIAL_CHARACTER } from '@rpg-master/ai/character';
import { HERO_ORIGINS } from '@rpg-master/ai/origins';
import type { CharacterStatus, HistoryMessage, Path } from '@rpg-master/ai/types';
import type { HeroOriginId } from '@rpg-master/ai/origins';
import type { TtsVoice } from '@rpg-master/ai';
import type { ChatMessage } from './types';
import { AudienceButton, AudienceCorner, AudienceModal, useAudience, VoteBar, type Audience } from './Audience';
import type { GameTurn, StoryOutcome } from './services/gameApi';
import {
  callGameMaster,
  generateSceneImage,
  generateSpeech,
  getOpeningScene,
  isEmailEnabled,
  sendStorySummary,
} from './services/gameApi';

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

// ── Scene Image (ilustração da cena) ────────────────────────────────
const IMAGES_KEY = 'rpg-images';

function getSavedImagesEnabled(): boolean {
  try {
    return localStorage.getItem(IMAGES_KEY) !== 'off';
  } catch {
    return true;
  }
}

function SceneImage({ msg, onRetry }: { msg: ChatMessage; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!msg.imagePrompt) return null;

  // Clique na imagem para alternar entre tamanho padrão e largura total.
  const size = { maxWidth: expanded ? '100%' : 720 };

  if (msg.imageUrl) {
    return (
      <img
        src={msg.imageUrl}
        alt={msg.imagePrompt}
        title={expanded ? 'Clique para reduzir' : 'Clique para ampliar'}
        onClick={() => setExpanded((v) => !v)}
        className="w-full rounded mb-3 fade-in"
        style={{
          ...size,
          border: `1px solid ${msg.isBoss ? '#8b2fc944' : '#2a2030'}`,
          aspectRatio: '3 / 2',
          objectFit: 'cover',
          cursor: expanded ? 'zoom-out' : 'zoom-in',
        }}
      />
    );
  }

  return (
    <div
      className="w-full rounded mb-3 flex items-center justify-center text-xs font-mono"
      style={{
        ...size,
        aspectRatio: '3 / 2',
        background: 'linear-gradient(110deg, #161218 30%, #1e1824 50%, #161218 70%)',
        border: '1px solid #2a2030',
        color: '#7a6e5e',
      }}
    >
      {msg.imageLoading ? (
        <span className="dice-rolling">🎨 Pintando a cena...</span>
      ) : (
        <button type="button" onClick={onRetry} className="cursor-pointer" style={{ color: '#c9922a' }}>
          ↻ Gerar imagem da cena
        </button>
      )}
    </div>
  );
}

function ImageToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono uppercase tracking-wider" style={{ color: '#7a6e5e' }}>
      <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      🖼 Imagens das cenas
    </label>
  );
}

// ── Speak Button (narração com voz humana via OpenAI TTS, ou grátis do navegador) ─
const VOICE_KEY = 'rpg-voice';
const RATE_KEY = 'rpg-voice-rate';
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const MAX_TTS_CHARS = 4000;

type VoiceChoice = TtsVoice | 'browser';

const VOICE_OPTIONS: { id: VoiceChoice; label: string }[] = [
  { id: 'browser', label: '🆓 Voz do navegador (grátis)' },
  { id: 'onyx', label: 'Onyx — grave e autoritária' },
  { id: 'fable', label: 'Fable — narrador clássico' },
  { id: 'ash', label: 'Ash — firme e direta' },
  { id: 'nova', label: 'Nova — jovem e enérgica' },
  { id: 'coral', label: 'Coral — calorosa' },
  { id: 'echo', label: 'Echo — serena' },
];

const canSpeakBrowser = typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickBrowserVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((v) => v.lang === 'pt-BR') ?? voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
}

// Padrão: voz grátis do navegador. As vozes da OpenAI são pagas e pré-geradas
// a cada cena, então só entram se o jogador escolher uma explicitamente.
const DEFAULT_VOICE: VoiceChoice = canSpeakBrowser ? 'browser' : 'onyx';

function getSavedVoice(): VoiceChoice {
  try {
    const saved = localStorage.getItem(VOICE_KEY);
    return VOICE_OPTIONS.find((v) => v.id === saved)?.id ?? DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

function getSavedRate(): number {
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    return r >= 0.5 && r <= 2 ? r : 1;
  } catch {
    return 1;
  }
}

function VoiceSelect() {
  const [voice, setVoice] = useState<VoiceChoice>(getSavedVoice);
  const [rate, setRate] = useState(getSavedRate);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (canSpeakBrowser) window.speechSynthesis.cancel();
    };
  }, []);

  // Prévia só ao trocar de voz — trocar a velocidade não deve tocar nada.
  const preview = async (v: VoiceChoice) => {
    audioRef.current?.pause();
    if (canSpeakBrowser) window.speechSynthesis.cancel();

    if (v === 'browser') {
      if (!canSpeakBrowser) return;
      const u = new SpeechSynthesisUtterance('Bem-vindo, herói. Sua jornada começa agora.');
      u.lang = 'pt-BR';
      const bv = pickBrowserVoice(window.speechSynthesis.getVoices());
      if (bv) u.voice = bv;
      u.rate = rate;
      u.onstart = () => setPreviewing(true);
      u.onend = () => setPreviewing(false);
      u.onerror = () => setPreviewing(false);
      window.speechSynthesis.speak(u);
      return;
    }

    setPreviewing(true);
    try {
      const src = await generateSpeech('Bem-vindo, herói. Sua jornada começa agora.', v, rate);
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setPreviewing(false);
      audio.onerror = () => setPreviewing(false);
      await audio.play();
    } catch {
      setPreviewing(false);
    }
  };

  const onChange = (v: VoiceChoice) => {
    setVoice(v);
    try {
      localStorage.setItem(VOICE_KEY, v);
    } catch {
      /* sem persistência */
    }
    void preview(v);
  };

  const onRateChange = (r: number) => {
    setRate(r);
    try {
      localStorage.setItem(RATE_KEY, String(r));
    } catch {
      /* sem persistência */
    }
  };

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-xs font-mono uppercase tracking-wider" style={{ color: '#7a6e5e' }}>
        🔊 Voz do narrador {previewing ? '(ouvindo prévia...)' : ''}
      </span>
      <select
        value={voice}
        onChange={(e) => onChange(e.target.value as VoiceChoice)}
        className="w-full rounded px-2 py-1.5 text-xs font-mono cursor-pointer"
        style={{ background: '#1a1520', color: '#b8a88a', border: '1px solid #2a2030' }}
      >
        {VOICE_OPTIONS.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <span className="text-xs font-mono uppercase tracking-wider mt-1" style={{ color: '#7a6e5e' }}>
        ⏩ Velocidade
      </span>
      <div className="flex gap-1">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRateChange(r)}
            aria-pressed={rate === r}
            className="flex-1 rounded py-1 text-xs font-mono cursor-pointer"
            style={{
              background: rate === r ? '#c9922a22' : '#1a1520',
              color: rate === r ? '#c9922a' : '#7a6e5e',
              border: `1px solid ${rate === r ? '#c9922a' : '#2a2030'}`,
            }}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}

function SpeakButton({ msg }: { msg: ChatMessage }) {
  const [state, setState] = useState<'idle' | 'loading' | 'speaking' | 'paused'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSrcRef = useRef<string | null>(msg.audioUrl ?? null);
  const modeRef = useRef<'audio' | 'browser'>('audio');

  useEffect(() => {
    if (msg.audioUrl) audioSrcRef.current = msg.audioUrl;
  }, [msg.audioUrl]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (canSpeakBrowser) window.speechSynthesis.cancel();
    };
  }, []);

  const start = async () => {
    if (state === 'loading') return;
    const voice = getSavedVoice();

    if (voice === 'browser') {
      if (!canSpeakBrowser) return;
      modeRef.current = 'browser';
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(msg.content);
      u.lang = 'pt-BR';
      const bv = pickBrowserVoice(window.speechSynthesis.getVoices());
      if (bv) u.voice = bv;
      u.rate = getSavedRate();
      u.onstart = () => setState('speaking');
      u.onend = () => setState('idle');
      u.onerror = () => setState('idle');
      window.speechSynthesis.speak(u);
      return;
    }

    modeRef.current = 'audio';
    setState('loading');
    try {
      if (!audioSrcRef.current) {
        audioSrcRef.current = await generateSpeech(msg.content.slice(0, MAX_TTS_CHARS), voice, getSavedRate());
      }
      const audio = new Audio(audioSrcRef.current);
      audioRef.current = audio;
      audio.onended = () => setState('idle');
      audio.onerror = () => setState('idle');
      await audio.play();
      setState('speaking');
    } catch {
      setState('idle');
    }
  };

  const pauseOrResume = () => {
    if (modeRef.current === 'browser') {
      const synth = window.speechSynthesis;
      if (state === 'speaking') {
        synth.pause();
        setState('paused');
      } else {
        synth.resume();
        setState('speaking');
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (state === 'speaking') {
      audio.pause();
      setState('paused');
    } else {
      void audio.play();
      setState('speaking');
    }
  };

  const stop = () => {
    if (modeRef.current === 'browser') {
      window.speechSynthesis.cancel();
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState('idle');
  };

  const btn = 'text-xs font-mono px-2 py-1 rounded border cursor-pointer';
  const idleStyle = { borderColor: '#c9922a55', color: '#c9922a', background: '#0d0b0e' };
  // Preparando em segundo plano (preload disparado assim que a cena chegou).
  const preparing = state === 'idle' && msg.audioLoading && getSavedVoice() !== 'browser';

  return (
    <div className="ml-auto flex items-center gap-1">
      {state === 'speaking' || state === 'paused' ? (
        <>
          <button
            type="button"
            onClick={pauseOrResume}
            title={state === 'paused' ? 'Continuar de onde parou' : 'Pausar narração'}
            className={btn}
            style={idleStyle}
          >
            {state === 'paused' ? '▶ Continuar' : '⏸ Pausar'}
          </button>
          <button
            type="button"
            onClick={stop}
            title="Parar e voltar ao início"
            className={btn}
            style={{ ...idleStyle, borderColor: '#e0525255', color: '#e05252' }}
          >
            ⏹
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={state === 'loading' || preparing}
          title="Ouvir mensagem"
          className={btn}
          style={idleStyle}
        >
          {state === 'loading' ? '⏳ Gerando voz...' : preparing ? '⏳ Preparando narração...' : '🔊 Ouvir'}
        </button>
      )}
    </div>
  );
}

// ── Narrator Message ─────────────────────────────────────────────────
function NarratorMessage({
  msg,
  onChoosePath,
  onRetryImage,
  waitingForChoice,
  audience,
}: {
  msg: ChatMessage;
  onChoosePath: (path: Path) => void;
  onRetryImage: (id: string) => void;
  waitingForChoice: boolean;
  /** Só na cena atual, com a plateia ligada. */
  audience?: Audience;
}) {
  const isBoss = msg.isBoss;
  const room = audience?.state;
  const showVotes = !!room && (room.phase === 'voting' || room.phase === 'closed');

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
          <SpeakButton msg={msg} />
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
          <SceneImage msg={msg} onRetry={() => onRetryImage(msg.id)} />
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
            {audience && <VoteBar audience={audience} />}
            {msg.paths.map((path) => {
              const votes = showVotes ? (room.options.find((o) => o.id === path.id)?.votes ?? 0) : 0;
              const pct = showVotes && room.totalVotes ? Math.round((votes / room.totalVotes) * 100) : 0;
              const winner = showVotes && room.phase === 'closed' && room.winnerId === path.id;
              return (
                <button
                  key={path.id}
                  onClick={() => onChoosePath(path)}
                  className="path-card relative overflow-hidden text-left rounded p-3 w-full cursor-pointer"
                  style={{ background: '#0d0b0e', ...(winner ? { borderColor: '#c9922a', boxShadow: '0 0 16px #c9922a55' } : {}) }}
                >
                  {showVotes && (
                    <div
                      className="absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none"
                      style={{ width: `${pct}%`, background: '#c9922a1f' }}
                    />
                  )}
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-cinzel text-sm font-semibold mb-1" style={{ color: '#c9922a' }}>
                        {path.id}. {path.title}
                      </div>
                      <div className="font-crimson text-sm" style={{ color: '#b8a88a' }}>
                        {path.description}
                      </div>
                    </div>
                    {showVotes && (
                      <div className="text-right shrink-0 font-mono">
                        <div className="text-base font-semibold" style={{ color: '#c9922a' }}>
                          {votes}
                        </div>
                        <div className="text-[10px]" style={{ color: '#7a6e5e' }}>
                          {pct}%
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
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
          Mestre de RPG
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
function WelcomeScreen({ onStart }: { onStart: (origin: HeroOriginId, withAudience: boolean) => void }) {
  const [origin, setOrigin] = useState<HeroOriginId>('dever');

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 parchment-bg"
      style={{ background: '#0d0b0e' }}
    >
      <div className="w-full max-w-lg text-center">
        <div className="text-7xl mb-6">🎲</div>
        <h1 className="font-cinzel text-4xl font-bold mb-3" style={{ color: '#c9922a' }}>
          Mestre de RPG
        </h1>
        <p className="font-cinzel text-sm tracking-widest uppercase mb-6" style={{ color: '#7a6e5e' }}>
          Inteligente
        </p>

        <div
          className="rounded p-6 mb-6 text-left"
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

        <div className="rounded p-5 mb-8 text-left" style={{ background: '#161218', border: '1px solid #2a2030' }}>
          <p className="font-cinzel text-xs tracking-widest uppercase mb-3" style={{ color: '#7a6e5e' }}>
            Por que seu herói parte nessa jornada?
          </p>
          <div className="flex flex-col gap-2">
            {Object.entries(HERO_ORIGINS).map(([id, info]) => {
              const selected = id === origin;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOrigin(id as HeroOriginId)}
                  className="text-left rounded p-3 transition-all"
                  style={{
                    background: selected ? '#241c14' : 'transparent',
                    border: `1px solid ${selected ? '#c9922a' : '#2a2030'}`,
                  }}
                >
                  <div
                    className="font-cinzel text-sm font-bold mb-1"
                    style={{ color: selected ? '#c9922a' : '#b8a88a' }}
                  >
                    {info.label}
                  </div>
                  <div className="font-crimson text-sm" style={{ color: '#7a6e5e' }}>
                    {info.teaser}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => onStart(origin, false)}
            className="px-10 py-4 rounded font-cinzel font-bold text-base uppercase tracking-wider transition-all glow-gold"
            style={{ background: '#c9922a', color: '#0d0b0e' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#d9a23a')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#c9922a')}
          >
            ⚔️ Iniciar Aventura
          </button>
          <button
            onClick={() => onStart(origin, true)}
            className="px-8 py-4 rounded font-cinzel font-bold text-base uppercase tracking-wider transition-all"
            style={{ background: 'transparent', color: '#c9922a', border: '2px solid #c9922a' }}
          >
            📱 Jogar com a plateia
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Game Over / Victory Screen ────────────────────────────────────────
// ── Resumo da aventura por e-mail (via webhook n8n) ────────────────────
function buildStorySummary(messages: ChatMessage[], character: CharacterStatus, outcome: StoryOutcome): string {
  const scenes = messages.filter((m) => m.role === 'narrator');
  const lines = scenes.map((m, i) => {
    const title = m.event || `Cena ${i + 1}`;
    const excerpt = m.content.replace(/\s+/g, ' ').trim().slice(0, 220);
    return `${i + 1}. ${title} — ${excerpt}${m.content.length > 220 ? '…' : ''}`;
  });

  const outcomeLine =
    outcome === 'vitoria'
      ? 'DESFECHO: Vitória! O Orbe do Caos foi destruído e a Região das Sombras foi salva.'
      : outcome === 'derrota'
        ? 'DESFECHO: Derrota. As trevas consumiram o herói.'
        : 'DESFECHO: Aventura em andamento (resumo parcial).';

  const statusLine = `Status final — Nível ${character.level} (${character.xp} XP), Vida ${character.health}/${character.maxHealth}, Ouro ${character.gold}, Local: ${character.location}.`;

  return [outcomeLine, statusLine, '', ...lines].join('\n');
}

function EmailSummaryForm({
  character,
  messages,
  outcome,
  stateToken,
}: {
  character: CharacterStatus;
  messages: ChatMessage[];
  outcome: StoryOutcome;
  stateToken: string | null;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void isEmailEnabled().then((v) => active && setEnabled(v));
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');
    try {
      if (!stateToken) throw new Error('Partida sem registro no servidor.');
      const summary = buildStorySummary(messages, character, outcome);
      await sendStorySummary(email.trim(), summary, stateToken);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  };

  if (!enabled) return null;

  if (status === 'sent') {
    return (
      <p className="font-mono text-xs mt-4" style={{ color: '#52e07a' }}>
        ✅ Resumo enviado! Confira sua caixa de entrada em instantes.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2 mt-6 w-full max-w-sm">
      <label className="text-xs font-mono uppercase tracking-wider" style={{ color: '#7a6e5e' }}>
        📧 Receber o resumo da aventura por e-mail
      </label>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="flex-1 rounded px-3 py-2 text-sm font-mono"
          style={{ background: '#1a1520', color: '#e8dcc8', border: '1px solid #2a2030' }}
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="px-4 py-2 rounded font-mono text-xs uppercase tracking-wider cursor-pointer"
          style={{ background: '#c9922a', color: '#0d0b0e' }}
        >
          {status === 'sending' ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
      {status === 'error' && (
        <p className="text-xs font-mono" style={{ color: '#e05252' }}>
          Falha ao enviar: {errorMsg}
        </p>
      )}
    </form>
  );
}

function EndScreen({
  isVictory,
  onRestart,
  messages,
  character,
  stateToken,
}: {
  isVictory: boolean;
  onRestart: () => void;
  messages: ChatMessage[];
  character: CharacterStatus;
  stateToken: string | null;
}) {
  return (
    <div
      className="message-appear flex flex-col items-center text-center p-8 rounded my-2"
      style={{
        background: isVictory ? '#0a150a' : '#150a0a',
        border: `2px solid ${isVictory ? '#52e07a' : '#e05252'}`,
        boxShadow: `0 0 30px ${isVictory ? '#52e07a33' : '#e0525233'}`,
      }}
    >
      <div className="text-6xl mb-4">{isVictory ? '🏆' : '💀'}</div>
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
      <EmailSummaryForm
        character={character}
        messages={messages}
        outcome={isVictory ? 'vitoria' : 'derrota'}
        stateToken={stateToken}
      />
    </div>
  );
}

// ── Salvamento da sessão (continuar de onde parou ao recarregar) ──────
const SAVE_KEY = 'rpg-save';

interface SavedSession {
  character: CharacterStatus;
  messages: ChatMessage[];
  conversationHistory: HistoryMessage[];
  waitingForChoice: boolean;
  isBossFight: boolean;
  isGameOver: boolean;
  isVictory: boolean;
  /** Estado assinado pelo servidor; sem ele não dá para continuar a partida. */
  stateToken: string;
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    // Saves anteriores ao estado assinado não têm token e não podem continuar.
    if (!parsed || !Array.isArray(parsed.messages) || !parsed.character || typeof parsed.stateToken !== 'string') {
      return null;
    }
    return {
      stateToken: parsed.stateToken,
      character: parsed.character,
      messages: parsed.messages,
      conversationHistory: Array.isArray(parsed.conversationHistory) ? parsed.conversationHistory : [],
      waitingForChoice: !!parsed.waitingForChoice,
      isBossFight: !!parsed.isBossFight,
      isGameOver: !!parsed.isGameOver,
      isVictory: !!parsed.isVictory,
    };
  } catch {
    return null;
  }
}

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const savedSession = loadSavedSession();

  const [gameStarted, setGameStarted] = useState(!!savedSession);
  const [loading, setLoading] = useState(false);
  const [rollingDice, setRollingDice] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(savedSession?.messages ?? []);
  const [character, setCharacter] = useState<CharacterStatus>(savedSession?.character ?? INITIAL_CHARACTER);
  const [stateToken, setStateToken] = useState<string | null>(savedSession?.stateToken ?? null);
  const [conversationHistory, setConversationHistory] = useState<HistoryMessage[]>(
    savedSession?.conversationHistory ?? [],
  );
  const [waitingForChoice, setWaitingForChoice] = useState(savedSession?.waitingForChoice ?? false);
  const [isBossFight, setIsBossFight] = useState(savedSession?.isBossFight ?? false);
  const [isGameOver, setIsGameOver] = useState(savedSession?.isGameOver ?? false);
  const [isVictory, setIsVictory] = useState(savedSession?.isVictory ?? false);
  const [customInput, setCustomInput] = useState('');
  const [imagesEnabled, setImagesEnabled] = useState(getSavedImagesEnabled);
  const imagesEnabledRef = useRef(imagesEnabled);

  const changeImagesEnabled = useCallback((v: boolean) => {
    setImagesEnabled(v);
    imagesEnabledRef.current = v;
    try {
      localStorage.setItem(IMAGES_KEY, v ? 'on' : 'off');
    } catch {
      /* sem persistência */
    }
  }, []);

  const loadSceneImage = useCallback((id: string, prompt: string) => {
    const patch = (p: Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));
    patch({ imageLoading: true });
    generateSceneImage(prompt)
      .then((url) => patch({ imageUrl: url, imageLoading: false }))
      .catch(() => patch({ imageLoading: false }));
  }, []);

  const retryImage = useCallback(
    (id: string) => {
      const msg = messagesRef.current.find((m) => m.id === id);
      if (msg?.imagePrompt) loadSceneImage(id, msg.imagePrompt);
    },
    [loadSceneImage],
  );

  // Pré-carrega a narração assim que uma nova parte da história chega, para
  // que o botão "Ouvir" já toque na hora (voz grátis do navegador é instantânea).
  const loadNarration = useCallback((id: string, text: string) => {
    const voice = getSavedVoice();
    if (voice === 'browser') return;
    const patch = (p: Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));
    patch({ audioLoading: true });
    generateSpeech(text.slice(0, MAX_TTS_CHARS), voice, getSavedRate())
      .then((url) => patch({ audioUrl: url, audioLoading: false }))
      .catch(() => patch({ audioLoading: false }));
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, isGameOver, isVictory, scrollToBottom]);

  // Salva a sessão a cada mudança para continuar de onde parou ao recarregar
  // a página. Imagens e áudios (data URLs) não entram no save — são pesados
  // demais para o localStorage e podem ser regenerados com um clique.
  useEffect(() => {
    if (!gameStarted || !stateToken) {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        /* sem persistência */
      }
      return;
    }
    try {
      const snapshot: SavedSession = {
        stateToken,
        character,
        messages: messages.map((m) => ({
          ...m,
          imageUrl: undefined,
          imageLoading: undefined,
          audioUrl: undefined,
          audioLoading: undefined,
        })),
        conversationHistory,
        waitingForChoice,
        isBossFight,
        isGameOver,
        isVictory,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    } catch {
      /* sem persistência (quota excedida, etc.) */
    }
  }, [gameStarted, stateToken, messages, character, conversationHistory, waitingForChoice, isBossFight, isGameOver, isVictory]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...msg, id: crypto.randomUUID(), timestamp: Date.now() };
    setMessages((prev) => [...prev, full]);
    return full;
  }, []);

  // ── Modo plateia: cada cena vira uma votação no celular ──────────────
  const lastNarrator = messages.filter((m) => m.role === 'narrator').at(-1);
  const lastNarratorRef = useRef(lastNarrator);
  lastNarratorRef.current = lastNarrator;
  const handlePathChoiceRef = useRef<(path: Path) => void>(() => {});
  const [showAudienceQr, setShowAudienceQr] = useState(false);

  const audience = useAudience((winnerId, room) => {
    const path = lastNarratorRef.current?.paths?.find((p) => p.id === winnerId);
    if (!path) {
      addMessage({ role: 'system', content: '🗳️ Ninguém votou nesta rodada. Escolha o caminho você mesmo.' });
      return;
    }
    const votes = room.options.find((o) => o.id === winnerId)?.votes ?? 0;
    addMessage({ role: 'system', content: `🗳️ A plateia escolheu "${path.title}" (${votes} de ${room.totalVotes} votos).` });
    // Pausa curta para o resultado aparecer no telão e nos celulares antes de seguir.
    setTimeout(() => handlePathChoiceRef.current(path), 2500);
  });
  const audienceRef = useRef(audience);
  audienceRef.current = audience;

  // Mantém a sala em sincronia com o jogo: opções abertas → rodada de votação;
  // Mestre narrando → "aguarde"; fim de jogo → resultado final.
  const audienceSyncKey = audience.room
    ? [audience.room.code, lastNarrator?.id, waitingForChoice, isGameOver, isVictory].join('|')
    : '';
  useEffect(() => {
    const a = audienceRef.current;
    if (!a.room) return;
    if (isGameOver || isVictory) a.end(isVictory ? 'vitoria' : 'derrota');
    else if (waitingForChoice && lastNarrator?.paths?.length) {
      const text = lastNarrator.content.trim();
      a.openRound({
        event: (lastNarrator.event || 'Próximo passo').slice(0, 100),
        // Narração inteira: o público no celular acompanha a história completa.
        narration: text.length <= 6000 ? text : `${text.slice(0, 6000).replace(/\s+\S*$/, '')}…`,
        dice: lastNarrator.dice,
        resultType: lastNarrator.resultType,
        options: lastNarrator.paths.map((p) => ({ id: p.id, title: p.title.slice(0, 80), description: p.description.slice(0, 300) })),
      });
    } else a.setWaiting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceSyncKey]);

  const applyGameResponse = useCallback(
    (response: GameTurn) => {
      setCharacter(characterFromResponse(response.character_status));
      setStateToken(response.state_token);

      setIsBossFight(response.is_boss_fight);

      const narratorMsg: Omit<ChatMessage, 'id' | 'timestamp'> = {
        role: 'narrator',
        content: response.description + (response.combat_log ? `\n\n${response.combat_log}` : ''),
        event: response.event,
        dice: response.dice,
        resultType: response.result_type,
        paths: response.is_game_over || response.is_victory ? [] : response.paths,
        isBoss: response.is_boss_fight,
        imagePrompt: response.scene_image_prompt,
      };

      const narratorId = crypto.randomUUID();
      setMessages((prev) => [...prev, { ...narratorMsg, id: narratorId, timestamp: Date.now() }]);
      if (imagesEnabledRef.current && response.scene_image_prompt) {
        loadSceneImage(narratorId, response.scene_image_prompt);
      }
      loadNarration(narratorId, response.description);
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
    [loadSceneImage, loadNarration],
  );

  const startGame = useCallback(
    async (origin: HeroOriginId, withAudience = false) => {
      setGameStarted(true);
      if (withAudience) {
        const a = audienceRef.current;
        if (a.room) setShowAudienceQr(true);
        else void a.enable().then(() => setShowAudienceQr(true));
      }
      setLoading(true);
      setRollingDice(true);

      try {
        addMessage({ role: 'system', content: '⚔️ A aventura começa...' });
        const response = await getOpeningScene(origin);
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
        if (!stateToken) throw new Error('Partida sem registro no servidor. Comece uma nova aventura.');
        const response = await callGameMaster(path.title, conversationHistory, stateToken);
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
    [loading, isGameOver, isVictory, stateToken, conversationHistory, applyGameResponse, addMessage],
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
        if (!stateToken) throw new Error('Partida sem registro no servidor. Comece uma nova aventura.');
        const response = await callGameMaster(action, conversationHistory, stateToken);
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
    [customInput, loading, isGameOver, isVictory, waitingForChoice, stateToken, conversationHistory, applyGameResponse, addMessage],
  );

  handlePathChoiceRef.current = (path) => void handlePathChoice(path);

  const handleRestart = useCallback(() => {
    setMessages([]);
    setCharacter(INITIAL_CHARACTER);
    setStateToken(null);
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
      className="h-dvh overflow-hidden flex parchment-bg"
      style={{ background: '#0d0b0e' }}
    >
      {showAudienceQr && <AudienceModal audience={audience} onClose={() => setShowAudienceQr(false)} />}
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
            🎲 Mestre de RPG
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

        <ImageToggle enabled={imagesEnabled} onChange={changeImagesEnabled} />
        <VoiceSelect />
        <AudienceButton audience={audience} onOpen={() => setShowAudienceQr(true)} />

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
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Mobile header */}
        <div
          className="flex lg:hidden items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid #2a2030', background: '#0d0b0e' }}
        >
          <div>
            <h1 className="font-cinzel text-base font-bold" style={{ color: '#c9922a' }}>
              🎲 Mestre de RPG
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: '#7a6e5e' }}>
            <span style={{ color: '#e05252' }}>♥ {character.health}</span>
            <span style={{ color: '#c9922a' }}>💰 {character.gold}</span>
            <span style={{ color: '#b8a88a' }}>Nv.{character.level}</span>
          </div>
        </div>
        <div className="lg:hidden px-4 py-2 shrink-0 flex flex-col gap-2" style={{ borderBottom: '1px solid #2a2030', background: '#0d0b0e' }}>
          <ImageToggle enabled={imagesEnabled} onChange={changeImagesEnabled} />
          <VoiceSelect />
          <AudienceButton audience={audience} onOpen={() => setShowAudienceQr(true)} />
        </div>

        {/* Chat scroll area */}
        <div className="relative flex-1 min-h-0">
        {audience.room && !showAudienceQr && <AudienceCorner audience={audience} onExpand={() => setShowAudienceQr(true)} />}
        <div className={`relative h-full overflow-y-auto p-4 flex flex-col gap-5 ${audience.room ? 'lg:pr-36' : ''}`} style={{ paddingBottom: '1rem' }}>
          {messages.map((msg) => {
            if (msg.role === 'system') return <SystemMessage key={msg.id} msg={msg} />;
            if (msg.role === 'player') return <PlayerMessage key={msg.id} msg={msg} />;
            return (
              <NarratorMessage
                key={msg.id}
                msg={msg}
                onChoosePath={handlePathChoice}
                onRetryImage={retryImage}
                waitingForChoice={waitingForChoice && msg.id === lastNarrator?.id}
                audience={audience.room && msg.id === lastNarrator?.id ? audience : undefined}
              />
            );
          })}

          {loading && <TypingIndicator rolling={rollingDice} />}

          {(isGameOver || isVictory) && (
            <EndScreen isVictory={isVictory} onRestart={handleRestart} messages={messages} character={character} stateToken={stateToken} />
          )}

          <div ref={chatEndRef} />
        </div>
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

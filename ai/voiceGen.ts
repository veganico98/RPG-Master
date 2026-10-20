const API_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'gpt-4o-mini-tts';

const NARRATOR_INSTRUCTIONS =
  'Você é um mestre de RPG narrando uma aventura de fantasia sombria em português do Brasil. ' +
  'Fale com dramaticidade, emoção e ritmo humano — pausas naturais, respiração, ênfase nos momentos ' +
  'de tensão, tom grave e envolvente, como um contador de histórias experiente ao redor de uma fogueira.';

export const TTS_VOICES = ['onyx', 'fable', 'ash', 'nova', 'coral', 'echo'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export function isTtsVoice(v: unknown): v is TtsVoice {
  return typeof v === 'string' && (TTS_VOICES as readonly string[]).includes(v);
}

/** Narra o texto com uma voz humana da OpenAI e devolve um data URL (mp3). */
export async function generateSpeech(
  apiKey: string,
  text: string,
  voice: TtsVoice = 'onyx',
  speed = 1,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL,
      voice,
      input: text,
      instructions: NARRATOR_INSTRUCTIONS,
      speed: Math.min(4, Math.max(0.25, speed)),
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(error?.error?.message || `Speech API error: ${response.status}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString('base64')}`;
}

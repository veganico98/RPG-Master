const API_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';

const STYLE =
  'Dark fantasy digital painting, cinematic composition, dramatic lighting, rich detail, painterly, moody atmosphere. ' +
  'No text, no letters, no watermark, no user interface. Scene: ';

/** Gera a ilustração da cena e devolve um data URL (jpeg). */
export async function generateSceneImage(apiKey: string, scenePrompt: string): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      prompt: STYLE + scenePrompt,
      size: '1536x1024',
      quality: process.env.OPENAI_IMAGE_QUALITY || 'low',
      output_format: 'jpeg',
      output_compression: 75,
      n: 1,
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(error?.error?.message || `Image API error: ${response.status}`);
  }

  const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('A API não retornou imagem.');
  return `data:image/jpeg;base64,${b64}`;
}

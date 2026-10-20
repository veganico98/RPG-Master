import type { RequestHandler } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Limite de requisições por IP em janela fixa, guardado em memória.
 * Suficiente para um único processo; com várias instâncias, troque por um
 * armazenamento compartilhado (Redis, por exemplo).
 */
export function rateLimit({ max, windowMs, message }: { max: number; windowMs: number; message: string }): RequestHandler {
  const hits = new Map<string, Window>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, w] of hits) if (w.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let w = hits.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      hits.set(key, w);
    }
    w.count++;

    if (w.count > max) {
      res.setHeader('Retry-After', Math.ceil((w.resetAt - now) / 1000));
      return void res.status(429).json({ error: message });
    }
    next();
  };
}

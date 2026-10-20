import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { rateLimit } from './rateLimit';

function call(handler: ReturnType<typeof rateLimit>, ip: string) {
  let status = 200;
  let passed = false;
  const res = {
    setHeader: () => res,
    status: (code: number) => ((status = code), res),
    json: () => res,
  } as unknown as Response;
  handler({ ip } as Request, res, () => (passed = true));
  return passed ? 200 : status;
}

test('bloqueia com 429 depois do limite, por IP', () => {
  const limit = rateLimit({ max: 2, windowMs: 60_000, message: 'calma' });
  assert.equal(call(limit, '1.1.1.1'), 200);
  assert.equal(call(limit, '1.1.1.1'), 200);
  assert.equal(call(limit, '1.1.1.1'), 429);
  assert.equal(call(limit, '2.2.2.2'), 200);
});

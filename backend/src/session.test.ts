import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_CHARACTER } from '@rpg-master/ai';
import { createSessionSigner } from './session';

const signer = createSessionSigner('segredo-de-teste', 1000);
const state = { id: 'abc', turn: 3, character: INITIAL_CHARACTER, outcome: null };

test('token assinado volta com o mesmo estado', () => {
  const token = signer.sign(state, 0);
  assert.deepEqual(signer.verify(token, 500), { ...state, iat: 0 });
});

test('token com estado alterado é rejeitado', () => {
  const [, sig] = signer.sign(state, 0).split('.');
  const forged = Buffer.from(JSON.stringify({ ...state, character: { ...INITIAL_CHARACTER, gold: 9999 }, iat: 0 })).toString(
    'base64url',
  );
  assert.equal(signer.verify(`${forged}.${sig}`, 0), null);
});

test('token de outro segredo é rejeitado', () => {
  const other = createSessionSigner('outro-segredo');
  assert.equal(signer.verify(other.sign(state, 0), 0), null);
});

test('token expirado é rejeitado', () => {
  assert.equal(signer.verify(signer.sign(state, 0), 1001), null);
});

test('a região sorteada viaja no token', () => {
  const token = signer.sign({ ...state, middle: 'Ruínas de Aldrath' }, 0);
  assert.equal(signer.verify(token, 0)?.middle, 'Ruínas de Aldrath');
});

test('região intermediária desconhecida é rejeitada', () => {
  // Mesmo com assinatura válida, um valor fora da lista não passa na validação.
  const token = signer.sign({ ...state, middle: 'Montanha do Trovão' as never }, 0);
  assert.equal(signer.verify(token, 0), null);
});

test('valores malformados são rejeitados', () => {
  for (const bad of [undefined, 42, '', 'abc', 'a.b.c', '.', 'x'.repeat(20_000)]) {
    assert.equal(signer.verify(bad, 0), null);
  }
});

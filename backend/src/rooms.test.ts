import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from './rooms';

const options = [
  { id: 1, title: 'Caverna', description: '' },
  { id: 2, title: 'Floresta', description: '' },
  { id: 3, title: 'Vila', description: '' },
];

function setup(now = { t: 0 }) {
  const store = new RoomStore({ now: () => now.t, idleMs: 1000, maxRooms: 2 });
  const { code, hostKey } = store.create()!;
  const room = store.get(code)!;
  store.openRound(room, { event: 'Encruzilhada', narration: '', options, durationSec: 30 });
  return { store, room, code, hostKey, now };
}

test('código tem 5 caracteres sem 0/O/1/I e a chave do telão é verificada', () => {
  const { store, room, code, hostKey } = setup();
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(store.isHost(room, hostKey), true);
  assert.equal(store.isHost(room, 'x'.repeat(64)), false);
  assert.equal(store.isHost(room, undefined), false);
});

test('a opção mais votada vence e cada celular conta uma vez (pode trocar o voto)', () => {
  const { store, room } = setup();
  store.vote(room, 'celular-a', 1, 1);
  store.vote(room, 'celular-b', 1, 2);
  store.vote(room, 'celular-c', 1, 2);
  store.vote(room, 'celular-a', 1, 2); // trocou de ideia
  const state = store.state(room, 'celular-a');
  assert.equal(state.totalVotes, 3);
  assert.equal(state.options.find((o) => o.id === 2)!.votes, 3);
  assert.equal(state.myVote, 2);
  assert.equal(store.close(room), 2);
  assert.equal(store.state(room).phase, 'closed');
});

test('empate é sorteado entre os empatados', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const { store, room } = setup();
    store.vote(room, 'celular-a', 1, 1);
    store.vote(room, 'celular-b', 1, 3);
    seen.add(store.close(room)!);
  }
  assert.deepEqual([...seen].sort(), [1, 3]);
});

test('sem votos não há vencedor', () => {
  const { store, room } = setup();
  assert.equal(store.close(room), null);
});

test('votos fora da rodada, em opção inexistente ou com a votação fechada são recusados', () => {
  const { store, room } = setup();
  assert.equal(store.vote(room, 'celular-a', 0, 1), 'stale_round');
  assert.equal(store.vote(room, 'celular-a', 1, 9), 'invalid_option');
  store.setWaiting(room);
  assert.equal(store.vote(room, 'celular-a', 1, 1), 'not_voting');
});

test('a rodada guarda o dado da cena para os celulares', () => {
  const { store, room } = setup();
  assert.equal(store.state(room).dice, null);
  store.openRound(room, { event: 'Ponte', narration: '', dice: 9, resultType: 'bom', options, durationSec: 30 });
  assert.equal(store.state(room).dice, 9);
  assert.equal(store.state(room).resultType, 'bom');
});

test('nova rodada zera os votos', () => {
  const { store, room } = setup();
  store.vote(room, 'celular-a', 1, 1);
  store.openRound(room, { event: 'Ponte', narration: '', options, durationSec: 30 });
  assert.equal(store.state(room).totalVotes, 0);
  assert.equal(store.state(room).round, 2);
});

test('plateia conta só celulares vistos nos últimos 15 s', () => {
  const { store, room, now } = setup();
  store.touch(room, 'celular-a');
  now.t = 10_000;
  store.touch(room, 'celular-b');
  assert.equal(store.state(room).audience, 2);
  now.t = 20_000;
  assert.equal(store.state(room).audience, 1);
});

test('salas paradas expiram e há limite de salas', () => {
  const now = { t: 0 };
  const { store, code } = setup(now);
  assert.ok(store.create());
  assert.equal(store.create(), null); // maxRooms = 2
  now.t = 5000;
  assert.equal(store.get(code), undefined);
  assert.ok(store.create());
});

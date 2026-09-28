// Aufruf: node --test tests/plan-log.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PS = require('../js/plan-store.js');
const PL = require('../js/plan-log.js');

const example = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'specs', 'beispiel-trainingsplan-v1.json'), 'utf8'));
const store = PS.applyImport(PS.emptyStore(), example, '2026-09-28');
const index = PL.sessionIndex(store);
const ex = (id) => store.exercises[id];

test('Messgröße aus Plan bzw. Übungsart', () => {
  assert.equal(PL.metricOf({ reps: 8 }, ex('U2')), 'reps');
  assert.equal(PL.metricOf({ seconds: 20 }, ex('U1')), 'seconds');
  assert.equal(PL.metricOf({ sets: 3 }, ex('U1')), 'seconds', 'Halten ohne Zielangabe');
  assert.equal(PL.metricOf({ sets: 3 }, ex('U10')), 'reps');
  assert.equal(PL.metricOf({ minutes: 4 }, ex('U22-23')), 'minutes');
});

test('Vorbelegung: feste Zahl, Bereich mit und ohne letzten Wert', () => {
  assert.equal(PL.prefillValue(12, 10), 12);
  assert.equal(PL.prefillValue([8, 12], 10), 10);
  assert.equal(PL.prefillValue([8, 12], 14), 8, 'letzter Wert außerhalb: unterer Wert');
  assert.equal(PL.prefillValue([8, 12], null), 8);
  assert.equal(PL.prefillValue(null, 7), 7);
});

test('Neue Satz-Zeilen: Anzahl, Werte, kg und Variante vom letzten Mal', () => {
  const item = { exercise: 'U24', sets: 3, reps: [8, 10], perSide: 'Bein' };
  const last = { date: '2026-10-09', item: {
    exercise: 'U24', variant: 'Rucksack', rows: [{ reps: 9, kg: 5, done: true }, { reps: 8, kg: 5, done: true }]
  } };
  const r = PL.newItemResult(item, ex('U24'), last);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map((x) => x.reps), [9, 8, 8]);
  assert.deepEqual(r.rows.map((x) => x.kg), [5, 5, 5]);
  assert.ok(r.rows.every((x) => x.done === false), 'nichts ist automatisch bestätigt');
  assert.equal(r.variant, 'Rucksack');
  assert.deepEqual(r.planned, { sets: 3, reps: [8, 10], perSide: 'Bein' });
});

test('Vorlagen je Art', () => {
  assert.deepEqual(PL.newItemResult({ exercise: 'A1', minutes: 5 }, ex('A1'), null),
    { exercise: 'A1', planned: { minutes: 5 }, done: false });
  const run = PL.newItemResult({ exercise: 'U20', minutes: [25, 35] }, ex('U20'), null);
  assert.equal(run.cardio.minutes, 25);
  const stairs = PL.newItemResult({ exercise: 'U22-23', sets: 3, minutes: 4 }, ex('U22-23'), null);
  assert.deepEqual(stairs.rows[0], { done: false, minutes: 4, rounds: null });
  assert.equal(stairs.effort, null);
  assert.deepEqual(PL.newItemResult({ text: 'Stufen zählen', input: { type: 'number', label: 'Stufen' } }, null, null),
    { text: 'Stufen zählen', done: false, value: null });
  assert.deepEqual(PL.newItemResult({ test: 'T1' }, null, null), { test: 'T1', done: false });
});

test('Letzte Werte: jüngste andere Einheit, nur bestätigte Sätze, nicht aus der Zukunft', () => {
  const log = PL.emptyLog();
  log.sessions.a = { sessionId: 'a', date: '2026-10-02', items: [{ exercise: 'U1', rows: [{ seconds: 15, done: true }] }] };
  log.sessions.b = { sessionId: 'b', date: '2026-10-05', items: [{ exercise: 'U1', rows: [{ seconds: 25, done: true }] }] };
  log.sessions.c = { sessionId: 'c', date: '2026-10-06', items: [{ exercise: 'U1', rows: [{ seconds: 99, done: false }] }] };
  log.sessions.d = { sessionId: 'd', date: '2026-10-20', items: [{ exercise: 'U1', rows: [{ seconds: 40, done: true }] }] };
  assert.equal(PL.lastExerciseResult(log, 'U1', 'x', '2026-10-08').date, '2026-10-05');
  assert.equal(PL.lastExerciseResult(log, 'U1', 'b', '2026-10-08').date, '2026-10-02', 'aktuelle Einheit ausgenommen');
  assert.equal(PL.lastExerciseResult(log, 'U9', 'x', '2026-10-08'), null);
});

test('Text „Letztes Mal“', () => {
  assert.equal(PL.lastText({ rows: [{ seconds: 30, done: true }, { seconds: 28, done: true }, { seconds: 25, done: true }], variant: 'Hände auf Stufe', feel: 'right' }),
    '30 / 28 / 25 s · Hände auf Stufe · genau richtig');
  assert.equal(PL.lastText({ rows: [{ reps: 8, kg: 5, done: true }, { reps: 8, kg: 7.5, done: false }] }), '8 Wdh. · 5 kg');
  assert.equal(PL.lastText({ cardio: { minutes: 31, km: 4.6, pulse: 142, done: true } }), '31 Min. · 4,6 km · Ø-Puls 142');
  assert.equal(PL.lastText({ rows: [{ minutes: 4, rounds: 7, done: true }] }), '4 Min. · 7 Durchgänge');
});

test('Status einer Einheit', () => {
  assert.equal(PL.sessionState(null, '2026-10-05', '2026-10-06', false), 'missed');
  assert.equal(PL.sessionState(null, '2026-10-05', '2026-10-06', true), 'none');
  assert.equal(PL.sessionState(null, '2026-10-07', '2026-10-06', false), 'open');
  assert.equal(PL.sessionState({ items: [{ rows: [{ reps: 8, done: true }] }] }, '2026-10-05', '2026-10-06', false), 'started');
  assert.equal(PL.sessionState({ items: [{ rows: [{ reps: 8, done: false }] }] }, '2026-10-05', '2026-10-06', false), 'missed',
    'nur vorbelegte Zeilen zählen nicht');
  assert.equal(PL.sessionState({ status: 'skipped', items: [] }, '2026-10-05', '2026-10-06', false), 'skipped');
});

test('Verschieben: Sa-Lauf auf So, Tauschen, zurück', () => {
  let moves = {};
  assert.equal(PL.sessionsOn(store, index, moves, '2026-10-03').length, 1);
  moves = PL.applyMove(moves, index, '2026-10-03-1', '2026-10-04');
  assert.equal(PL.sessionsOn(store, index, moves, '2026-10-03').length, 0);
  const sun = PL.sessionsOn(store, index, moves, '2026-10-04');
  assert.equal(sun.length, 1);
  assert.equal(sun[0].movedFrom, '2026-10-03');
  assert.deepEqual(PL.movedAway(store, moves, '2026-10-03').map((m) => m.to), ['2026-10-04']);
  assert.equal(PL.effectiveDate(index, moves, '2026-10-03-1'), '2026-10-04');
  moves = PL.applyMove(moves, index, '2026-10-03-1', '2026-10-03');
  assert.deepEqual(moves, {}, 'zurück auf den geplanten Tag löscht den Eintrag');
});

test('Zahlen mit Komma', () => {
  assert.equal(PL.parseNum('4,6'), 4.6);
  assert.equal(PL.parseNum(' 12 '), 12);
  assert.equal(PL.parseNum(''), null);
  assert.equal(PL.parseNum('abc'), null);
});

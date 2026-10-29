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

const T6 = { id: 'T6', main: 'km', fields: [
  { key: 'km', label: 'Strecke (km)', type: 'km' },
  { key: 'pulse', label: 'Ø-Puls', type: 'bpm' },
  { key: 'walkBreaks', label: 'Gehpausen', type: 'yesno' }] };

test('Testwerte formatieren', () => {
  assert.equal(PL.formatTestValue({ type: 'seconds' }, 42), '42 s');
  assert.equal(PL.formatTestValue({ type: 'minsec' }, 185), '3:05 min');
  assert.equal(PL.formatTestValue({ type: 'km' }, 4.8), '4,8 km');
  assert.equal(PL.formatTestValue({ type: 'scale10' }, 3), '3/10');
  assert.equal(PL.formatTestValue({ type: 'yesno' }, false), 'nein');
  assert.equal(PL.formatTestValue({ type: 'text' }, 'gelb'), 'gelb');
  assert.equal(PL.formatTestValue({ type: 'number' }, null), '–');
  assert.equal(PL.testSummary(T6, { km: 4.8, pulse: 148, walkBreaks: true }), '4,8 km · Ø-Puls: 148 · Gehpausen: ja');
  assert.equal(PL.testSummary(T6, { pulse: 150 }), 'Ø-Puls: 150', 'Hauptwert fehlt noch');
  assert.ok(PL.hasTestValue({ walkBreaks: false }), 'nein ist ein Wert');
  assert.ok(!PL.hasTestValue({ km: null, note: '' }));
});

test('Testergebnisse: Reihenfolge, letztes Ergebnis, Ergebnis der Einheit', () => {
  const log = PL.emptyLog();
  log.tests.push({ id: 'b', test: 'T1', date: '2026-12-07', round: 'Test 2', sessionId: 's2', values: { seconds: 50 } });
  log.tests.push({ id: 'a', test: 'T1', date: '2026-10-09', round: 'Eingangstest', sessionId: null, values: { seconds: 42 } });
  log.tests.push({ id: 'c', test: 'T2', date: '2026-10-09', round: 'Eingangstest', sessionId: null, values: { seconds: 20 } });
  assert.deepEqual(PL.testResults(log, 'T1').map((r) => r.id), ['a', 'b']);
  assert.equal(PL.lastTestResult(log, 'T1', null, '2026-12-31').id, 'b');
  assert.equal(PL.lastTestResult(log, 'T1', 's2', '2026-12-31').id, 'a', 'eigene Einheit ausgenommen');
  assert.equal(PL.lastTestResult(log, 'T1', null, '2026-11-01').id, 'a', 'nicht aus der Zukunft');
  assert.equal(PL.sessionTestResult(log, 's2', 'T1').id, 'b');
  assert.equal(PL.sessionTestResult(log, 's2', 'T2'), null);
});

test('Bekannte Testrunden aus Plan und Ergebnissen', () => {
  const log = PL.emptyLog();
  log.tests.push({ id: 'x', test: 'T1', date: '2026-10-09', round: 'Fitness-Analyse', values: { seconds: 40 } });
  const rounds = PL.testRounds(store, log);
  assert.ok(rounds.includes('Eingangstest'));
  assert.ok(rounds.includes('Fitness-Analyse'));
  assert.equal(new Set(rounds).size, rounds.length, 'keine Doppelten');
});

function sampleLog() {
  const log = PL.emptyLog();
  log.sessions['2026-10-02-1'] = {
    sessionId: '2026-10-02-1', plannedDate: '2026-10-02', date: '2026-10-02', title: 'Übungen kennenlernen',
    variant: 'normal', status: 'done', effort: 4, minutes: 27, note: 'gut', items: [
      { exercise: 'A1', planned: { minutes: 5 }, done: true },
      { exercise: 'U1', planned: { sets: 3, seconds: 15, restSec: 90 }, rows: [
        { seconds: 18, done: true }, { seconds: 16, done: true }, { seconds: 15, done: false }], variant: 'Tür', feel: 'right' },
      { exercise: 'U2', planned: { sets: 2, reps: 5 }, rows: [{ reps: 5, done: false }, { reps: 5, done: false }], feel: null },
      null
    ] };
  log.sessions['2026-10-03-1'] = {
    sessionId: '2026-10-03-1', plannedDate: '2026-10-03', date: '2026-10-03', title: 'Lauf', variant: 'normal',
    status: null, effort: null, minutes: null, note: '', items: [
      null, { exercise: 'U20', planned: { minutes: [25, 35] }, cardio: { minutes: 31, km: 4.6, pulse: 142, effort: null, done: true }, feel: null }] };
  log.sessions['2026-10-09-1'] = {
    sessionId: '2026-10-09-1', plannedDate: '2026-10-09', date: '2026-10-09', title: 'Treppe', variant: 'normal',
    status: 'skipped', effort: null, minutes: null, note: 'Regen', items: [] };
  log.tests.push({ id: 'x1', test: 'T1', date: '2026-10-12', round: 'Eingangstest', sessionId: '2026-10-12-1', values: { seconds: 42 }, note: '', updatedAt: 'z' });
  return log;
}

test('Trainingsprotokoll im Format 2', () => {
  const log = sampleLog();
  const moves = { '2026-10-03-1': '2026-10-04' };
  const daily = [{ date: '2026-10-02', weight: 82.4 }];
  const p = PL.buildProtocol({ store, log, index, moves, daily, appVersion: 21, now: '2026-10-29T10:00:00' });
  assert.equal(p.format, 'trainingsprotokoll');
  assert.equal(p.formatVersion, 1);
  assert.equal(p.appVersion, 21);
  assert.deepEqual(p.plans.map((x) => x.planId), ['beispiel-startpaket']);
  assert.deepEqual(p.sessions.map((s) => s.sessionId), ['2026-10-02-1', '2026-10-03-1', '2026-10-09-1']);
  const s1 = p.sessions[0];
  assert.equal(s1.status, 'done');
  assert.equal(s1.effort, 4);
  assert.deepEqual(s1.items, [
    { exercise: 'A1', planned: { minutes: 5 }, done: true },
    { exercise: 'U1', planned: { sets: 3, seconds: 15, restSec: 90 }, sets: [{ seconds: 18 }, { seconds: 16 }], variant: 'Tür', feel: 'right' }
  ], 'nur bestätigte Sätze, unberührte Übungen fehlen');
  const s2 = p.sessions[1];
  assert.equal(s2.date, '2026-10-04', 'Verschiebung berücksichtigt');
  assert.equal(s2.plannedDate, '2026-10-03');
  assert.equal(s2.status, 'started', 'Werte ohne Abschluss');
  assert.deepEqual(s2.items[0].cardio, { minutes: 31, km: 4.6, pulse: 142 });
  assert.equal(p.sessions[2].status, 'skipped');
  assert.equal(p.sessions[2].note, 'Regen');
  assert.deepEqual(p.tests, [{ test: 'T1', date: '2026-10-12', round: 'Eingangstest', sessionId: '2026-10-12-1', values: { seconds: 42 }, note: '' }]);
  assert.deepEqual(p.daily, daily);
});

test('Erfolgsquote Plan-Einheiten', () => {
  const log = sampleLog();
  // Pflicht-Einheiten im Beispiel: 08.10., 09.10., 12.10., 13.10. (02./03./07.10. sind freiwillig)
  const st = PL.planStats(store, index, {}, log, '2026-10-12');
  assert.equal(st.planned, 2, '08.10. und 09.10.; der 12.10. ist heute und noch offen');
  assert.equal(st.skipped, 1);
  assert.equal(st.missed, 1);
  assert.equal(st.done, 0);
  log.sessions['2026-10-12-1'] = { sessionId: '2026-10-12-1', status: 'done', items: [] };
  const st2 = PL.planStats(store, index, {}, log, '2026-10-12');
  assert.equal(st2.planned, 3, 'heute erledigt zählt mit');
  assert.equal(st2.done, 1);
});

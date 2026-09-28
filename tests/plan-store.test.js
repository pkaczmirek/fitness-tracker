// Aufruf: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PS = require('../js/plan-store.js');
const { checkPlan } = require('../js/plan-check.js');

const example = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'specs', 'beispiel-trainingsplan-v1.json'), 'utf8'));

test('Beispiel-Plan ist gültig', () => {
  const r = checkPlan(example);
  assert.deepEqual(r.errors, []);
});

test('Import füllt einen leeren Speicher', () => {
  const s = PS.applyImport(PS.emptyStore(), example, '2026-09-28');
  assert.equal(Object.keys(s.days).length, example.days.length);
  assert.equal(s.exercises.U1.name, 'Totes Hängen');
  assert.equal(s.event.date, '2027-06-26');
  assert.equal(s.imports.length, 1);
  assert.ok(PS.hasPlan(s));
  assert.deepEqual(PS.bounds(s), { first: '2026-10-02', last: '2026-10-13' });
});

test('Import verändert den alten Speicher nicht', () => {
  const empty = PS.emptyStore();
  PS.applyImport(empty, example, '2026-09-28');
  assert.equal(Object.keys(empty.days).length, 0);
});

test('Neu-Import ersetzt nur Tage im eigenen Zeitraum', () => {
  let s = PS.applyImport(PS.emptyStore(), example, '2026-09-28');
  s.days['2026-12-01'] = { date: '2026-12-01', week: 'X', sessions: [] }; // aus späterer Phase
  const revised = JSON.parse(JSON.stringify(example));
  revised.days = revised.days.filter((d) => d.date !== '2026-10-08');
  assert.equal(PS.countReplaced(s, revised), example.days.length);
  s = PS.applyImport(s, revised, '2026-09-29');
  assert.equal(s.days['2026-10-08'], undefined, 'weggefallener Tag ist weg');
  assert.ok(s.days['2026-12-01'], 'Tag außerhalb des Zeitraums bleibt');
  assert.equal(s.imports.length, 1, 'gleiche planId ersetzt den Import-Eintrag');
});

test('Bibliothek aus früherem Import bleibt für spätere Dateien gültig', () => {
  const s = PS.applyImport(PS.emptyStore(), example, '2026-09-28');
  const next = {
    format: 'trainingsplan', formatVersion: 1, planId: 'phase1', title: 'P1', createdAt: '2026-10-10',
    range: { from: '2026-10-19', to: '2026-10-19' }, event: example.event, places: {},
    exercises: [], weeks: [{ id: 'W1', title: 'W1', phase: 'Phase 1', types: ['build'], start: '2026-10-19' }],
    days: [{ date: '2026-10-19', week: 'W1', sessions: [{
      id: '2026-10-19-1', title: 'Kraft A', place: ['Z'], minutes: 45, effort: '7–8',
      variants: { normal: { items: [{ exercise: 'U1', sets: 3, seconds: 20 }] } }
    }] }]
  };
  assert.ok(checkPlan(next).errors.length > 0, 'ohne vorhandene Bibliothek: Fehler');
  assert.deepEqual(checkPlan(next, PS.existingIds(s)).errors, []);
});

test('Wochen: Einstiegstage Do–So, normale Woche 7 Tage', () => {
  const s = PS.applyImport(PS.emptyStore(), example, '2026-09-28');
  assert.deepEqual(PS.weekDates(s, 'SP0'), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(PS.weekDates(s, 'SP1').length, 7);
  assert.equal(PS.weekDates(s, 'SP2')[6], '2026-10-18');
  assert.equal(PS.weekForDate(s, '2026-10-06').id, 'SP1', 'Tag ohne Eintrag');
  assert.equal(PS.weekForDate(s, '2026-10-12').id, 'SP2');
  assert.equal(PS.initialWeek(s, '2026-09-28').id, 'SP0', 'vor Planbeginn: erste Woche');
  assert.equal(PS.initialWeek(s, '2027-01-01').id, 'SP2', 'nach Planende: letzte Woche');
});

test('Fassung übernimmt fehlende Angaben aus der Einheit', () => {
  const session = example.days.find((d) => d.date === '2026-10-09').sessions[0];
  const home = PS.variantOf(session, 'home');
  assert.deepEqual(home.place, ['Z']);
  assert.equal(home.minutes, 35, 'Dauer aus der Einheit');
  assert.equal(PS.variantOf(session, 'short'), null);
});

test('Zieltexte', () => {
  assert.equal(PS.targetText({ sets: 3, seconds: [20, 30], restSec: 90 }), '3 × 20–30 s · Pause 90 s');
  assert.equal(PS.targetText({ sets: 2, reps: 8, perSide: 'Bein', restSec: 60 }), '2 × 8 je Bein · Pause 60 s');
  assert.equal(PS.targetText({ sets: 4, seconds: 75, restSec: 120 }), '4 × 1:15 Min. · Pause 2 Min.');
  assert.equal(PS.targetText({ sets: 4, seconds: 60 }), '4 × 1 Min.');
  assert.equal(PS.targetText({ minutes: 5 }), '5 Min.');
  assert.equal(PS.targetText({ minutes: [25, 35] }), '25–35 Min.');
  assert.equal(PS.targetText({ sets: 3, minutes: 4, restSec: 120, effort: '4–5' }), '3 × 4 Min. · Pause 2 Min. · Anstrengung 4–5');
  assert.equal(PS.secondsText([60, 90]), '1:00–1:30 Min.');
});

test('Datums-Hilfen', () => {
  assert.equal(PS.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(PS.daysBetween('2026-09-28', '2027-06-26'), 271);
  assert.equal(PS.addDays('2026-10-25', 1), '2026-10-26', 'Zeitumstellung');
});

/* Trainingsplan-Protokoll: Vorbelegung, letzte Werte, Status, Verschieben (ohne DOM).
   Datenmodell in data.planLog (Spec 001, Abschnitt 5). Läuft im Browser und in Node. */
(function (root) {
  'use strict';

  const SET_KINDS = ['strength', 'hold', 'climb', 'stairs'];
  const FEEL_KINDS = ['strength', 'hold', 'cardio', 'stairs', 'climb'];
  const UNITS = { reps: 'Wdh.', seconds: 's', minutes: 'Min.' };
  const FEEL = {
    hard: 'zu hart',
    right: 'genau richtig',
    easy: 'hätte schwerer sein können'
  };
  const STATES = {
    done: { icon: '✓', label: 'erledigt' },
    partial: { icon: '◐', label: 'teilweise' },
    started: { icon: '◐', label: 'angefangen' },
    skipped: { icon: '✕', label: 'ausgelassen' },
    missed: { icon: '!', label: 'nicht eingetragen' },
    open: { icon: '○', label: 'geplant' },
    none: { icon: '–', label: 'nicht gemacht' }
  };

  function emptyLog() {
    return { sessions: {}, tests: [] };
  }

  /* ---------- Übungsart und Messgröße ---------- */

  function kindOf(ex) {
    return ex ? ex.kind : 'other';
  }

  /* Welche Zahl pro Satz eingetragen wird: aus dem Plan, sonst aus der Übungsart */
  function metricOf(item, ex) {
    if (item.reps != null) return 'reps';
    if (item.seconds != null) return 'seconds';
    if (item.minutes != null) return 'minutes';
    const kind = kindOf(ex);
    if (kind === 'hold') return 'seconds';
    if (kind === 'strength') return 'reps';
    return 'minutes';
  }

  /* ---------- Welche Einheit liegt an welchem Tag (nach Verschieben) ---------- */

  function sessionIndex(store) {
    const index = new Map();
    for (const [date, day] of Object.entries(store.days)) {
      for (const s of day.sessions || []) index.set(s.id, { session: s, date });
    }
    return index;
  }

  function sessionsOn(store, index, moves, date) {
    const out = [];
    const day = store.days[date];
    for (const s of (day && day.sessions) || []) {
      const to = moves[s.id];
      if (!to || to === date) out.push({ session: s, plannedDate: date, movedFrom: null });
    }
    for (const [id, to] of Object.entries(moves)) {
      if (to !== date) continue;
      const hit = index.get(id);
      if (hit && hit.date !== date) out.push({ session: hit.session, plannedDate: hit.date, movedFrom: hit.date });
    }
    return out;
  }

  function movedAway(store, moves, date) {
    const day = store.days[date];
    return ((day && day.sessions) || [])
      .filter((s) => moves[s.id] && moves[s.id] !== date)
      .map((s) => ({ session: s, to: moves[s.id] }));
  }

  function effectiveDate(index, moves, id) {
    const hit = index.get(id);
    return moves[id] || (hit ? hit.date : null);
  }

  /* Neues moves-Objekt; zurück auf den geplanten Tag entfernt den Eintrag */
  function applyMove(moves, index, id, to) {
    const next = Object.assign({}, moves);
    const hit = index.get(id);
    if (hit && hit.date === to) delete next[id];
    else next[id] = to;
    return next;
  }

  /* ---------- Status ---------- */

  function rowsDone(itemResult) {
    return ((itemResult && itemResult.rows) || []).filter((r) => r.done);
  }

  function itemMeasured(r) {
    return !!r && (rowsDone(r).length > 0 || !!(r.cardio && r.cardio.done));
  }

  function itemHasData(r) {
    if (!r) return false;
    return itemMeasured(r) || !!r.done || !!r.feel || (r.value != null && r.value !== '');
  }

  function hasData(result) {
    return !!result && ((result.items || []).some(itemHasData) || result.effort != null || !!result.note);
  }

  function sessionState(result, date, today, optional) {
    if (result && result.status) return result.status;
    if (hasData(result)) return 'started';
    if (date < today) return optional ? 'none' : 'missed';
    return 'open';
  }

  /* ---------- Letzte Werte und Vorbelegung (Spec 001, 3.1) ---------- */

  function lastExerciseResult(log, exerciseId, excludeSessionId, maxDate) {
    let best = null;
    for (const r of Object.values(log.sessions)) {
      if (r.sessionId === excludeSessionId) continue;
      if (maxDate && r.date > maxDate) continue;
      for (const it of r.items || []) {
        if (!it || it.exercise !== exerciseId || !itemMeasured(it)) continue;
        if (!best || r.date > best.date) best = { date: r.date, item: it };
      }
    }
    return best;
  }

  /* Feste Zahl: die Zahl. Bereich: letzter Wert, wenn er drinliegt, sonst der untere. */
  function prefillValue(target, lastVal) {
    if (target == null) return lastVal != null ? lastVal : null;
    if (!Array.isArray(target)) return target;
    if (lastVal != null && lastVal >= target[0] && lastVal <= target[1]) return lastVal;
    return target[0];
  }

  function plannedOf(item) {
    const p = {};
    for (const k of ['sets', 'reps', 'seconds', 'minutes', 'restSec', 'perSide']) {
      if (item[k] != null) p[k] = item[k];
    }
    return p;
  }

  /* Ergebnis-Vorlage für einen Eintrag; wird erst gespeichert, wenn man etwas ändert */
  function newItemResult(item, ex, last) {
    if (item.test != null) return { test: item.test, done: false };
    if (item.text != null) return { text: item.text, done: false, value: null };

    const kind = kindOf(ex);
    const r = { exercise: item.exercise, planned: plannedOf(item) };
    if (kind === 'block' || kind === 'other') {
      r.done = false;
      if (kind === 'other') r.note = '';
      return r;
    }
    const lastItem = last ? last.item : null;
    if (kind === 'cardio') {
      const lc = lastItem && lastItem.cardio;
      r.cardio = {
        minutes: prefillValue(item.minutes, lc ? lc.minutes : null),
        km: null, pulse: null, effort: null, done: false
      };
      r.feel = null;
      return r;
    }

    const metric = metricOf(item, ex);
    const lastRows = lastItem ? rowsDone(lastItem) : [];
    r.rows = [];
    for (let i = 0; i < (item.sets || 1); i++) {
      const lr = lastRows[i] || lastRows[lastRows.length - 1] || null;
      const row = { done: false };
      row[metric] = prefillValue(item[metric], lr ? lr[metric] : null);
      if (ex && ex.load) row.kg = lr && lr.kg != null ? lr.kg : null;
      if (kind === 'stairs') row.rounds = null;
      r.rows.push(row);
    }
    r.feel = null;
    if (kind === 'strength' || kind === 'hold') r.variant = lastItem && lastItem.variant ? lastItem.variant : '';
    if (kind === 'climb') r.note = '';
    if (kind === 'stairs' || kind === 'climb') r.effort = null;
    return r;
  }

  /* Passt ein gespeichertes Ergebnis noch zum Eintrag im Plan? (nach Neu-Import) */
  function matchesItem(itemResult, item) {
    if (!itemResult) return false;
    if (item.exercise != null) return itemResult.exercise === item.exercise;
    if (item.test != null) return itemResult.test === item.test;
    return itemResult.text === item.text;
  }

  /* ---------- Anzeige ---------- */

  function num(v) {
    return typeof v === 'number' ? v.toLocaleString('de-DE') : String(v);
  }

  /* "30 / 28 / 25 s · 5 kg · Hände auf Stufe · genau richtig" */
  function lastText(itemResult) {
    const parts = [];
    if (itemResult.cardio && itemResult.cardio.done) {
      const c = itemResult.cardio;
      if (c.minutes != null) parts.push(`${num(c.minutes)} Min.`);
      if (c.km != null) parts.push(`${num(c.km)} km`);
      if (c.pulse != null) parts.push(`Ø-Puls ${num(c.pulse)}`);
    } else {
      const rows = rowsDone(itemResult);
      const metric = ['reps', 'seconds', 'minutes'].find((m) => rows.some((r) => r[m] != null));
      if (metric) parts.push(`${rows.map((r) => (r[metric] != null ? num(r[metric]) : '–')).join(' / ')} ${UNITS[metric]}`);
      const kgs = [...new Set(rows.map((r) => r.kg).filter((v) => v != null))];
      if (kgs.length) parts.push(`${kgs.map(num).join(' / ')} kg`);
      const rounds = rows.map((r) => r.rounds).filter((v) => v != null);
      if (rounds.length) parts.push(`${rounds.map(num).join(' / ')} Durchgänge`);
    }
    if (itemResult.variant) parts.push(itemResult.variant);
    if (itemResult.feel && FEEL[itemResult.feel]) parts.push(FEEL[itemResult.feel]);
    return parts.join(' · ');
  }

  /* ---------- Tests (Spec 001, Schritt 3) ---------- */

  /* Ergebnisse eines Tests, älteste zuerst */
  function testResults(log, testId) {
    return (log.tests || [])
      .filter((r) => r.test === testId)
      .sort((a, b) => (a.date === b.date ? (a.updatedAt || '').localeCompare(b.updatedAt || '') : a.date.localeCompare(b.date)));
  }

  /* Jüngstes Ergebnis eines Tests, ohne das der aktuellen Einheit, nicht nach maxDate */
  function lastTestResult(log, testId, excludeSessionId, maxDate) {
    const list = testResults(log, testId)
      .filter((r) => !(excludeSessionId && r.sessionId === excludeSessionId) && (!maxDate || r.date <= maxDate));
    return list.length ? list[list.length - 1] : null;
  }

  function sessionTestResult(log, sessionId, testId) {
    return (log.tests || []).find((r) => r.sessionId === sessionId && r.test === testId) || null;
  }

  function mmss(sec) {
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function formatTestValue(field, v) {
    if (v == null || v === '') return '–';
    switch (field.type) {
      case 'seconds': return `${num(v)} s`;
      case 'minsec': return `${mmss(v)} min`;
      case 'km': return `${num(v)} km`;
      case 'bpm': return `${num(v)}`;
      case 'scale10': return `${num(v)}/10`;
      case 'yesno': return v ? 'ja' : 'nein';
      default: return typeof v === 'number' ? num(v) : String(v);
    }
  }

  /* "45 s · Gehpausen: ja": Hauptwert ohne Namen, die übrigen mit Namen */
  function testSummary(testDef, values) {
    const parts = [];
    const fields = testDef.fields || [];
    const main = fields.find((f) => f.key === testDef.main);
    if (main && values[main.key] != null && values[main.key] !== '') parts.push(formatTestValue(main, values[main.key]));
    for (const f of fields) {
      if (f === main) continue;
      const v = values[f.key];
      if (v == null || v === '') continue;
      parts.push(`${f.label}: ${formatTestValue(f, v)}`);
    }
    return parts.join(' · ');
  }

  function hasTestValue(values) {
    return Object.values(values || {}).some((v) => v != null && v !== '');
  }

  /* Bekannte Testrunden: aus dem Plan und aus bisherigen Ergebnissen */
  function testRounds(store, log) {
    const set = new Set();
    for (const day of Object.values(store.days)) {
      for (const s of day.sessions || []) if (s.testRound) set.add(s.testRound);
    }
    for (const r of log.tests || []) if (r.round) set.add(r.round);
    return [...set];
  }

  /* "12,5" oder "12.5" → 12.5; leer → null */
  function parseNum(s) {
    if (s == null) return null;
    const t = String(s).trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return isNaN(n) ? null : n;
  }

  const api = {
    SET_KINDS, FEEL_KINDS, UNITS, FEEL, STATES,
    emptyLog, kindOf, metricOf,
    sessionIndex, sessionsOn, movedAway, effectiveDate, applyMove,
    rowsDone, itemMeasured, itemHasData, hasData, sessionState,
    lastExerciseResult, prefillValue, newItemResult, matchesItem,
    lastText, parseNum,
    testResults, lastTestResult, sessionTestResult, formatTestValue, testSummary, hasTestValue, testRounds
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlanLog = api;
})(this);

/* Prüfregeln für Plan-Dateien (specs/format-trainingsplan-v1.md, Abschnitt 1.9).
   Gemeinsam genutzt von der App (Import) und tools/check-plan.js (PC). */
(function (root) {
  'use strict';

  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const ID = /^[A-Za-z0-9-]+$/;
  const KINDS = ['strength', 'hold', 'cardio', 'stairs', 'climb', 'block', 'other'];
  const WEEK_TYPES = ['intro', 'build', 'deload', 'test', 'xmas', 'taper', 'race'];
  const FIELD_TYPES = ['seconds', 'minsec', 'number', 'km', 'bpm', 'scale10', 'yesno', 'text'];
  const SIDES = ['Bein', 'Seite', 'Arm'];
  const VARIANTS = ['normal', 'short', 'home'];

  function isDate(d) {
    if (typeof d !== 'string' || !DATE.test(d)) return false;
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day;
  }

  function isRange(v) {
    if (typeof v === 'number') return v >= 0;
    return Array.isArray(v) && v.length === 2 &&
      v.every((x) => typeof x === 'number' && x >= 0) && v[0] <= v[1];
  }

  const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

  /**
   * p: geparste Plan-Datei. existing: bereits importierte Kennungen
   * ({ exercises, tests, weeks, places } als Arrays), damit eine Datei auf
   * Übungen aus früheren Importen verweisen darf.
   */
  function checkPlan(p, existing) {
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(m);
    const ex = existing || {};

    if (!isObj(p)) return { errors: ['Die Datei enthält kein JSON-Objekt.'], warnings, stats: null };
    if (p.format !== 'trainingsplan') {
      err('Das ist keine Plan-Datei (format muss "trainingsplan" sein).');
      return { errors, warnings, stats: null };
    }
    if (p.formatVersion !== 1) {
      err(`Format-Version ${p.formatVersion} wird nicht unterstützt (diese App kennt Version 1).`);
      return { errors, warnings, stats: null };
    }
    for (const f of ['planId', 'title', 'createdAt', 'range', 'event', 'places', 'exercises', 'weeks', 'days']) {
      if (p[f] == null) err(`Pflichtfeld fehlt: ${f}`);
    }
    if (errors.length) return { errors, warnings, stats: null };
    if (!isObj(p.range) || !isDate(p.range.from) || !isDate(p.range.to) || p.range.from > p.range.to) {
      err('range ist ungültig (from/to als Datum, from ≤ to).');
    }
    if (!isObj(p.event) || !p.event.name || !isDate(p.event.date)) err('event braucht name und ein gültiges date.');
    if (!isObj(p.places)) err('places muss ein Objekt sein ({ "Z": "zu Hause", … }).');
    for (const f of ['exercises', 'weeks', 'days']) if (!Array.isArray(p[f])) err(`${f} muss eine Liste sein.`);
    if (p.tests != null && !Array.isArray(p.tests)) err('tests muss eine Liste sein.');
    if (p.guides != null && !Array.isArray(p.guides)) err('guides muss eine Liste sein.');
    if (errors.length) return { errors, warnings, stats: null };

    const places = new Set([...Object.keys(p.places), ...(ex.places || [])]);

    const exercises = new Map();
    for (const e of p.exercises) {
      const w = `Übung "${e && e.id}"`;
      if (!isObj(e) || !ID.test(e.id || '')) { err(`${w}: ungültige id (nur A–Z, a–z, 0–9, -)`); continue; }
      if (exercises.has(e.id)) err(`${w}: kommt doppelt vor`);
      if (!e.name) err(`${w}: name fehlt`);
      if (!KINDS.includes(e.kind)) err(`${w}: kind "${e.kind}" unbekannt`);
      if (!e.howTo) err(`${w}: howTo fehlt`);
      exercises.set(e.id, e);
    }
    const knownExercises = new Set([...exercises.keys(), ...(ex.exercises || [])]);

    const tests = new Map();
    for (const t of p.tests || []) {
      const w = `Test "${t && t.id}"`;
      if (!isObj(t) || !ID.test(t.id || '')) { err(`${w}: ungültige id`); continue; }
      if (tests.has(t.id)) err(`${w}: kommt doppelt vor`);
      if (!t.name || !t.howTo) err(`${w}: name oder howTo fehlt`);
      if (!Array.isArray(t.fields) || !t.fields.length) {
        err(`${w}: fields fehlt`);
      } else {
        for (const f of t.fields) {
          if (!isObj(f) || !f.key || !f.label || !FIELD_TYPES.includes(f.type)) {
            err(`${w}: Messwert ${JSON.stringify(f)} ungültig`);
          }
        }
        if (!t.fields.some((f) => f && f.key === t.main)) err(`${w}: main "${t.main}" steht nicht in fields`);
      }
      if (!['higher', 'lower'].includes(t.better)) err(`${w}: better muss "higher" oder "lower" sein`);
      if (t.target != null && (!isObj(t.target) || !t.target.text)) err(`${w}: target braucht text`);
      tests.set(t.id, t);
    }
    const knownTests = new Set([...tests.keys(), ...(ex.tests || [])]);

    const weeks = new Set();
    for (const wk of p.weeks) {
      const w = `Woche "${wk && wk.id}"`;
      if (!isObj(wk) || !ID.test(wk.id || '')) { err(`${w}: ungültige id`); continue; }
      if (weeks.has(wk.id)) err(`${w}: kommt doppelt vor`);
      if (!wk.title || !wk.phase || !isDate(wk.start)) err(`${w}: title, phase oder start fehlt/ungültig`);
      if (!Array.isArray(wk.types)) err(`${w}: types muss eine Liste sein`);
      else for (const ty of wk.types) if (!WEEK_TYPES.includes(ty)) err(`${w}: Wochentyp "${ty}" unbekannt`);
      weeks.add(wk.id);
    }
    const knownWeeks = new Set([...weeks, ...(ex.weeks || [])]);

    for (const g of p.guides || []) {
      if (!isObj(g) || !g.id || !g.title || !g.text) err(`Hilfetext ${JSON.stringify(g && g.id)}: id, title und text nötig`);
    }

    const dates = new Set();
    const sessionIds = new Set();
    let sessionCount = 0;
    let itemCount = 0;

    function checkItem(where, it) {
      itemCount++;
      if (!isObj(it)) { err(`${where}: Eintrag ist kein Objekt`); return; }
      const kinds = ['exercise', 'test', 'text'].filter((k) => it[k] != null);
      if (kinds.length !== 1) {
        err(`${where}: Eintrag braucht genau eins von exercise / test / text`);
        return;
      }
      if (it.exercise != null && !knownExercises.has(it.exercise)) err(`${where}: unbekannte Übung "${it.exercise}"`);
      if (it.test != null && !knownTests.has(it.test)) err(`${where}: unbekannter Test "${it.test}"`);
      const targets = ['reps', 'seconds', 'minutes'].filter((k) => it[k] != null);
      if (targets.length > 1) err(`${where}: mehr als eins von reps / seconds / minutes`);
      for (const k of targets) if (!isRange(it[k])) err(`${where}: ${k} ist keine Zahl bzw. kein Bereich [von, bis]`);
      if (it.sets != null && !(Number.isInteger(it.sets) && it.sets >= 1)) err(`${where}: sets muss eine ganze Zahl ≥ 1 sein`);
      if (it.restSec != null && !(typeof it.restSec === 'number' && it.restSec >= 0)) err(`${where}: restSec ungültig`);
      if (it.perSide != null && !SIDES.includes(it.perSide)) err(`${where}: perSide "${it.perSide}" unbekannt`);
      if (it.input != null && (!isObj(it.input) || !FIELD_TYPES.includes(it.input.type) || !it.input.label)) {
        err(`${where}: input braucht type und label`);
      }
    }

    for (const d of p.days) {
      const where = `Tag ${d && d.date}`;
      if (!isObj(d) || !isDate(d.date)) { err(`${where}: Datum ungültig`); continue; }
      if (isObj(p.range) && (d.date < p.range.from || d.date > p.range.to)) err(`${where}: liegt außerhalb von range`);
      if (dates.has(d.date)) err(`${where}: kommt doppelt vor`);
      dates.add(d.date);
      if (!knownWeeks.has(d.week)) err(`${where}: unbekannte Woche "${d.week}"`);
      if (!Array.isArray(d.sessions)) { err(`${where}: sessions muss eine Liste sein`); continue; }
      for (const s of d.sessions) {
        sessionCount++;
        const sw = `${where} / Einheit ${s && s.id}`;
        if (!isObj(s)) { err(`${sw}: keine gültige Einheit`); continue; }
        if (!s.id || !ID.test(s.id)) err(`${sw}: id fehlt oder ungültig`);
        else if (sessionIds.has(s.id)) err(`${sw}: Einheiten-id kommt doppelt vor`);
        sessionIds.add(s.id);
        if (s.id && !String(s.id).startsWith(d.date)) warnings.push(`${sw}: id beginnt nicht mit dem Datum`);
        for (const f of ['title', 'place', 'minutes', 'effort', 'variants']) if (s[f] == null) err(`${sw}: ${f} fehlt`);
        if (s.place != null && !Array.isArray(s.place)) err(`${sw}: place muss eine Liste sein`);
        for (const pl of Array.isArray(s.place) ? s.place : []) if (!places.has(pl)) err(`${sw}: unbekannter Ort "${pl}"`);
        if (s.minutes != null && !isRange(s.minutes)) err(`${sw}: minutes ist keine Zahl bzw. kein Bereich`);
        for (const a of s.altDates || []) if (!isDate(a)) err(`${sw}: altDates enthält ein ungültiges Datum`);
        if (!isObj(s.variants)) continue;
        if (!s.variants.normal) err(`${sw}: variants.normal fehlt`);
        for (const [vn, v] of Object.entries(s.variants)) {
          if (v == null) continue;
          const vw = `${sw} (${vn})`;
          if (!VARIANTS.includes(vn)) { err(`${sw}: unbekannte Fassung "${vn}"`); continue; }
          if (v.place != null && !Array.isArray(v.place)) err(`${vw}: place muss eine Liste sein`);
          for (const pl of Array.isArray(v.place) ? v.place : []) if (!places.has(pl)) err(`${vw}: unbekannter Ort "${pl}"`);
          if (v.minutes != null && !isRange(v.minutes)) err(`${vw}: minutes ungültig`);
          if (!Array.isArray(v.items) || !v.items.length) { err(`${vw}: items fehlt oder ist leer`); continue; }
          v.items.forEach((it, i) => checkItem(`${vw} Eintrag ${i + 1}`, it));
        }
        const hasTest = Object.values(s.variants).some((v) => v && Array.isArray(v.items) && v.items.some((it) => it && it.test));
        if (hasTest && !s.testRound) warnings.push(`${sw}: enthält Tests, aber keine testRound`);
      }
    }

    return {
      errors,
      warnings,
      stats: {
        exercises: exercises.size, tests: tests.size, weeks: weeks.size,
        days: dates.size, sessions: sessionCount, items: itemCount
      }
    };
  }

  const api = { checkPlan, isDate, isRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlanCheck = api;
})(this);

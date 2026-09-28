/* Trainingsplan: Speicher, Import-Regeln und Anzeige-Hilfen (ohne DOM).
   Format: specs/format-trainingsplan-v1.md. Läuft im Browser und in Node. */
(function (root) {
  'use strict';

  const PLAN_KEY = 'fitness-tracker:plan';

  function emptyStore() {
    return {
      formatVersion: 1,
      imports: [],
      event: null,
      places: {},
      guides: {},
      exercises: {},
      tests: {},
      weeks: {},
      days: {}
    };
  }

  /* ---------- Datum (lokale Zeit, Schlüssel JJJJ-MM-TT) ---------- */

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function daysBetween(fromK, toK) {
    return Math.round((fromKey(toK) - fromKey(fromK)) / 86400000);
  }

  /* ---------- Speicher ---------- */

  function load(storage) {
    try {
      const raw = storage.getItem(PLAN_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.days) return emptyStore();
      return Object.assign(emptyStore(), parsed);
    } catch (e) {
      return emptyStore();
    }
  }

  function save(storage, store) {
    storage.setItem(PLAN_KEY, JSON.stringify(store));
  }

  function isStore(v) {
    return v != null && typeof v === 'object' && v.days != null && typeof v.days === 'object' &&
      v.exercises != null && typeof v.exercises === 'object';
  }

  /* ---------- Import (Format-Abschnitt 1.9) ---------- */

  function existingIds(store) {
    return {
      exercises: Object.keys(store.exercises),
      tests: Object.keys(store.tests),
      weeks: Object.keys(store.weeks),
      places: Object.keys(store.places)
    };
  }

  /* Tage im Zeitraum der Datei, die schon importiert sind (werden ersetzt) */
  function countReplaced(store, plan) {
    return Object.keys(store.days)
      .filter((d) => d >= plan.range.from && d <= plan.range.to).length;
  }

  /* Liefert einen neuen Speicher; der alte bleibt unverändert */
  function applyImport(store, plan, importedAt) {
    const next = JSON.parse(JSON.stringify(store));
    for (const d of Object.keys(next.days)) {
      if (d >= plan.range.from && d <= plan.range.to) delete next.days[d];
    }
    for (const day of plan.days) next.days[day.date] = day;
    for (const e of plan.exercises) next.exercises[e.id] = e;
    for (const t of plan.tests || []) next.tests[t.id] = t;
    for (const w of plan.weeks) next.weeks[w.id] = w;
    for (const g of plan.guides || []) next.guides[g.id] = g;
    Object.assign(next.places, plan.places);
    next.event = plan.event;
    // Gleicher Plan-Teil oder komplett überdeckter Zeitraum: alter Eintrag entfällt
    next.imports = next.imports.filter((i) => i.planId !== plan.planId &&
      !(i.range.from >= plan.range.from && i.range.to <= plan.range.to));
    next.imports.push({
      planId: plan.planId,
      title: plan.title,
      range: plan.range,
      createdAt: plan.createdAt,
      importedAt
    });
    next.imports.sort((a, b) => a.range.from.localeCompare(b.range.from));
    return next;
  }

  /* ---------- Abfragen ---------- */

  function hasPlan(store) {
    return Object.keys(store.days).length > 0;
  }

  function bounds(store) {
    const keys = Object.keys(store.days).sort();
    return keys.length ? { first: keys[0], last: keys[keys.length - 1] } : null;
  }

  function weekList(store) {
    return Object.values(store.weeks).sort((a, b) => a.start.localeCompare(b.start));
  }

  /* Alle Daten einer Woche: vom Start bis vor den Start der nächsten Woche (höchstens 7 Tage) */
  function weekDates(store, weekId) {
    const list = weekList(store);
    const i = list.findIndex((w) => w.id === weekId);
    if (i < 0) return [];
    const start = list[i].start;
    let len = 7;
    if (i + 1 < list.length) len = Math.min(7, Math.max(1, daysBetween(start, list[i + 1].start)));
    return Array.from({ length: len }, (_, n) => addDays(start, n));
  }

  /* Woche eines Datums: aus dem Tag selbst, sonst die letzte Woche, die davor beginnt */
  function weekForDate(store, date) {
    const day = store.days[date];
    if (day && store.weeks[day.week]) return store.weeks[day.week];
    let found = null;
    for (const w of weekList(store)) {
      if (w.start <= date && weekDates(store, w.id).includes(date)) found = w;
    }
    return found;
  }

  /* Woche, die der Plan-Tab zuerst zeigt: heute, sonst die nächstliegende */
  function initialWeek(store, today) {
    const list = weekList(store);
    if (!list.length) return null;
    const w = weekForDate(store, today);
    if (w) return w;
    if (today < list[0].start) return list[0];
    return list[list.length - 1];
  }

  /* Fassung einer Einheit; fehlende Angaben kommen aus der Einheit */
  function variantOf(session, name) {
    const v = session.variants && session.variants[name];
    if (!v) return null;
    return {
      name,
      place: v.place || session.place,
      minutes: v.minutes != null ? v.minutes : session.minutes,
      effort: v.effort || session.effort,
      note: v.note || '',
      items: v.items || []
    };
  }

  /* ---------- Anzeige ---------- */

  const DASH = '–';

  function rangeText(v, fmt) {
    const f = fmt || String;
    return Array.isArray(v) ? `${f(v[0])}${DASH}${f(v[1])}` : f(v);
  }

  function mmss(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* 20 → "20 s", [20, 30] → "20–30 s", 75 → "1:15 Min.", 120 → "2 Min." */
  function secondsText(v) {
    const vals = Array.isArray(v) ? v : [v];
    if (vals.every((x) => x < 60)) return `${rangeText(v)} s`;
    if (vals.every((x) => x % 60 === 0)) return `${rangeText(v, (x) => x / 60)} Min.`;
    return `${rangeText(v, mmss)} Min.`;
  }

  function minutesText(v) {
    return `${rangeText(v)} Min.`;
  }

  /* Wie im Plan geschrieben: "Pause 60 s", "Pause 90 s", "Pause 2 Min." */
  function restText(sec) {
    return sec >= 120 && sec % 60 === 0 ? `Pause ${sec / 60} Min.` : `Pause ${sec} s`;
  }

  /* "3 × 8–12 je Bein · Pause 90 s" */
  function targetText(item) {
    const sets = item.sets || 1;
    let amount = '';
    if (item.reps != null) amount = rangeText(item.reps);
    else if (item.seconds != null) amount = secondsText(item.seconds);
    else if (item.minutes != null) amount = minutesText(item.minutes);

    let main = '';
    if (amount) main = sets > 1 ? `${sets} × ${amount}` : amount;
    else if (sets > 1) main = `${sets} Sätze`;
    if (main && item.perSide) main += ` je ${item.perSide}`;

    const parts = [];
    if (main) parts.push(main);
    if (item.restSec) parts.push(restText(item.restSec));
    if (item.effort) parts.push(`Anstrengung ${item.effort}`);
    if (item.tank) parts.push(`${item.tank} im Tank`);
    return parts.join(' · ');
  }

  const WEEK_TYPE_LABELS = {
    intro: '🌱 Einstieg',
    build: '▲ Aufbau',
    deload: '▽ Entlastung',
    test: '🧪 Test',
    xmas: '🎄 Weihnachten',
    taper: '🏁 Tapering',
    race: '🏁 Rennwoche'
  };

  function weekTypeText(week) {
    return (week.types || []).map((t) => WEEK_TYPE_LABELS[t] || t).join(' · ');
  }

  const api = {
    PLAN_KEY, emptyStore, load, save, isStore,
    fromKey, toKey, addDays, daysBetween,
    existingIds, countReplaced, applyImport,
    hasPlan, bounds, weekList, weekDates, weekForDate, initialWeek, variantOf,
    rangeText, secondsText, minutesText, restText, targetText, weekTypeText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlanStore = api;
})(this);

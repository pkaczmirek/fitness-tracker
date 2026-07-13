/* ============================================================
   Fitness Tracker – Training, Kalorien, Wasser & Gewicht
   Alle Daten liegen lokal im Browser (localStorage).
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'fitness-tracker:v1';

  // Muss zur CACHE-Version in sw.js passen (bei jedem Release beide hochzählen)
  const APP_VERSION = 11;

  // Nur noch für die Migration alter Daten (Version 1) benötigt
  const MEAL_TYPES_V1 = ['breakfast', 'lunch', 'dinner', 'snacks'];

  const SCHEME_LABELS = {
    amrap: 'Max. Runden in Zeit',
    fixedRounds: 'Feste Runden, Wdh. zählen',
    time: 'Auf Zeit',
    free: 'Freies Ergebnis'
  };

  /* Übungskatalog der Challenge – Auswahl je Training, Zählung je Einheit */
  const EXERCISES = [
    'Bodyrocks',
    'Scorpion Kicks',
    'Liegestütze',
    'Tischziehen',
    'Fallschirmspringer',
    'Einbeiniges Kreuzheben',
    'Iron Mikes',
    'Prisoner Squats m Sprung',
    'Lunges'
  ];

  /* Ruhetag-Varianten; alle außer "rest" zählen als aktiver Ruhetag.
     Alte Einträge ohne restType gelten als tatsächlicher Ruhetag. */
  const REST_TYPES = {
    steps: { icon: '🚶', label: '10.000 Schritte' },
    mobility: { icon: '🧘', label: 'Mobilitytraining' },
    run: { icon: '🏃', label: 'Regenerationslauf' },
    rest: { icon: '😌', label: 'Tatsächlicher Ruhetag' }
  };

  function restType(t) {
    return REST_TYPES[t.restType] ? t.restType : 'rest';
  }

  function isActiveRest(t) {
    return !!t && t.restDay && restType(t) !== 'rest';
  }

  function restLabel(t) {
    const rt = REST_TYPES[restType(t)];
    return `${rt.icon} ${rt.label}`;
  }

  /* ---------- Datum-Hilfen (immer lokale Zeitzone!) ---------- */

  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey() { return toKey(new Date()); }

  function addDays(key, n) {
    const d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function formatDateLong(key) {
    return fromKey(key).toLocaleDateString('de-DE', {
      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function challengeDay(key) {
    const start = fromKey(data.settings.challengeStart);
    const diff = Math.round((fromKey(key) - start) / 86400000) + 1;
    return diff;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmt(n, digits = 0) {
    return Number(n).toLocaleString('de-DE', {
      minimumFractionDigits: digits, maximumFractionDigits: digits
    });
  }

  /* ---------- Speicher ---------- */

  function defaultData() {
    return {
      version: 2,
      settings: {
        // Tag 1 der 90-Tage-Challenge (unter „Mehr" änderbar)
        challengeStart: '2026-06-01',
        challengeDays: 90,
        kcalGoal: 2200,
        waterGoal: 3000,
        fastingWindow: 6,
        sleepGoal: 7.5,
        // Ab wann die einzelnen Erfolgsquoten zählen (null = von Anfang an)
        trackFrom: { training: null, kcal: null, water: null, fasting: null, sleep: null, sweets: null }
      },
      workouts: [],
      foods: [],
      days: {}
    };
  }

  /* Alte Datenstände ins aktuelle Format überführen */
  function migrate(d) {
    if (!d.version || d.version < 2) {
      // v1 → v2: Mahlzeiten von festen Typen (Frühstück …) auf
      // nummerierte Mahlzeiten mit Uhrzeit umstellen
      for (const day of Object.values(d.days || {})) {
        if (day.meals && !Array.isArray(day.meals)) {
          const arr = [];
          for (const type of MEAL_TYPES_V1) {
            const items = day.meals[type];
            if (items && items.length) arr.push({ id: uid(), time: null, items });
          }
          day.meals = arr;
        } else if (!Array.isArray(day.meals)) {
          day.meals = [];
        }
      }
      if (d.settings.fastingWindow == null) d.settings.fastingWindow = 6;
      d.version = 2;
    }
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.settings) return defaultData();
      const merged = Object.assign(defaultData(), parsed);
      merged.settings = Object.assign(defaultData().settings, parsed.settings);
      merged.settings.trackFrom = Object.assign(
        defaultData().settings.trackFrom,
        (parsed.settings && parsed.settings.trackFrom) || {}
      );
      const before = parsed.version || 1;
      const migrated = migrate(merged);
      // Migration sofort zurückschreiben, nicht erst beim nächsten Speichern
      if (migrated.version !== before) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      }
      return migrated;
    } catch (e) {
      console.error('Konnte Daten nicht laden:', e);
      return defaultData();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getDay(key, create) {
    if (!data.days[key] && create) {
      data.days[key] = { weight: null, water: 0, meals: [], training: null };
    }
    return data.days[key] || { weight: null, water: 0, meals: [], training: null };
  }

  function cleanupDay(key) {
    // Leere Tage nicht dauerhaft speichern
    const d = data.days[key];
    if (!d) return;
    const hasMeals = (d.meals || []).length > 0;
    if (d.weight == null && !d.water && !hasMeals && !d.training &&
        !d.sleepOk && !d.noSweets) delete data.days[key];
  }

  function dayKcal(day) {
    let sum = 0;
    for (const meal of day.meals || []) {
      for (const item of meal.items || []) sum += Number(item.kcal) || 0;
    }
    return sum;
  }

  /* Essensfenster eines Tages auswerten (für das Fasten-Ziel).
     known = alle Mahlzeiten mit Einträgen haben eine Uhrzeit */
  function fastingInfo(day) {
    const meals = (day.meals || []).filter((m) => m.items && m.items.length);
    if (!meals.length) return { hasMeals: false, known: false };
    const mins = meals
      .filter((m) => m.time)
      .map((m) => {
        const [h, mm] = m.time.split(':').map(Number);
        return h * 60 + mm;
      });
    if (mins.length < meals.length) return { hasMeals: true, known: false };
    const first = Math.min(...mins);
    const last = Math.max(...mins);
    const spanH = (last - first) / 60;
    const toHM = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    return {
      hasMeals: true,
      known: true,
      spanH,
      first: toHM(first),
      last: toHM(last),
      ok: spanH <= data.settings.fastingWindow
    };
  }

  /* Tages-Schlüssel, die für einen Parameter zählen (trackFrom-Filter) */
  function countedKeys(param) {
    const from = (data.settings.trackFrom || {})[param];
    return Object.keys(data.days).filter((k) => !from || k >= from).sort();
  }

  /* Schlaf-Ziel: an wie vielen der erfassten Tage erreicht */
  function sleepStats() {
    const keys = countedKeys('sleep');
    const achieved = keys.filter((k) => data.days[k].sleepOk).length;
    return { achieved, total: keys.length };
  }

  /* Süßigkeiten-Streak: Tage am Stück (heute zählt erst, wenn angehakt;
     ein noch nicht angehakter heutiger Tag bricht den Streak nicht) */
  function sweetsStreak() {
    const from = (data.settings.trackFrom || {}).sweets;
    const ok = (k) => (!from || k >= from) && data.days[k] && data.days[k].noSweets;
    let k = todayKey();
    let streak = 0;
    if (!ok(k)) k = addDays(k, -1);
    while (ok(k)) {
      streak++;
      k = addDays(k, -1);
    }
    // Rekord: längste Serie aufeinanderfolgender Kalendertage
    let best = 0, run = 0, prev = null;
    for (const key of countedKeys('sweets')) {
      if (!data.days[key].noSweets) continue;
      run = (prev && addDays(prev, 1) === key) ? run + 1 : 1;
      best = Math.max(best, run);
      prev = key;
    }
    return { streak, best };
  }

  /* Quote „erreicht an X von Y Tagen" für kcal / Wasser / Fasten */
  function ratioStats(param) {
    let total = 0, achieved = 0;
    for (const k of countedKeys(param)) {
      const day = data.days[k];
      if (param === 'kcal') {
        const kc = dayKcal(day);
        if (kc > 0) { total++; if (kc <= data.settings.kcalGoal) achieved++; }
      } else if (param === 'water') {
        if (day.water > 0) { total++; if (day.water >= data.settings.waterGoal) achieved++; }
      } else if (param === 'fasting') {
        const fi = fastingInfo(day);
        if (fi.known) { total++; if (fi.ok) achieved++; }
      }
    }
    return { achieved, total };
  }

  /* Trainingsquote: Training oder Ruhetag an X von Y Kalendertagen */
  function trainingStats() {
    const start = (data.settings.trackFrom || {}).training || data.settings.challengeStart;
    const today = todayKey();
    let calDays = Math.floor((fromKey(today) - fromKey(start)) / 86400000) + 1;
    if (calDays < 0) calDays = 0;
    let trained = 0, activeRests = 0, rests = 0;
    for (const k of Object.keys(data.days)) {
      if (k < start || k > today) continue;
      const t = data.days[k].training;
      if (!t) continue;
      if (!t.restDay) trained++;
      else if (isActiveRest(t)) activeRests++;
      else rests++;
    }
    return { trained, activeRests, rests, calDays, start };
  }

  /* Lebenszeit-Summen je Übung über alle Trainings */
  function exerciseTotals() {
    const totals = {};
    for (const day of Object.values(data.days)) {
      const c = day.training && day.training.exerciseCounts;
      if (!c) continue;
      for (const [name, n] of Object.entries(c)) {
        totals[name] = (totals[name] || 0) + (Number(n) || 0);
      }
    }
    return totals;
  }

  /* ---------- Persönliche Rekorde je Workout ----------
     amrap: meiste Runden (+ Zusatz-Wdh. als Feinvergleich)
     fixedRounds: meiste Wdh. in der letzten Runde (Gesamt als Feinvergleich)
     time: schnellste Zeit. Höherer Score = besser. */

  function lastRoundReps(t) {
    const arr = (t.repsPerRound || []).filter((r) => r != null && r !== '');
    return arr.length ? Number(arr[arr.length - 1]) : null;
  }

  function recordScore(t, scheme) {
    if (!t || t.restDay) return null;
    if (scheme === 'amrap') {
      if (t.rounds == null || isNaN(Number(t.rounds))) return null;
      return Number(t.rounds) * 10000 + (Number(t.extraReps) || 0);
    }
    if (scheme === 'fixedRounds') {
      const last = lastRoundReps(t);
      if (last == null || isNaN(last)) return null;
      const total = (t.repsPerRound || []).reduce((s, r) => s + (Number(r) || 0), 0);
      return last * 100000 + total;
    }
    if (scheme === 'time') {
      const sec = (Number(t.timeMin) || 0) * 60 + (Number(t.timeSec) || 0);
      return sec > 0 ? -sec : null;
    }
    return null;
  }

  function recordText(w, t) {
    if (w.scheme === 'amrap') {
      let s = `${t.rounds} Runden in ${t.minutes || w.minutes || '?'} min`;
      if (t.extraReps) s += ` + ${t.extraReps} Wdh.`;
      return s;
    }
    if (w.scheme === 'fixedRounds') {
      const total = (t.repsPerRound || []).reduce((s, r) => s + (Number(r) || 0), 0);
      return `${lastRoundReps(t)} Wdh. in der letzten Runde (gesamt ${fmt(total)})`;
    }
    if (w.scheme === 'time') {
      const m = Number(t.timeMin) || 0;
      const s = Number(t.timeSec) || 0;
      return `${m}:${String(s).padStart(2, '0')} min`;
    }
    return '';
  }

  function workoutRecord(w, excludeKey) {
    let best = null;
    for (const k of Object.keys(data.days)) {
      if (k === excludeKey) continue;
      const t = data.days[k].training;
      if (!t || t.restDay || t.workoutId !== w.id) continue;
      const score = recordScore(t, w.scheme);
      if (score == null) continue;
      if (!best || score > best.score) best = { score, key: k, t };
    }
    return best;
  }

  /* Feste Runden: Bestwert der letzten Runde je Übung (name → {value, key}) */
  function exerciseLastRoundRecords(w, excludeKey) {
    const recs = {};
    for (const k of Object.keys(data.days)) {
      if (k === excludeKey) continue;
      const t = data.days[k].training;
      if (!t || t.restDay || t.workoutId !== w.id || !t.lastRound) continue;
      for (const [name, v] of Object.entries(t.lastRound)) {
        const n = Number(v);
        if (isNaN(n)) continue;
        if (!recs[name] || n > recs[name].value) recs[name] = { value: n, key: k };
      }
    }
    return recs;
  }

  /* Rekord-Text je Workout; fixedRounds mit Übungen → je Übung */
  function recordSummaryText(w, excludeKey) {
    if (w.scheme === 'fixedRounds' && w.exercises && w.exercises.length) {
      const recs = exerciseLastRoundRecords(w, excludeKey);
      const parts = w.exercises
        .filter((n) => recs[n])
        .map((n) => `${n} ${fmt(recs[n].value)}`);
      if (parts.length) return `Letzte Runde: ${parts.join(' · ')}`;
      // Noch keine Übungswerte erfasst → alter Gesamt-Vergleich als Rückfall
    }
    const rec = workoutRecord(w, excludeKey);
    return rec ? `${recordText(w, rec.t)} · ${formatDateShort(rec.key)}` : null;
  }

  /* Letztes erfasstes Ergebnis eines Workouts vor einem Datum */
  function lastTrainingResult(workoutId, beforeKey) {
    const keys = Object.keys(data.days).filter((k) => k < beforeKey).sort().reverse();
    for (const k of keys) {
      const t = data.days[k].training;
      if (t && !t.restDay && t.workoutId === workoutId) return { key: k, t };
    }
    return null;
  }

  /* ---------- Zustand ---------- */

  let data = load();
  let currentKey = todayKey();
  let currentView = 'today';
  let editLogMode = false; // logDialog: neu vs. bearbeiten

  /* ---------- Kürzel ---------- */
  const $ = (sel) => document.querySelector(sel);

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k === 'html') node.innerHTML = v;
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ============================================================
     Rendering
     ============================================================ */

  function renderAll() {
    renderHeader();
    if (currentView === 'today') renderToday();
    if (currentView === 'history') renderHistory();
    if (currentView === 'manage') renderManage();
    if (currentView === 'more') renderMore();
  }

  function renderHeader() {
    const badge = $('#challengeBadge');
    const day = challengeDay(currentKey);
    if (day >= 1 && day <= data.settings.challengeDays) {
      badge.textContent = `Tag ${day} / ${data.settings.challengeDays}`;
    } else if (day > data.settings.challengeDays) {
      badge.textContent = 'Challenge geschafft 🎉';
    } else {
      badge.textContent = '';
    }
    $('#datePicker').value = currentKey;
    $('#datePicker').max = todayKey();
    $('#nextDay').disabled = currentKey >= todayKey();
    $('#todayBtn').hidden = currentKey === todayKey();
  }

  /* ---------- Heute ---------- */

  function renderToday() {
    const day = getDay(currentKey);

    // Gewicht
    $('#weightInput').value = day.weight != null ? day.weight : '';
    const prev = lastWeightBefore(currentKey);
    let hint = '';
    if (day.weight != null && prev != null) {
      const diff = day.weight - prev.weight;
      const sign = diff > 0 ? '+' : '';
      hint = `${sign}${fmt(diff, 1)} kg seit ${formatDateLong(prev.key)}`;
    } else if (day.weight == null && prev != null) {
      hint = `Letzter Wert: ${fmt(prev.weight, 1)} kg (${formatDateLong(prev.key)})`;
    }
    $('#weightHint').textContent = hint;

    // Tagesziele (Checkboxen)
    $('#checkSleepLabel').textContent =
      `Mindestens ${data.settings.sleepGoal.toLocaleString('de-DE')} h geschlafen`;
    $('#checkSleep').checked = !!day.sleepOk;
    $('#checkSweets').checked = !!day.noSweets;

    // Wasser
    const water = day.water || 0;
    const wGoal = data.settings.waterGoal;
    const wPct = Math.min(100, (water / wGoal) * 100);
    $('#waterFill').style.width = wPct + '%';
    $('#waterLabel').textContent =
      `${fmt(water / 1000, water % 1000 ? 2 : 1)} / ${fmt(wGoal / 1000, 1)} Liter` +
      (water >= wGoal ? ' – Ziel erreicht! 💧' : '');

    // Kalorien
    const kcal = dayKcal(day);
    const kGoal = data.settings.kcalGoal;
    const kPct = Math.min(100, (kcal / kGoal) * 100);
    const kFill = $('#kcalFill');
    kFill.style.width = kPct + '%';
    kFill.classList.toggle('over', kcal > kGoal);
    $('#kcalLabel').textContent = `${fmt(kcal)} / ${fmt(kGoal)} kcal` +
      (kcal > kGoal ? ` – ${fmt(kcal - kGoal)} über dem Ziel` : ` – noch ${fmt(kGoal - kcal)} übrig`);

    // Fasten-Status + Countdown
    updateFastingDisplay(day);

    // Mahlzeiten (nummeriert, je mit Uhrzeit)
    const mc = $('#mealsContainer');
    mc.innerHTML = '';
    const meals = day.meals || [];
    meals.forEach((meal, idx) => {
      const items = meal.items || [];
      const sum = items.reduce((s, i) => s + (Number(i.kcal) || 0), 0);

      const timeInput = el('input', {
        type: 'time', class: 'meal-time', value: meal.time || '',
        'aria-label': `Uhrzeit ${idx + 1}. Mahlzeit`,
        onchange: (e) => {
          meal.time = e.target.value || null;
          save(); renderAll();
        }
      });

      const group = el('div', { class: 'meal-group' },
        el('div', { class: 'meal-group-head' },
          el('h3', null, `${idx + 1}. Mahlzeit`),
          el('div', { class: 'meal-head-right' },
            timeInput,
            el('span', { class: 'meal-kcal-sum' }, items.length ? `${fmt(sum)} kcal` : ''),
            el('button', {
              class: 'item-del', 'aria-label': 'Mahlzeit löschen',
              onclick: () => {
                if (items.length && !confirm(`${idx + 1}. Mahlzeit mit ${items.length} Einträgen löschen?`)) return;
                day.meals = day.meals.filter((m) => m.id !== meal.id);
                cleanupDay(currentKey); save(); renderAll();
              }
            }, '✕')
          )
        )
      );
      if (items.length) {
        const list = el('ul', { class: 'item-list' });
        for (const item of items) {
          list.append(el('li', { class: 'item-row' },
            el('span', { class: 'item-name' }, item.name),
            el('span', { class: 'item-meta' },
              (item.qty && item.qty !== 1 ? `${fmt(item.qty, item.qty % 1 ? 2 : 0)} × ` : '') + `${fmt(item.kcal)} kcal`),
            el('button', {
              class: 'item-del', 'aria-label': 'Eintrag löschen',
              onclick: () => {
                meal.items = meal.items.filter((i) => i.id !== item.id);
                cleanupDay(currentKey); save(); renderAll();
              }
            }, '✕')
          ));
        }
        group.append(list);
      }
      group.append(el('button', {
        class: 'add-item-btn',
        onclick: () => openMealDialog(meal.id)
      }, '+ Eintrag ergänzen'));
      mc.append(group);
    });

    // „Wie gestern": nur anbieten, wenn der Tag leer ist und der Vortag Mahlzeiten hat
    const prevDay = data.days[addDays(currentKey, -1)];
    const prevHasMeals = prevDay && (prevDay.meals || []).some((m) => m.items && m.items.length);
    $('#copyMealsBtn').hidden = !(meals.length === 0 && prevHasMeals);

    // Training
    renderTrainingCard(day);
  }

  function updateFastingDisplay(day) {
    const fi = fastingInfo(day);
    const fl = $('#fastingLabel');
    const goalTxt = fmt(data.settings.fastingWindow, 1);
    if (fi.hasMeals && fi.known) {
      fl.textContent = `Essensfenster: ${fi.first}–${fi.last} Uhr = ${fmt(fi.spanH, 1)} h ` +
        (fi.ok ? `✓ (Ziel ≤ ${goalTxt} h)` : `✗ (Ziel ≤ ${goalTxt} h)`);
    } else if (fi.hasMeals) {
      fl.textContent = 'Essensfenster: Uhrzeiten ergänzen, um das Fasten-Ziel auszuwerten';
    } else {
      fl.textContent = '';
    }

    // Countdown nur für den heutigen Tag
    const fc = $('#fastingCountdown');
    fc.textContent = '';
    if (currentKey !== todayKey()) return;
    const timed = (day.meals || []).filter((m) => m.items && m.items.length && m.time);
    if (!timed.length || (fi.known && !fi.ok)) return;
    const mins = timed.map((m) => {
      const [h, mm] = m.time.split(':').map(Number);
      return h * 60 + mm;
    });
    const close = Math.min(...mins) + Math.round(data.settings.fastingWindow * 60);
    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();
    const hm = (v) => `${String(Math.floor((v % 1440) / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    if (nowM <= close) {
      const rest = close - nowM;
      fc.textContent = `⏳ Fenster noch offen bis ${hm(close)} Uhr (${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')} h übrig)`;
    } else {
      fc.textContent = `🔒 Fenster geschlossen (war offen bis ${hm(close)} Uhr)`;
    }
  }

  function lastWeightBefore(key) {
    const keys = Object.keys(data.days)
      .filter((k) => k < key && data.days[k].weight != null)
      .sort();
    if (!keys.length) return null;
    const k = keys[keys.length - 1];
    return { key: k, weight: data.days[k].weight };
  }

  function workoutById(id) {
    return data.workouts.find((w) => w.id === id) || null;
  }

  function trainingResultText(t) {
    if (!t) return '';
    if (t.restDay) return REST_TYPES[restType(t)].label;
    const w = workoutById(t.workoutId);
    const scheme = t.scheme || (w && w.scheme) || 'free';
    if (scheme === 'amrap') {
      const min = t.minutes || (w && w.minutes) || '?';
      let s = `${t.rounds ?? '?'} Runden in ${min} min`;
      if (t.extraReps) s += ` + ${t.extraReps} Wdh.`;
      return s;
    }
    if (scheme === 'fixedRounds') {
      const reps = (t.repsPerRound || []).map((r) => (r == null || r === '' ? '–' : r));
      const total = (t.repsPerRound || []).reduce((s, r) => s + (Number(r) || 0), 0);
      return `${reps.length} Runden: ${reps.join(' / ')} Wdh. (gesamt ${fmt(total)})`;
    }
    if (scheme === 'time') {
      const m = Number(t.timeMin) || 0;
      const s = Number(t.timeSec) || 0;
      return `Zeit: ${m}:${String(s).padStart(2, '0')} min`;
    }
    return t.resultText || '';
  }

  function renderTrainingCard(day) {
    const tc = $('#trainingContainer');
    tc.innerHTML = '';
    const t = day.training;

    if (t && t.restDay) {
      tc.append(el('div', { class: 'rest-banner' }, restLabel(t)));
      tc.append(el('div', { class: 'quick-btns' },
        el('button', { class: 'btn', onclick: () => $('#restDialog').showModal() }, 'Ändern'),
        el('button', { class: 'btn danger-btn', onclick: () => { day.training = null; cleanupDay(currentKey); save(); renderAll(); } },
          'Entfernen')
      ));
      return;
    }

    if (t) {
      const w = workoutById(t.workoutId);
      const summary = el('div', { class: 'training-summary' },
        el('div', { class: 't-name' }, w ? w.name : (t.workoutName || 'Training')),
        el('div', { class: 't-result' }, trainingResultText(t))
      );
      if (t.note) summary.append(el('div', { class: 't-note' }, `📝 ${t.note}`));
      tc.append(summary);
      tc.append(el('div', { class: 'quick-btns' },
        el('button', { class: 'btn', onclick: () => openLogDialog(true) }, 'Bearbeiten'),
        el('button', {
          class: 'btn danger-btn', onclick: () => {
            if (confirm('Training für diesen Tag löschen?')) {
              day.training = null; cleanupDay(currentKey); save(); renderAll();
            }
          }
        }, 'Löschen')
      ));
      return;
    }

    // Noch nichts erfasst
    if (!data.workouts.length) {
      tc.append(el('p', { class: 'empty-note' },
        'Lege zuerst unter „Verwalten" deine Trainings an – danach kannst du sie hier mit einem Tipp erfassen.'));
    }
    tc.append(el('div', { class: 'quick-btns' },
      el('button', {
        class: 'btn btn-primary', onclick: () => {
          if (!data.workouts.length) { switchView('manage'); toast('Lege zuerst ein Training an'); return; }
          openLogDialog(false);
        }
      }, 'Training erfassen'),
      el('button', {
        class: 'btn', onclick: () => $('#restDialog').showModal()
      }, 'Ruhetag')
    ));
  }

  /* ---------- Verlauf ---------- */

  function statRow(icon, value, label) {
    return el('div', { class: 'stat-row' },
      el('span', { class: 'stat-icon' }, icon),
      el('div', { class: 'stat-main' },
        el('div', { class: 'stat-value' }, value),
        el('div', { class: 'stat-label' }, label)
      )
    );
  }

  function formatDateShort(key) {
    return fromKey(key).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function sinceSuffix(param) {
    const from = (data.settings.trackFrom || {})[param];
    return from ? ` · zählt ab ${formatDateShort(from)}` : '';
  }

  function renderHistory() {
    renderReport();

    // Erfolge
    const sc = $('#statsContainer');
    sc.innerHTML = '';

    const tr = trainingStats();
    const done = tr.trained + tr.activeRests + tr.rests;
    sc.append(statRow('🏋️',
      tr.calDays ? `${fmt((done / tr.calDays) * 100)} %` : '–',
      `${tr.trained} Trainings · ${tr.activeRests} aktive Ruhetage · ${tr.rests} Ruhetage · ${tr.calDays} Tage seit ${formatDateShort(tr.start)}`));

    const kc = ratioStats('kcal');
    sc.append(statRow('🍽️',
      kc.total ? `${fmt((kc.achieved / kc.total) * 100)} %` : '–',
      kc.total
        ? `Kalorienziel an ${kc.achieved} von ${kc.total} erfassten Tagen${sinceSuffix('kcal')}`
        : 'Kalorienziel: noch keine Tage erfasst'));

    const fa = ratioStats('fasting');
    sc.append(statRow('⏱️',
      fa.total ? `${fmt((fa.achieved / fa.total) * 100)} %` : '–',
      fa.total
        ? `Fasten-Ziel an ${fa.achieved} von ${fa.total} ausgewerteten Tagen${sinceSuffix('fasting')}`
        : 'Fasten-Ziel: noch keine Tage mit Uhrzeiten'));

    const wa = ratioStats('water');
    sc.append(statRow('💧',
      wa.total ? `${fmt((wa.achieved / wa.total) * 100)} %` : '–',
      wa.total
        ? `Wasserziel an ${wa.achieved} von ${wa.total} erfassten Tagen${sinceSuffix('water')}`
        : 'Wasserziel: noch keine Tage erfasst'));

    const sleep = sleepStats();
    const goalTxt = data.settings.sleepGoal.toLocaleString('de-DE');
    sc.append(statRow('😴',
      sleep.total ? `${fmt((sleep.achieved / sleep.total) * 100)} %` : '–',
      sleep.total
        ? `Schlaf ≥ ${goalTxt} h an ${sleep.achieved} von ${sleep.total} erfassten Tagen${sinceSuffix('sleep')}`
        : `Schlaf ≥ ${goalTxt} h: noch keine Tage erfasst`));

    const sweets = sweetsStreak();
    sc.append(statRow('🍬',
      `${sweets.streak} ${sweets.streak === 1 ? 'Tag' : 'Tage'}`,
      'am Stück ohne Süßigkeiten' +
      (sweets.best > sweets.streak ? ` · Rekord: ${sweets.best}` : '') +
      sinceSuffix('sweets')));

    renderWeightChart();
    renderTrainingChart();
    renderExerciseTotals();

    const list = $('#historyList');
    list.innerHTML = '';
    const keys = Object.keys(data.days).sort().reverse();
    if (!keys.length) {
      list.append(el('p', { class: 'empty-note' }, 'Noch keine Einträge vorhanden.'));
      return;
    }
    for (const key of keys) {
      const day = data.days[key];
      const kcal = dayKcal(day);
      const facts = [];
      if (kcal) {
        facts.push(`🍽️ ${fmt(kcal)} kcal ${kcal <= data.settings.kcalGoal ? '✓' : '✗'}`);
        const fi = fastingInfo(day);
        if (fi.known) facts.push(`⏱️ ${fmt(fi.spanH, 1)} h ${fi.ok ? '✓' : '✗'}`);
      }
      if (day.water) facts.push(`💧 ${fmt(day.water / 1000, 1)} L`);
      if (day.weight != null) facts.push(`⚖️ ${fmt(day.weight, 1)} kg`);
      if (day.sleepOk) facts.push('😴 ✓');
      if (day.noSweets) facts.push('🍬-frei');
      if (day.training) {
        const w = day.training.restDay ? null : workoutById(day.training.workoutId);
        facts.push(day.training.restDay ? restLabel(day.training) : `🏋️ ${w ? w.name : 'Training'}`);
      }
      const cd = challengeDay(key);
      const row = el('button', {
        class: 'history-row',
        onclick: () => { currentKey = key; switchView('today'); }
      },
        el('div', null,
          el('span', { class: 'history-date' }, formatDateLong(key)),
          (cd >= 1 && cd <= data.settings.challengeDays)
            ? el('span', { class: 'history-tag' }, `Tag ${cd}`) : null
        ),
        el('div', { class: 'history-facts' }, facts.join('   ·   ') || '– leer –')
      );
      list.append(row);
    }
  }

  /* Abschlussbericht nach Ende der Challenge */
  function renderReport() {
    const card = $('#reportCard');
    const S = data.settings;
    if (challengeDay(todayKey()) <= S.challengeDays) { card.hidden = true; return; }
    card.hidden = false;
    const box = $('#reportContent');
    box.innerHTML = '';
    const startKey = S.challengeStart;
    const endKey = addDays(startKey, S.challengeDays - 1);
    const keys = Object.keys(data.days).filter((k) => k >= startKey && k <= endKey).sort();

    box.append(el('p', { class: 'hint' },
      `${S.challengeDays} Tage vom ${formatDateShort(startKey)} bis ${formatDateShort(endKey)} – stark durchgezogen! 💪`));

    const weights = keys.filter((k) => data.days[k].weight != null);
    if (weights.length >= 2) {
      const a = data.days[weights[0]].weight;
      const b = data.days[weights[weights.length - 1]].weight;
      const diff = b - a;
      box.append(statRow('⚖️', `${diff > 0 ? '+' : ''}${fmt(diff, 1)} kg`,
        `von ${fmt(a, 1)} kg auf ${fmt(b, 1)} kg`));
    }

    let tr = 0, ar = 0, ru = 0;
    for (const k of keys) {
      const t = data.days[k].training;
      if (!t) continue;
      if (!t.restDay) tr++;
      else if (isActiveRest(t)) ar++;
      else ru++;
    }
    box.append(statRow('🏋️', `${tr} Trainings`,
      `dazu ${ar} aktive Ruhetage und ${ru} Ruhetage in ${S.challengeDays} Tagen`));

    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      if (!data.days[k].noSweets) continue;
      run = (prev && addDays(prev, 1) === k) ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    if (best) box.append(statRow('🍬', `${best} ${best === 1 ? 'Tag' : 'Tage'}`, 'längste Serie ohne Süßigkeiten'));
  }

  /* Generischer Linien-Chart: mehrere Serien, Hover-Tooltip, optionale Legende */
  function drawLineChart(wrap, cfg) {
    const allKeys = [...new Set(cfg.series.flatMap((s) => s.entries.map((e) => e.key)))].sort();
    if (allKeys.length < 2) return;

    const W = 640, H = 260;
    const PAD = { l: 44, r: 16, t: 16, b: 30 };
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;

    const t0 = fromKey(allKeys[0]).getTime();
    const t1 = fromKey(allKeys[allKeys.length - 1]).getTime();
    const span = Math.max(t1 - t0, 1);
    const values = cfg.series.flatMap((s) => s.entries.map((e) => e.value));
    let yMin = Math.min(...values), yMax = Math.max(...values);
    const padY = Math.max((yMax - yMin) * 0.15, cfg.minPad != null ? cfg.minPad : 0.5);
    yMin -= padY; yMax += padY;

    const xOf = (key) => PAD.l + ((fromKey(key).getTime() - t0) / span) * iw;
    const yOf = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    if (cfg.ariaLabel) svg.setAttribute('aria-label', cfg.ariaLabel);

    const S = (tag, attrs) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };

    // Gitterlinien + Y-Beschriftung
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = yMin + ((yMax - yMin) * i) / steps;
      const gy = yOf(v);
      svg.append(S('line', {
        x1: PAD.l, x2: W - PAD.r, y1: gy, y2: gy,
        stroke: 'var(--grid)', 'stroke-width': 1
      }));
      const label = S('text', {
        x: PAD.l - 8, y: gy + 3.5, 'text-anchor': 'end',
        fill: 'var(--ink-muted)', 'font-size': 11,
        style: 'font-variant-numeric: tabular-nums'
      });
      label.textContent = fmt(v, cfg.digits);
      svg.append(label);
    }

    // X-Beschriftung: erster & letzter Tag
    for (const k of [allKeys[0], allKeys[allKeys.length - 1]]) {
      const label = S('text', {
        x: xOf(k), y: H - 8,
        'text-anchor': k === allKeys[0] ? 'start' : 'end',
        fill: 'var(--ink-muted)', 'font-size': 11
      });
      label.textContent = fromKey(k).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      svg.append(label);
    }

    // Linien
    for (const s of cfg.series) {
      if (s.entries.length < 2) continue;
      const dPath = s.entries.map((e, i) => `${i ? 'L' : 'M'}${xOf(e.key).toFixed(1)},${yOf(e.value).toFixed(1)}`).join('');
      svg.append(S('path', {
        d: dPath, fill: 'none', stroke: s.color,
        'stroke-width': s.width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }

    // Punkte (mit Surface-Ring)
    for (const s of cfg.series) {
      if (!s.r) continue;
      for (const e of s.entries) {
        svg.append(S('circle', {
          cx: xOf(e.key), cy: yOf(e.value), r: s.r,
          fill: s.color, stroke: 'var(--surface-1)', 'stroke-width': 2
        }));
      }
    }

    // Letzten Wert der markierten Serie direkt beschriften
    const lblSeries = cfg.series.find((s) => s.labelLast);
    if (lblSeries && lblSeries.entries.length) {
      const last = lblSeries.entries[lblSeries.entries.length - 1];
      const t = S('text', {
        x: Math.min(xOf(last.key), W - PAD.r) - 2, y: yOf(last.value) - 10,
        'text-anchor': 'end', fill: 'var(--ink-2)',
        'font-size': 12, 'font-weight': 700,
        style: 'font-variant-numeric: tabular-nums'
      });
      t.textContent = `${fmt(last.value, cfg.digits)}${cfg.unit ? ' ' + cfg.unit : ''}`;
      svg.append(t);
    }

    // Hover/Touch: Fadenkreuz + Tooltip am nächsten Datum
    const crosshair = S('line', {
      x1: 0, x2: 0, y1: PAD.t, y2: H - PAD.b,
      stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden'
    });
    svg.append(crosshair);

    const tooltip = el('div', { class: 'chart-tooltip' });
    tooltip.style.display = 'none';

    // Legende nur bei mehreren Serien
    if (cfg.series.length > 1) {
      wrap.append(el('div', { class: 'chart-legend' },
        ...cfg.series.map((s) => el('span', { class: 'legend-item' },
          el('span', { class: 'chip', style: `background:${s.color}` }), s.name))));
    }
    wrap.append(svg, tooltip);

    function onMove(clientX) {
      const rect = svg.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      let best = allKeys[0], bd = Infinity;
      for (const k of allKeys) {
        const d = Math.abs(xOf(k) - px);
        if (d < bd) { bd = d; best = k; }
      }
      const parts = [];
      let anchorY = PAD.t;
      for (const s of cfg.series) {
        const e = s.entries.find((x) => x.key === best);
        if (e) {
          parts.push(`${s.tipLabel || ''}${fmt(e.value, cfg.digits)}${cfg.unit ? ' ' + cfg.unit : ''}`);
          anchorY = yOf(e.value);
        }
      }
      const bx = xOf(best);
      crosshair.setAttribute('x1', bx);
      crosshair.setAttribute('x2', bx);
      crosshair.setAttribute('visibility', 'visible');
      tooltip.style.display = 'block';
      tooltip.style.left = `${(rect.left - wrapRect.left) + (bx / W) * rect.width}px`;
      tooltip.style.top = `${(rect.top - wrapRect.top) + (anchorY / H) * rect.height}px`;
      tooltip.textContent = `${formatDateLong(best)} · ${parts.join(' · ')}`;
    }
    function onLeave() {
      crosshair.setAttribute('visibility', 'hidden');
      tooltip.style.display = 'none';
    }
    svg.addEventListener('mousemove', (ev) => onMove(ev.clientX));
    svg.addEventListener('mouseleave', onLeave);
    svg.addEventListener('touchstart', (ev) => onMove(ev.touches[0].clientX), { passive: true });
    svg.addEventListener('touchmove', (ev) => onMove(ev.touches[0].clientX), { passive: true });
    svg.addEventListener('touchend', onLeave);
  }

  /* Gewichtsdiagramm: Tageswerte + rollierender 7-Tage-Durchschnitt */
  function renderWeightChart() {
    const wrap = $('#weightChart');
    wrap.innerHTML = '';

    const entries = Object.keys(data.days)
      .filter((k) => data.days[k].weight != null)
      .sort()
      .map((k) => ({ key: k, value: data.days[k].weight }))
      .slice(-60);

    if (entries.length < 2) {
      wrap.append(el('p', { class: 'empty-note' },
        entries.length === 1
          ? `Bisher ein Messwert: ${fmt(entries[0].value, 1)} kg. Ab zwei Werten gibt es hier eine Kurve.`
          : 'Trage dein Gewicht ein, um hier den Verlauf zu sehen.'));
      return;
    }

    const trend = entries.map((e) => {
      const end = fromKey(e.key).getTime();
      const startT = end - 6 * 86400000;
      const win = entries.filter((x) => {
        const t = fromKey(x.key).getTime();
        return t >= startT && t <= end;
      });
      return { key: e.key, value: win.reduce((s, x) => s + x.value, 0) / win.length };
    });

    drawLineChart(wrap, {
      unit: 'kg', digits: 1, ariaLabel: 'Gewichtsverlauf in Kilogramm',
      series: [
        { name: 'Tageswert', color: 'var(--series-1-soft)', width: 1.5, r: 3.5, entries, labelLast: true },
        { name: '7-Tage-Schnitt', color: 'var(--series-1)', width: 2.5, r: 0, entries: trend, tipLabel: 'Ø ' }
      ]
    });
  }

  /* Übungen gesamt: Lebenszeit-Zähler, absteigend sortiert */
  function renderExerciseTotals() {
    const box = $('#exerciseTotals');
    box.innerHTML = '';
    const totals = exerciseTotals();
    const rows = Object.entries(totals)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      box.append(el('p', { class: 'empty-note' },
        'Trage beim Erfassen eines Trainings die Anzahl pro Übung ein – hier wächst dann dein Gesamtkonto.'));
      return;
    }
    for (const [name, n] of rows) {
      box.append(el('div', { class: 'ex-row' },
        el('span', { class: 'ex-name' }, name),
        el('span', { class: 'ex-count' }, fmt(n))
      ));
    }
  }

  /* Trainingsfortschritt: Ergebnis-Verlauf pro Workout */
  let trainChartWorkoutId = null;

  function trainingChartEntries(w) {
    const entries = [];
    for (const k of Object.keys(data.days).sort()) {
      const t = data.days[k].training;
      if (!t || t.restDay || t.workoutId !== w.id) continue;
      let v = null;
      if (w.scheme === 'amrap') v = t.rounds != null ? Number(t.rounds) : null;
      else if (w.scheme === 'fixedRounds') v = (t.repsPerRound || []).reduce((s, r) => s + (Number(r) || 0), 0);
      else if (w.scheme === 'time') v = (Number(t.timeMin) || 0) + (Number(t.timeSec) || 0) / 60;
      if (v != null && !isNaN(v)) entries.push({ key: k, value: v });
    }
    return entries;
  }

  function renderTrainingChart() {
    const sel = $('#trainChartSelect');
    const wrap = $('#trainChart');
    wrap.innerHTML = '';
    const chartable = data.workouts.filter((w) => w.scheme !== 'free' && trainingChartEntries(w).length >= 1);
    sel.innerHTML = '';
    sel.hidden = !chartable.length;
    if (!chartable.length) {
      wrap.append(el('p', { class: 'empty-note' },
        'Sobald du Trainings erfasst hast, siehst du hier deinen Fortschritt pro Workout.'));
      return;
    }
    for (const w of chartable) sel.append(el('option', { value: w.id }, w.name));
    if (!chartable.some((w) => w.id === trainChartWorkoutId)) trainChartWorkoutId = chartable[0].id;
    sel.value = trainChartWorkoutId;

    const w = workoutById(trainChartWorkoutId);
    const entries = trainingChartEntries(w);
    if (entries.length < 2) {
      wrap.append(el('p', { class: 'empty-note' },
        `Bisher ein Ergebnis für „${w.name}" – ab zwei Einträgen gibt es hier eine Kurve.`));
      return;
    }
    const unit = w.scheme === 'amrap' ? 'Runden' : w.scheme === 'fixedRounds' ? 'Wdh.' : 'min';
    drawLineChart(wrap, {
      unit, digits: w.scheme === 'time' ? 1 : 0, minPad: 1,
      ariaLabel: `Trainingsfortschritt ${w.name}`,
      series: [{ name: w.name, color: 'var(--series-1)', width: 2, r: 4, entries, labelLast: true }]
    });
    if (w.scheme === 'time') {
      wrap.append(el('p', { class: 'hint' }, 'Bei Trainings auf Zeit ist ein niedrigerer Wert besser.'));
    }
  }

  /* ---------- Verwalten ---------- */

  function workoutSubtitle(w) {
    let s = SCHEME_LABELS[w.scheme] || '';
    if (w.scheme === 'amrap' && w.minutes) s += ` · ${w.minutes} min`;
    if (w.scheme === 'fixedRounds' && w.rounds) s += ` · ${w.rounds} Runden`;
    if (w.exercises && w.exercises.length) s += ` · ${w.exercises.length} Übungen`;
    return s;
  }

  function renderManage() {
    const wl = $('#workoutList');
    wl.innerHTML = '';
    if (!data.workouts.length) {
      wl.append(el('p', { class: 'empty-note' }, 'Noch keine Trainings angelegt.'));
    }
    for (const w of data.workouts) {
      const recTxt = recordSummaryText(w);
      const main = el('div', { class: 'manage-main' },
        el('div', { class: 'manage-title' }, w.name),
        el('div', { class: 'manage-sub' }, workoutSubtitle(w) + (w.note ? ` · ${w.note}` : ''))
      );
      if (recTxt) {
        main.append(el('div', { class: 'manage-record' }, `🏆 Rekord: ${recTxt}`));
      }
      wl.append(el('div', { class: 'manage-row' },
        main,
        el('button', { class: 'link-btn', onclick: () => openWorkoutDialog(w) }, 'Bearbeiten'),
        el('button', {
          class: 'link-btn danger-btn', onclick: () => {
            if (confirm(`Training „${w.name}" löschen? Bereits erfasste Einheiten bleiben erhalten.`)) {
              data.workouts = data.workouts.filter((x) => x.id !== w.id);
              save(); renderManage();
            }
          }
        }, 'Löschen')
      ));
    }

    const fl = $('#foodList');
    fl.innerHTML = '';
    if (!data.foods.length) {
      fl.append(el('p', { class: 'empty-note' }, 'Noch keine Lebensmittel gespeichert. Beim Erfassen einer Mahlzeit kannst du Einträge direkt hier speichern.'));
    }
    for (const f of [...data.foods].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      fl.append(el('div', { class: 'manage-row' },
        el('div', { class: 'manage-main' },
          el('div', { class: 'manage-title' }, f.name),
          el('div', { class: 'manage-sub' }, `${fmt(f.kcal)} kcal / Portion`)
        ),
        el('button', { class: 'link-btn', onclick: () => openFoodDialog(f) }, 'Bearbeiten'),
        el('button', {
          class: 'link-btn danger-btn', onclick: () => {
            if (confirm(`„${f.name}" aus der Datenbank löschen?`)) {
              data.foods = data.foods.filter((x) => x.id !== f.id);
              save(); renderManage();
            }
          }
        }, 'Löschen')
      ));
    }
  }

  /* ---------- Mehr / Einstellungen ---------- */

  function renderMore() {
    $('#setStart').value = data.settings.challengeStart;
    $('#setDays').value = data.settings.challengeDays;
    $('#setKcal').value = data.settings.kcalGoal;
    $('#setWater').value = data.settings.waterGoal / 1000;
    $('#setFasting').value = data.settings.fastingWindow;
    $('#setSleep').value = data.settings.sleepGoal;
    const tf = data.settings.trackFrom || {};
    $('#tfTraining').value = tf.training || '';
    $('#tfKcal').value = tf.kcal || '';
    $('#tfWater').value = tf.water || '';
    $('#tfFasting').value = tf.fasting || '';
    $('#tfSleep').value = tf.sleep || '';
    $('#tfSweets').value = tf.sweets || '';
    $('#versionInfo').textContent = `App-Version ${APP_VERSION}`;
    const day = challengeDay(todayKey());
    $('#settingsHint').textContent =
      (day >= 1 && day <= data.settings.challengeDays)
        ? `Heute ist damit Tag ${day} von ${data.settings.challengeDays}.`
        : '';
  }

  /* ============================================================
     Dialoge
     ============================================================ */

  function wireCloseButtons(dialog) {
    dialog.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => dialog.close()));
  }

  /* ---------- Mahlzeit ---------- */

  let mealTargetId = null;

  function openMealDialog(mealId) {
    mealTargetId = mealId;
    const day = getDay(currentKey);
    const idx = (day.meals || []).findIndex((m) => m.id === mealId);
    $('#mealDialogTitle').textContent = idx >= 0 ? `${idx + 1}. Mahlzeit ergänzen` : 'Eintrag hinzufügen';
    $('#mealSearch').value = '';
    $('#mealName').value = '';
    $('#mealKcal').value = '';
    $('#mealQty').value = 1;
    $('#mealSaveFood').checked = false;
    $('#mealSuggestions').innerHTML = '';
    $('#mealTotalHint').textContent = '';
    renderMealSuggestions('');
    $('#mealDialog').showModal();
  }

  function renderMealSuggestions(query) {
    const box = $('#mealSuggestions');
    box.innerHTML = '';
    const q = query.trim().toLowerCase();
    const matches = data.foods
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .slice(0, 6);
    for (const f of matches) {
      box.append(el('button', {
        type: 'button', class: 'suggestion',
        onclick: () => {
          $('#mealName').value = f.name;
          $('#mealKcal').value = f.kcal;
          $('#mealSaveFood').checked = false;
          updateMealTotal();
        }
      },
        el('span', null, f.name),
        el('span', { class: 's-kcal' }, `${fmt(f.kcal)} kcal`)
      ));
    }
  }

  function updateMealTotal() {
    const kcal = Number($('#mealKcal').value) || 0;
    const qty = Number($('#mealQty').value) || 1;
    $('#mealTotalHint').textContent =
      qty !== 1 && kcal ? `= ${fmt(Math.round(kcal * qty))} kcal gesamt` : '';
  }

  function submitMeal(ev) {
    ev.preventDefault();
    const name = $('#mealName').value.trim();
    const kcalPer = Number($('#mealKcal').value);
    const qty = Number($('#mealQty').value) || 1;
    if (!name || isNaN(kcalPer)) return;

    const day = getDay(currentKey, true);
    const meal = (day.meals || []).find((m) => m.id === mealTargetId);
    if (!meal) return;
    meal.items.push({
      id: uid(), name, qty, kcal: Math.round(kcalPer * qty)
    });

    if ($('#mealSaveFood').checked &&
        !data.foods.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      data.foods.push({ id: uid(), name, kcal: Math.round(kcalPer) });
    }

    save();
    $('#mealDialog').close();
    renderAll();
  }

  /* ---------- Training definieren ---------- */

  let editWorkoutId = null;

  function openWorkoutDialog(workout) {
    editWorkoutId = workout ? workout.id : null;
    $('#workoutDialogTitle').textContent = workout ? 'Training bearbeiten' : 'Training definieren';
    $('#woName').value = workout ? workout.name : '';
    $('#woScheme').value = workout ? workout.scheme : 'amrap';
    $('#woMinutes').value = workout && workout.minutes ? workout.minutes : 20;
    $('#woRounds').value = workout && workout.rounds ? workout.rounds : 6;
    $('#woNote').value = workout ? (workout.note || '') : '';
    const box = $('#woExercises');
    box.innerHTML = '';
    const selected = new Set((workout && workout.exercises) || []);
    for (const name of EXERCISES) {
      const cb = el('input', { type: 'checkbox', value: name });
      if (selected.has(name)) cb.checked = true;
      box.append(el('label', { class: 'checkbox-label' }, cb, name));
    }
    updateWorkoutFields();
    $('#workoutDialog').showModal();
  }

  function updateWorkoutFields() {
    const scheme = $('#woScheme').value;
    $('#woMinutesWrap').hidden = scheme !== 'amrap';
    $('#woRoundsWrap').hidden = scheme !== 'fixedRounds';
  }

  function submitWorkout(ev) {
    ev.preventDefault();
    const w = {
      id: editWorkoutId || uid(),
      name: $('#woName').value.trim(),
      scheme: $('#woScheme').value,
      minutes: Number($('#woMinutes').value) || null,
      rounds: Number($('#woRounds').value) || null,
      note: $('#woNote').value.trim(),
      exercises: [...document.querySelectorAll('#woExercises input:checked')].map((c) => c.value)
    };
    if (!w.name) return;
    if (editWorkoutId) {
      const i = data.workouts.findIndex((x) => x.id === editWorkoutId);
      if (i >= 0) data.workouts[i] = w;
    } else {
      data.workouts.push(w);
    }
    save();
    $('#workoutDialog').close();
    renderManage();
  }

  /* ---------- Training erfassen ---------- */

  function openLogDialog(edit) {
    editLogMode = !!edit;
    const day = getDay(currentKey);
    const existing = edit ? day.training : null;

    $('#logDialogTitle').textContent = edit ? 'Training bearbeiten' : 'Training erfassen';

    const sel = $('#logWorkout');
    sel.innerHTML = '';
    for (const w of data.workouts) {
      sel.append(el('option', { value: w.id }, w.name));
    }
    if (existing && existing.workoutId && workoutById(existing.workoutId)) {
      sel.value = existing.workoutId;
    }
    $('#logNote').value = existing ? (existing.note || '') : '';
    renderLogFields(existing);
    $('#logDialog').showModal();
  }

  function renderLogFields(existing) {
    const w = workoutById($('#logWorkout').value);
    const box = $('#logFields');
    box.innerHTML = '';
    $('#logLastResult').textContent = '';
    if (!w) return;

    $('#logWorkoutInfo').textContent =
      workoutSubtitle(w) + (w.note ? ` – ${w.note}` : '');

    // Letztes Ergebnis desselben Workouts als Vergleich anzeigen
    const last = lastTrainingResult(w.id, currentKey);
    if (last) {
      const cd = challengeDay(last.key);
      const tag = cd >= 1 && cd <= data.settings.challengeDays ? `Tag ${cd}, ` : '';
      $('#logLastResult').textContent =
        `💪 Letztes Mal (${tag}${formatDateLong(last.key)}): ${trainingResultText(last.t)}`;
    }

    // Persönlicher Rekord (ohne den gerade bearbeiteten Tag)
    const recTxt = recordSummaryText(w, currentKey);
    $('#logRecord').textContent = recTxt ? `🏆 Rekord: ${recTxt}` : '';

    const use = existing && existing.workoutId === w.id ? existing : null;

    if (w.scheme === 'amrap') {
      box.append(
        el('label', null, `Geschaffte Runden (in ${w.minutes || '?'} min)`,
          el('input', { type: 'number', id: 'lfRounds', min: 0, max: 200, required: '', inputmode: 'numeric', value: use && use.rounds != null ? use.rounds : '' })),
        el('label', null, 'Zusätzliche Wiederholungen (optional)',
          el('input', { type: 'number', id: 'lfExtra', min: 0, max: 500, inputmode: 'numeric', value: use && use.extraReps ? use.extraReps : '' }))
      );
    } else if (w.scheme === 'fixedRounds') {
      const n = w.rounds || 6;
      const grid = el('div', { class: 'round-grid' });
      for (let i = 0; i < n; i++) {
        grid.append(el('label', null, `Runde ${i + 1}`,
          el('input', {
            type: 'number', class: 'lf-round', min: 0, max: 999, inputmode: 'numeric',
            value: use && use.repsPerRound && use.repsPerRound[i] != null ? use.repsPerRound[i] : ''
          })));
      }
      box.append(el('label', null, 'Wiederholungen pro Runde'), grid);

      // Rekord-relevant: Wdh. der letzten Runde je Übung
      if (w.exercises && w.exercises.length) {
        const lrGrid = el('div', { class: 'exercise-grid' });
        for (const name of w.exercises) {
          lrGrid.append(el('label', null, name,
            el('input', {
              type: 'number', class: 'lf-lastround', 'data-exercise': name,
              min: 0, max: 999, inputmode: 'numeric',
              value: use && use.lastRound && use.lastRound[name] != null ? use.lastRound[name] : ''
            })));
        }
        box.append(el('label', null, '🏆 Letzte Runde – Wdh. je Übung (für den Rekord)'), lrGrid);
      }
    } else if (w.scheme === 'time') {
      box.append(el('div', { class: 'form-row' },
        el('label', null, 'Minuten',
          el('input', { type: 'number', id: 'lfMin', min: 0, max: 300, required: '', inputmode: 'numeric', value: use && use.timeMin != null ? use.timeMin : '' })),
        el('label', null, 'Sekunden',
          el('input', { type: 'number', id: 'lfSec', min: 0, max: 59, inputmode: 'numeric', value: use && use.timeSec != null ? use.timeSec : '' }))
      ));
    } else {
      box.append(el('label', null, 'Ergebnis',
        el('textarea', { id: 'lfText', rows: 3, maxlength: 300 }, use ? (use.resultText || '') : '')));
    }

    // Übungs-Zähler (Gesamtzahl je Übung, optional)
    if (w.exercises && w.exercises.length) {
      box.append(el('label', null, 'Übungen – wie viele insgesamt? (optional)'));
      const grid = el('div', { class: 'exercise-grid' });
      for (const name of w.exercises) {
        grid.append(el('label', null, name,
          el('input', {
            type: 'number', class: 'lf-exercise', 'data-exercise': name,
            min: 0, max: 9999, inputmode: 'numeric',
            value: use && use.exerciseCounts && use.exerciseCounts[name] != null ? use.exerciseCounts[name] : ''
          })));
      }
      box.append(grid);
    }
  }

  function submitLog(ev) {
    ev.preventDefault();
    const w = workoutById($('#logWorkout').value);
    if (!w) return;

    const t = {
      workoutId: w.id,
      workoutName: w.name,
      scheme: w.scheme,
      note: $('#logNote').value.trim()
    };

    if (w.scheme === 'amrap') {
      t.minutes = w.minutes;
      t.rounds = Number($('#lfRounds').value);
      t.extraReps = Number($('#lfExtra').value) || 0;
      if (isNaN(t.rounds)) return;
    } else if (w.scheme === 'fixedRounds') {
      t.repsPerRound = [...document.querySelectorAll('.lf-round')]
        .map((i) => (i.value === '' ? null : Number(i.value)));
    } else if (w.scheme === 'time') {
      t.timeMin = Number($('#lfMin').value) || 0;
      t.timeSec = Number($('#lfSec').value) || 0;
    } else {
      t.resultText = ($('#lfText') ? $('#lfText').value : '').trim();
    }

    const counts = {};
    document.querySelectorAll('.lf-exercise').forEach((i) => {
      if (i.value !== '') counts[i.dataset.exercise] = Number(i.value) || 0;
    });
    if (Object.keys(counts).length) t.exerciseCounts = counts;

    const lr = {};
    document.querySelectorAll('.lf-lastround').forEach((i) => {
      if (i.value !== '') lr[i.dataset.exercise] = Number(i.value) || 0;
    });
    if (Object.keys(lr).length) t.lastRound = lr;

    // Neuer Rekord? (Vergleich ohne den aktuellen Tag)
    let recordMsg = null;
    if (w.scheme === 'fixedRounds' && w.exercises && w.exercises.length) {
      // Je Übung: letzte Runde gegen bisherigen Bestwert
      if (t.lastRound) {
        const prev = exerciseLastRoundRecords(w, currentKey);
        const beaten = Object.entries(t.lastRound)
          .filter(([name, v]) => !prev[name] || v > prev[name].value)
          .map(([name, v]) => `${name} ${fmt(v)}`);
        if (beaten.length) recordMsg = `🏆 Neuer Rekord: ${beaten.join(', ')}!`;
      }
    } else {
      const prevRecord = workoutRecord(w, currentKey);
      const newScore = recordScore(t, w.scheme);
      if (newScore != null && (!prevRecord || newScore > prevRecord.score)) {
        recordMsg = `🏆 Neuer Rekord bei ${w.name}!`;
      }
    }

    getDay(currentKey, true).training = t;
    save();
    $('#logDialog').close();
    renderAll();
    toast(recordMsg || (editLogMode ? 'Training aktualisiert' : 'Training gespeichert 💪'));
  }

  /* ---------- Lebensmittel ---------- */

  let editFoodId = null;

  function openFoodDialog(food) {
    editFoodId = food ? food.id : null;
    $('#foodDialogTitle').textContent = food ? 'Lebensmittel bearbeiten' : 'Neues Lebensmittel';
    $('#foodName').value = food ? food.name : '';
    $('#foodKcal').value = food ? food.kcal : '';
    $('#foodDialog').showModal();
  }

  function submitFood(ev) {
    ev.preventDefault();
    const name = $('#foodName').value.trim();
    const kcal = Number($('#foodKcal').value);
    if (!name || isNaN(kcal)) return;
    if (editFoodId) {
      const f = data.foods.find((x) => x.id === editFoodId);
      if (f) { f.name = name; f.kcal = kcal; }
    } else {
      data.foods.push({ id: uid(), name, kcal });
    }
    save();
    $('#foodDialog').close();
    renderManage();
  }

  /* ============================================================
     Excel-Export & Backup
     ============================================================ */

  function buildWorkbook() {
    const wb = XLSX.utils.book_new();
    const keys = Object.keys(data.days).sort();
    const S = data.settings;

    // Blatt 1: Tagesübersicht
    const overview = [[
      'Datum', 'Challenge-Tag', 'Gewicht (kg)', 'Wasser (ml)', 'Wasser-Ziel (ml)',
      'Kalorien (kcal)', 'Kalorien-Ziel (kcal)', 'Kalorienziel eingehalten',
      'Essensfenster (h)', `Fasten-Ziel eingehalten (≤ ${S.fastingWindow} h)`,
      `Schlaf ≥ ${S.sleepGoal} h`, 'Keine Süßigkeiten',
      'Training', 'Ergebnis', 'Notiz'
    ]];
    for (const key of keys) {
      const day = data.days[key];
      const cd = challengeDay(key);
      const t = day.training;
      const w = t && !t.restDay ? workoutById(t.workoutId) : null;
      const kcal = dayKcal(day);
      const fi = fastingInfo(day);
      overview.push([
        key,
        cd >= 1 && cd <= S.challengeDays ? cd : '',
        day.weight != null ? day.weight : '',
        day.water || 0,
        S.waterGoal,
        kcal,
        S.kcalGoal,
        kcal > 0 ? (kcal <= S.kcalGoal ? 'Ja' : 'Nein') : '',
        fi.known ? Math.round(fi.spanH * 100) / 100 : '',
        fi.known ? (fi.ok ? 'Ja' : 'Nein') : '',
        day.sleepOk ? 'Ja' : '',
        day.noSweets ? 'Ja' : '',
        t ? (t.restDay ? (isActiveRest(t) ? 'Aktiver Ruhetag' : 'Ruhetag') : (w ? w.name : t.workoutName || 'Training')) : '',
        t ? trainingResultText(t) : '',
        t && t.note ? t.note : ''
      ]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(overview);
    ws1['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 14 },
                    { wch: 14 }, { wch: 17 }, { wch: 20 }, { wch: 15 }, { wch: 24 },
                    { wch: 13 }, { wch: 15 },
                    { wch: 20 }, { wch: 36 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Tagesübersicht');

    // Blatt 2: Mahlzeiten
    const meals = [['Datum', 'Challenge-Tag', 'Mahlzeit', 'Uhrzeit', 'Eintrag', 'Portionen', 'kcal']];
    for (const key of keys) {
      const day = data.days[key];
      const cd = challengeDay(key);
      (day.meals || []).forEach((meal, idx) => {
        for (const item of meal.items || []) {
          meals.push([
            key,
            cd >= 1 && cd <= S.challengeDays ? cd : '',
            `${idx + 1}. Mahlzeit`,
            meal.time || '',
            item.name, item.qty || 1, item.kcal
          ]);
        }
      });
    }
    const ws2 = XLSX.utils.aoa_to_sheet(meals);
    ws2['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 34 }, { wch: 9 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Mahlzeiten');

    // Blatt 3: Trainings (mit Runden-Details)
    let maxRounds = 0;
    for (const key of keys) {
      const t = data.days[key].training;
      if (t && t.repsPerRound) maxRounds = Math.max(maxRounds, t.repsPerRound.length);
    }
    const headTr = ['Datum', 'Challenge-Tag', 'Training', 'Auswertung', 'Ergebnis'];
    for (let i = 1; i <= maxRounds; i++) headTr.push(`Runde ${i}`);
    headTr.push('Notiz');
    const trainings = [headTr];
    for (const key of keys) {
      const day = data.days[key];
      const t = day.training;
      if (!t) continue;
      const cd = challengeDay(key);
      const w = t.restDay ? null : workoutById(t.workoutId);
      const row = [
        key,
        cd >= 1 && cd <= S.challengeDays ? cd : '',
        t.restDay ? (isActiveRest(t) ? 'Aktiver Ruhetag' : 'Ruhetag') : (w ? w.name : t.workoutName || 'Training'),
        t.restDay ? '' : (SCHEME_LABELS[t.scheme || (w && w.scheme)] || ''),
        trainingResultText(t)
      ];
      for (let i = 0; i < maxRounds; i++) {
        row.push(t.repsPerRound && t.repsPerRound[i] != null ? t.repsPerRound[i] : '');
      }
      row.push(t.note || '');
      trainings.push(row);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(trainings);
    ws3['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 36 }]
      .concat(Array.from({ length: maxRounds }, () => ({ wch: 9 })), [{ wch: 28 }]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Trainings');

    // Blatt 4: Übungen (Detail + Gesamtsummen)
    const exRows = [['Datum', 'Challenge-Tag', 'Training', 'Übung', 'Anzahl gesamt', 'Letzte Runde']];
    for (const key of keys) {
      const t = data.days[key].training;
      if (!t || (!t.exerciseCounts && !t.lastRound)) continue;
      const cd = challengeDay(key);
      const w = workoutById(t.workoutId);
      const names = [...new Set([
        ...Object.keys(t.exerciseCounts || {}),
        ...Object.keys(t.lastRound || {})
      ])];
      for (const name of names) {
        exRows.push([
          key,
          cd >= 1 && cd <= S.challengeDays ? cd : '',
          w ? w.name : t.workoutName || 'Training',
          name,
          t.exerciseCounts && t.exerciseCounts[name] != null ? t.exerciseCounts[name] : '',
          t.lastRound && t.lastRound[name] != null ? t.lastRound[name] : ''
        ]);
      }
    }
    exRows.push([]);
    exRows.push(['', '', '', 'GESAMT', '', '']);
    for (const [name, n] of Object.entries(exerciseTotals()).sort((a, b) => b[1] - a[1])) {
      exRows.push(['', '', '', name, n, '']);
    }
    const ws4 = XLSX.utils.aoa_to_sheet(exRows);
    ws4['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 13 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Übungen');

    return wb;
  }

  async function exportExcel() {
    if (!Object.keys(data.days).length) {
      toast('Noch keine Daten zum Exportieren');
      return;
    }
    const wb = buildWorkbook();
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const filename = `Fitness-Tracker_${todayKey()}.xlsx`;
    const file = new File([blob], filename, { type: blob.type });

    // Auf dem Handy: direkt teilen (Mail, WhatsApp, …); sonst herunterladen
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Fitness Tracker Export' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // Nutzer hat abgebrochen
      }
    }
    downloadBlob(blob, filename);
    toast('Excel-Datei heruntergeladen');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `Fitness-Tracker-Backup_${todayKey()}.json`);
    toast('Backup erstellt');
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.settings || !parsed.days) {
          throw new Error('Kein gültiges Backup');
        }
        if (!confirm('Backup einspielen? Die aktuellen Daten auf diesem Gerät werden ersetzt.')) return;
        data = Object.assign(defaultData(), parsed);
        save();
        currentKey = todayKey();
        renderAll();
        toast('Backup eingespielt ✓');
      } catch (e) {
        alert('Diese Datei ist kein gültiges Backup.');
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
     Navigation & Events
     ============================================================ */

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = true; });
    $(`#view-${view}`).hidden = false;
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.view === view));
    $('#dayNav').style.display = view === 'today' ? '' : 'none';
    renderAll();
    window.scrollTo(0, 0);
  }

  function init() {
    // Tabs
    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => switchView(t.dataset.view)));

    // Tages-Navigation
    $('#prevDay').addEventListener('click', () => { currentKey = addDays(currentKey, -1); renderAll(); });
    $('#nextDay').addEventListener('click', () => {
      if (currentKey < todayKey()) { currentKey = addDays(currentKey, 1); renderAll(); }
    });
    $('#todayBtn').addEventListener('click', () => { currentKey = todayKey(); renderAll(); });
    $('#datePicker').addEventListener('change', (e) => {
      if (e.target.value && e.target.value <= todayKey()) {
        currentKey = e.target.value;
      }
      renderAll();
    });

    // Gewicht
    $('#weightSave').addEventListener('click', () => {
      const v = $('#weightInput').value;
      const day = getDay(currentKey, true);
      day.weight = v === '' ? null : Number(v);
      cleanupDay(currentKey);
      save(); renderAll();
      if (v !== '') toast('Gewicht gespeichert');
    });

    // Wasser
    document.querySelectorAll('.water-add').forEach((b) =>
      b.addEventListener('click', () => {
        const day = getDay(currentKey, true);
        day.water = (day.water || 0) + Number(b.dataset.ml);
        save(); renderAll();
      }));
    $('#waterEditBtn').addEventListener('click', () => {
      $('#waterExact').value = getDay(currentKey).water || 0;
      $('#waterDialog').showModal();
    });
    $('#waterForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const day = getDay(currentKey, true);
      day.water = Math.max(0, Number($('#waterExact').value) || 0);
      cleanupDay(currentKey);
      save();
      $('#waterDialog').close();
      renderAll();
    });

    // Tagesziele
    $('#checkSleep').addEventListener('change', (e) => {
      const day = getDay(currentKey, true);
      day.sleepOk = e.target.checked;
      cleanupDay(currentKey); save(); renderAll();
    });
    $('#checkSweets').addEventListener('change', (e) => {
      const day = getDay(currentKey, true);
      day.noSweets = e.target.checked;
      cleanupDay(currentKey); save(); renderAll();
    });

    // Mahlzeiten vom Vortag übernehmen
    $('#copyMealsBtn').addEventListener('click', () => {
      const prevDay = data.days[addDays(currentKey, -1)];
      if (!prevDay) return;
      const day = getDay(currentKey, true);
      day.meals = (prevDay.meals || [])
        .filter((m) => m.items && m.items.length)
        .map((m) => ({
          id: uid(),
          time: m.time,
          items: m.items.map((i) => Object.assign({}, i, { id: uid() }))
        }));
      save(); renderAll();
      toast('Mahlzeiten vom Vortag übernommen');
    });

    // Mahlzeiten
    $('#addMealBtn').addEventListener('click', () => {
      const day = getDay(currentKey, true);
      if (!Array.isArray(day.meals)) day.meals = [];
      const now = new Date();
      const isToday = currentKey === todayKey();
      const meal = {
        id: uid(),
        // Bei heutigen Einträgen die aktuelle Uhrzeit vorschlagen
        time: isToday
          ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
          : null,
        items: []
      };
      day.meals.push(meal);
      save(); renderAll();
      openMealDialog(meal.id);
    });
    $('#mealForm').addEventListener('submit', submitMeal);
    $('#mealSearch').addEventListener('input', (e) => renderMealSuggestions(e.target.value));
    $('#mealKcal').addEventListener('input', updateMealTotal);
    $('#mealQty').addEventListener('input', updateMealTotal);

    // Trainings-Dialoge
    $('#addWorkoutBtn').addEventListener('click', () => openWorkoutDialog(null));
    $('#workoutForm').addEventListener('submit', submitWorkout);
    $('#woScheme').addEventListener('change', updateWorkoutFields);
    $('#logForm').addEventListener('submit', submitLog);
    $('#logWorkout').addEventListener('change', () => renderLogFields(null));

    // Lebensmittel-Dialog
    $('#addFoodBtn').addEventListener('click', () => openFoodDialog(null));
    $('#foodForm').addEventListener('submit', submitFood);

    // Einstellungen
    $('#settingsForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      data.settings.challengeStart = $('#setStart').value;
      data.settings.challengeDays = Number($('#setDays').value) || 90;
      data.settings.kcalGoal = Number($('#setKcal').value) || 2200;
      data.settings.waterGoal = Math.round((Number($('#setWater').value) || 3) * 1000);
      data.settings.fastingWindow = Number($('#setFasting').value) || 6;
      data.settings.sleepGoal = Number($('#setSleep').value) || 7.5;
      save(); renderAll();
      toast('Einstellungen gespeichert');
    });

    // Auswertungs-Startdaten
    $('#trackFromForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      data.settings.trackFrom = {
        training: $('#tfTraining').value || null,
        kcal: $('#tfKcal').value || null,
        water: $('#tfWater').value || null,
        fasting: $('#tfFasting').value || null,
        sleep: $('#tfSleep').value || null,
        sweets: $('#tfSweets').value || null
      };
      save(); renderAll();
      toast('Auswertungs-Startdaten gespeichert');
    });

    // Export & Backup
    $('#exportExcelBtn').addEventListener('click', exportExcel);
    $('#backupBtn').addEventListener('click', exportBackup);
    $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
    $('#restoreFile').addEventListener('change', (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });

    // Ruhetag-Auswahl
    document.querySelectorAll('#restDialog .rest-option').forEach((b) =>
      b.addEventListener('click', () => {
        getDay(currentKey, true).training = { restDay: true, restType: b.dataset.rest };
        save();
        $('#restDialog').close();
        renderAll();
      }));

    // Wischgeste auf der Heute-Seite: links/rechts = Tag wechseln
    let swipeX = null, swipeY = null;
    const main = $('#main');
    main.addEventListener('touchstart', (e) => {
      if (currentView !== 'today' || e.touches.length !== 1) { swipeX = null; return; }
      swipeX = e.touches[0].clientX;
      swipeY = e.touches[0].clientY;
    }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (swipeX == null || currentView !== 'today') return;
      const dx = e.changedTouches[0].clientX - swipeX;
      const dy = e.changedTouches[0].clientY - swipeY;
      swipeX = null;
      // Nur deutliche horizontale Wischer, kein Scrollen abfangen
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      const view = $('#view-today');
      if (dx < 0) {
        if (currentKey >= todayKey()) return; // nicht in die Zukunft
        currentKey = addDays(currentKey, 1);
        view.classList.remove('slide-left', 'slide-right');
        void view.offsetWidth;
        view.classList.add('slide-left');
      } else {
        currentKey = addDays(currentKey, -1);
        view.classList.remove('slide-left', 'slide-right');
        void view.offsetWidth;
        view.classList.add('slide-right');
      }
      renderAll();
    }, { passive: true });

    // Trainingsfortschritt: Workout-Auswahl
    $('#trainChartSelect').addEventListener('change', (e) => {
      trainChartWorkoutId = e.target.value;
      renderTrainingChart();
    });

    // Essensfenster-Countdown minütlich aktualisieren
    setInterval(() => {
      if (currentView === 'today' && currentKey === todayKey()) {
        updateFastingDisplay(getDay(currentKey));
      }
    }, 60000);

    // Dialog-Abbrechen-Buttons
    document.querySelectorAll('dialog').forEach(wireCloseButtons);

    // Service Worker mit aktiver Update-Suche und Neustart-Banner
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.update().catch(() => {});
        // Bei Rückkehr aus dem Hintergrund erneut nach Updates suchen
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) reg.update().catch(() => {});
        });
      }).catch((e) => console.warn('Service Worker nicht registriert:', e));

      // Wenn eine neue Version übernommen hat: Banner zum Neustart zeigen
      // (nicht bei der allerersten Installation)
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { hadController = true; return; }
        $('#updateBanner').hidden = false;
      });
    }
    $('#updateReloadBtn').addEventListener('click', () => location.reload());

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

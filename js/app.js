/* ============================================================
   Fitness Tracker – Training, Kalorien, Wasser & Gewicht
   Alle Daten liegen lokal im Browser (localStorage).
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'fitness-tracker:v1';

  const MEAL_TYPES = [
    ['breakfast', 'Frühstück'],
    ['lunch', 'Mittagessen'],
    ['dinner', 'Abendessen'],
    ['snacks', 'Snacks']
  ];

  const SCHEME_LABELS = {
    amrap: 'Max. Runden in Zeit',
    fixedRounds: 'Feste Runden, Wdh. zählen',
    time: 'Auf Zeit',
    free: 'Freies Ergebnis'
  };

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
    // Standard: heute ist Tag 39 der 90-Tage-Challenge
    const start = new Date();
    start.setDate(start.getDate() - 38);
    return {
      version: 1,
      settings: {
        challengeStart: toKey(start),
        challengeDays: 90,
        kcalGoal: 2200,
        waterGoal: 3000
      },
      workouts: [],
      foods: [],
      days: {}
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.settings) return defaultData();
      return Object.assign(defaultData(), parsed);
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
      data.days[key] = { weight: null, water: 0, meals: {}, training: null };
    }
    return data.days[key] || { weight: null, water: 0, meals: {}, training: null };
  }

  function cleanupDay(key) {
    // Leere Tage nicht dauerhaft speichern
    const d = data.days[key];
    if (!d) return;
    const hasMeals = Object.values(d.meals || {}).some((arr) => arr && arr.length);
    if (d.weight == null && !d.water && !hasMeals && !d.training) delete data.days[key];
  }

  function dayKcal(day) {
    let sum = 0;
    for (const arr of Object.values(day.meals || {})) {
      for (const item of arr || []) sum += Number(item.kcal) || 0;
    }
    return sum;
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

    // Mahlzeiten
    const mc = $('#mealsContainer');
    mc.innerHTML = '';
    for (const [type, label] of MEAL_TYPES) {
      const items = (day.meals && day.meals[type]) || [];
      const sum = items.reduce((s, i) => s + (Number(i.kcal) || 0), 0);
      const group = el('div', { class: 'meal-group' },
        el('div', { class: 'meal-group-head' },
          el('h3', null, label),
          el('span', { class: 'meal-kcal-sum' }, items.length ? `${fmt(sum)} kcal` : '')
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
                day.meals[type] = day.meals[type].filter((i) => i.id !== item.id);
                cleanupDay(currentKey); save(); renderAll();
              }
            }, '✕')
          ));
        }
        group.append(list);
      }
      group.append(el('button', {
        class: 'add-item-btn',
        onclick: () => openMealDialog(type, label)
      }, `+ ${label} ergänzen`));
      mc.append(group);
    }

    // Training
    renderTrainingCard(day);
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
    if (t.restDay) return 'Ruhetag';
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
      tc.append(el('div', { class: 'rest-banner' }, '😌 Ruhetag'));
      tc.append(el('div', { class: 'quick-btns' },
        el('button', { class: 'btn', onclick: () => { day.training = null; cleanupDay(currentKey); save(); renderAll(); } },
          'Ruhetag entfernen')
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
        class: 'btn', onclick: () => {
          getDay(currentKey, true).training = { restDay: true };
          save(); renderAll();
        }
      }, 'Ruhetag')
    ));
  }

  /* ---------- Verlauf ---------- */

  function renderHistory() {
    renderWeightChart();

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
      if (kcal) facts.push(`🍽️ ${fmt(kcal)} kcal`);
      if (day.water) facts.push(`💧 ${fmt(day.water / 1000, 1)} L`);
      if (day.weight != null) facts.push(`⚖️ ${fmt(day.weight, 1)} kg`);
      if (day.training) {
        const w = day.training.restDay ? null : workoutById(day.training.workoutId);
        facts.push(day.training.restDay ? '😌 Ruhetag' : `🏋️ ${w ? w.name : 'Training'}`);
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

  /* Gewichts-Diagramm: eine Serie, Linie + Punkte, Hover-Tooltip */
  function renderWeightChart() {
    const wrap = $('#weightChart');
    wrap.innerHTML = '';

    const entries = Object.keys(data.days)
      .filter((k) => data.days[k].weight != null)
      .sort()
      .map((k) => ({ key: k, weight: data.days[k].weight }))
      .slice(-60);

    if (entries.length < 2) {
      wrap.append(el('p', { class: 'empty-note' },
        entries.length === 1
          ? `Bisher ein Messwert: ${fmt(entries[0].weight, 1)} kg. Ab zwei Werten gibt es hier eine Kurve.`
          : 'Trage dein Gewicht ein, um hier den Verlauf zu sehen.'));
      return;
    }

    const W = 640, H = 260;
    const PAD = { l: 44, r: 16, t: 16, b: 30 };
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;

    const t0 = fromKey(entries[0].key).getTime();
    const t1 = fromKey(entries[entries.length - 1].key).getTime();
    const span = Math.max(t1 - t0, 1);
    const weights = entries.map((e) => e.weight);
    let yMin = Math.min(...weights), yMax = Math.max(...weights);
    const pad = Math.max((yMax - yMin) * 0.15, 0.5);
    yMin -= pad; yMax += pad;

    const x = (e) => PAD.l + ((fromKey(e.key).getTime() - t0) / span) * iw;
    const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Gewichtsverlauf in Kilogramm');

    const S = (tag, attrs) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };

    // Gitterlinien + Y-Beschriftung
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = yMin + ((yMax - yMin) * i) / steps;
      const gy = y(v);
      svg.append(S('line', {
        x1: PAD.l, x2: W - PAD.r, y1: gy, y2: gy,
        stroke: 'var(--grid)', 'stroke-width': 1
      }));
      const label = S('text', {
        x: PAD.l - 8, y: gy + 3.5, 'text-anchor': 'end',
        fill: 'var(--ink-muted)', 'font-size': 11,
        style: 'font-variant-numeric: tabular-nums'
      });
      label.textContent = fmt(v, 1);
      svg.append(label);
    }

    // X-Beschriftung: erster & letzter Tag
    for (const e of [entries[0], entries[entries.length - 1]]) {
      const label = S('text', {
        x: x(e), y: H - 8,
        'text-anchor': e === entries[0] ? 'start' : 'end',
        fill: 'var(--ink-muted)', 'font-size': 11
      });
      label.textContent = fromKey(e.key).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      svg.append(label);
    }

    // Linie
    const dPath = entries.map((e, i) => `${i ? 'L' : 'M'}${x(e).toFixed(1)},${y(e.weight).toFixed(1)}`).join('');
    svg.append(S('path', {
      d: dPath, fill: 'none', stroke: 'var(--series-1)',
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    // Punkte (mit Surface-Ring)
    for (const e of entries) {
      svg.append(S('circle', {
        cx: x(e), cy: y(e.weight), r: 4,
        fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2
      }));
    }

    // Letzten Wert direkt beschriften
    const last = entries[entries.length - 1];
    const lastLabel = S('text', {
      x: Math.min(x(last), W - PAD.r) - 2, y: y(last.weight) - 10,
      'text-anchor': 'end', fill: 'var(--ink-2)',
      'font-size': 12, 'font-weight': 700,
      style: 'font-variant-numeric: tabular-nums'
    });
    lastLabel.textContent = `${fmt(last.weight, 1)} kg`;
    svg.append(lastLabel);

    // Hover/Touch: Fadenkreuz + Tooltip am nächsten Punkt
    const crosshair = S('line', {
      x1: 0, x2: 0, y1: PAD.t, y2: H - PAD.b,
      stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden'
    });
    svg.append(crosshair);

    const tooltip = el('div', { class: 'chart-tooltip' });
    tooltip.style.display = 'none';
    wrap.append(svg, tooltip);

    function onMove(clientX) {
      const rect = svg.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      let best = entries[0], bd = Infinity;
      for (const e of entries) {
        const d = Math.abs(x(e) - px);
        if (d < bd) { bd = d; best = e; }
      }
      const bx = x(best);
      crosshair.setAttribute('x1', bx);
      crosshair.setAttribute('x2', bx);
      crosshair.setAttribute('visibility', 'visible');
      tooltip.style.display = 'block';
      tooltip.style.left = `${(bx / W) * rect.width}px`;
      tooltip.style.top = `${(y(best.weight) / H) * rect.height}px`;
      tooltip.textContent = `${formatDateLong(best.key)} · ${fmt(best.weight, 1)} kg`;
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

  /* ---------- Verwalten ---------- */

  function workoutSubtitle(w) {
    let s = SCHEME_LABELS[w.scheme] || '';
    if (w.scheme === 'amrap' && w.minutes) s += ` · ${w.minutes} min`;
    if (w.scheme === 'fixedRounds' && w.rounds) s += ` · ${w.rounds} Runden`;
    return s;
  }

  function renderManage() {
    const wl = $('#workoutList');
    wl.innerHTML = '';
    if (!data.workouts.length) {
      wl.append(el('p', { class: 'empty-note' }, 'Noch keine Trainings angelegt.'));
    }
    for (const w of data.workouts) {
      wl.append(el('div', { class: 'manage-row' },
        el('div', { class: 'manage-main' },
          el('div', { class: 'manage-title' }, w.name),
          el('div', { class: 'manage-sub' }, workoutSubtitle(w) + (w.note ? ` · ${w.note}` : ''))
        ),
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

  let mealTargetType = null;

  function openMealDialog(type, label) {
    mealTargetType = type;
    $('#mealDialogTitle').textContent = `${label} ergänzen`;
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
    if (!day.meals[mealTargetType]) day.meals[mealTargetType] = [];
    day.meals[mealTargetType].push({
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
      note: $('#woNote').value.trim()
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
    if (!w) return;

    $('#logWorkoutInfo').textContent =
      workoutSubtitle(w) + (w.note ? ` – ${w.note}` : '');

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

    getDay(currentKey, true).training = t;
    save();
    $('#logDialog').close();
    renderAll();
    toast(editLogMode ? 'Training aktualisiert' : 'Training gespeichert 💪');
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
      'Kalorien (kcal)', 'Kalorien-Ziel (kcal)', 'Training', 'Ergebnis', 'Notiz'
    ]];
    for (const key of keys) {
      const day = data.days[key];
      const cd = challengeDay(key);
      const t = day.training;
      const w = t && !t.restDay ? workoutById(t.workoutId) : null;
      overview.push([
        key,
        cd >= 1 && cd <= S.challengeDays ? cd : '',
        day.weight != null ? day.weight : '',
        day.water || 0,
        S.waterGoal,
        dayKcal(day),
        S.kcalGoal,
        t ? (t.restDay ? 'Ruhetag' : (w ? w.name : t.workoutName || 'Training')) : '',
        t && !t.restDay ? trainingResultText(t) : '',
        t && t.note ? t.note : ''
      ]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(overview);
    ws1['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 14 },
                    { wch: 14 }, { wch: 17 }, { wch: 20 }, { wch: 36 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Tagesübersicht');

    // Blatt 2: Mahlzeiten
    const meals = [['Datum', 'Challenge-Tag', 'Mahlzeit', 'Eintrag', 'Portionen', 'kcal']];
    const mealLabel = Object.fromEntries(MEAL_TYPES);
    for (const key of keys) {
      const day = data.days[key];
      const cd = challengeDay(key);
      for (const [type] of MEAL_TYPES) {
        for (const item of (day.meals && day.meals[type]) || []) {
          meals.push([
            key,
            cd >= 1 && cd <= S.challengeDays ? cd : '',
            mealLabel[type], item.name, item.qty || 1, item.kcal
          ]);
        }
      }
    }
    const ws2 = XLSX.utils.aoa_to_sheet(meals);
    ws2['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 34 }, { wch: 9 }, { wch: 8 }];
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
        t.restDay ? 'Ruhetag' : (w ? w.name : t.workoutName || 'Training'),
        t.restDay ? '' : (SCHEME_LABELS[t.scheme || (w && w.scheme)] || ''),
        t.restDay ? '' : trainingResultText(t)
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

    // Mahlzeiten-Dialog
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
      save(); renderAll();
      toast('Einstellungen gespeichert');
    });

    // Export & Backup
    $('#exportExcelBtn').addEventListener('click', exportExcel);
    $('#backupBtn').addEventListener('click', exportBackup);
    $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
    $('#restoreFile').addEventListener('change', (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });

    // Dialog-Abbrechen-Buttons
    document.querySelectorAll('dialog').forEach(wireCloseButtons);

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((e) =>
        console.warn('Service Worker nicht registriert:', e));
    }

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

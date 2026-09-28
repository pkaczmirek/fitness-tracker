// Prüft eine Plan-Datei gegen specs/format-trainingsplan-v1.md.
// Aufruf: node tools/check-plan.js <plan-datei.json>
// Nutzt dieselben Regeln wie die App beim Import (js/plan-check.js).
const fs = require('fs');
const path = require('path');
const { checkPlan } = require(path.join(__dirname, '..', 'js', 'plan-check.js'));

const file = process.argv[2];
if (!file) {
  console.log('Aufruf: node tools/check-plan.js <plan-datei.json>');
  process.exit(2);
}

let plan;
try {
  plan = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.log(`Datei ist kein gültiges JSON: ${e.message}`);
  process.exit(1);
}

const { errors, warnings, stats } = checkPlan(plan);
if (stats) {
  console.log(`Übungen ${stats.exercises} · Tests ${stats.tests} · Wochen ${stats.weeks} · ` +
    `Tage ${stats.days} · Einheiten ${stats.sessions} · Einträge ${stats.items}`);
}
console.log(errors.length ? `FEHLER (${errors.length}):\n- ` + errors.join('\n- ') : 'Keine Fehler.');
if (warnings.length) console.log(`Hinweise (${warnings.length}):\n- ` + warnings.join('\n- '));
process.exit(errors.length ? 1 : 0);

# Format: Plan-Datei und Trainingsprotokoll (Version 1)

Stand: 2026-09-28 · Festgelegt in der App-Session (`D:\dev\Fitness tracker`),
gehört zu [Spec 001](001-trainingsplan.md). Das Trainingsplan-Projekt
(`D:\dev\Trainingsplan`, Spec 004) übernimmt dieses Format 1:1.

Beispiel mit echten Tagen aus dem Startpaket:
[beispiel-trainingsplan-v1.json](beispiel-trainingsplan-v1.json). Die
Beispieldatei ist ein **Auszug** (8 Tage). Eine echte Plan-Datei enthält
jeden Tag ihres Zeitraums.

**Prüfen vor dem Übertragen aufs Handy** (Node.js ist auf dem PC installiert):

```
node "D:\dev\Fitness tracker\tools\check-plan.js" "<pfad zur plan-datei.json>"
```

Der Prüfer nennt jeden Fehler mit Tag, Einheit und Eintragsnummer. Die App
prüft beim Import nach denselben Regeln (Abschnitt 1.9).

Es gibt zwei Dateiarten:

| Datei | Richtung | Wer schreibt sie |
|---|---|---|
| **Plan-Datei** (`"format": "trainingsplan"`) | PC → Handy | Claude im Trainingsplan-Projekt, pro Phase |
| **Trainingsprotokoll** (`"format": "trainingsprotokoll"`) | Handy → PC | die App (Export-Knopf) |

---

## 0. Grundregeln für beide Dateien

1. **JSON, UTF-8.** Umlaute und typografische Anführungszeichen („…“) sind in
   Texten erlaubt.
2. **Datum** immer als `"JJJJ-MM-TT"`, z. B. `"2026-10-19"`.
3. **Zahl oder Bereich:** Wo in den Tabellen *Zahl/Bereich* steht, ist
   entweder eine Zahl (`12`) oder ein Paar `[von, bis]` erlaubt (`[8, 12]`).
   `von` muss kleiner oder gleich `bis` sein.
4. **Kennungen (`id`) sind für immer.** Dieselbe Übung hat in allen
   Plan-Dateien dieselbe Kennung, sonst reißen „letzte Werte“ und der Verlauf
   ab. Erlaubt sind nur `A–Z`, `a–z`, `0–9` und `-`. Keine Umlaute und keine
   Leerzeichen, dafür gibt es das Feld `label`.
5. **Alles ausgerechnet.** Keine Verweise wie „laut Abschnitt 3“ oder „halbe
   Zeit von Montag“. Jede Zahl steht fertig am jeweiligen Tag.
6. **Unbekannte Felder** ignoriert die App. Fehlende Pflichtfelder und
   Verweise auf unbekannte Kennungen lehnt sie beim Import mit einer genauen
   Meldung ab (Abschnitt 1.9).

---

## 1. Plan-Datei

### 1.1 Oberste Ebene

| Feld | Pflicht | Inhalt |
|---|---|---|
| `format` | ja | immer `"trainingsplan"` |
| `formatVersion` | ja | immer `1` |
| `planId` | ja | Kennung dieses Plan-Teils, z. B. `"startpaket"`, `"phase1"` |
| `title` | ja | Anzeigename, z. B. `"Phase 1: Fundament + Weihnachten"` |
| `createdAt` | ja | Datum der Erstellung |
| `range` | ja | `{ "from": Datum, "to": Datum }`: der Zeitraum, den diese Datei abdeckt (siehe Import-Regeln 1.8) |
| `event` | ja | `{ "name": "…", "date": "2027-06-26" }`: für den Countdown |
| `places` | ja | Orte, z. B. `{ "Z": "zu Hause (inkl. Treppe im Haus)", "L": "Laufstrecke" }` |
| `guides` | nein | Hilfetexte (1.2) |
| `exercises` | ja | Übungsbibliothek (1.3). Darf auch Übungen enthalten, die in dieser Datei nicht vorkommen. |
| `tests` | nein | Test-Bibliothek (1.4) |
| `weeks` | ja | Wochen (1.5) |
| `days` | ja | Tage (1.6) |

### 1.2 `guides`: Hilfetexte

Allgemeine Texte, die die App unter „Plan → Infos“ zeigt (Anstrengungsskala,
Grundregeln, Hundespaziergang-Zusatz …).

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | z. B. `"effort"` |
| `title` | ja | Überschrift |
| `text` | ja | Klartext, Zeilenumbrüche als `\n`. Keine Tabellen, kein Markdown. |

### 1.3 `exercises`: Übungsbibliothek (= Spickzettel)

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | dauerhafte Kennung (Regeln unten) |
| `label` | nein | Nummer, wie sie im Plan steht: `"Ü1"`, `"Ü26"`, `"A1"`, `"Ü22/Ü23"`. Leer lassen, wenn es keine gibt. |
| `name` | ja | `"Totes Hängen"` |
| `kind` | ja | Art der Übung, bestimmt die Eingabemaske (Tabelle unten) |
| `load` | nein | `true`, wenn Zusatzgewicht möglich ist (Rucksack …). Dann zeigt die App ein kg-Feld. |
| `group` | nein | Bereich für die Sortierung: `"Hängen und Zug"`, `"Rumpf"`, `"Beine, Treppe, Laufen"`, `"Klettern"`, `"Bausteine"` |
| `howTo` | ja* | „So geht's“ |
| `watch` | nein | „Achte auf“ |
| `harder` | nein | „Schwerer machen“ |

\* bei `kind: "block"` darf `howTo` die Ablaufbeschreibung des Bausteins sein.

**Regeln für `id`:**
- Übungen mit Ü-Nummer: `U` + Nummer (+ Kleinbuchstabe): `U1`, `U3c`, `U26`.
- **Teilen sich zwei Übungen eine Nummer**, bekommt jede einen Zusatz:
  `U26-UAS` (Unterarmstütz), `U26-SEIT` (Seitstütz). `label` bleibt `"Ü26"`.
- Kombinierte Nummern: `U22-23` (Treppe hoch und runter), `label` `"Ü22/Ü23"`.
- Übungen ohne Nummer: kurzes Wort in Großbuchstaben: `BULG` (Bulgarische
  Kniebeuge), `HOHL` (Hohlkörper-Halten), `RUDERN`, `LIEGE`, `WALK`.
- Bausteine: `A1`, `A2`, `D`.

**`kind`: was die App beim Eintragen abfragt**

| `kind` | Für | Pro Satz | Pro Übung |
|---|---|---|---|
| `strength` | Wiederholungs-Übungen (Kniebeuge, Rudern, Liegestütz, Knieheben) | Wdh. (+ kg bei `load`) | Gefühl* · Variante (Freitext, z. B. „Hände auf Stufe“) |
| `hold` | Halte-Übungen (Hängen, Stütz, Einbeinstand) | Sekunden (+ kg bei `load`) | Gefühl* · Variante |
| `cardio` | Lauf, Spaziergang, Wandern | – (meist 1 Block) | Dauer (Min.), km, Ø-Puls, Anstrengung 1–10 · Gefühl* |
| `stairs` | Treppe, Stairmaster | Minuten · Durchgänge | Anstrengung 1–10 · Gefühl* |
| `climb` | Quergänge, Bouldern | Sekunden bzw. Minuten | Anstrengung 1–10 · Gefühl* · Notiz (Grad/Farbe, Anzahl) |
| `block` | Bausteine A1, A2, D | – | nur abhaken |
| `other` | alles andere | – | abhaken · Notiz |

\* **Gefühl** (freiwillig, ein Antippen pro Übung): „zu hart“ · „genau richtig“
· „hätte schwerer sein können“. Grundlage für die doppelte Steigerung. Das
Feld `tank` in der Plan-Datei (1.8) bleibt ein reiner Anzeigetext für das
Ziel; abgefragt wird „im Tank“ nicht.

### 1.4 `tests`: Test-Bibliothek

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `"T1"`, `"T3a"`, `"T8b"` |
| `name` | ja | `"Totes Hängen trocken"` |
| `howTo` | ja | Anleitung |
| `fields` | ja | Liste der Messwerte (Tabelle unten), mindestens einer |
| `main` | ja | `key` des Messwerts, der im Verlauf als Kurve gezeigt wird |
| `better` | ja | `"higher"` (mehr ist besser) oder `"lower"` |
| `target` | nein | Zielmarke: `{ "text": "60 s", "value": 60 }`. `value` in der Einheit von `main` (bei `minsec` in Sekunden). |
| `goal` | nein | Wofür: `"F3"` |
| `note` | nein | Hinweis, z. B. „Kein Tempotest!“ |

**Ein Messwert in `fields`:** `{ "key": "km", "label": "Strecke (km)", "type": "km" }`

| `type` | Eingabe in der App | gespeichert als |
|---|---|---|
| `seconds` | Sekunden | Zahl |
| `minsec` | Minuten : Sekunden | Zahl (Sekunden gesamt) |
| `number` | ganze Zahl | Zahl |
| `km` | Kommazahl | Zahl |
| `bpm` | Puls | Zahl |
| `scale10` | Auswahl 0–10 | Zahl |
| `yesno` | Ja / Nein | `true` / `false` |
| `text` | Freitext | Text |

Ein Messwert darf **später nachgetragen** werden (z. B. T7 „Muskelkater am
Folgetag“). Die App erlaubt, ein Test-Ergebnis nachträglich zu bearbeiten.

### 1.5 `weeks`: Wochen

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `"SP0"`, `"SP1"`, `"SP2"` (Startpaket), `"W1"` … `"W36"` |
| `title` | ja | `"Woche 1: Gewöhnung"`, `"W8: Entlastung + Test 2"` |
| `phase` | ja | Anzeigetext: `"Startpaket"`, `"Phase 1: Fundament"`, `"Weihnachten"` |
| `types` | ja | Liste aus `"intro"` (Startpaket), `"build"` ▲, `"deload"` ▽, `"test"` 🧪, `"xmas"` 🎄, `"taper"` 🏁, `"race"` (Rennwoche) |
| `start` | ja | Datum des ersten Tages (Montag; beim Startpaket SP0 der 01.10.) |
| `goal` | nein | „Ziel der Woche“ |
| `note` | nein | z. B. Steigerungsregel, „3–4 Einheiten reichen“ |

### 1.6 `days`: Tage

Jeder Tag, an dem etwas geplant ist, **und jeder Ruhetag** steht in der Liste.
Ein Datum, das im `range` liegt, aber fehlt, zeigt die App als „frei“.

| Feld | Pflicht | Inhalt |
|---|---|---|
| `date` | ja | Datum, muss in `range` liegen, jedes Datum nur einmal |
| `week` | ja | `id` einer Woche (aus dieser Datei oder schon importiert) |
| `rest` | nein | `true` = Ruhetag (App zeigt „Ruhetag“ statt „frei“) |
| `highlight` | nein | Hervorhebung als Plakette: `"Schlüsseltag S1"`, `"Team 1"`, `"Rennen"` |
| `note` | nein | Tageshinweis: „Hundespaziergang.“, Ausrüstung, „Muskelkater von T7 notieren“ |
| `sessions` | ja | Liste der Einheiten (1.7), meist genau eine, bei reinem Ruhetag `[]` |

### 1.7 Einheit (`sessions[…]`)

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `"<Datum>-<Nr>"`, z. B. `"2026-10-19-1"`. Eindeutig über alle Plan-Dateien. Beim Neu-Erzeugen einer Phase bleibt die Kennung gleich, solange die Einheit am selben Datum liegt. |
| `title` | ja | `"Kraft A: Ganzkörper zu Hause"` |
| `place` | ja | Liste von Ort-Kürzeln: `["Z"]`, `["T", "Z"]` („T, dann Z“), `["T", "P"]` („T + P“) |
| `minutes` | ja | Dauer: Zahl/Bereich, z. B. `45` oder `[60, 75]` |
| `effort` | ja | Anzeigetext der Anstrengung: `"3–4"`, `"Kraftsätze 7–8, Treppe 4–5"`, `"Test"` |
| `goal` | nein | `"F5 Zug, F3 Griff (Wände, Hangel-Hindernisse)"` |
| `note` | nein | Hinweis zur ganzen Einheit, z. B. „Dauer inkl. Anfahrt“, Zeitspar-Tipp, „Warum Freitag“ |
| `optional` | nein | `true` = freiwillig (Einstiegstage, optionaler Rumpf am Ruhetag, Weihnachts-Einheiten). Zählt nicht in die Erfolgsquote. |
| `altDates` | nein | Weitere mögliche Tage, z. B. `["2026-10-04"]` bei „Sa oder So“. Die App bietet dann „auf So 04.10. verschieben“ mit einem Tipp an. |
| `testRound` | nein | Bei Testtagen: `"Eingangstest"`, `"Test 2"` … `"Test 5"`. Gilt für alle Tests dieser Einheit. |
| `variants` | ja | die Fassungen (unten) |

**`variants`: die drei Fassungen**

```json
"variants": {
  "normal": { "items": [ … ] },
  "short":  { "minutes": 30, "items": [ … ] },
  "home":   { "place": ["Z"], "minutes": 40, "note": "Was das nicht ersetzt: …", "items": [ … ] }
}
```

- `normal` ist Pflicht. `short` und `home` sind optional (weglassen oder `null`),
  dann ist der Knopf in der App ausgegraut.
- Jede Fassung darf `place`, `minutes`, `effort` und `note` **überschreiben**.
  Was fehlt, gilt aus der Einheit.
- Jede Fassung enthält ihre **vollständige** Übungsliste. Die Kurzfassung
  „1, 2, 3, 4, 7 und 1 Satz Unterarmstütz“ wird also ausgeschrieben.

### 1.8 Einträge in einer Fassung (`items[…]`)

Jeder Eintrag ist genau **eine** von drei Arten:

**a) Übung** (`exercise`)

| Feld | Pflicht | Inhalt |
|---|---|---|
| `exercise` | ja | `id` aus der Übungsbibliothek |
| `sets` | nein | Anzahl Sätze bzw. Blöcke, Standard `1` |
| `reps` / `seconds` / `minutes` | höchstens eins | Ziel pro Satz, Zahl/Bereich. Bis 5 Min. pro Satz bevorzugt `seconds` (`75` für 1:15). Bei `block` meist `minutes`. |
| `perSide` | nein | `"Bein"`, `"Seite"` oder `"Arm"`: Ziel gilt **je Seite** |
| `restSec` | nein | Pause nach jedem Satz in Sekunden |
| `effort` | nein | Anstrengung nur für diese Übung, Anzeigetext `"4–5"` |
| `tank` | nein | Ziel „im Tank“, Anzeigetext `"1–3"` |
| `note` | nein | Hinweis: „im Wechsel mit Rudern“, „Hände vorher nass“, „Variante nach Stand“ |

**b) Test** (`test`)

| Feld | Pflicht | Inhalt |
|---|---|---|
| `test` | ja | `id` aus der Test-Bibliothek |
| `note` | nein | z. B. „im Protokoll vermerken, welche Treppe“ |

**c) Schritt** (`text`): alles ohne Messwerte, wird nur abgehakt

| Feld | Pflicht | Inhalt |
|---|---|---|
| `text` | ja | „5 Min. Pause“, „Einweisung der Halle, falls nötig“ |
| `minutes` | nein | Dauer, Zahl/Bereich |
| `input` | nein | Notierfeld: `{ "type": "number", "label": "Stufen" }` (Typen wie bei Tests, 1.4) |

### 1.9 Import-Regeln

1. **Tage:** Alle geplanten Tage im `range` der Datei werden durch die Tage
   der Datei **ersetzt**. Tage außerhalb bleiben unverändert. So kann eine
   überarbeitete Phase einfach neu importiert werden.
2. **Bibliotheken** (`exercises`, `tests`, `places`, `guides`) und `weeks`:
   Einträge mit gleicher `id` werden durch die neue Fassung ersetzt, neue
   kommen dazu, nichts wird gelöscht.
3. **Ergebnisse werden nie gelöscht.** Jedes Ergebnis speichert eine Kopie
   des Plan-Werts, gegen den trainiert wurde. Auch wenn eine Einheit nach
   einer Überarbeitung wegfällt, bleibt ihr Ergebnis im Verlauf und im Export.
4. **Verschiebungen** („Sa ↔ So tauschen“) merkt sich die App pro
   Einheiten-`id`. Sie bleiben nach einem Neu-Import erhalten, solange die
   `id` noch existiert.

**Die App lehnt eine Datei ab** (mit Meldung, welcher Tag und welcher
Eintrag), wenn:
- `format` oder `formatVersion` nicht passen,
- ein Pflichtfeld fehlt oder ein Datum ungültig ist oder außerhalb `range` liegt,
- ein Datum oder eine Einheiten-`id` doppelt vorkommt,
- ein Eintrag auf eine unbekannte Übung, einen unbekannten Test, eine
  unbekannte Woche oder einen unbekannten Ort verweist,
- ein Eintrag nicht genau eine der Arten `exercise` / `test` / `text` ist
  oder mehr als eins von `reps` / `seconds` / `minutes` hat,
- ein Bereich `[von, bis]` falsch herum ist,
- `kind`, `types`, `better` oder ein Feld-`type` einen unbekannten Wert hat,
- bei einem Test `main` nicht in `fields` vorkommt.

Vor dem Import zeigt die App eine Zusammenfassung („Startpaket · 18 Tage ·
01.10.–18.10. · 22 Übungen · 11 Tests · ersetzt 0 Tage“) und fragt nach.

### 1.10 Übersetzungshilfe: Markdown → JSON

| Im Markdown | In der Plan-Datei |
|---|---|
| `Ü1 Totes Hängen — 3 × 20–30 s, Pause 90 s` | `{ "exercise": "U1", "sets": 3, "seconds": [20, 30], "restSec": 90 }` |
| `… — 2 × 8 je Bein` | `"reps": 8, "perSide": "Bein"` |
| `Ü8 Quergänge — 4 × 1:15, Pause 2 Min.` | `"sets": 4, "seconds": 75, "restSec": 120` |
| `A1 — 5 Min.` | `{ "exercise": "A1", "minutes": 5 }` |
| `Ü20 Lockerer Lauf — 30 Min. im Sprechtempo` | `{ "exercise": "U20", "minutes": 30, "note": "Sprechtempo, Gehpausen erlaubt" }` |
| `Ü22/Ü23 Treppe — 3 × 4 Min. …, Pause 2 Min.` | `{ "exercise": "U22-23", "sets": 3, "minutes": 4, "restSec": 120 }` |
| `Ü26 Unterarmstütz — 2 × 30–60 s · Ü26 Seitstütz — 2 × 20–40 s je Seite` | zwei Einträge: `U26-UAS` und `U26-SEIT` (mit `"perSide": "Seite"`) |
| `Ü9 Überhang-Bouldern — 15–20 Min.` | `{ "exercise": "U9", "minutes": [15, 20] }` |
| `5 Min. Pause` | `{ "text": "Pause", "minutes": 5 }` |
| `Stufen zählen und notieren: ______ Stufen` | `{ "text": "Stufen zählen (einmal)", "input": { "type": "number", "label": "Stufen" } }` |
| `**T1** Totes Hängen trocken` | `{ "test": "T1" }` |
| `Test A` / `Eingangstest` | an der Einheit: `"testRound": "Eingangstest"` |
| `Sa 03.10. oder So 04.10.` | Einheit am Samstag, `"altDates": ["2026-10-04"]`; Sonntag als eigener Tag ohne Einheit mit `note` |
| `Ü1 Totes Hängen — 3 × Zeit laut Abschnitt 3` | ausgerechnet für die Woche: `"seconds": 25` |
| `Ü1 Totes Hängen locker — 2 × halbe Zeit von Montag` | ausgerechnet: `"sets": 2, "seconds": 12, "note": "locker"` |
| `Liegestütz (Variante nach Stand)` | `{ "exercise": "LIEGE", …, "note": "Variante nach Stand (siehe Spickzettel)" }`; die gewählte Variante trägt der Nutzer beim Eintragen ein |
| `Kurzfassung (30 Min.): 1, 2, 3, 4, 7 und 1 Satz Unterarmstütz` | `"short": { "minutes": 30, "items": [ … ausgeschrieben … ] }` |
| `Home-Alternative: dasselbe an der Treppe im Haus` | `"home": { "place": ["Z"], "items": [ … vollständige Kopie … ] }` |
| `Was das nicht ersetzt: …` | `"note"` in der `home`-Fassung |
| `Home-Alternative: keine gleichwertige. Test verschieben.` | `note` an der Einheit; ggf. `home` mit Ersatz-Einheit und `note` „ersetzt den Test nicht“ |
| `Tipp zum Zeitsparen: 2+3 im Wechsel` | `note` an der Einheit oder an den Übungen |
| Einstiegstage „alles freiwillig“, optionaler Rumpf am Ruhetag | `"optional": true` |
| Weihnachten „3–4 der Einheiten pro Woche, egal welcher Tag“ | Einheiten auf Vorschlags-Tage legen, alle `"optional": true`, Wochen-`note` „3–4 Einheiten reichen, Tage frei tauschbar“ |
| Doppel-Wochenende `+ So 45` | eigene Einheit am Sonntag |
| Schlüsseltag, Team-Termin | `"highlight": "Schlüsseltag S1"` am Tag |
| Ausrüstungs-Hinweis | `note` am Tag |
| Hundespaziergang-Zusatz, Anstrengungsskala, Grundregeln | `guides` |
| Ruhetag mit Hundespaziergang | `{ "date": …, "rest": true, "note": "Hundespaziergang.", "sessions": [] }` |

---

## 2. Trainingsprotokoll (Export aus der App)

Die App schreibt **immer den kompletten Verlauf** (nicht nur das Neue). Die
neueste Datei ersetzt also alle älteren. Dateiname:
`Trainingsprotokoll_<Datum>.json`.

### 2.1 Oberste Ebene

```json
{
  "format": "trainingsprotokoll",
  "formatVersion": 1,
  "exportedAt": "2026-10-18T20:15:00",
  "appVersion": 13,
  "plans": [ { "planId": "startpaket", "title": "…", "importedAt": "2026-09-30" } ],
  "sessions": [ … ],
  "tests": [ … ],
  "daily": [ … ]
}
```

### 2.2 `sessions`: eingetragene Einheiten

Nur Einheiten, zu denen etwas eingetragen oder die als ausgelassen markiert
wurden. Welche geplant, aber nie angefasst wurden, ergibt sich aus der
Plan-Datei.

```json
{
  "sessionId": "2026-10-05-1",
  "plannedDate": "2026-10-05",
  "date": "2026-10-05",
  "title": "Hängen und Rumpf",
  "variant": "normal",
  "status": "done",
  "effort": 5,
  "minutes": 32,
  "note": "Schultern gut gespürt",
  "items": [
    { "exercise": "A1", "done": true },
    {
      "exercise": "U1",
      "planned": { "sets": 3, "seconds": [20, 30], "restSec": 90 },
      "variant": "",
      "sets": [ { "seconds": 30 }, { "seconds": 28 }, { "seconds": 25 } ],
      "feel": "right",
      "note": ""
    },
    {
      "exercise": "U20",
      "planned": { "minutes": 30 },
      "cardio": { "minutes": 31, "km": 4.6, "pulse": 142, "effort": 4 }
    },
    {
      "exercise": "U22-23",
      "planned": { "sets": 3, "minutes": 4, "restSec": 120 },
      "sets": [ { "minutes": 4, "rounds": 7 }, { "minutes": 4, "rounds": 7 }, { "minutes": 4, "rounds": 6 } ],
      "effort": 5
    },
    { "text": "Stufen zählen (einmal)", "done": true, "value": 20 },
    { "test": "T1", "done": true }
  ]
}
```

| Feld | Inhalt |
|---|---|
| `plannedDate` / `date` | geplanter und tatsächlicher Tag (unterscheiden sich nach Verschieben) |
| `variant` (Einheit) | `"normal"`, `"short"` oder `"home"` |
| `status` | `"done"` (erledigt), `"partial"` (teilweise), `"skipped"` (ausgelassen) |
| `effort` / `minutes` / `note` | Gesamt-Anstrengung 1–10, tatsächliche Dauer, Notiz (alle optional) |
| `planned` | Kopie des Plan-Werts zum Zeitpunkt des Trainings |
| `variant` (Übung) | gewählte Variante als Freitext („Hände auf Stufe“, „Rucksack 5 kg“) |
| `sets` | nur **bestätigte** Sätze. Mögliche Felder: `reps`, `seconds`, `minutes`, `kg`, `rounds` (Durchgänge) |
| `feel` | Gefühl zur ganzen Übung: `"hard"` (zu hart), `"right"` (genau richtig), `"easy"` (hätte schwerer sein können). Fehlt, wenn nicht angegeben. |
| `cardio` | bei `kind: "cardio"`: `minutes`, `km`, `pulse`, `effort` |
| `effort` (Übung) | bei `stairs` und `climb`: Anstrengung 1–10 |
| `done` | bei Bausteinen, Schritten und Tests: abgehakt ja/nein |
| `value` | bei Schritten mit `input` |

Bei Übungen **je Seite** (`perSide`) steht pro Satz **ein** Wert (gilt für
beide Seiten). Unterschiede zwischen den Seiten gehören in `note`.

### 2.3 `tests`: Test-Ergebnisse

```json
{
  "test": "T6",
  "date": "2026-10-13",
  "round": "Eingangstest",
  "sessionId": "2026-10-13-1",
  "values": { "km": 4.8, "pulse": 148, "walkBreaks": true },
  "note": "windig"
}
```

`values` enthält die `key`s aus der Test-Definition. Fehlende Werte fehlen
einfach (z. B. Muskelkater noch nicht nachgetragen).

### 2.4 `daily`: Tageswerte aus der restlichen App

Damit Claude Erholung und Ernährung mit auswerten kann. Nur Tage mit
mindestens einem Wert.

```json
{ "date": "2026-10-13", "weight": 82.4, "sleepOk": true, "kcal": 2150, "water": 2500 }
```

---

## 3. Versionen

- Diese Beschreibung ist **Version 1**. Neue **optionale** Felder dürfen
  ohne Versionswechsel dazukommen.
- Ändert sich etwas so, dass alte Dateien falsch verstanden würden, steigt
  `formatVersion` auf `2`. Die App lehnt Versionen ab, die sie nicht kennt,
  und sagt das in der Meldung.

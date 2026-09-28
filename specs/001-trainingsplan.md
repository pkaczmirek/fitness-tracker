# Spec 001: Trainingsplan in der App

Status: 2026-09-28: Format festgelegt
([format-trainingsplan-v1.md](format-trainingsplan-v1.md)), Fragen geklärt
(Abschnitt 8). **Schritt 1 in Arbeit.**

Gegenstück im Trainingsplan-Projekt:
`D:\dev\Trainingsplan\specs\004-app-anbindung.md`

---

## 1. Worum es geht

Ab dem 01.10.2026 trainiert der Nutzer nach einem 9-Monats-Plan für die
XLETIX Challenge Tirol X-treme (26.06.2027). Der Plan entsteht als Markdown im
Trainingsplan-Projekt. Claude erzeugt daraus pro Phase eine **Plan-Datei**
(JSON). Die App **importiert** sie, zeigt jeden Tag die geplante Einheit, lässt
die Ergebnisse **Satz für Satz** eintragen und exportiert ein
**Trainingsprotokoll** (JSON + Excel), das Claude auswertet und in den
nächsten Plan einfließen lässt.

```
Trainingsplan-Projekt (Markdown)
        │ Claude erzeugt
        ▼
Plan-Datei (JSON) ──► App: Import · Heute · Woche · Satz für Satz · Tests
                                            │
Claude wertet aus, passt an ◄── Trainingsprotokoll (JSON) + Excel
```

Die 90-Tage-Challenge (bis 29.08.2026) ist vorbei. Der Trainingsplan ersetzt
sie, mit einem **Countdown** bis zum Rennen statt „Tag X / 90“.

## 2. Entscheidungen

Aus Spec 004 übernommen:
- Die App enthält **keinen fest einprogrammierten Plan**. Alle Inhalte
  (Übungen, Zahlen, Texte, Orte, Tests) kommen aus der Plan-Datei.
- Plan-Dateien kommen **fertig ausgerechnet** (jeder Tag mit konkreten Zahlen).
- **Jeder Satz einzeln** wird protokolliert.
- Keine Online-Verbindung, kein Konto, kein Sync. Austausch nur über Dateien
  (per Mail an sich selbst, Google Drive oder USB, wie beim Backup).
- Gewicht, Kalorien, Wasser, Schlaf, Tagesziele und Backup bleiben.

Neu in dieser Sitzung (2026-09-28):
- **Das Format** steht in [format-trainingsplan-v1.md](format-trainingsplan-v1.md),
  mit Beispieldatei [beispiel-trainingsplan-v1.json](beispiel-trainingsplan-v1.json).
  Wichtigste Punkte:
  - Wochen, Tage, Einheiten, drei Fassungen (Normal / Kurz / Zuhause), jede
    mit vollständiger Übungsliste.
  - Drei Arten von Einträgen: **Übung**, **Test**, **Schritt** (nur abhaken,
    optional mit Notierfeld wie „Stufen zählen“).
  - Jede Übung hat eine **Art** (`kind`): Wiederholungen, Halten, Lauf,
    Treppe, Klettern, Baustein, Sonstiges. Die Art bestimmt, welche Felder
    die App beim Eintragen zeigt.
  - Kennungen sind **dauerhaft**, damit „letzte Werte“ und Verläufe über
    alle Phasen funktionieren.
  - Flexible Tage: „Sa oder So“ über `altDates`; Weihnachten als Vorschlags-Tage
    mit `optional` und frei tauschbar. Kein eigener „Wochen-Pool“.
- **Import ersetzt nur den Zeitraum der Datei**, Ergebnisse werden nie gelöscht.
  Jedes Ergebnis enthält eine Kopie des Plan-Werts.
- **Die App prüft jede Plan-Datei streng** und nennt Fehler mit Tag, Einheit
  und Eintragsnummer. Dieselbe Prüfung gibt es als PC-Werkzeug
  [tools/check-plan.js](../tools/check-plan.js). Es findet die typischen
  Handschrift-Fehler (unbekannte Kennung, doppeltes Datum, Bereich falsch
  herum, unbekannter Ort …) und wird im Trainingsplan-Projekt vor jedem
  Übertragen aufs Handy ausgeführt. App und Werkzeug nutzen **denselben**
  Prüf-Code (`js/plan-check.js`).
- **Die erste Plan-Datei ist das Startpaket (01.–18.10.)**, nicht Phase 1.
  Es beginnt in 3 Tagen und enthält den Eingangstest.

## 3. Was die App können muss

Nummern wie in Spec 004, Abschnitt 4.3.

| # | Anforderung | So in der App |
|---|---|---|
| 1 | Plan importieren | Tab **Plan** → „Plan importieren“ → Datei wählen → Zusammenfassung → Bestätigen. Fehler werden aufgelistet, nichts wird halb importiert. |
| 2 | Heute-Ansicht | Auf **Heute** ganz oben eine kompakte Karte mit der Einheit des Tages (Titel, Ort, Dauer, Status). Antippen öffnet die **Einheit** als eigene Seite, oben der Umschalter **Normal / Kurz / Zuhause**. Wischen wechselt wie bisher den Tag. |
| 3 | Wochenansicht | Tab **Plan** → Woche: Mo–So mit Einheit und Status (○ geplant · ✓ erledigt · ◐ teilweise · ✕ ausgelassen · ! nicht eingetragen), oben Ziel der Woche, Phase und Wochentyp. Wischen wechselt die Woche. |
| 4 | Satz für Satz | Pro Übung eine Zeile je Satz, **vorbelegt** (siehe 3.1). Jede Zeile hat einen ✓-Knopf zum Bestätigen. Felder je nach Übungsart: Wdh. oder Sekunden, kg (wenn möglich). Pro Übung freiwillig das Gefühl: „zu hart“ · „genau richtig“ · „hätte schwerer sein können“. |
| 5 | Läufe und Treppe | Lauf: Dauer, km, Ø-Puls, Anstrengung. Treppe: pro Block Minuten und Durchgänge, dazu Anstrengung. |
| 6 | Tag tauschen | In der Einheit: „Verschieben …“ → anderer Tag. Liegt dort eine Einheit, fragt die App „Tauschen?“. Bei `altDates` ein Knopf „Auf So 04.10. verschieben“. |
| 7 | Spickzettel | Antippen des Übungsnamens zeigt So geht's / Achte auf / Schwerer machen. Außerdem Tab **Plan** → Übungen: alle Übungen nach Bereich. |
| 8 | Tests | Test-Einträge in der Einheit öffnen eine eigene Maske mit den Feldern des Tests, Zielmarke und letztem Ergebnis. Tab **Plan** → Tests: je Test Tabelle (Eingangstest bis Test 5) und Kurve mit Zielmarke. Ergebnisse lassen sich nachträglich ergänzen (T7 Muskelkater). |
| 9 | Letzte Werte | Unter jeder Übung: „Letztes Mal (05.10.): 30 / 28 / 25 s · Hände auf Stufe“. Gesucht wird nach Übungs-Kennung über alle Einheiten und Phasen. |
| 10 | Countdown | Kopfzeile: „🏁 noch 271 Tage“ bis zum Datum aus `event`. |
| 11 | Ergebnis-Export | Tab **Plan** bzw. **Mehr** → „Trainingsprotokoll exportieren“ (JSON, Format Abschnitt 2). Der Excel-Export bekommt die Blätter **Plan-Einheiten**, **Plan-Sätze** und **Tests**. |
| 12 | Bestehendes bleibt | Gewicht, Kalorien, Wasser, Tagesziele, Verlauf, Backup. Das Backup enthält auch Plan und Protokoll. |

### 3.1 Vorbelegung beim Eintragen

- Feste Zahl im Plan (`3 × 12`): Zeile mit `12` vorbelegt.
- Bereich im Plan (`3 × 8–12`): der letzte eigene Wert dieser Übung, wenn er
  im Bereich liegt, sonst der untere Wert. So ist die „doppelte Steigerung“
  meist nur ein Antippen.
- kg und Variante: vom letzten Mal übernommen.
- Das Gefühl bleibt leer, bis es angetippt wird.
- Nur mit ✓ bestätigte Sätze werden gespeichert und exportiert. Nichts wird
  automatisch als „geschafft“ eingetragen.

### 3.2 Abschluss einer Einheit

Unten in der Einheit: **Erledigt** / **Teilweise** / **Ausgelassen**, dazu
freiwillig Gesamt-Anstrengung (1–10), tatsächliche Dauer und Notiz. Die
gewählte Fassung (Normal/Kurz/Zuhause) wird mitgespeichert.

## 4. Bildschirme

- **Heute:** Plan-Karte oben, darunter wie bisher Gewicht, Tagesziele,
  Wasser, Kalorien. (Was mit der alten Trainings-Karte passiert: Frage 8.1.)
- **Einheit** (neue Seite über Heute bzw. Woche): Kopf (Titel, Orte, Dauer,
  Anstrengung, Ziel, Hinweis), Umschalter, Einträge, Abschluss.
- **Plan** (neuer Tab zwischen Verlauf und Verwalten): Woche · Tests ·
  Übungen · Infos (Hilfetexte aus `guides`) · Import/Export.
- **Mehr:** zusätzlich „Trainingsprotokoll exportieren“; Backup inkl. Plan.

## 5. Datenhaltung in der App (technisch)

- Plan (Bibliotheken, Wochen, Tage, Import-Liste) in einem **eigenen
  Speicherbereich** `fitness-tracker:plan`, damit der Hauptspeicher klein und
  schnell bleibt. Geschätzte Größe für den ganzen Plan: unter 1 MB.
- Ergebnisse im Hauptspeicher (`fitness-tracker:v1`, Datenformat-Version 3):
  `planLog.sessions` (nach Einheiten-Kennung), `planLog.tests` (Liste),
  `planMoves` (Einheiten-Kennung → neues Datum). Migration von Version 2
  fügt nur leere Felder hinzu.
- Backup-Datei enthält zusätzlich den Plan-Speicher; Einspielen stellt beides
  wieder her. Alte Backups ohne Plan bleiben gültig.

## 6. Umsetzungsschritte

Jeder Schritt wird einzeln gebaut, getestet, veröffentlicht und vom Nutzer
auf dem Handy abgenommen.

| Schritt | Inhalt | Nötig bis |
|---|---|---|
| **1. Plan sehen** | Import mit Prüfung · Plan-Speicher + Backup · Heute-Karte + Einheit-Seite mit Umschalter (nur ansehen) · Spickzettel · Plan-Tab mit Woche und Infos · Countdown | **Do 01.10.** (erster Tag Startpaket) |
| **2. Eintragen** | Satz für Satz (alle Übungsarten, Schritte mit Notierfeld) · Vorbelegung · letzte Werte · Abschluss/Status · Verschieben/Tauschen | **Fr 02.10.** (erste Einheit mit Sätzen) |
| **3. Tests** | Test-Masken · nachträglich ergänzen · Tests-Übersicht mit Tabelle und Kurve | **Mo 12.10.** (Eingangstest) |
| **4. Export** | Trainingsprotokoll (JSON) · Excel-Blätter · Erfolgsquote „Plan-Einheiten erledigt“ | **So 18.10.** (Auswertung Eingangstest) |
| **5. Aufräumen** | Umgang mit den alten Challenge-Funktionen (Frage 8.1) · kleinere Wünsche aus den ersten Wochen | danach |

**Parallel im Trainingsplan-Projekt:** Plan-Datei für das **Startpaket**
erzeugen (vor Phase 1), mit `tools/check-plan.js` prüfen, dann aufs Handy.

## 7. Bewusst nicht

- Kein fest eingebauter Plan, keine automatische Planänderung durch die App.
- Keine Online-Verbindung, kein Konto, kein Sync, keine Uhr-/Samsung-Health-Anbindung.
- Kein Bearbeiten des Plans in der App (nur Verschieben/Tauschen). Änderungen
  am Inhalt macht Claude im Trainingsplan-Projekt.
- Pro Satz **ein** Wert, auch bei Übungen je Seite. Unterschiede zwischen
  links und rechts gehören in die Notiz.

**Ideen für später** (nicht Teil dieser Spec): Pausen-Timer nach jedem
bestätigten Satz (aus `restSec`) · Hinweis „oberes Ende in allen Sätzen
geschafft → nächste Woche schwerer“ · freie Zusatz-Einheit ohne Plan.

## 8. Geklärte Fragen (2026-09-28)

1. **Alte Challenge-Funktionen** (Workouts wie „Meltdown“, Übungszähler,
   Rekorde, Ruhetag-Varianten, Trainingsquote, Challenge-Badge):
   **Archiv.** Die Daten bleiben im Verlauf und im Excel-Export. Sobald ein
   Plan importiert ist, verschwindet die alte Trainings-Karte von der
   Heute-Seite (ab Schritt 1) und der Challenge-Badge wird zum Countdown.
   Erfolge und Verwalten räumt Schritt 5 auf.
2. **Plan-Karte oben auf Heute, Details auf eigener Seite:** ja.
3. **„Im Tank“ entfällt.** Pro Satz werden nur Wiederholungen bzw.
   Sekunden (und ggf. kg) abgefragt. Stattdessen gibt es pro Übung ein
   freiwilliges **Gefühl** mit drei Knöpfen: „zu hart“ · „genau richtig“ ·
   „hätte schwerer sein können“ (Vorschlag des Nutzers). Das reicht für die
   Steigerungsregel und ist ein Antippen statt einer Zahl pro Satz.
4. **Specs im öffentlichen GitHub-Repo:** ja. **Echte Plan-Dateien und
   Protokolle kommen nie ins Repo**, die liegen nur auf PC und Handy.

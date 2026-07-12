# Fitness Tracker (PWA)

Eine schlanke Web-App zum Tracken der 90-Tage-Challenge („Fit ohne Geräte", Mark Lauren):
Training, Kalorien pro Mahlzeit, Wasser und Gewicht – mit Excel-Export.

## Funktionen

- **Challenge-Zähler** – Startdatum einstellbar, Anzeige „Tag X / 90"
- **Training** – eigene Workouts definieren mit vier Auswertungsarten:
  - Möglichst viele Runden in X Minuten (AMRAP)
  - Feste Rundenzahl, Wiederholungen pro Runde zählen
  - Feste Aufgabe auf Zeit
  - Freies Ergebnis (Text)
  - plus **Ruhetag**-Markierung
- **Kalorien** – nummerierte Mahlzeiten (1., 2., 3. …) mit Uhrzeit, wiederverwendbarer
  Lebensmittel-Datenbank, Portionen-Multiplikator und Tagesziel-Fortschritt
- **Fasten-Ziel** – prüft, ob alle Mahlzeiten eines Tages in einem konfigurierbaren
  Essensfenster (Standard 6 h) lagen; Auswertung im Verlauf und im Excel-Export
- **Wasser** – Schnellbuttons (+200/300/500 ml), Tagesziel-Fortschritt
- **Gewicht** – tägliche Eingabe, Verlaufskurve, Differenz zum letzten Wert
- **Verlauf** – alle Tage im Überblick, antippen zum Nachtragen/Korrigieren
- **Excel-Export** – drei Blätter (Tagesübersicht, Mahlzeiten, Trainings), auf dem
  Handy direkt teilbar (Mail, WhatsApp, …)
- **Backup** – kompletter Export/Import als JSON

Alle Daten bleiben lokal im Browser (localStorage) – nichts verlässt das Gerät,
außer du exportierst selbst.

## Lokal starten (zum Testen am PC)

```
node server.js
```

Dann http://localhost:5173 öffnen. Vom Handy im gleichen WLAN erreichbar über
`http://<IP-des-PCs>:5173` – **Hinweis:** Offline-Modus und „App installieren"
funktionieren nur über HTTPS, dafür muss die App gehostet werden (z. B. GitHub
Pages, Cloudflare Pages, Netlify – alle kostenlos für statische Seiten).

## Auf dem Handy installieren

1. Die gehostete HTTPS-URL in Chrome öffnen
2. Menü (⋮) → **„App installieren"** bzw. „Zum Startbildschirm hinzufügen"
3. Die App startet dann wie eine normale Android-App und funktioniert offline

## Technik

- Reines HTML/CSS/JS, kein Build-Schritt
- [SheetJS](https://sheetjs.com) (lokal in `vendor/`) für den Excel-Export
- Service Worker (`sw.js`) für Offline-Betrieb — **bei Änderungen an den
  App-Dateien die Konstante `CACHE` in `sw.js` UND `APP_VERSION` in
  `js/app.js` hochzählen** (beide auf dieselbe Nummer), sonst sehen
  installierte Apps die alte Version. Die App zeigt die Version im
  „Mehr"-Tab an und bietet nach dem Laden eines Updates einen
  Neustart-Knopf an.
- Daten-Schlüssel im localStorage: `fitness-tracker:v1`

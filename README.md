# 🍞 BakeBuddy — Sauerteig Back-Assistent

Eine Progressive Web App (PWA) für Hobby-Bäcker mit Fokus auf Sauerteigbrot.

## Features

- **Rezeptverwaltung** — Rezepte mit Baker's Percentage (Mehl in Gramm, alles andere in % relativ zur Gesamtmehlmenge)
- **Rezept-Kalkulator** — Skalierung (0.5x–3x), automatische Grammberechnung, Hydration & Teigausbeute (TA)
- **Backplaner** — Rückwärtsplanung ab Zielzeitpunkt, visueller Zeitblocker (24h-Raster, Touch-Wischen)
- **Backprozess-Begleitung** — Schritt-für-Schritt mit Timern
- **Back-Tagebuch** — Bewertungen & Optimierungen pro Backergebnis
- **JSON-Export/Import** — Für iCloud Drive Backup, im Texteditor lesbar

## Tech Stack

- React 18 + Vite
- PWA (installierbar auf iPhone via "Zum Home-Bildschirm")
- Lokale Datenspeicherung (localStorage) + JSON-Export für iCloud
- Kein Backend, keine Cloud-Abhängigkeit

## Setup

```bash
# Dependencies installieren
npm install

# Dev-Server starten
npm run dev

# Production Build
npm run build

# Build lokal testen
npm run preview
```

## Auf dem iPhone nutzen

1. `npm run build` ausführen
2. `dist/`-Ordner auf einem Webserver hosten (z.B. GitHub Pages, Netlify, oder lokal)
3. URL in Safari öffnen
4. Teilen-Button → "Zum Home-Bildschirm"
5. BakeBuddy wird als App-Icon installiert (Vollbild, offline-fähig)

## Datenformat

Rezepte werden als JSON gespeichert. Beispiel-Struktur:

```json
{
  "ingredients": [
    { "name": "Weizenmehl 550", "grams": 400, "type": "mehl" },
    { "name": "Roggenmehl 1150", "grams": 100, "type": "mehl" },
    { "name": "Wasser", "percent": 68, "type": "wasser" },
    { "name": "Sauerteig Starter", "percent": 20, "type": "starter", "hydration": 100 },
    { "name": "Salz", "percent": 2, "type": "salz" }
  ]
}
```

Mehl = Gramm (Summe = 100% Basis). Alles andere = Baker's Percentage relativ zur Mehlsumme.

## Roadmap

- [ ] GitHub Pages Deployment (CI/CD)
- [ ] Native iOS App (SwiftUI) Migration
- [ ] Temperaturabhängige Garzeiten-Berechnung
- [ ] Foto-Upload im Tagebuch
- [ ] Rezept-Sharing via Link/QR

## Lizenz

Privates Projekt.

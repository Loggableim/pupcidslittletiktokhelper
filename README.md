# Pup Cids Little TikTok Helper

Ein einfach zu bedienendes Tool für TikTok LIVE Streaming mit Overlays, Alerts, Text-to-Speech und mehr.

---

## 🚀 Schnellstart

### Voraussetzungen

- **Node.js 18 oder höher** muss installiert sein
  - Download: [https://nodejs.org](https://nodejs.org)
  - Empfohlen: LTS Version (Long Term Support)

### Installation & Start

#### Windows:
1. Doppelklick auf `launcher.exe` (Grafischer Launcher mit Hintergrundbild und Fortschrittsanzeige)
2. Das war's! Der Launcher installiert automatisch alle benötigten Abhängigkeiten und öffnet das Dashboard

**Alternative:** Bei Problemen mit dem grafischen Launcher:
- Verwende `launcher-backup.exe` (Minimalistischer Launcher mit detailliertem Logging)
- Erstellt automatisch eine `launcher-debug.log` Datei zur Fehleranalyse
- Zeigt alle Schritte im Terminal-Fenster an
- Terminal bleibt geöffnet, um Fehler zu sehen

#### Linux:
1. Doppelklick auf `start-linux` (oder im Terminal: `./start-linux`)
2. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

#### Mac:
1. Doppelklick auf `start-mac` (oder im Terminal: `./start-mac`)
2. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

---

## 📖 Was macht der Launcher?

Der Launcher (`launcher.exe` für Windows, `start-linux` für Linux, `start-mac` für Mac) übernimmt automatisch:

✅ Prüft ob Node.js installiert ist  
✅ Installiert alle benötigten Abhängigkeiten (beim ersten Start)  
✅ Startet das Tool  
✅ Öffnet automatisch das Dashboard im Browser  

### Features des grafischen Launchers (launcher.exe):

- **Hintergrundbild**: Zeigt das Hintergrundbild `launcherbg.png` in voller Größe an
- **Fortschrittsbalken**: Prozentualer Fortschrittsbalken im unteren linken Bereich
- **Status-Updates**: Zeigt aktuelle Status-Meldungen während des Startvorgangs
- **Auto-Redirect**: Leitet automatisch zum Dashboard weiter, sobald das Tool gestartet ist
- **Hinweise**: Zeigt wichtige Hinweise (z.B. "npm install kann einige Minuten dauern")  

---

## 🔧 Weitere Informationen

- **Vollständige Dokumentation:** Siehe `app/README.md`
- **Features, Konfiguration, Troubleshooting:** Alle Details in `app/README.md`
- **Launcher Build-Anleitung:** Siehe `build-src/README.md`
- **Support:** [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

## 🎨 Branding

Das Tool verwendet das ltthappicon.png (Hund mit Brille und TikTok-Rahmen) als:
- **Launcher-Icon:** Windows-Programmsymbol für `launcher.exe`
- **Dashboard-Logo:** Seitennavigation im Browser-UI
- **Favicon:** Browser-Tab-Symbol

Icon-Datei: `app/ltthappicon.png`

---

## ⚠️ Hinweis

Wenn Node.js nicht installiert ist, erscheint eine Fehlermeldung mit Download-Link.

**Bei Problemen:**
1. Überprüfe ob Node.js korrekt installiert ist: `node --version`
2. **Verwende den Backup-Launcher:** `launcher-backup.exe` erstellt eine `launcher-debug.log` Datei mit detaillierten Informationen
3. Siehe `app/README.md` für Troubleshooting
4. Kontaktiere Support: loggableim@gmail.com

### Problemlösung mit dem Backup-Launcher

Wenn `launcher.exe` ein Terminal-Fenster öffnet, das sich sofort wieder schließt:
1. Verwende stattdessen `launcher-backup.exe`
2. Das Terminal bleibt geöffnet und zeigt alle Schritte an
3. Eine `launcher-debug.log` Datei wird erstellt mit detaillierten Informationen
4. Die Log-Datei kann zur Fehleranalyse an den Support geschickt werden

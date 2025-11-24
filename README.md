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
1. Doppelklick auf `launcher.exe` (visueller Launcher mit Fortschrittsanzeige)
2. **Alternative:** Doppelklick auf `start.exe` (Konsolen-Version)
3. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

**Weitere Alternativen:** Nutze `start.bat` wenn die .exe Dateien aus irgendeinem Grund nicht funktionieren

#### Linux:
1. Doppelklick auf `start-linux` (oder im Terminal: `./start-linux`)
2. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

**Alternative:** Nutze `start.sh` wenn die Binary nicht funktioniert

#### Mac:
1. Doppelklick auf `start-mac` (oder im Terminal: `./start-mac`)
2. Das war's! Das Tool installiert automatisch alle benötigten Abhängigkeiten und startet sich

**Alternative:** Nutze `start.sh` wenn die Binary nicht funktioniert

---

## 📖 Was macht der Launcher?

Der Launcher (`launcher.exe` / `start.exe` für Windows, `start-linux` für Linux, `start-mac` für Mac) übernimmt automatisch:

✅ Prüft ob Node.js installiert ist  
✅ Installiert alle benötigten Abhängigkeiten (beim ersten Start)  
✅ Startet das Tool  
✅ Öffnet automatisch das Dashboard im Browser  

### Unterschied zwischen launcher.exe und start.exe:

- **`launcher.exe`**: Grafischer Launcher mit Hintergrundbild und Fortschrittsbalken
  - Zeigt das Hintergrundbild `launcherbg.png` an
  - Zeigt einen prozentualen Fortschrittsbalken während des Starts
  - Modernes GUI-Erlebnis
  
- **`start.exe`**: Klassischer Konsolen-Launcher
  - Einfache Textausgabe in der Konsole
  - Leichtgewichtig und schnell

**Hinweis:** Falls die ausführbaren Dateien (.exe, start-linux, start-mac) Probleme machen, gibt es Fallback-Skripte: `start.bat` (Windows) und `start.sh` (Linux/Mac)  

---

## 🔧 Weitere Informationen

- **Vollständige Dokumentation:** Siehe `app/README.md`
- **Features, Konfiguration, Troubleshooting:** Alle Details in `app/README.md`
- **Support:** [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

## ⚠️ Hinweis

Wenn Node.js nicht installiert ist, erscheint eine Fehlermeldung mit Download-Link.

**Bei Problemen:**
1. Überprüfe ob Node.js korrekt installiert ist: `node --version`
2. Siehe `app/README.md` für Troubleshooting
3. Kontaktiere Support: loggableim@gmail.com

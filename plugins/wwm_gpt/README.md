# WWM GPT Plugin - "Wer wird Millionär" Quiz für TikTok

Ein interaktives Quizspiel nach dem Prinzip "Wer wird Millionär" mit GPT-5 Mini Integration für dynamische Fragenerzeugung.

## Features

### 🎮 Gameplay
- **Dynamische Fragenerzeugung** via GPT-5 Mini (gpt-4o-mini)
- **Live-Timer** mit visueller Anzeige (5-60 Sekunden konfigurierbar)
- **Team-Mechanik**: Team Fuchs vs Team Cid
- **Joker-System**:
  - 50:50 Joker (entfernt 2 falsche Antworten)
  - Extra-Zeit Joker (verlängert Timer)
- **Automatischer Spielablauf** mit konfigurierbarer Verzögerung

### 🎨 Design & Overlay
- **OBS-kompatibles Overlay** (1920x1080)
- **4 Theme-Presets**: Dark, Neon, Classic WWM, Custom
- **Vollständig anpassbar**:
  - Farben (Primary, Secondary, Background)
  - Schriftarten und -größen
  - Animationen (Slide, Fade, Zoom)
  - Sound-Effekte
- **Live-Anzeigen**:
  - Aktuelle Frage mit 4 Antworten
  - Countdown-Timer mit Farbwechsel
  - Team-Scores mit Balken
  - Top 10 Leaderboard
  - Antwort-Verteilung (Prozent-Balken)

### 👥 Team-System
- **Team-Beitritt** via Chat-Commands: `!join fuchs` / `!join cid`
- **Team-Antworten** via Mehrheitsvotum
- **Individuelle Scores** parallel zu Team-Scores
- **Konfigurierbare Teams**:
  - Namen, Farben, Icons (Emojis)

### 🎁 TikTok-Integration
- **Gift-basierte Joker**:
  - Rose (ID 5655) → 50:50 Joker
  - TikTok (ID 5827) → Extra-Zeit (+5s)
- **Chat-Commands** für Antworten: `A`, `B`, `C`, `D`
- **Mod-Commands**: `!wwm start/stop/next/skip/reset`

### 🗣️ Text-to-Speech
- **Automatische Fragenvorlesung** via TTS-Plugin
- **Konfigurierbar**:
  - Frage vorlesen
  - Antworten vorlesen
  - Stimmenauswahl (TikTok TTS)

### 🤖 GPT-5 Mini Integration
- **Fragenkategorien**: Allgemeinwissen, Popkultur, Wissenschaft, Geschichte, Sport, Geographie
- **Schwierigkeitsgrade**: Leicht, Mittel, Schwer, Gemischt
- **Intelligentes Caching**: Generierte Fragen werden gespeichert
- **Offline-Fallback**: Bei API-Fehler Zugriff auf lokale Fragenbank
- **Community-Fragen**: Import eigener Fragen via JSON

### 📊 Scoring & Statistiken
- **Persistente Highscores** mit Username, Punkten, Richtig/Falsch
- **Top 10 Leaderboard** im Overlay
- **Team-Scores** mit Live-Balken
- **Konfigurierbare Punktevergabe**:
  - Punkte pro richtiger Antwort (Standard: 100)
  - Punkte pro falscher Antwort (Standard: -25)

### 🛠️ Moderations-Tools
- **Admin-Controls**:
  - Spiel starten/stoppen
  - Nächste Frage / Überspringen
  - Force Correct (Team als richtig markieren)
  - Bonus-Punkte vergeben
- **Whitelist** für Mod-Commands
- **Session-Resume**: Spiel nach Absturz weiterspielen

### 📡 API-Endpoints

#### Config
- `GET /api/wwm_gpt/config` - Config abrufen
- `POST /api/wwm_gpt/config` - Config speichern

#### Game Control
- `POST /api/wwm_gpt/start` - Spiel starten
- `POST /api/wwm_gpt/stop` - Spiel stoppen
- `POST /api/wwm_gpt/next` - Nächste Frage
- `POST /api/wwm_gpt/skip` - Frage überspringen
- `GET /api/wwm_gpt/state` - Spielstatus abrufen

#### Questions
- `POST /api/wwm_gpt/questions/generate` - Fragen generieren (GPT)
- `GET /api/wwm_gpt/questions/cache` - Cache abrufen
- `DELETE /api/wwm_gpt/questions/cache` - Cache leeren
- `POST /api/wwm_gpt/questions/community` - Community-Fragen importieren

#### Scores
- `GET /api/wwm_gpt/scores?limit=10` - Top-Scores abrufen
- `POST /api/wwm_gpt/scores/reset` - Scores zurücksetzen

#### Moderation
- `POST /api/wwm_gpt/mod/force-correct` - Team als richtig markieren
- `POST /api/wwm_gpt/mod/bonus-points` - Bonus-Punkte vergeben

#### Jokers
- `GET /api/wwm_gpt/jokers` - Joker-Mapping abrufen
- `POST /api/wwm_gpt/jokers` - Joker-Mapping speichern

#### UI
- `GET /plugin/wwm_gpt/overlay` - OBS Overlay
- `GET /plugin/wwm_gpt/settings` - Settings-Panel

### 🔌 Socket.io Events

#### Emitted (vom Server)
- `wwm:state-update` - Vollständiger Spielzustand
- `wwm:config-update` - Config-Änderung
- `wwm:game-started` - Spiel gestartet
- `wwm:game-stopped` - Spiel beendet
- `wwm:question-start` - Neue Frage
- `wwm:question-end` - Frage beendet mit Ergebnis
- `wwm:timer-tick` - Timer-Update (jede Sekunde)
- `wwm:joker-activated` - Joker aktiviert
- `wwm:team-join` - User trat Team bei
- `wwm:answer-submitted` - Antwort abgegeben
- `wwm:scores-reset` - Scores zurückgesetzt

#### Received (vom Client)
- `wwm:get-state` - State anfordern
- `wwm:start-game` - Spiel starten
- `wwm:stop-game` - Spiel stoppen
- `wwm:next-question` - Nächste Frage
- `wwm:skip-question` - Frage überspringen

## Installation

1. Plugin ist bereits im `/plugins/wwm_gpt/` Verzeichnis
2. OpenAI API Key in den Settings eintragen
3. Plugin aktivieren (standardmäßig aktiviert)
4. Server neustarten

## Konfiguration

### Settings-Panel
Öffne das Dashboard und navigiere zu "Plugins" → "WWM GPT Settings"

#### Gameplay-Tab
- Timer-Dauer (5-60 Sekunden)
- Fragenquelle (GPT / Lokal / Community)
- Schwierigkeitsgrad (Leicht / Mittel / Schwer / Gemischt)
- Punktevergabe (Richtig / Falsch)
- Auto-Next (Automatisch zur nächsten Frage)

#### Design-Tab
- Theme-Presets (Dark, Neon, Classic, Custom)
- Custom Colors (Primary, Secondary, Background)
- Schriftart und -größe
- Animationstyp (Slide, Fade, Zoom)
- Avatare und Sound-Effekte

#### Teams-Tab
- Team 1: Name, Farbe, Icon
- Team 2: Name, Farbe, Icon

#### Joker-Tab
- 50:50 Joker: Gift-ID, Animation, Aktiviert
- Extra-Zeit Joker: Gift-ID, Extra-Sekunden, Animation, Aktiviert

#### TTS-Tab
- TTS aktivieren
- Frage vorlesen
- Antworten vorlesen
- Stimmenauswahl

#### OpenAI-Tab
- API Key
- Model (gpt-4o-mini empfohlen)
- Temperature (0.7 Standard)
- Kategorien (Komma-getrennt)
- Fragen generieren / Cache leeren

#### Scores-Tab
- Top 100 Spieler anzeigen
- Scores zurücksetzen

### OBS Setup

1. **Browser Source hinzufügen**
   - URL: `http://localhost:3000/plugin/wwm_gpt/overlay`
   - Breite: 1920
   - Höhe: 1080
   - FPS: 30
   - ✅ Shutdown source when not visible
   - ✅ Refresh browser when scene becomes active

2. **Custom CSS** (optional):
   ```css
   body { background-color: rgba(0, 0, 0, 0); }
   ```

## Chat-Commands

### Spieler
- `!join fuchs` oder `!team fuchs` - Team Fuchs beitreten
- `!join cid` oder `!team cid` - Team Cid beitreten
- `A`, `B`, `C`, `D` - Antwort abgeben (nur während aktiver Frage)

### Moderatoren (konfigurierbar)
- `!wwm start` - Spiel starten
- `!wwm stop` - Spiel stoppen
- `!wwm next` - Nächste Frage
- `!wwm skip` - Frage überspringen
- `!wwm reset` - Spiel zurücksetzen

## GPT-Fragenerzeugung

### OpenAI API Key
1. Gehe zu https://platform.openai.com/api-keys
2. Erstelle einen API Key
3. Trage ihn in Settings → OpenAI → API Key ein

### Fragen generieren
1. Settings → OpenAI → "10 Fragen generieren"
2. Fragen werden im Cache gespeichert
3. Bei Bedarf werden automatisch neue Fragen generiert

### Kategorien anpassen
Settings → OpenAI → Kategorien (Komma-getrennt):
```
Allgemeinwissen, Popkultur, Wissenschaft, Geschichte, Sport, Geographie, Filme, Musik, Gaming
```

## Community-Fragen importieren

### Format (JSON)
```json
[
  {
    "question": "Was ist die Hauptstadt von Deutschland?",
    "answers": {
      "A": "Berlin",
      "B": "München",
      "C": "Hamburg",
      "D": "Köln"
    },
    "correct": "A",
    "category": "Geographie",
    "difficulty": "easy"
  }
]
```

### Import via API
```bash
curl -X POST http://localhost:3000/api/wwm_gpt/questions/community \
  -H "Content-Type: application/json" \
  -d @community_questions.json
```

## Joker-Mapping

### Standard-Mapping (joker_map.json)
```json
{
  "5655": { "type": "fiftyFifty", "name": "Rose" },
  "5827": { "type": "extraTime", "name": "TikTok", "seconds": 5 }
}
```

### Anpassen
Settings → Joker → Gift-IDs eintragen und speichern

## Persistente Daten

Alle Daten werden in `/plugins/wwm_gpt/data/` gespeichert:

- `config.json` - Alle Einstellungen
- `questions_cache.json` - Generierte Fragen
- `scores.json` - Highscores
- `session.json` - Aktueller Spielstand
- `joker_map.json` - Gift → Joker Mapping
- `community_questions.json` - Community-Fragen

## Troubleshooting

### Overlay zeigt nichts an
1. Prüfe Browser-Console auf Fehler
2. Stelle sicher dass Server läuft
3. Prüfe ob Plugin aktiviert ist
4. Starte Browser Source neu (F5)

### GPT generiert keine Fragen
1. Prüfe OpenAI API Key
2. Prüfe API-Guthaben
3. Siehe Server-Logs für Fehlermeldungen
4. Fallback auf lokale Fragen

### Joker funktionieren nicht
1. Prüfe Gift-IDs in joker_map.json
2. Stelle sicher dass Joker aktiviert sind
3. User muss in einem Team sein

### TTS funktioniert nicht
1. TTS-Plugin muss aktiviert sein
2. TTS in WWM-Settings aktivieren
3. Stimme auswählen

## Credits

**Plugin:** WWM GPT
**Version:** 1.0.0
**Author:** TikTok Stream Tool
**License:** MIT

Entwickelt für **Pup Cid's Little TikTok Helper**

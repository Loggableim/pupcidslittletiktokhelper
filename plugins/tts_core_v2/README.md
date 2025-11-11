# 🎙️ TTS Core V2 - Advanced Text-to-Speech Plugin

Ein vollständiges, produktionsreifes TTS-System für TikTok Live Streams mit erweiterten Features für Moderation, Mehrsprachunterstützung und Zuschauer-Interaktion.

## ✨ Features

### 🌍 Mehrsprachige Erkennung
- **Automatische Spracherkennung** pro Kommentar mit `franc-min`
- **Intelligentes Voice-Mapping**: Sprache → passende TikTok-Stimme
- Unterstützt: Englisch, Deutsch, Spanisch, Französisch, Portugiesisch, Japanisch, Koreanisch, Indonesisch
- Fallback auf konfigurierbare Default-Stimme

### 👤 Username-Vorlesen
- Optional: Username vor Nachricht vorlesen
- Separate, konfigurierbare Stimme für Usernamen
- Format: `"<username> says: <message>"`
- Ideal für Community-Engagement

### ⏱️ Queue-Management & Throttling
- **Async Queue** mit konfigurierbarer Verzögerung (Standard: 1s)
- Max. Queue-Größe: 100 Items (konfigurierbar)
- Backpressure-Handling bei voller Queue
- Echtzeit-Status-Updates über Socket.IO
- Automatische Queue-Visualisierung im UI

### 🚫 Wortfilter & Fäkalsprache-Filter
- **Drei Filter-Modi**:
  - **Censor**: Ersetzt Wörter durch `***`
  - **Skip**: Überspringt gesamte Nachricht
  - **Beep**: Ersetzt durch `[BEEP]`
- **Drei Schweregrade**:
  - Mild: Nur extreme Wörter
  - Standard: Übliche Filter
  - Strict: Alle Schimpfwörter
- Editierbare Blacklist in `banned_words.json`
- URL-Filter (automatisch)
- Regex-Unterstützung

### 🛡️ Moderationssystem
- **Mute-Funktionen**:
  - Zeitbasiert: 5, 15, 30, 60 Minuten (konfigurierbar)
  - Permanent-Ban
  - Persistent gespeichert in `muted_users.json`
- **Chat-Log-Interface**:
  - Zeigt letzte 100 Chat-Events
  - Live-Updates via Socket.IO
  - Inline-Moderation mit Buttons
- **Keyboard-Shortcuts**:
  - `CTRL+5`: Mute 5 Minuten
  - `CTRL+6`: Mute 15 Minuten
  - `CTRL+7`: Permanent Ban
- Automatische Cleanup-Timer für abgelaufene Mutes

### 🎯 Feedback-Loop für Zuschauer
- **Emoji-basierte Stimmenwahl** (aktivierbar)
- **Geschenk-basierte Stimmenwahl**:
  - Mapping: Gift → Voice-ID
  - Persistent für User-Session
- Bestätigung an Zuschauer via Socket.IO

### 🔒 Teamlevel-Freigabe
- Mindest-Teamlevel konfigurierbar (Standard: 0 = alle)
- **Whitelist-System**: Admins können User manuell freigeben
- Bypass für System-Nachrichten (Follows, Gifts, etc.)

### 🎤 TikTok TTS API Integration
- **Offizielle TikTok API** mit Fallback
- **Rate-Limiting**: Max. 1 Request/Sekunde
- **Retry-Logic**: 3 Versuche mit exponential backoff
- **75+ Stimmen** verfügbar:
  - Disney-Characters (Ghostface, Chewbacca, C3PO, Stitch, etc.)
  - Standard-Stimmen (Male/Female)
  - Mehrsprachige Stimmen

### 📊 Vollständiges Web-UI
- **6 Tabs**:
  1. **General**: Grundeinstellungen, Volume, Speed, Queue
  2. **Voices**: Stimmen-Übersicht & TTS-Test
  3. **Filter**: Wortfilter & Fäkalsprache-Filter
  4. **Moderation**: Chat-Log & Mute-Management
  5. **Queue**: Echtzeit-Status & Queue-Items
  6. **Events**: Event-Ankündigungen & Teamlevel
- Responsive Design
- Live-Updates via Socket.IO
- Gradient-Design (lila/blau)

### 🔔 Event-Hooks (Abwärtskompatibel)
- `on_chat`: Chat-Nachrichten (Haupt-TTS-Trigger)
- `on_gift`: Geschenke (optional ankündigen)
- `on_follow`: Follows (optional ankündigen)
- `on_subscribe`: Subscribes (optional ankündigen)
- `on_share`: Shares (optional ankündigen)

### 📝 Logging & Error-Handling
- Plugin-spezifisches Logging via `api.log()`
- Fehlerbehandlung in allen API-Calls
- Retry-Logic mit Logging
- Performance-Monitoring (Queue-Warnungen)

## 📦 Installation

1. **Plugin aktivieren**:
   ```bash
   # Plugin-Status überprüfen
   GET /api/plugins

   # Plugin aktivieren
   POST /api/plugins/tts_core_v2/enable
   ```

2. **Dependencies installieren** (bereits im Projekt):
   ```bash
   npm install
   ```
   - `axios`: HTTP-Client
   - `franc-min`: Spracherkennung

3. **Plugin in Server laden**:
   - Server neu starten oder Hot-Reload nutzen
   - Plugin wird automatisch geladen wenn `enabled: true`

## ⚙️ Konfiguration

### Config-Dateien

#### `config.json`
```json
{
  "default_voice": "en_us_001",
  "include_username": true,
  "username_voice": "en_us_ghostface",
  "queue_delay_ms": 1000,
  "max_queue_size": 100,
  "min_team_level": 0,
  "enable_language_detection": true,
  "enable_word_filter": true,
  "filter_mode": "censor",
  "profanity_level": "standard",
  "enable_emoji_voice_selection": false,
  "enable_gift_voice_selection": false,
  "volume": 80,
  "speed": 1.0,
  "max_text_length": 300,
  "announce_gifts": false,
  "announce_follows": false,
  "announce_subscribes": false,
  "announce_shares": false
}
```

#### `banned_words.json`
```json
[
  "http", "https", "www.", ".com",
  "fuck", "shit", "bitch"
]
```

#### `muted_users.json`
```json
{
  "username123": {
    "permanent": false,
    "until": 1699876543210,
    "mutedAt": 1699876000000
  }
}
```

### Web-UI

Zugriff über: `http://localhost:3000/plugins/tts_core_v2/ui.html`

## 🔌 API-Endpoints

### Konfiguration
- `GET /api/tts-v2/config` - Config abrufen
- `POST /api/tts-v2/config` - Config aktualisieren

### Stimmen
- `GET /api/tts-v2/voices` - Alle verfügbaren Stimmen

### Queue
- `GET /api/tts-v2/queue` - Queue-Status
- `POST /api/tts-v2/queue/clear` - Queue leeren

### Wortfilter
- `GET /api/tts-v2/banned-words` - Bannierte Wörter
- `POST /api/tts-v2/banned-words` - Wort hinzufügen
- `DELETE /api/tts-v2/banned-words` - Wort entfernen

### Moderation
- `GET /api/tts-v2/muted-users` - Gemutete User
- `POST /api/tts-v2/mute` - User muten
  ```json
  { "username": "user123", "duration": 5, "permanent": false }
  ```
- `POST /api/tts-v2/unmute` - User entmuten

### Chat-Log
- `GET /api/tts-v2/chat-log` - Letzte 100 Chat-Events

### Test
- `POST /api/tts-v2/test` - TTS testen
  ```json
  { "text": "Hello World", "voice": "en_us_001" }
  ```

### Whitelist
- `POST /api/tts-v2/whitelist` - User zur Teamlevel-Whitelist hinzufügen
- `DELETE /api/tts-v2/whitelist` - User von Whitelist entfernen

## 🎯 Verwendung

### 1. Chat-TTS (Automatisch)
Alle Chat-Nachrichten werden automatisch verarbeitet:
- Spracherkennung (falls aktiviert)
- Wortfilter
- Teamlevel-Check
- Mute-Check
- → In Queue eingereiht

### 2. Event-Ankündigungen
Aktiviere in Settings → Events:
- Geschenke ankündigen
- Follows ankündigen
- Subscribes ankündigen
- Shares ankündigen

### 3. Moderation
**Web-UI**:
- Öffne Moderation-Tab
- Klicke auf Buttons: `5 Min`, `15 Min`, `Ban`

**Keyboard-Shortcuts**:
- Hover über Chat-Entry
- `CTRL+5`: 5 Minuten Mute
- `CTRL+6`: 15 Minuten Mute
- `CTRL+7`: Permanent Ban

### 4. Wortfilter anpassen
- Öffne Filter-Tab
- Füge Wörter hinzu
- Wähle Modus: Censor / Skip / Beep
- Wähle Schweregrad: Mild / Standard / Strict

### 5. TTS testen
- Öffne Voices-Tab
- Text eingeben
- Stimme wählen
- "TTS testen" klicken

## 🔧 Technische Details

### Plugin-Architektur
- **Plugin-Klasse**: `TTSCoreV2Plugin`
- **API**: `PluginAPI` (bereitgestellt vom Server)
- **Event-System**: `registerTikTokEvent()`
- **Routes**: `api.registerRoute()`
- **Socket.IO**: Real-time Updates

### Spracherkennung
- **Library**: `franc-min` (ISO 639-3 Codes)
- **Mapping**: `LANGUAGE_TO_VOICE`
- **Fallback**: Default Voice

### TTS-Generierung
1. **Rate-Limiting**: Min. 1s zwischen Requests
2. **Primary API**: `api16-normal-c-useast1a.tiktokv.com`
3. **Fallback API**: `tiktok-tts.weilnet.workers.dev`
4. **Retry**: 3 Versuche, exponential backoff
5. **Format**: Base64-encoded MP3

### Queue-Verarbeitung
1. Item aus Queue nehmen
2. Audio an Frontend senden (`tts-v2:play`)
3. Geschätzte Dauer berechnen
4. Delay + Queue-Verzögerung warten
5. Nächstes Item

### Persistenz
- **Config**: `config.json`
- **Banned Words**: `banned_words.json`
- **Muted Users**: `muted_users.json`
- Auto-Speicherung bei Änderungen

## 🚀 Performance

- **Queue-Größe**: Max. 100 Items (konfigurierbar)
- **Rate-Limit**: 1 Request/Sekunde
- **Memory**: Chat-Log max. 100 Einträge
- **Cleanup**: Expired Mutes alle 60 Sekunden

## 🔒 Sicherheit

- **Input-Validierung**: Alle API-Endpoints
- **SQL-Injection-Schutz**: Prepared Statements (Database-Modul)
- **XSS-Schutz**: HTML-Escaping im Frontend
- **CSRF**: Socket.IO-basiert
- **Rate-Limiting**: TikTok API

## 📊 Logging

Logs erscheinen in:
- Server-Konsole: `[Plugin:tts_core_v2] Message`
- Winston-Logger (falls konfiguriert)
- Chat-Log-Interface (letzte 100)

## 🐛 Troubleshooting

### TTS spielt nicht ab
1. Prüfe Queue-Status (Queue-Tab)
2. Prüfe Browser-Konsole (Audio-Playback)
3. Prüfe Server-Logs (API-Fehler)

### Spracherkennung funktioniert nicht
1. Prüfe ob `enable_language_detection` aktiviert
2. Prüfe Mindest-Textlänge (3 Zeichen)
3. Fallback: Default Voice wird verwendet

### User wird nicht gemutet
1. Prüfe `muted_users.json` Syntax
2. Prüfe Timestamp (muss in Zukunft liegen)
3. Prüfe Server-Logs

### Queue ist voll
1. Erhöhe `max_queue_size` in Config
2. Erhöhe `queue_delay_ms` (schnellere Abarbeitung)
3. Aktiviere strengere Filter

## 📝 Changelog

### v2.0.0 (2025-01-11)
- ✨ Initial Release
- ✨ Vollständige Implementierung aller Features
- ✨ Web-UI mit 6 Tabs
- ✨ Mehrsprachunterstützung (8 Sprachen)
- ✨ Moderation mit Mute/Ban
- ✨ Wortfilter & Fäkalsprache-Filter
- ✨ Teamlevel-Kontrolle
- ✨ Feedback-Loop (Emoji/Gift)
- ✨ 75+ TikTok-Stimmen
- ✨ Vollständige API-Dokumentation

## 🤝 Support

Bei Fragen oder Problemen:
- GitHub Issues: [Repository-URL]
- Discord: [Server-Link]
- Dokumentation: `/wiki`

## 📄 Lizenz

MIT License - siehe Haupt-Repository

---

**Entwickelt mit ❤️ für die TikTok Live Community**

# 🎥 TikTok LIVE Stream Tool

**Kostenlose, lokal hostbare Open-Source-Alternative zu Tikfinity und Tiktory**

Professionelles Tool für TikTok LIVE Streamer mit Overlays, Alerts, Text-to-Speech und Event-Automatisierung. Komplett kostenfrei, keine Cloud-Abhängigkeiten, volle Kontrolle über deine Daten!

---

## ✨ Features

### 🔗 TikTok Live Integration
- ✅ Live-Verbindung zu TikTok-Streams über Username
- ✅ Echtzeit-Events: Gifts, Follows, Shares, Likes, Chat, Subscriptions
- ✅ Auto-Reconnect bei Verbindungsabbruch
- ✅ Live-Statistiken (Viewer, Likes, Coins, Followers)

### 🎤 Text-to-Speech (TTS)
- ✅ 50+ TikTok-Stimmen (inkl. Ghostface, C3PO, Chewbacca, Stitch, etc.)
- ✅ User-spezifisches Voice-Mapping (jeder User kann eigene Stimme haben)
- ✅ Automatisches TTS für Chat-Nachrichten (optional)
- ✅ Blacklist für unerwünschte Wörter/URLs
- ✅ Queue-System (keine Überlappungen)

### 🔔 Alert-System
- ✅ Anpassbare Alerts für alle Event-Typen
- ✅ Sound + Text + Bild/GIF Support
- ✅ Template-System mit Variablen (`{username}`, `{coins}`, etc.)
- ✅ Alert-Queue mit smooth Animationen
- ✅ Mindest-Coins-Filter für Gift-Alerts

### 🖼️ OBS Browser Source Overlay
- ✅ Transparentes Full-HD-Overlay (1920x1080)
- ✅ Alert-Display mit Animationen
- ✅ Live-Chat-Anzeige
- ✅ Event-Feed (Gifts, Follows, Shares)
- ✅ Coins-Goal-Bar (Fortschrittsanzeige)
- ✅ Drag & Drop in OBS

### ⚡ Event-Automation (Flows)
- ✅ "Wenn-Dann"-Automatisierungen
- ✅ Trigger: Gift (mit Coin-Bedingung), Follow, Chat, etc.
- ✅ Actions: TTS, Alert, Sound, Webhook, File-Log, Delay
- ✅ Unbegrenzte Flows erstellbar
- ✅ Enable/Disable Toggle

### 📊 Dashboard
- ✅ Modernes Web-Interface (Tailwind CSS)
- ✅ Live-Event-Log
- ✅ Voice-Mapping-Verwaltung
- ✅ Settings (TTS, Alerts, etc.)
- ✅ Flow-Management
- ✅ Echtzeit-Stats

### 💾 Lokale Datenspeicherung
- ✅ SQLite-Datenbank (keine Cloud erforderlich)
- ✅ User-Voice-Mappings gespeichert
- ✅ Event-Logs (optional, für Analytics)
- ✅ Profile-System (verschiedene Configs speichern)

---

## 🚀 Installation

### Voraussetzungen:
- **Node.js** 16 oder höher ([Download](https://nodejs.org/))
- Moderner Browser (Chrome, Firefox, Edge)
- OBS Studio oder Streamlabs OBS (für Overlays)

### Schritt 1: Repository klonen oder herunterladen

```bash
git clone https://github.com/yourusername/tiktok-stream-tool.git
cd tiktok-stream-tool
```

Oder ZIP herunterladen und entpacken.

### Schritt 2: Dependencies installieren

```bash
npm install
```

### Schritt 3: Server starten

```bash
npm start
```

Das Dashboard öffnet sich automatisch im Browser unter `http://localhost:3000`

---

## 📖 Erste Schritte

### 1. Mit TikTok Live verbinden

1. Öffne das Dashboard: `http://localhost:3000`
2. Gib deinen **TikTok-Username** ein (ohne @)
3. Klicke auf **"Connect"**
4. Warte auf Status "🟢 Connected"

**Wichtig:** Du musst LIVE sein auf TikTok, bevor du dich verbindest!

### 2. OBS Studio einrichten

1. Öffne **OBS Studio**
2. Klicke auf **"+"** unter Sources (Quellen)
3. Wähle **"Browser Source"** (Browser-Quelle)
4. Gib einen Namen ein (z.B. "TikTok Overlay")
5. Kopiere die URL aus dem Dashboard (Tab "Overlays"):
   ```
   http://localhost:3000/overlay.html
   ```
6. Setze:
   - **Width (Breite):** 1920
   - **Height (Höhe):** 1080
7. **Entferne Häkchen** bei "Shutdown source when not visible"
8. Klicke **OK**

Fertig! Alerts, Chat und Events erscheinen jetzt im Overlay.

### 3. Voice-Mapping einrichten (optional)

Im Dashboard → Tab **"Voice Mapping"**:

1. Klicke **"+ Add User"**
2. Gib den TikTok-Username ein
3. Wähle eine Stimme (z.B. "Ghostface", "C3PO", "Deutsch Männlich")
4. Speichern

Ab jetzt wird dieser User immer mit der gewählten Stimme vorgelesen!

### 4. TTS für Chat aktivieren

Im Dashboard → Tab **"Settings"**:

1. Aktiviere **"Enable TTS for Chat Messages"**
2. Wähle **Default Voice** (für neue/unbekannte User)
3. Passe **Volume** und **Speed** an
4. Klicke **"Save Settings"**

Jetzt werden Chat-Nachrichten automatisch vorgelesen!

---

## ⚙️ Erweiterte Konfiguration

### Flows erstellen (Event-Automatisierung)

**Beispiel: Epic Gift Alert ab 1000 Coins**

1. Dashboard → Tab **"Flows"**
2. Klicke **"+ Create Flow"** (in der finalen Version würde ein Modal erscheinen)

Aktuell kannst du Flows direkt über die API erstellen:

```bash
curl -X POST http://localhost:3000/api/flows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Epic Gift Alert",
    "trigger_type": "gift",
    "trigger_condition": {
      "operator": ">=",
      "field": "coins",
      "value": 1000
    },
    "actions": [
      {
        "type": "tts",
        "text": "WOW! {username} sent {gift_name}! THANK YOU SO MUCH!",
        "voice": "en_us_ghostface"
      },
      {
        "type": "alert",
        "text": "EPIC GIFT from {username}!",
        "duration": 8,
        "volume": 100
      }
    ],
    "enabled": true
  }'
```

### Verfügbare Flow-Actions:

| Action-Typ | Beschreibung | Parameter |
|------------|--------------|-----------|
| `tts` | Text-to-Speech abspielen | `text`, `voice` |
| `alert` | Alert anzeigen | `text`, `duration`, `volume` |
| `sound` | Sound-Datei abspielen | `file`, `volume` |
| `webhook` | HTTP-Request senden | `url`, `method`, `body` |
| `write_file` | In Datei schreiben | `file_path`, `content`, `append` |
| `delay` | Pause einfügen | `duration` (ms) |

### Alert-Konfiguration anpassen

```bash
curl -X POST http://localhost:3000/api/alerts/gift \
  -H "Content-Type: application/json" \
  -d '{
    "sound_file": "epic_gift.mp3",
    "sound_volume": 100,
    "text_template": "{username} sent {gift_name} x{repeat_count}! ({coins} coins)",
    "duration": 6,
    "enabled": true
  }'
```

---

## 🎨 Verfügbare TTS-Stimmen

### Englisch - Characters
- `en_us_ghostface` - Ghostface (Scream)
- `en_us_chewbacca` - Chewbacca (Star Wars)
- `en_us_c3po` - C3PO (Star Wars)
- `en_us_stitch` - Stitch (Lilo & Stitch)
- `en_us_stormtrooper` - Stormtrooper (Star Wars)
- `en_us_rocket` - Rocket (Guardians of Galaxy)

### Englisch - Standard
- `en_male_narration` - Male Narrator
- `en_male_funny` - Male Funny
- `en_female_emotional` - Female Emotional
- `en_female_samc` - Female Friendly
- `en_us_001` - US Female 1
- `en_us_002` - US Female 2
- `en_us_006` - US Male 1
- `en_us_007` - US Male 2

### Deutsch
- `de_001` - Deutsch Männlich
- `de_002` - Deutsch Weiblich

### Weitere Sprachen
- `es_002` - Spanisch Male
- `fr_001` - Französisch Male
- `fr_002` - Französisch Female
- `pt_female` - Portugiesisch Female
- `jp_001` - Japanisch Female
- `kr_002` - Koreanisch Male

...und viele mehr! (Über 50 Stimmen verfügbar)

---

## 🔧 Troubleshooting

### Problem: "Connection failed"

**Lösung:**
- Stelle sicher, dass du **LIVE** bist auf TikTok
- Überprüfe den Username (ohne @)
- Warte 10-15 Sekunden nach Start des Streams
- Bei "User offline" Fehler: Stream neu starten

### Problem: TTS funktioniert nicht

**Lösung:**
- Überprüfe Internet-Verbindung (TTS-API benötigt Internet)
- Überprüfe Settings → TTS Volume (nicht 0)
- Checke Browser-Konsole für Fehler
- TikTok TTS API könnte temporär down sein

### Problem: Overlay zeigt nichts in OBS

**Lösung:**
- Überprüfe URL: `http://localhost:3000/overlay.html`
- Stelle sicher, dass Server läuft
- Rechtsklick auf Browser Source → "Refresh"
- Überprüfe OBS-Logs für Fehler

### Problem: Alerts erscheinen nicht

**Lösung:**
- Überprüfe Settings → Alerts sind enabled
- Bei Gift-Alerts: Mindest-Coins-Filter prüfen
- Checke Browser-Konsole (F12) für Fehler
- Test-Alert über API senden:
  ```bash
  curl -X POST http://localhost:3000/api/alerts/test \
    -H "Content-Type: application/json" \
    -d '{"type": "gift", "data": {"username": "TestUser", "giftName": "Rose", "coins": 100}}'
  ```

### Problem: Port 3000 already in use

**Lösung:**
```bash
# Custom Port verwenden
PORT=3001 npm start
```

Dann URL anpassen: `http://localhost:3001`

---

## 📁 Projekt-Struktur

```
tiktok-stream-tool/
│
├── server.js                 # Haupt-Server
├── package.json             # Dependencies
├── database.db              # SQLite Datenbank (wird erstellt)
│
├── modules/
│   ├── database.js          # Datenbank-Funktionen
│   ├── tiktok.js            # TikTok Live Connector
│   ├── tts.js               # Text-to-Speech
│   ├── alerts.js            # Alert-System
│   └── flows.js             # Event-Automation
│
├── public/
│   ├── dashboard.html       # Control-Panel
│   ├── overlay.html         # OBS Browser Source
│   │
│   ├── js/
│   │   └── dashboard.js     # Dashboard-Logik
│   │
│   └── assets/
│       ├── sounds/          # Alert-Sounds (User-Upload)
│       └── images/          # Alert-Bilder
│
└── README.md
```

---

## 🛠️ Development

### Development-Modus mit Auto-Reload

```bash
npm install -g nodemon
npm run dev
```

### API-Endpunkte

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/connect` | POST | TikTok-Verbindung herstellen |
| `/api/disconnect` | POST | TikTok-Verbindung trennen |
| `/api/status` | GET | Connection-Status abrufen |
| `/api/voices` | GET | User-Voice-Mappings abrufen |
| `/api/voices` | POST | Voice-Mapping hinzufügen |
| `/api/voices/:username` | DELETE | Voice-Mapping löschen |
| `/api/voices/list` | GET | Verfügbare Stimmen abrufen |
| `/api/settings` | GET | Settings abrufen |
| `/api/settings` | POST | Settings speichern |
| `/api/flows` | GET | Flows abrufen |
| `/api/flows` | POST | Flow erstellen |
| `/api/flows/:id` | PUT | Flow bearbeiten |
| `/api/flows/:id` | DELETE | Flow löschen |
| `/api/flows/:id/toggle` | POST | Flow aktivieren/deaktivieren |
| `/api/alerts` | GET | Alert-Configs abrufen |
| `/api/alerts/:type` | POST | Alert-Config setzen |
| `/api/alerts/test` | POST | Test-Alert senden |
| `/api/tts/test` | POST | TTS testen |

---

## 🌟 Geplante Features (Roadmap)

- [ ] 🎮 Minecraft RCON Integration
- [ ] 🎵 Spotify Now Playing Display
- [ ] 📊 Analytics-Dashboard mit Charts
- [ ] 🔗 Discord Webhook Integration
- [ ] 📱 Mobile-Responsive Dashboard
- [ ] 🌍 Multi-Language Support (i18n)
- [ ] 🎨 Theme-System (Custom Colors)
- [ ] 💾 Profile Import/Export
- [ ] 🎤 Custom TTS-Provider (Google, Amazon Polly)
- [ ] 📹 Stream-Recorder
- [ ] 🏆 Leaderboard (Top Gifters, etc.)

---

## 🤝 Contributing

Contributions sind willkommen!

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/AmazingFeature`)
3. Commit deine Änderungen (`git commit -m 'Add AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

---

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei

---

## 🙏 Credits

- **TikTok Live Connector:** [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector)
- **TikTok TTS API:** [tiktok-tts](https://github.com/oscie57/tiktok-voice)
- **UI Framework:** [Tailwind CSS](https://tailwindcss.com/)

---

## ⚠️ Disclaimer

Dieses Tool ist nicht offiziell von TikTok unterstützt oder verbunden. Die Nutzung erfolgt auf eigene Verantwortung. Beachte die TikTok-Nutzungsbedingungen.

---

## 💬 Support

Bei Fragen oder Problemen:
- Öffne ein [GitHub Issue](https://github.com/yourusername/tiktok-stream-tool/issues)
- Checke die [Troubleshooting-Sektion](#troubleshooting)

---

**Made with ❤️ for the TikTok Streaming Community**

Viel Erfolg mit deinen Streams! 🎉

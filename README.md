# 🐾 Pup Cid´s Little Tiktok Helper

**Die ultimative kostenlose Open-Source-Alternative zu Tikfinity und Tiktory**

Professionelles All-in-One-Tool für TikTok LIVE Streamer mit erweiterten Features: Overlays, Alerts, Text-to-Speech, Soundboard, Multi-Goal-System, Event-Automatisierung und User-Profile-Management. Komplett kostenfrei, keine Cloud-Abhängigkeiten, volle Kontrolle über deine Daten!

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18.0.0+-green.svg)](https://nodejs.org/)
[![TikTok](https://img.shields.io/badge/TikTok-LIVE-ff0050.svg)](https://www.tiktok.com/)

---

## 🎯 Warum "Pup Cid´s Little Tiktok Helper"?

| Feature | Tikfinity/Tiktory | Pup Cid's Helper |
|---------|-------------------|------------------|
| **Preis** | 10-30€/Monat | **Kostenlos** ✅ |
| **Datenschutz** | Cloud-basiert | **Lokal** ✅ |
| **Anpassbar** | Limitiert | **Open-Source** ✅ |
| **Soundboard** | Basis | **100k+ Sounds (MyInstants)** ✅ |
| **Goals** | 1 Goal | **4 separate Goals** ✅ |
| **Flows** | Keine | **Unbegrenzte Automatisierungen** ✅ |
| **User-Profile** | Keine | **Multi-User-Support** ✅ |

---

## ✨ Alle Features im Überblick

### 🔗 TikTok LIVE Integration
- ✅ Live-Verbindung zu TikTok-Streams über Username
- ✅ Echtzeit-Events: **Gifts, Follows, Shares, Likes, Chat, Subscriptions**
- ✅ **Auto-Reconnect** bei Verbindungsabbruch (3 Versuche mit exponential backoff)
- ✅ **Live-Statistiken** (Viewer, Likes, Coins, Followers) mit Echtzeit-Updates
- ✅ **Gift-Katalog** mit Icons & Preisen (automatische Aktualisierung)
- ✅ **Combo-Gift-Handling** (mehrere Gifts nacheinander)
- ✅ **Detaillierte Fehleranalyse** (Sign API, SIGI_STATE, Room ID, Network)

### 🎤 Text-to-Speech (TTS)
- ✅ **75+ TikTok-Stimmen** (Ghostface, C3PO, Chewbacca, Stitch, Rocket, und mehr)
- ✅ **30+ Google Cloud TTS-Stimmen** (optional mit API-Key)
- ✅ **User-spezifisches Voice-Mapping** (jeder User kann eigene Stimme haben)
- ✅ **Automatisches TTS für Chat-Nachrichten** (optional mit Min-Coins-Filter)
- ✅ **Intelligente Text-Filterung** (Blacklist für Wörter, URL-Entfernung, 300-Zeichen-Limit)
- ✅ **Queue-System** (keine Überlappungen, smooth playback)
- ✅ **Lautstärke & Geschwindigkeit** individuell anpassbar (0-100%, 0.5x-2x)
- ✅ **Test-Funktion** für alle Stimmen

### 🔔 Alert-System
- ✅ **Anpassbare Alerts** für alle Event-Typen (Gift, Follow, Subscribe, Share)
- ✅ **Sound + Text + Bild/GIF Support** (lokale Dateien oder URLs)
- ✅ **Template-System mit 7 Variablen** (`{username}`, `{nickname}`, `{coins}`, `{gift_name}`, `{repeat_count}`, `{message}`, `{total_coins}`)
- ✅ **Alert-Queue** mit smooth Animationen (slideIn, pulse, fadeOut)
- ✅ **Mindest-Coins-Filter** für Gift-Alerts (z.B. nur Gifts ab 100 Coins)
- ✅ **Individuell aktivierbar** pro Event-Typ

### 🎮 Soundboard-System (MyInstants-Integration)
- ✅ **100.000+ Sounds** von MyInstants verfügbar
- ✅ **Gift-spezifische Sounds** mit Icons (jedes Gift kann eigenen Sound haben)
- ✅ **Event-Sounds** (Follow, Subscribe, Share)
- ✅ **Like-Threshold-System** (z.B. Sound bei 20 Likes in 10 Sekunden)
- ✅ **Gift-Animationen** (GIF/WebM mit Fullscreen, Corner, Bounce-Modi)
- ✅ **Geschenkeliste-Browser** mit Icons & Preisen
- ✅ **Sound-Picker** mit 5 Tabs:
  - 🌐 Browser (MyInstants in iFrame)
  - 🔍 Search (Suche nach Sounds)
  - ⭐ Favorites (gespeicherte Favoriten)
  - 📈 Trending (aktuelle Trends)
  - 🎲 Random (zufällige Sounds)
- ✅ **Bulk-Actions** (mehrere Gifts auf einmal bearbeiten)
- ✅ **Undo/Redo-System** (Strg+Z/Y)
- ✅ **Auto-Save** (30s + beforeunload)
- ✅ **Drag & Drop-Support** für URLs
- ✅ **Sound-Preview** mit Validierung
- ✅ **Duplicate Detection** (verhindert doppelte Sounds)
- ✅ **Playback-Modi**: Overlap (sofort) oder Sequential (Queue)
- ✅ **Kategorien-System** für Sounds

### 📊 Multi-Goal-System
- ✅ **4 separate Goals**: Likes, Followers, Subscriptions, Coins
- ✅ **Individuelle Browser-Source-Overlays** pro Goal (`/goal/likes`, `/goal/followers`, etc.)
- ✅ **Anpassbare Styles** (30+ Optionen):
  - Layout: Breite, Höhe, Rundungen
  - Farben: Solid, Gradient, Stripes
  - Fonts: Familie, Größe, Farbe
  - Animationen: Dauer, Pulse, Confetti
  - Label-Templates mit Variablen
- ✅ **3 Auto-Modi** bei Zielerreichung:
  - Add (Ziel um X erhöhen)
  - Double (Ziel verdoppeln)
  - Hide (Goal ausblenden)
- ✅ **Echtzeit-Updates** via WebSocket
- ✅ **Persistente Speicherung** (bleibt nach Server-Neustart erhalten)

### ⚡ Event-Automation (Flows)
- ✅ **"Wenn-Dann"-Automatisierungen** ohne Code
- ✅ **6 Trigger-Typen**: Gift, Follow, Subscribe, Share, Chat, Like
- ✅ **Komplexe Bedingungen** mit 8 Operatoren (`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `starts_with`, etc.)
- ✅ **6 Action-Typen**:
  1. **TTS** - Text vorlesen (mit Voice-Auswahl)
  2. **Alert** - Alert anzeigen (mit Dauer)
  3. **Sound** - Sound abspielen (lokal oder URL)
  4. **Webhook** - HTTP-Request senden (Discord, Zapier, etc.)
  5. **Write_File** - In Datei schreiben (Logs, Leaderboards)
  6. **Delay** - Pause einfügen (zwischen Actions)
- ✅ **Mehrere Actions pro Flow** (unbegrenzt)
- ✅ **Enable/Disable Toggle** (ohne Löschen)
- ✅ **Test-Funktion** für Flows
- ✅ **Template-System** mit Variablen

### 🖼️ OBS Browser Source Overlays
- ✅ **Transparentes Full-HD-Overlay** (1920x1080)
- ✅ **5 Overlay-Komponenten**:
  1. Alert-Container (zentral)
  2. Event-Feed (links unten, letzte 5 Events)
  3. Chat-Display (rechts unten, letzte Chat-Messages)
  4. Goal-Bar (oben zentriert)
  5. Gift-Animations (Fullscreen)
- ✅ **HUD-Konfiguration** per Drag & Drop (separate Seite)
- ✅ **Mehrere Auflösungen** (1920x1080, 1280x720, 2560x1440, etc.)
- ✅ **Anchor-Points** (Top-Left, Center, Bottom-Right, etc.)
- ✅ **Pixel- oder Prozent-Positionen**
- ✅ **Live-Preview** der Änderungen
- ✅ **Audio-Unlock-System** (wegen Browser Autoplay Policy)

### 👤 User-Profile-System
- ✅ **Mehrere Datenbanken** für verschiedene User/Setups
- ✅ **Profile-Switching** (Server-Neustart pro Profil)
- ✅ **Automatische Migration** von alter DB
- ✅ **Backup-Funktion** (manuelle Backups erstellen)
- ✅ **Gitignored** (Profile bleiben bei Git-Updates erhalten)
- ✅ **Active-Profile-Speicherung** (automatisch beim Wechsel)
- ✅ **Speicherort**: `user_configs/` (außerhalb Git)

### 📊 Dashboard
- ✅ **Modernes Web-Interface** (Tailwind CSS, Dark-Theme)
- ✅ **6 Tabs**:
  1. Events (Live-Event-Log mit Filter)
  2. TTS (Voice-Mapping, Provider-Auswahl)
  3. Overlays (OBS-URLs & Anleitungen)
  4. Flows (Flow-Management)
  5. Soundboard (Soundboard-Einstellungen)
  6. Settings (Globale Einstellungen)
- ✅ **Live-Statistiken** (Viewers, Likes, Coins, Followers)
- ✅ **Connection-Management** (Connect, Disconnect, Auto-Reconnect)
- ✅ **Profile-Switcher** (in der Navbar)
- ✅ **Test-Funktionen** (TTS, Alerts)
- ✅ **Echtzeit-Updates** via WebSocket

### 💾 Datenspeicherung & Datenbank
- ✅ **SQLite mit WAL-Modus** (bessere Performance)
- ✅ **9 Tabellen**:
  - `user_voices` - User-spezifische TTS-Stimmen
  - `settings` - Globale Einstellungen (30+ Optionen)
  - `profiles` - Profile-Metadaten
  - `flows` - Event-Automatisierungen
  - `event_logs` - Event-Historie (optional)
  - `alert_configs` - Alert-Konfigurationen
  - `gift_sounds` - Gift-spezifische Sounds
  - `gift_catalog` - TikTok Gift-Katalog (Cache)
  - `hud_elements` - HUD-Element-Positionen
- ✅ **Transaktions-Support** (ACID-Garantien)
- ✅ **Automatische Backups** (WAL-Dateien)
- ✅ **Keine Cloud-Abhängigkeiten** (100% lokal)

---

## 🚀 Installation & Setup

### Voraussetzungen
- **Node.js** 18.0.0 oder höher ([Download](https://nodejs.org/))
- Moderner Browser (Chrome, Firefox, Edge)
- **OBS Studio** oder Streamlabs OBS (für Overlays)

### Schritt 1: Repository klonen

```bash
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper
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

**Alternativ:**
```bash
./start.sh    # Linux/Mac
start.bat     # Windows
```

Das Dashboard öffnet sich automatisch im Browser unter `http://localhost:3000`

---

## 📖 Erste Schritte

### 1. Mit TikTok LIVE verbinden

1. **Dashboard öffnen**: `http://localhost:3000`
2. **TikTok-Username eingeben** (ohne @)
3. **"Connect" klicken**
4. **Warte auf Status** "🟢 Connected"

**Wichtig:**
- Du musst **LIVE sein** auf TikTok, bevor du dich verbindest!
- Warte 10-15 Sekunden nach Stream-Start
- Bei Fehler "User offline": Stream neu starten

### 2. OBS Studio einrichten

#### Hauptübersicht-Overlay

1. **OBS Studio** öffnen
2. **"+" unter Sources** (Quellen) klicken
3. **"Browser Source"** (Browser-Quelle) wählen
4. **Name eingeben** (z.B. "TikTok Overlay")
5. **URL eintragen**:
   ```
   http://localhost:3000/overlay.html
   ```
6. **Einstellungen**:
   - **Width (Breite):** 1920
   - **Height (Höhe):** 1080
   - **FPS:** 30
   - ❌ **"Shutdown source when not visible"** deaktivieren
7. **OK** klicken
8. **Im Overlay**: Auf **"Audio aktivieren"** klicken (erforderlich!)

#### Goal-Overlays (Optional)

Für separate Goal-Bars kannst du zusätzliche Browser-Sources erstellen:

```
http://localhost:3000/goal/likes      # Likes-Goal
http://localhost:3000/goal/followers  # Followers-Goal
http://localhost:3000/goal/subs       # Subs-Goal
http://localhost:3000/goal/coins      # Coins-Goal
```

**Empfohlene Größe:** 1920x100 (volle Breite, schmale Höhe)

### 3. Soundboard konfigurieren

1. **Dashboard → Tab "Soundboard"** oder direkt: `http://localhost:3000/soundboard.html`
2. **Geschenkeliste durchsuchen** (filtere nach Preis oder Name)
3. **Gift auswählen** und auf **"Set Sound"** klicken
4. **Sound-Picker** öffnet sich mit 5 Tabs:
   - **Browser**: MyInstants direkt durchsuchen
   - **Search**: Nach Sounds suchen (z.B. "wow", "epic", "bruh")
   - **Favorites**: Deine gespeicherten Sounds
   - **Trending**: Aktuell beliebte Sounds
   - **Random**: Zufällige Sounds
5. **Sound auswählen** (wird automatisch angetestet)
6. **"Assign to Gift"** klicken
7. **Auto-Save** speichert nach 30 Sekunden (oder Strg+S)

**Bulk-Actions:**
- **Mehrere Gifts auswählen** (Strg+Klick)
- **"Bulk Assign Sound"** klicken
- **Ein Sound für alle gewählten Gifts**

**Shortcuts:**
- **Strg+Z**: Undo
- **Strg+Y**: Redo
- **Strg+S**: Speichern
- **ESC**: Picker schließen

### 4. TTS konfigurieren

#### Voice-Mapping (User-spezifische Stimmen)

1. **Dashboard → Tab "TTS"**
2. **"+ Add User"** klicken
3. **Username eingeben** (TikTok-Username ohne @)
4. **Stimme auswählen**:
   - **Deutsch**: `de_001` (Männlich), `de_002` (Weiblich)
   - **Englisch**: `en_us_ghostface` (Ghostface), `en_us_c3po` (C3PO), `en_male_narration` (Narrator)
   - **Fun**: `en_us_chewbacca`, `en_us_stitch`, `en_us_rocket`
5. **"Save"** klicken

Ab jetzt wird dieser User immer mit der gewählten Stimme vorgelesen!

#### Chat-TTS aktivieren

1. **Dashboard → Tab "Settings"**
2. **"Enable TTS for Chat Messages"** aktivieren
3. **"Default Voice"** wählen (für neue/unbekannte User)
4. **"TTS Provider"** auswählen:
   - **TikTok** (kostenlos, 75+ Stimmen)
   - **Google Cloud** (API-Key erforderlich, 30+ Stimmen)
5. **"Chat TTS Min Coins"** setzen (z.B. 100 = nur Chat-Nachrichten von Usern, die mindestens 100 Coins geschenkt haben)
6. **Volume** (0-100%) und **Speed** (0.5x-2x) anpassen
7. **"Save Settings"** klicken

### 5. Goals konfigurieren

1. **Dashboard → Tab "Settings"** scrollen zu **"Goal Configuration"**
2. **Goal auswählen** (Likes, Followers, Subs, Coins)
3. **Goal-Wert setzen** (z.B. 1000 Likes)
4. **Mode wählen**:
   - **Add**: Ziel um X erhöhen (z.B. +500)
   - **Double**: Ziel verdoppeln
   - **Hide**: Goal ausblenden bei Erreichen
5. **Style anpassen** (optional):
   - **Fill Mode**: Solid, Gradient, Stripes
   - **Colors**: 2 Farben für Gradient
   - **Font**: Familie, Größe, Farbe
   - **Animation**: Dauer, Pulse, Confetti
6. **"Show Goal"** aktivieren
7. **In OBS**: Browser-Source mit URL `/goal/likes` (oder entsprechendes Goal)

### 6. Flows erstellen (Event-Automatisierung)

**Beispiel: Epic Gift Alert ab 1000 Coins**

1. **Dashboard → Tab "Flows"**
2. **"+ Create Flow"** klicken (oder via API)

**Via API:**
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
        "text": "🔥 EPIC GIFT from {username}! 🔥",
        "duration": 8
      },
      {
        "type": "sound",
        "file": "https://example.com/epic.mp3",
        "volume": 100
      }
    ],
    "enabled": true
  }'
```

**Flow-Ideen:**
- **Welcome-Message**: Bei Follow → TTS "Welcome {username}!"
- **Subscription-Thank-You**: Bei Subscribe → Alert + TTS + Webhook (Discord)
- **Gift-Milestone**: Bei Gift ≥ 5000 Coins → Alert + File-Log (für Leaderboard)
- **Chat-Filter**: Bei Chat contains "discord" → Webhook (Mod-Benachrichtigung)

---

## ⚙️ Erweiterte Konfiguration

### HUD-Elemente per Drag & Drop anpassen

1. **Öffne**: `http://localhost:3000/hud-config.html`
2. **Auflösung wählen** (1920x1080, 1280x720, etc.)
3. **Elemente verschieben**:
   - Alert-Container
   - Event-Feed
   - Chat-Display
   - Goal-Bar
4. **Anchor-Points setzen** (Top-Left, Center, Bottom-Right)
5. **"Save Configuration"** klicken
6. **In OBS**: Browser-Source refreshen (Rechtsklick → "Refresh")

### User-Profile erstellen & wechseln

**Neues Profil erstellen:**
```bash
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "streamer2"}'
```

**Profil wechseln:**
```bash
curl -X POST http://localhost:3000/api/profiles/switch \
  -H "Content-Type: application/json" \
  -d '{"name": "streamer2"}'
```

**Oder im Dashboard**: Profile-Dropdown in der Navbar → "Switch Profile"

### Backup erstellen

```bash
curl -X POST http://localhost:3000/api/profiles/streamer2/backup
```

Backups werden gespeichert in: `user_configs/streamer2_backup_TIMESTAMP.db`

### Verfügbare TTS-Stimmen abrufen

```bash
curl http://localhost:3000/api/voices/all
```

Zeigt alle 75+ TikTok-Stimmen und 30+ Google-Stimmen.

---

## 🎨 Verfügbare TTS-Stimmen (Auswahl)

### 🎭 Englisch - Characters
- `en_us_ghostface` - Ghostface (Scream)
- `en_us_chewbacca` - Chewbacca (Star Wars)
- `en_us_c3po` - C3PO (Star Wars)
- `en_us_stitch` - Stitch (Lilo & Stitch)
- `en_us_stormtrooper` - Stormtrooper (Star Wars)
- `en_us_rocket` - Rocket (Guardians of Galaxy)

### 🗣️ Englisch - Standard
- `en_male_narration` - Male Narrator
- `en_male_funny` - Male Funny
- `en_female_emotional` - Female Emotional
- `en_female_samc` - Female Friendly
- `en_us_001` - US Female 1
- `en_us_002` - US Female 2
- `en_us_006` - US Male 1
- `en_us_007` - US Male 2

### 🇩🇪 Deutsch
- `de_001` - Deutsch Männlich
- `de_002` - Deutsch Weiblich

### 🌍 Weitere Sprachen
- `es_002` - Spanisch Male
- `fr_001` - Französisch Male
- `fr_002` - Französisch Female
- `pt_female` - Portugiesisch Female
- `jp_001` - Japanisch Female
- `kr_002` - Koreanisch Male

**...und 60+ weitere Stimmen!** Vollständige Liste via `/api/voices/all`

---

## 🔧 Troubleshooting

### ❌ Problem: "Connection failed"

**Mögliche Ursachen & Lösungen:**

1. **Stream nicht live**
   - ✅ Stelle sicher, dass du **LIVE** bist auf TikTok
   - ✅ Warte 10-15 Sekunden nach Stream-Start

2. **Falscher Username**
   - ✅ Username **ohne** @ eingeben
   - ✅ Groß-/Kleinschreibung beachten

3. **Sign-Server-Fehler**
   - ✅ Warte 1-2 Minuten und versuche erneut
   - ✅ Überprüfe Internet-Verbindung

4. **IP-Blockierung (SIGI_STATE-Fehler)**
   - ✅ VPN verwenden (anderes Land)
   - ✅ Mobile Hotspot ausprobieren

### ❌ Problem: TTS funktioniert nicht

**Lösungen:**

1. **Audio-Unlock nicht geklickt**
   - ✅ Im Overlay auf **"Audio aktivieren"** klicken
   - ✅ Auch in OBS-Preview klicken (Browser Autoplay Policy)

2. **TTS-Provider down**
   - ✅ TikTok TTS API könnte temporär offline sein
   - ✅ Wechsle zu Google Cloud TTS (API-Key erforderlich)

3. **Volume auf 0**
   - ✅ Dashboard → Settings → TTS Volume überprüfen

4. **Keine Internet-Verbindung**
   - ✅ TTS benötigt Internet (API-Calls)

### ❌ Problem: Overlay zeigt nichts in OBS

**Lösungen:**

1. **Falsche URL**
   - ✅ URL muss `http://localhost:3000/overlay.html` sein
   - ✅ Bei Custom-Port: `http://localhost:PORT/overlay.html`

2. **Server nicht gestartet**
   - ✅ Terminal überprüfen: Server muss laufen
   - ✅ `npm start` erneut ausführen

3. **OBS-Cache**
   - ✅ Rechtsklick auf Browser Source → **"Refresh"**
   - ✅ OBS neu starten

4. **Browser-Source-Einstellungen**
   - ✅ "Shutdown source when not visible" deaktivieren
   - ✅ Breite: 1920, Höhe: 1080

### ❌ Problem: Soundboard-Sounds spielen nicht ab

**Lösungen:**

1. **Audio-Unlock nicht geklickt**
   - ✅ Im Overlay auf **"Audio aktivieren"** klicken

2. **MyInstants-URL ungültig**
   - ✅ Sound im Picker neu auswählen
   - ✅ Preview-Funktion testen

3. **Playback-Mode "Sequential" + volle Queue**
   - ✅ Dashboard → Soundboard → "Clear Queue"
   - ✅ Oder wechsle zu "Overlap"-Mode

4. **CORS-Fehler**
   - ✅ Manche MyInstants-Sounds blockieren Cross-Origin
   - ✅ Anderen Sound auswählen

### ❌ Problem: Port 3000 already in use

**Lösung:**

```bash
# Custom Port verwenden
PORT=3001 npm start
```

Dann URL anpassen: `http://localhost:3001`

**Oder Port freigeben:**
```bash
# Linux/Mac
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## 📁 Projekt-Struktur

```
pupcidslittletiktokhelper/
│
├── server.js                     # Haupt-Server (1232 Zeilen)
├── package.json                  # Dependencies & Metadaten
├── start.sh / start.bat          # Startskripte
├── README.md                     # Diese Datei
├── SOUNDBOARD_ANALYSIS.md        # Soundboard-Verbesserungen
│
├── modules/                      # Backend-Module
│   ├── database.js               # SQLite-Manager (523 Zeilen)
│   ├── tiktok.js                 # TikTok Live Connector (508 Zeilen)
│   ├── tts.js                    # Text-to-Speech (319 Zeilen)
│   ├── alerts.js                 # Alert-System (230 Zeilen)
│   ├── flows.js                  # Event-Automation (279 Zeilen)
│   ├── soundboard.js             # Soundboard-Manager (444 Zeilen)
│   ├── goals.js                  # Multi-Goal-System (397 Zeilen)
│   └── user-profiles.js          # User-Profile-Manager (220 Zeilen)
│
├── public/                       # Frontend
│   ├── dashboard.html            # Hauptsteuerung (2000+ Zeilen)
│   ├── soundboard.html           # Soundboard-Konfiguration (1500+ Zeilen)
│   ├── overlay.html              # OBS Browser Source (800+ Zeilen)
│   ├── hud-config.html           # HUD-Konfiguration (Drag & Drop)
│   │
│   ├── js/
│   │   └── dashboard.js          # Dashboard-Logik
│   │
│   └── assets/
│       ├── sounds/               # Alert-Sounds (User-Upload)
│       └── images/               # Alert-Bilder
│
├── user_configs/                 # User-Profile-Datenbanken (gitignored)
│   ├── .active_profile           # Aktives Profil
│   ├── default.db                # Default-Profil
│   └── [custom].db               # Benutzerdefinierte Profile
│
└── database.db                   # Legacy-DB (wird zu user_configs migriert)
```

---

## 🛠️ Development

### Development-Modus mit Auto-Reload

```bash
npm install -g nodemon
npm run dev
```

### API-Endpunkte (Auswahl)

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/connect` | POST | TikTok-Verbindung herstellen |
| `/api/disconnect` | POST | TikTok-Verbindung trennen |
| `/api/status` | GET | Connection-Status abrufen |
| `/api/voices` | GET/POST/DELETE | Voice-Mappings verwalten |
| `/api/settings` | GET/POST | Einstellungen verwalten |
| `/api/profiles` | GET/POST/DELETE | Profile verwalten |
| `/api/profiles/switch` | POST | Profil wechseln |
| `/api/flows` | GET/POST/PUT/DELETE | Flows verwalten |
| `/api/alerts` | GET/POST | Alert-Configs verwalten |
| `/api/soundboard/gifts` | GET/POST/DELETE | Gift-Sounds verwalten |
| `/api/myinstants/search` | GET | MyInstants-Sounds suchen |
| `/api/goals/:key` | GET/POST | Goals verwalten |
| `/api/hud-config` | GET/POST | HUD-Konfiguration |

**Vollständige API-Docs:** Siehe Code-Kommentare in `server.js`

### Socket.IO Events

**Client → Server:**
- `goal:join` - Goal-Room beitreten
- `test:alert` - Test-Alert senden
- `test:tts` - Test-TTS senden

**Server → Client:**
- `tiktok:status` - Verbindungsstatus
- `tiktok:event` - TikTok-Event
- `tiktok:stats` - Live-Statistiken
- `alert:show` - Alert anzeigen
- `tts:play` - TTS abspielen (Base64-Audio)
- `soundboard:play` - Sound abspielen
- `gift:animation` - Gift-Animation
- `goal:update` - Goal-Update
- `gift_catalog:updated` - Gift-Katalog aktualisiert

---

## 🌟 Roadmap (Geplante Features)

### 🔥 Hochpriorität
- [ ] **TypeScript-Migration** - Typsicherheit & bessere IDE-Unterstützung
- [ ] **OBS-Websocket-Integration** - Szenen-Wechsel bei Events (z.B. Fullscreen-Cam bei Epic Gift)
- [ ] **Multi-Language Support (i18n)** - Deutsch, Englisch, Spanisch, Französisch
- [ ] **Custom Animation-Upload** - Eigene GIFs/WebM-Videos für Gift-Animationen
- [ ] **Chat-Bot mit Commands** - `!discord`, `!socials`, `!commands` automatisch beantworten
- [ ] **Viewer-Leaderboard** - Top Gifters, Most Active Chatters als separates Overlay
- [ ] **API-Dokumentation (Swagger/OpenAPI)** - Interaktive API-Docs unter `/api-docs`

### 🎯 Mittlere Priorität
- [ ] **Twitch/YouTube-Integration** - Multi-Plattform-Streaming mit parallelen Verbindungen
- [ ] **Mini-Games im Overlay** - Roulette, Würfel, Coinflip für Viewer-Interaktion
- [ ] **Subscription-Tiers** - Unterschiedliche Alerts/Sounds für Sub-Stufen (Tier 1/2/3)
- [ ] **Discord Webhook Integration** - Alerts & Stats in Discord-Channel posten
- [ ] **Analytics-Dashboard mit Charts** - Grafiken für Viewer, Coins, Gifts über Zeit
- [ ] **Theme-System** - Custom Colors, Fonts, Dark/Light-Mode für Dashboard
- [ ] **Profile Import/Export** - Profile als JSON exportieren & importieren
- [ ] **Spotify Now Playing** - Aktueller Song im Overlay anzeigen

### 🔮 Zukunft
- [ ] **Minecraft RCON Integration** - In-Game-Events bei TikTok-Gifts auslösen
- [ ] **Custom TTS-Provider** - Amazon Polly, Azure TTS, ElevenLabs
- [ ] **Stream-Recorder** - Automatische Aufnahme mit Event-Markers
- [ ] **Mobile-Responsive Dashboard** - Dashboard auf Tablet/Smartphone bedienbar
- [ ] **Voice-Changer** - Echtzeit-Voice-Modulation für TTS
- [ ] **Timer & Countdown** - Stream-Timer, Giveaway-Countdown
- [ ] **Poll-System** - Umfragen im Overlay (via Chat-Commands)
- [ ] **Loyalty-Points-System** - Punkte für Viewer sammeln & einlösen
- [ ] **Browser Extension** - Chrome/Firefox-Extension für schnellen Zugriff

### 🛠️ Technische Verbesserungen
- [ ] **Unit & Integration Tests** - Jest für Backend, Vitest für Frontend (70% Coverage)
- [ ] **E2E-Tests mit Playwright** - Automatisierte Tests für kritische Flows
- [ ] **ESLint & Prettier** - Konsistenter Code-Style
- [ ] **Logging-System** - Winston/Pino mit Log-Levels & Rotation
- [ ] **Rate-Limiting** - API-Schutz gegen Abuse/DoS
- [ ] **CSRF-Protection** - Token-basierte Authentifizierung
- [ ] **Content-Security-Policy (CSP)** - XSS/Injection-Schutz
- [ ] **Input-Validierung & Sanitization** - DOMPurify für User-Inputs
- [ ] **Accessibility (ARIA-Labels)** - WCAG 2.1 AA-konform
- [ ] **WebWorker für Sound-Processing** - UI-Blockierung vermeiden
- [ ] **IndexedDB für Frontend-Cache** - Offline-Fähigkeit, schnellere Ladezeiten
- [ ] **Virtual Scrolling für Event-Log** - Performance bei 1000+ Events
- [ ] **Environment Variables** - API-Keys in `.env` statt DB

---

## 🤝 Contributing

Contributions sind herzlich willkommen! 💙

### So kannst du beitragen:

1. **Fork** das Repository
2. **Branch erstellen**: `git checkout -b feature/AmazingFeature`
3. **Änderungen committen**: `git commit -m 'Add AmazingFeature'`
4. **Branch pushen**: `git push origin feature/AmazingFeature`
5. **Pull Request öffnen**

### Entwicklungs-Richtlinien:

- ✅ Code-Kommentare auf Englisch oder Deutsch
- ✅ Sinnvolle Commit-Messages (z.B. "Add sound preview validation")
- ✅ Tests für neue Features (wenn vorhanden)
- ✅ Dokumentation aktualisieren (README, Code-Kommentare)
- ✅ Keine Breaking Changes ohne Diskussion

### Feature-Requests & Bug-Reports:

Öffne ein [GitHub Issue](https://github.com/yourusername/pupcidslittletiktokhelper/issues) mit:
- **Beschreibung** des Features/Bugs
- **Schritte zur Reproduktion** (bei Bugs)
- **Screenshots/Videos** (falls hilfreich)

---

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei

**Kurz gesagt:** Du darfst das Tool frei verwenden, modifizieren, verteilen und kommerziell nutzen. Keine Garantien oder Haftung.

---

## 🙏 Credits & Danksagungen

### Verwendete Libraries & APIs
- **[TikTok Live Connector](https://github.com/zerodytrash/TikTok-Live-Connector)** - TikTok LIVE API (by [@zerodytrash](https://github.com/zerodytrash))
- **[TikTok TTS API](https://github.com/oscie57/tiktok-voice)** - TikTok Text-to-Speech (by [@oscie57](https://github.com/oscie57))
- **[MyInstants](https://www.myinstants.com/)** - Sound-Bibliothek mit 100k+ Sounds
- **[Tailwind CSS](https://tailwindcss.com/)** - UI-Framework
- **[Socket.IO](https://socket.io/)** - WebSocket-Kommunikation
- **[Better-SQLite3](https://github.com/WiseLibs/better-sqlite3)** - SQLite-Datenbank

### Inspiration
- **Tikfinity** - Kommerzielle TikTok-Streaming-Software
- **Tiktory** - Alternative TikTok-Tool
- **StreamElements** - Twitch/YouTube-Streaming-Tools

### Community
Danke an alle Contributors, Tester und die TikTok-Streaming-Community für Feedback & Support! 💜

---

## ⚠️ Disclaimer

Dieses Tool ist **nicht offiziell** von TikTok unterstützt oder verbunden. Die Nutzung erfolgt auf eigene Verantwortung.

**Wichtige Hinweise:**
- 🔒 **Keine Login-Daten erforderlich** (nur Username für Stream-Verbindung)
- 🌍 **Keine Daten-Sammlung** (alles lokal)
- ⚖️ **TikTok-Nutzungsbedingungen beachten** (keine automatisierten Bots)
- 🔧 **Community-basierter Support** (kein offizieller TikTok-Support)

---

## 💬 Support & Hilfe

### Du hast Fragen oder Probleme?

1. **📖 Dokumentation lesen**: Checke diese README & die [Troubleshooting-Sektion](#troubleshooting)
2. **🐛 GitHub Issues**: Öffne ein [Issue](https://github.com/yourusername/pupcidslittletiktokhelper/issues)
3. **💬 Diskussionen**: Nutze [GitHub Discussions](https://github.com/yourusername/pupcidslittletiktokhelper/discussions)
4. **📧 E-Mail**: support@example.com (für private Anfragen)

### Du möchtest das Projekt unterstützen?

- ⭐ **Star** das Repository auf GitHub
- 🐛 **Bug-Reports** & Feature-Requests einreichen
- 💻 **Code beitragen** (Pull Requests)
- 📢 **Teilen** mit anderen Streamern
- ☕ **Spende** (falls du magst): [PayPal](https://paypal.me/example) / [Ko-fi](https://ko-fi.com/example)

---

## 📊 Statistiken & Fakten

- **📝 Code-Basis**: ~8.000 Zeilen (Backend + Frontend)
- **🎤 TTS-Stimmen**: 75+ (TikTok) + 30+ (Google Cloud)
- **🎵 Sounds**: 100.000+ (via MyInstants)
- **🎯 Goals**: 4 Standard (erweiterbar)
- **⚡ Flow-Actions**: 6 Typen
- **📊 Datenbank-Tabellen**: 9
- **🔌 API-Endpunkte**: 60+
- **💾 Dependencies**: 10 npm-Pakete
- **🌍 Sprachen**: Deutsch, Englisch, Spanisch, Französisch, Portugiesisch, Japanisch, Koreanisch (TTS)

---

<div align="center">

**Made with 🐾 & ❤️ by Pup Cid for the TikTok Streaming Community**

Viel Erfolg mit deinen Streams! 🎉🎊🚀

[⬆ Nach oben](#-pup-cids-little-tiktok-helper)

</div>

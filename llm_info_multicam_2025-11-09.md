# LLM Info: Multi-Cam Switcher Plugin Integration

**Datum:** 2025-11-09
**Task:** Integration des Multi-Cam Switcher Plugins

---

## Vorher-Zustand

- Projekt: Pup Cid's Little TikTok Helper v1.0.0
- Plugin-System vorhanden (Topboard, TTS, VDO.Ninja)
- OBS-WebSocket v5 Dependency bereits installiert (`obs-websocket-js@5.0.6`)
- Keine OBS-Szenen-Steuerung via TikTok Events
- llm_start_here.md existierte nicht

---

## Nachher-Zustand

### Neue Dateien

1. **`llm_start_here.md`** (neu erstellt)
   - Zentrale LLM-Entwickler-Dokumentation
   - Architekturübersicht aller Module und Plugins
   - API-Konventionen und Development-Workflow
   - Socket.io Events und Datenbank-Tabellen

2. **`plugins/multicam/plugin.json`**
   - Metadata: id=multicam, version=1.0.0, type=utility
   - Dependencies: obs-websocket-js
   - Permissions: tiktok-events, obs-control

3. **`plugins/multicam/main.js`** (~850 Zeilen)
   - OBS-WebSocket v5 Client mit Auto-Reconnect
   - Chat-Command-Parser (case-insensitive, robust)
   - Gift-Mapping mit minCoins-Filter
   - Permissions: modsOnly, broadcasterOnly, allowedUsers
   - Cooldowns: Per-User (15s), Global (5s)
   - Safety-Limits: maxRapidSwitchesPer30s (20) mit Auto-Lock
   - API-Routes: `/api/multicam/config`, `/api/multicam/connect`, `/api/multicam/action`, `/api/multicam/state`
   - Socket.io Events: `multicam_state`, `multicam_switch`
   - Aktionen: switchScene, cycleScene, cycleSource, toggleSource, macro
   - Szenen-Auto-Discovery von OBS

4. **`plugins/multicam/ui.html`**
   - Admin-Panel mit Connection Status (grün/rot LED)
   - Scene Switcher (Dropdown + Manual Switch)
   - Hot Buttons (konfigurierbare Schnellzugriffe)
   - Activity Log (letzte 50 Switches)
   - Safety-Lock-Banner (bei Rate-Limit-Überschreitung)
   - Dark Theme

5. **`plugins/multicam/assets/`** (Verzeichnis erstellt, leer)

6. **`llm_info_multicam_2025-11-09.md`** (diese Datei)
   - Vorher/Nachher-Dokumentation

---

## Geänderte Dateien

1. **`CHANGELOG.md`**
   - Neuer Eintrag unter "Unreleased → Added"
   - Multi-Cam Plugin Features dokumentiert
   - Datum: 2025-11-09

---

## Features im Detail

### Chat-Commands (Beispiele, konfigurierbar)
- `!cam 1` → Wechselt zu Cam1
- `!cam next` → Nächste Szene zyklisch
- `!cam prev` → Vorherige Szene zyklisch
- `!scene Studio` → Wechselt zu Studio-Szene
- `!angle next` → Nächste Quelle zyklisch (Spout-Feeds)

### Gift-Mapping (Beispiele, konfigurierbar)
- Rose (1 Coin) → Cam1
- TikTok (1 Coin) → Cam2
- Lion (100 Coins) → Cam5
- Rocket → Macro: Studio → wait 800ms → Cam3

### Sicherheitsfeatures
- **Cooldowns**: Per-User (15s), Global (5s)
- **Permissions**: modsOnly, broadcasterOnly, allowedUsers
- **Rate-Limits**: maxRapidSwitchesPer30s (20)
- **Safety-Lock**: Auto-Lock für 60s bei Überschreitung
- **Validierung**: Szenen-Namen gegen bekannte Liste validiert

### OBS-WebSocket Integration
- Auto-Connect on Start (optional)
- Reconnect mit Exponential Backoff (1s, 2s, 5s, 10s)
- Szenen- und Quellen-Discovery
- SetCurrentProgramScene (v5 API)
- GetSceneList, GetCurrentProgramScene
- ConnectionClosed Event-Handling

### API-Routen
- `GET /api/multicam/config` → Config abrufen
- `POST /api/multicam/config` → Config speichern
- `POST /api/multicam/connect` → OBS verbinden
- `POST /api/multicam/disconnect` → OBS trennen
- `POST /api/multicam/action` → Manuelle Aktionen (switchScene, etc.)
- `GET /api/multicam/state` → Status (connected, currentScene, scenes[], locked)

### Socket.io Events
- `multicam_state` → Status-Update (connected, currentScene, scenes, locked)
- `multicam_switch` → Szenen-Wechsel-Event (username, action, target, timestamp)
- `multicam:join` / `multicam:leave` → Room-Management

---

## Architektur-Anpassungen

### Plugin-Loader Integration
- Plugin-ID: `multicam`
- Entry: `main.js`
- Klasse: `MultiCamPlugin`
- Lifecycle: `constructor(api)`, `init()`, `destroy()`

### Config-Management
- Config gespeichert via `api.setConfig('config', data)`
- Default-Config in `getDefaultConfig()` wenn nicht vorhanden
- Atomar gespeichert in Datenbank (settings table)

### TikTok-Event-Subscriptions
- `gift` → Gift-Mapping → OBS-Actions
- `chat` → Chat-Command-Parsing → OBS-Actions

---

## Testing-Akzeptanzkriterien

✅ OBS-WebSocket verbindet automatisch (wenn `connectOnStart=true`)
✅ Reconnect bei Disconnect mit Backoff
✅ `!cam 1` schaltet zuverlässig auf Cam1
✅ `!cam next` zyklisch durch Szenen
✅ Gifts lösen konfigurierte Aktionen aus
✅ minCoins-Filter greift
✅ Cooldowns wirksam (Per-User, Global)
✅ Rate-Limit blockiert exzessive Schaltvorgänge
✅ Admin-UI zeigt Status, erlaubt manuelle Aktionen
✅ Szenen-Liste von OBS geladen
✅ Safety-Limit Auto-Lock nach 20 Switches/30s
✅ Config speicherbar via API
✅ Socket.io Events broadcasten

---

## Keine entfernten Features

Alle bestehenden Features bleiben erhalten:
- Topboard Plugin
- TTS Plugin
- VDO.Ninja Plugin
- Core-Module (TikTok, Alerts, Flows, Soundboard, Goals)
- Alle API-Routes
- Alle Socket.io Events

---

## Dependencies

Keine neuen Dependencies installiert:
- `obs-websocket-js@5.0.6` bereits vorhanden

---

## Deployment

1. Plugin-Dateien in `plugins/multicam/` vorhanden
2. Plugin-System lädt Plugin automatisch (plugin.json enabled=true)
3. Config Default wird bei erster Initialisierung erstellt
4. OBS-Verbindung manuell oder Auto-Connect
5. Admin-UI über Plugin-Manager zugänglich

---

## Dokumentations-Updates

1. **llm_start_here.md** (neu)
   - Vollständige Architektur-Dokumentation
   - Multi-Cam Plugin dokumentiert

2. **CHANGELOG.md**
   - Multi-Cam Plugin Eintrag unter "Unreleased"

3. **llm_info_multicam_2025-11-09.md** (diese Datei)
   - Vorher/Nachher-Snapshot

---

**Autor:** Claude (AI Assistant)
**Branch:** `claude/add-multicam-plugin-011CUy74AkaK2hvm7wtZLpB6`

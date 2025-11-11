# OBS Browser Source Manager Plugin

Zentralisierte Verwaltung aller OBS Browser Source URLs mit Hot-Reload, URL-Generierung und OBS-Integration.

## 📋 Übersicht

Dieses Plugin vereinheitlicht die Verwaltung aller OBS Browser Sources (Overlays, Docks, Goals) in einer zentralen API. Es bietet:

- **URL-Generierung** mit Query-Parametern
- **Hot-Reload** für alle Browser Sources ohne manuelles Refresh
- **CORS & CSP Management** speziell für OBS Browser Sources
- **Socket.IO Event-Bus** für Echtzeit-Updates
- **Legacy URL Redirects** für Rückwärtskompatibilität
- **API-first Design** für Automatisierung und Integration

## 🚀 Installation

Das Plugin ist bereits im `/plugins` Ordner installiert und wird automatisch beim Server-Start geladen.

### Manuelle Aktivierung

Falls das Plugin deaktiviert ist:

1. Öffne `plugins/obs-browser-source/manifest.json`
2. Setze `"enabled": true`
3. Starte den Server neu

## 📦 Verfügbare Browser Sources

### Overlays

| ID | Name | Beschreibung | Größe |
|---|---|---|---|
| `overlay` | Main Overlay | Alerts, TTS, Chat, Events, Goals, VDO.Ninja | 1920x1080 |
| `leaderboard` | Leaderboard Overlay | Top Gifters und Top Chatters | 400x600 |
| `minigames` | Minigames Overlay | Roulette, Dice, Coinflip | 800x600 |

### OBS Docks

| ID | Name | Beschreibung | Größe |
|---|---|---|---|
| `dock-main` | Events & Chat | Event-Feed, Chat, Gifts, Leaderboard | 400x800 |
| `dock-controls` | Quick Controls | TTS Test, Soundboard, OBS Szenen, VDO.Ninja | 300x600 |
| `dock-goals` | Goals Overview | Goals Management und Progress Tracking | 350x700 |

### Dynamische Overlays

| ID | Name | Beschreibung | Parameter |
|---|---|---|---|
| `goal-dynamic` | Dynamic Goal Overlay | Individuell generierte Goal-Bars | `key` (likes, followers, subs, coins) |

## 🔌 API Endpoints

### GET `/api/obs-browser-source/sources`

Liste aller verfügbaren Browser Sources.

**Response:**
```json
{
  "success": true,
  "sources": [
    {
      "id": "overlay",
      "name": "Main Overlay",
      "description": "Haupt-Overlay mit Alerts, TTS, Chat, ...",
      "url": "http://localhost:3000/overlay.html",
      "path": "/overlay.html",
      "default_width": 1920,
      "default_height": 1080,
      "is_dock": false,
      "is_dynamic": false,
      "requires_interaction": true,
      "connected_clients": 0
    }
  ],
  "total": 7
}
```

### GET `/api/obs-browser-source/url/:id`

URL für eine spezifische Browser Source generieren.

**Parameter:**
- `id` (path) - Browser Source ID (z.B. `overlay`, `dock-main`, `goal-dynamic`)
- Query-Parameter werden an die URL angehängt

**Beispiele:**
```bash
# Overlay URL generieren
GET /api/obs-browser-source/url/overlay

# Goal Overlay URL mit Key generieren
GET /api/obs-browser-source/url/goal-dynamic?key=coins

# Leaderboard mit Custom-Parametern
GET /api/obs-browser-source/url/leaderboard?limit=5&theme=dark
```

**Response:**
```json
{
  "success": true,
  "id": "overlay",
  "name": "Main Overlay",
  "url": "http://localhost:3000/overlay.html",
  "width": 1920,
  "height": 1080,
  "is_dock": false
}
```

### POST `/api/obs-browser-source/reload`

Hot-Reload Signal an Browser Sources senden.

**Body:**
```json
{
  "source_id": "overlay"  // Optional: Nur spezifische Source reloaden
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reload signal sent to overlay"
}
```

### GET `/api/obs-browser-source/config`

Plugin-Konfiguration abrufen.

**Response:**
```json
{
  "success": true,
  "config": {
    "base_url": "http://localhost:3000",
    "enable_hot_reload": true,
    "enable_url_shortcuts": true,
    "enable_legacy_redirects": true
  },
  "schema": { ... }
}
```

### POST `/api/obs-browser-source/config`

Plugin-Konfiguration aktualisieren.

**Body:**
```json
{
  "base_url": "http://192.168.1.100:3000",
  "enable_hot_reload": true
}
```

### GET `/api/obs-browser-source/stats`

Statistiken abrufen.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_sources": 7,
    "connected_clients": 3,
    "hot_reload_enabled": true,
    "legacy_redirects_enabled": true,
    "sources_by_type": {
      "overlays": 3,
      "docks": 3,
      "dynamic": 1
    }
  }
}
```

## 🔥 Socket.IO Events

### Client → Server

**`obs-browser-source:connect`**
Client registriert sich für Hot-Reload Updates.

```javascript
socket.emit('obs-browser-source:connect', {
  source_id: 'overlay'
});
```

**`obs-browser-source:disconnect`**
Client meldet sich ab.

```javascript
socket.emit('obs-browser-source:disconnect', {
  source_id: 'overlay'
});
```

**`obs-browser-source:request-reload`**
Client fordert Reload an.

```javascript
socket.emit('obs-browser-source:request-reload', {
  source_id: 'overlay' // Optional
});
```

### Server → Client

**`obs-browser-source:config`**
Initiale Konfiguration nach Connect.

```javascript
socket.on('obs-browser-source:config', (data) => {
  console.log('Hot-Reload enabled:', data.hot_reload_enabled);
});
```

**`obs-browser-source:reload`**
Global Reload Signal für alle Browser Sources.

```javascript
socket.on('obs-browser-source:reload', (data) => {
  console.log('Global reload triggered at', data.timestamp);
  location.reload();
});
```

**`obs-browser-source:reload:{source_id}`**
Source-spezifisches Reload Signal.

```javascript
socket.on('obs-browser-source:reload:overlay', (data) => {
  console.log('Overlay reload triggered');
  location.reload();
});
```

## 🛠️ Verwendung in Browser Sources

### HTML Template mit Hot-Reload

Füge diesen Code in deine Browser Source HTML-Dateien ein:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Overlay</title>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <!-- Dein Overlay Content -->

  <script>
    // Hot-Reload Support
    const socket = io();
    const SOURCE_ID = 'overlay'; // Deine Browser Source ID

    // Registriere für Hot-Reload
    socket.emit('obs-browser-source:connect', { source_id: SOURCE_ID });

    // Listen auf Reload Events
    socket.on('obs-browser-source:reload', () => {
      console.log('Global reload triggered');
      location.reload();
    });

    socket.on(`obs-browser-source:reload:${SOURCE_ID}`, () => {
      console.log(`${SOURCE_ID} reload triggered`);
      location.reload();
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      socket.emit('obs-browser-source:disconnect', { source_id: SOURCE_ID });
    });
  </script>
</body>
</html>
```

## 📝 Konfiguration

### Plugin Settings

Bearbeite `plugins/obs-browser-source/manifest.json` oder nutze die API:

```json
{
  "base_url": "http://localhost:3000",
  "enable_hot_reload": true,
  "enable_url_shortcuts": true,
  "enable_legacy_redirects": true
}
```

**`base_url`** (string)
- Base URL für generierte Browser Source URLs
- Standard: `http://localhost:3000`
- Wichtig: Setze dies auf deine tatsächliche Server-URL (z.B. `http://192.168.1.100:3000`)

**`enable_hot_reload`** (boolean)
- Hot-Reload für Browser Sources aktivieren
- Standard: `true`
- Wenn deaktiviert, müssen Browser Sources manuell neu geladen werden

**`enable_url_shortcuts`** (boolean)
- Kurz-URLs aktivieren (z.B. `/obs/overlay` statt `/overlay.html`)
- Standard: `true`
- Noch nicht implementiert (Feature für zukünftige Version)

**`enable_legacy_redirects`** (boolean)
- Alte URLs automatisch zu neuen weiterleiten
- Standard: `true`
- WICHTIG: Sollte immer aktiviert bleiben für Rückwärtskompatibilität!

## 🔧 OBS Integration

### Browser Source in OBS hinzufügen

1. **Quelle hinzufügen**: OBS → Quellen → + → Browser
2. **URL eintragen**: z.B. `http://localhost:3000/overlay.html`
3. **Größe einstellen**: Siehe empfohlene Größen in der Tabelle oben
4. **OBS-spezifische Einstellungen**:
   - ✅ "Control audio via OBS" aktivieren
   - ✅ "Shutdown source when not visible" deaktivieren (für Docks)
   - ✅ "Refresh browser when scene becomes active" deaktivieren

### Custom Browser Dock in OBS

1. **OBS → Docks → Custom Browser Docks**
2. **Dock hinzufügen**:
   - Name: z.B. "TikTok Events"
   - URL: `http://localhost:3000/obs-dock.html`
3. **Dock wird in OBS-UI eingebettet**

### Automatische URL-Generierung

Nutze die API für programmatische Integration:

```javascript
// URL für Goal Overlay generieren
const response = await fetch('/api/obs-browser-source/url/goal-dynamic?key=coins');
const data = await response.json();

console.log(data.url); // http://localhost:3000/goal/coins
console.log(data.width); // 500
console.log(data.height); // 150
```

## 🐛 Troubleshooting

### Problem: Browser Source lädt nicht

**Lösung:**
1. Überprüfe, ob der Server läuft: `http://localhost:3000`
2. Teste die URL im Browser außerhalb von OBS
3. Prüfe Browser-Konsole (F12) auf JavaScript-Fehler
4. Stelle sicher, dass OBS "Control audio via OBS" aktiviert hat

### Problem: Hot-Reload funktioniert nicht

**Lösung:**
1. Prüfe Socket.IO-Verbindung in Browser-Konsole
2. Stelle sicher, dass `enable_hot_reload: true` in der Config ist
3. Teste manuell: `POST /api/obs-browser-source/reload`
4. Prüfe ob Browser Source Socket.IO-Events registriert hat

### Problem: Dynamische Goal URLs funktionieren nicht

**Lösung:**
1. Stelle sicher, dass `key` Parameter angegeben ist:
   ```
   /api/obs-browser-source/url/goal-dynamic?key=coins
   ```
2. Gültige Keys: `likes`, `followers`, `subs`, `coins`
3. Prüfe ob Goal im Dashboard konfiguriert ist

### Problem: CORS-Fehler in OBS

**Lösung:**
1. CORS ist für OBS Browser Sources bereits konfiguriert
2. Stelle sicher, dass keine Proxy/Firewall blockiert
3. Nutze `http://localhost:3000` statt `http://127.0.0.1:3000`
4. Im Zweifel: Server neu starten

### Problem: Audio spielt nicht ab in OBS

**Lösung:**
1. In OBS: Browser Source → Properties → "Control audio via OBS" aktivieren
2. Im Browser Source: Audio Unlock Button klicken (falls angezeigt)
3. OBS Audio-Mixer prüfen: Browser Source sollte sichtbar sein
4. Lautstärke-Pegel in OBS Audio-Mixer erhöhen

## 🔒 Sicherheit

### CORS & CSP

Das Plugin nutzt die bestehende CORS- und CSP-Konfiguration in `server.js`:

- Erlaubt `origin: null` für OBS Browser Sources
- Entfernt `X-Frame-Options` für OBS-kompatible Routes
- Permissive CSP: `default-src 'self' 'unsafe-inline' 'unsafe-eval' ws: wss: http: https: data: blob:`

### Empfohlene Sicherheitsmaßnahmen

1. **Lokaler Zugriff**: Nutze `http://localhost:3000` wenn möglich
2. **Firewall**: Blockiere Port 3000 von extern, wenn nicht benötigt
3. **HTTPS**: Nutze HTTPS mit Let's Encrypt für Remote-OBS-Zugriffe
4. **Authentifizierung**: Noch nicht implementiert (Feature für zukünftige Version)

## 🚀 Erweiterte Nutzung

### Programmgesteuerte URL-Generierung

```javascript
// In eigenem Plugin oder Script
const obsPlugin = pluginLoader.getPluginInstance('obs-browser-source');
const api = obsPlugin.getAPI();

// URL generieren
const overlayUrl = api.generateURL('overlay', { theme: 'dark' });
console.log(overlayUrl); // http://localhost:3000/overlay.html?theme=dark

// Goal URL generieren
const goalUrl = api.generateURL('goal-dynamic', { key: 'coins' });
console.log(goalUrl); // http://localhost:3000/goal/coins

// Hot-Reload triggern
api.reloadSource('overlay');

// Statistiken abrufen
const stats = api.getStats();
console.log(stats); // { total_sources: 7, connected_clients: 3 }
```

### Integration in Flows

Nutze das Plugin in Flow-Actions:

```javascript
// In modules/flows.js
case 'obs-browser-source-reload':
  const obsPlugin = this.pluginLoader.getPluginInstance('obs-browser-source');
  if (obsPlugin) {
    const api = obsPlugin.getAPI();
    api.reloadSource(action.source_id);
  }
  break;
```

## 📚 Weitere Ressourcen

- **OBS WebSocket v5 Docs**: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- **Socket.IO Docs**: https://socket.io/docs/v4/
- **Plugin Development Guide**: `/docs/plugin-development.md` (falls vorhanden)

## 🤝 Support

Bei Problemen oder Feature-Requests:

1. Prüfe dieses README auf bekannte Lösungen
2. Teste mit `GET /api/obs-browser-source/stats` ob Plugin läuft
3. Prüfe Server-Logs auf Fehler
4. Öffne ein Issue im GitHub Repository

## 📄 Changelog

### Version 1.0.0 (Initial Release)

- ✅ URL-Generierung für alle Browser Sources
- ✅ Hot-Reload via Socket.IO
- ✅ API-Endpoints für CRUD-Operationen
- ✅ Legacy URL Support (keine Breaking Changes)
- ✅ CORS & CSP Management
- ✅ Statistiken und Monitoring
- ✅ Vollständige API-Dokumentation

## 📜 Lizenz

Siehe Haupt-Projekt Lizenz.

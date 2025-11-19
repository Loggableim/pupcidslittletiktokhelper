# Pup Cid's Little TikTok Helper - Dokumentation

Diese Datei fasst die wichtigsten Features und Anleitungen für das TikTok Helper Tool zusammen.

---

## 📚 Inhaltsverzeichnis

1. [Quick Start Guide](#quick-start-guide)
2. [Setup-Anleitung](#setup-anleitung)
3. [Cloud Sync Feature](#cloud-sync-feature)
4. [Goals Plugin Architecture](#goals-plugin-architecture)

---

## Quick Start Guide

### ⚡ Schnellstart (3 Minuten)

#### 1. Server starten
```bash
npm start
```
Warte auf: `✅ Pup Cids little TikTok Helper läuft!`

#### 2. Dashboard öffnen
```
http://localhost:3000/dashboard.html
```

#### 3. Status überprüfen
**Speechify konfiguriert?**
```bash
curl -s http://localhost:3000/api/tts/status | grep speechify
```
Erwartung: `"speechify": true`

---

### 🎤 TTS testen

#### Weg 1: Dashboard (GUI)
1. Dashboard → **TTS v2.0** Tab
2. **Queue & Playback** → Text eingeben
3. **Speak** klicken → Audio hören

#### Weg 2: API (Terminal)
```bash
curl -X POST http://localhost:3000/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hallo, das ist ein Test",
    "username": "test",
    "voice": "mads",
    "engine": "speechify"
  }'
```

**Wichtig:** Overlay muss geöffnet sein: `http://localhost:3000/overlay.html`

---

### 📺 TikTok Livestream verbinden

#### Voraussetzungen
- ✅ Du bist LIVE auf TikTok
- ✅ 10-15 Sekunden nach Stream-Start gewartet

#### Weg 1: Dashboard
1. Dashboard → **Connect** Sektion
2. Username eingeben: `pupcid` (ohne @)
3. **Connect** klicken
4. Warte auf: "✓ Connected to @pupcid"

#### Weg 2: API
```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"username": "pupcid"}'
```

---

### 📋 Verfügbare Stimmen

#### Deutsch
- `mads` - Männlich, Conversational
- `ava` - Weiblich, Friendly

#### Englisch
- `george` - Männlich, Conversational
- `henry` - Männlich, Narrative
- `emma` - Weiblich, Friendly
- `gwyneth` - Weiblich, Professional
- `mrbeast` - Männlich, Energetic

**Alle Stimmen anzeigen:**
```bash
curl -s http://localhost:3000/api/tts/voices?engine=speechify | python3 -m json.tool
```

---

### 🐛 Häufige Probleme

#### TTS kein Audio
- ✅ Overlay öffnen: `http://localhost:3000/overlay.html`
- ✅ Im Overlay: "✅ Audio aktivieren" klicken
- ✅ OBS Audio-Mixer: Browser-Source nicht stumm

#### TikTok verbindet nicht
- ✅ Bist du LIVE? (Wichtigste Voraussetzung!)
- ✅ 10-15 Sekunden nach Stream-Start warten
- ✅ Username OHNE @: `pupcid` nicht `@pupcid`
- ✅ Bei SIGI_STATE Error: VPN verwenden

#### Speechify funktioniert nicht
- ✅ Internet-Verbindung prüfen
- ✅ API-Key korrekt? (Status überprüfen)
- ✅ Server neu starten: `npm start`

---

## Setup-Anleitung

### 🎯 Übersicht

Diese Anleitung erklärt:
1. **Speechify TTS** mit API-Key konfigurieren
2. **TikTok Livestream** verbinden
3. TTS im Livestream testen

### ✅ Voraussetzungen

- ✅ Node.js 18+ installiert
- ✅ Server läuft (`npm start`)
- ✅ Internetverbindung vorhanden
- ✅ Speechify API-Key bereit

### 🚀 Installation

```bash
# Repository klonen
git clone https://github.com/yourusername/pupcidslittletiktokhelper.git
cd pupcidslittletiktokhelper

# Dependencies installieren
npm install

# Server starten
npm start
```

Dashboard öffnet sich automatisch unter `http://localhost:3000`

### 🔧 OBS einrichten

**Overlay:**
- Source → Browser Source
- URL: `http://localhost:3000/overlay.html`
- Breite: 1920, Höhe: 1080
- "Shutdown source when not visible" deaktivieren

**Optional - Goal-Overlays:**
```
http://localhost:3000/goal/likes
http://localhost:3000/goal/followers
http://localhost:3000/goal/subs
http://localhost:3000/goal/coins
```

### 🎯 Automatischer Test

Alles auf einmal testen:
```bash
node test-tts-and-connection.js
```

---

## Cloud Sync Feature

### Übersicht

Das Cloud Sync Feature ermöglicht die automatische Synchronisation aller User-Konfigurationen mit Cloud-Speichern wie OneDrive, Google Drive oder Dropbox. Die Synchronisation erfolgt bidirektional und vollständig transparent im Hintergrund.

### Hauptmerkmale

#### ✅ Vollständig optional
- Cloud Sync ist standardmäßig deaktiviert
- Der User muss den Sync bewusst aktivieren
- Kann jederzeit deaktiviert werden ohne Datenverlust

#### ✅ Unterstützte Cloud-Anbieter
- **OneDrive**: Microsoft OneDrive
- **Google Drive**: Google Drive  
- **Dropbox**: Dropbox

#### ✅ Synchronisierte Daten
Das System synchronisiert automatisch:
- User-Settings (alle Einstellungen)
- Plugin-Konfigurationen
- TTS-Profile und Stimmen-Zuweisungen
- Flow-Automationen (IFTTT)
- HUD-Layouts (ClarityHUD, Goals, etc.)
- Emoji-Mappings
- Custom-Assets
- Soundboard-Konfigurationen
- Alle anderen persistenten Daten im `user_configs/` Verzeichnis

#### ✅ Bidirektionale Synchronisation
- **Local → Cloud**: Lokale Änderungen werden automatisch in die Cloud hochgeladen
- **Cloud → Local**: Cloud-Änderungen werden automatisch lokal übernommen
- **Echtzeit-Synchronisation**: File-Watcher überwachen beide Verzeichnisse

#### ✅ Konfliktlösung
- Timestamp-basierte Konfliktlösung
- Die neuere Datei gewinnt automatisch
- Keine manuellen Eingriffe erforderlich

### Verwendung

#### Aktivierung

1. Öffne **Settings** in der Sidebar
2. Scrolle zum Bereich **"Cloud Sync (Optional)"**
3. Klicke auf **"Auswählen"** und gib den Pfad zu deinem Cloud-Ordner ein
4. Klicke auf **"Cloud Sync aktivieren"**

**Beispiel-Pfade:**
- Windows OneDrive: `C:\Users\DeinName\OneDrive\TikTokHelper`
- macOS Google Drive: `/Users/DeinName/Google Drive/TikTokHelper`
- Linux Dropbox: `/home/username/Dropbox/TikTokHelper`

#### Status-Übersicht

Nach der Aktivierung siehst du:
- ✅ **Aktivierungsstatus**: Ob Sync aktiv ist
- 📅 **Letzte Synchronisation**: Zeitpunkt des letzten Syncs
- 📤 **Dateien hochgeladen**: Anzahl hochgeladener Dateien
- 📥 **Dateien heruntergeladen**: Anzahl heruntergeladener Dateien
- ⚠️ **Konflikte gelöst**: Anzahl automatisch gelöster Konflikte
- ✅ **Erfolgreiche Syncs**: Gesamtzahl erfolgreicher Sync-Vorgänge

### API-Endpunkte

#### GET `/api/cloud-sync/status`
Gibt den aktuellen Sync-Status zurück.

#### POST `/api/cloud-sync/enable`
Aktiviert Cloud Sync mit angegebenem Pfad.

**Request:**
```json
{
  "cloudPath": "/path/to/cloud/folder"
}
```

#### POST `/api/cloud-sync/disable`
Deaktiviert Cloud Sync.

#### POST `/api/cloud-sync/manual-sync`
Führt manuellen Sync durch.

### Sicherheit & Datenschutz

#### Keine Cloud-API-Aufrufe
- Das Tool macht **keine direkten API-Aufrufe** an Cloud-Anbieter
- Nutzt ausschließlich lokale Ordner-Synchronisation
- Cloud-Anbieter übernehmen die eigentliche Cloud-Synchronisation

#### Datensicherheit
- **Atomare Schreibvorgänge**: Temporäre Dateien + Rename
- **Kein Datenverlust**: Fehlerbehandlung bei jedem Schritt
- **Preservierung von Timestamps**: Für korrekte Konfliktlösung

### Troubleshooting

#### Cloud Sync aktiviert sich nicht
- **Prüfe Pfad**: Stelle sicher, dass der Pfad existiert und beschreibbar ist
- **Prüfe Berechtigung**: Das Tool benötigt Schreib-/Lesezugriff
- **Cloud-Client läuft**: OneDrive/Google Drive/Dropbox muss laufen

#### Dateien werden nicht synchronisiert
- **Warte kurz**: Sync hat 1 Sekunde Debounce-Zeit
- **Prüfe Logs**: Überprüfe Console-Output für Fehler
- **Manueller Sync**: Trigger manuellen Sync

---

## Goals Plugin Architecture

### Overview

The Goals Plugin is a multi-overlay system that allows streamers to display multiple customizable goals simultaneously. Each goal has its own overlay URL and can be positioned independently in OBS.

### Data Persistence

#### Storage Mechanism

**Goals are stored in the SQLite database**, NOT in JSON config files.

- **Database**: `user_configs/{profile}.db`
- **Table**: `goals`
- **History Table**: `goals_history`

#### Why Database Instead of JSON?

1. **Better performance** - SQL queries are faster than file I/O
2. **ACID compliance** - Atomic transactions prevent data corruption
3. **Relational integrity** - Foreign keys maintain data consistency
4. **History tracking** - Built-in audit trail of all changes
5. **Concurrent access** - Multiple processes can safely access data

### API Endpoints

#### REST API (HTTP)

The plugin uses proper REST API patterns:

- `POST /api/goals` - Create new goal
- `GET /api/goals` - List all goals
- `GET /api/goals/:id` - Get single goal
- `PUT /api/goals/:id` - Update goal
- `DELETE /api/goals/:id` - Delete goal
- `POST /api/goals/:id/increment` - Increment goal value
- `POST /api/goals/:id/reset` - Reset goal to start value
- `GET /api/goals/:id/history` - Get goal change history

#### WebSocket API (Socket.IO)

Real-time updates via WebSocket:

- `goals:get-all` - Request all goals
- `goals:all` - Receive all goals
- `goals:created` - Broadcast when goal created
- `goals:updated` - Broadcast when goal updated
- `goals:deleted` - Broadcast when goal deleted
- `goals:value-changed` - Broadcast when value changes

### Verification

To verify goals are persisting:

```bash
# Check database directly
sqlite3 user_configs/default.db "SELECT id, name, current_value, target_value FROM goals;"

# Check via API
curl http://localhost:3000/api/goals

# Check server logs
grep "Loaded.*goals from database" server.log
```

### Troubleshooting

#### Goals not appearing in UI

1. **Check browser console** for JavaScript errors
2. **Verify WebSocket connection** - Look for "Connected" in console
3. **Check server logs** - Search for "Goals Plugin" messages
4. **Verify database** - Check if goals table exists and has data

#### Goals not persisting

1. **Verify database file exists**: `user_configs/{profile}.db`
2. **Check file permissions**: Database file must be writable
3. **Review server logs**: Look for database errors during save
4. **Check disk space**: Ensure system has available storage

### Testing

#### Manual Test for Persistence

```bash
# 1. Start server
node server.js

# 2. Create a goal
curl -X POST http://localhost:3000/api/goals \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","goal_type":"coin","target_value":1000}'

# 3. Verify creation
curl http://localhost:3000/api/goals

# 4. Restart server (Ctrl+C, then node server.js again)

# 5. Verify goal still exists
curl http://localhost:3000/api/goals
```

Expected: Goal persists across restart

---

## Support

- 📖 README & Troubleshooting-Sektion
- 🐛 [GitHub Issues](https://github.com/yourusername/pupcidslittletiktokhelper/issues)
- 📧 [loggableim@gmail.com](mailto:loggableim@gmail.com)

---

**Entwickelt für Pup Cid's Little TikTok Helper**
**Letzte Aktualisierung:** 2025-11-18

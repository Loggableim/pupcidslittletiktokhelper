# Cloud Sync Documentation

## Übersicht

Das Cloud Sync Feature ermöglicht die automatische Synchronisation aller User-Konfigurationen mit Cloud-Speichern wie OneDrive, Google Drive oder Dropbox. Die Synchronisation erfolgt bidirektional und vollständig transparent im Hintergrund.

## Hauptmerkmale

### ✅ Vollständig optional
- Cloud Sync ist standardmäßig deaktiviert
- Der User muss den Sync bewusst aktivieren
- Kann jederzeit deaktiviert werden ohne Datenverlust

### ✅ Unterstützte Cloud-Anbieter
- **OneDrive**: Microsoft OneDrive
- **Google Drive**: Google Drive  
- **Dropbox**: Dropbox

### ✅ Synchronisierte Daten
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

### ✅ Bidirektionale Synchronisation
- **Local → Cloud**: Lokale Änderungen werden automatisch in die Cloud hochgeladen
- **Cloud → Local**: Cloud-Änderungen werden automatisch lokal übernommen
- **Echtzeit-Synchronisation**: File-Watcher überwachen beide Verzeichnisse

### ✅ Konfliktlösung
- Timestamp-basierte Konfliktlösung
- Die neuere Datei gewinnt automatisch
- Keine manuellen Eingriffe erforderlich

### ✅ Datensicherheit
- **Atomare Schreibvorgänge**: Verhindert Datenverlust bei Schreibfehlern
- **Kein Datenverlust**: Selbst bei Fehlern bleiben lokale Daten erhalten
- **Keine direkten API-Calls**: Nutzt nur lokale Ordner-Synchronisation

## Funktionsweise

### Technische Architektur

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Local Storage  │ ←─────→ │  Sync Engine     │ ←─────→ │  Cloud Folder   │
│  user_configs/  │  Watch  │  (File Watcher)  │  Watch  │  (OneDrive/etc) │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                      │
                                      ↓
                            ┌──────────────────┐
                            │  Timestamp-Based │
                            │  Conflict Mgmt   │
                            └──────────────────┘
```

### Sync-Engine Details

1. **Initialer Sync beim Start**
   - Vergleicht alle Dateien in beiden Verzeichnissen
   - Lädt neuere Cloud-Dateien herunter
   - Lädt neuere lokale Dateien hoch
   - Löst Konflikte automatisch

2. **Echtzeit-Überwachung**
   - File-Watcher auf lokalem Verzeichnis
   - File-Watcher auf Cloud-Verzeichnis
   - Debounced Synchronisation (1 Sekunde)
   - Verhindert Sync-Schleifen

3. **Konfliktlösung**
   - Vergleich der Timestamps (`mtime`)
   - Neuere Datei überschreibt ältere
   - Statistiken werden protokolliert

## Verwendung

### Aktivierung

1. Öffne **Settings** in der Sidebar
2. Scrolle zum Bereich **"Cloud Sync (Optional)"**
3. Klicke auf **"Auswählen"** und gib den Pfad zu deinem Cloud-Ordner ein
4. Klicke auf **"Cloud Sync aktivieren"**

**Beispiel-Pfade:**
- Windows OneDrive: `C:\Users\DeinName\OneDrive\TikTokHelper`
- macOS Google Drive: `/Users/DeinName/Google Drive/TikTokHelper`
- Linux Dropbox: `/home/username/Dropbox/TikTokHelper`

### Status-Übersicht

Nach der Aktivierung siehst du:
- ✅ **Aktivierungsstatus**: Ob Sync aktiv ist
- 📅 **Letzte Synchronisation**: Zeitpunkt des letzten Syncs
- 📤 **Dateien hochgeladen**: Anzahl hochgeladener Dateien
- 📥 **Dateien heruntergeladen**: Anzahl heruntergeladener Dateien
- ⚠️ **Konflikte gelöst**: Anzahl automatisch gelöster Konflikte
- ✅ **Erfolgreiche Syncs**: Gesamtzahl erfolgreicher Sync-Vorgänge

### Manueller Sync

- Klicke auf **"Manueller Sync"** um einen sofortigen Sync zu triggern
- Nützlich nach großen Änderungen

### Deaktivierung

1. Klicke auf **"Cloud Sync deaktivieren"**
2. Die Synchronisation wird gestoppt
3. **Lokale Daten bleiben unberührt**
4. Cloud-Daten bleiben ebenfalls erhalten

## API-Endpunkte

### GET `/api/cloud-sync/status`
Gibt den aktuellen Sync-Status zurück.

**Response:**
```json
{
  "success": true,
  "enabled": true,
  "cloudPath": "/path/to/cloud",
  "syncInProgress": false,
  "lastSyncTime": "2025-11-17T23:44:37.000Z",
  "stats": {
    "totalSyncs": 1,
    "successfulSyncs": 1,
    "failedSyncs": 0,
    "filesUploaded": 5,
    "filesDownloaded": 0,
    "conflicts": 0
  },
  "watchers": {
    "local": true,
    "cloud": true
  }
}
```

### POST `/api/cloud-sync/enable`
Aktiviert Cloud Sync mit angegebenem Pfad.

**Request:**
```json
{
  "cloudPath": "/path/to/cloud/folder"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cloud sync enabled successfully",
  "enabled": true,
  "cloudPath": "/path/to/cloud/folder"
}
```

### POST `/api/cloud-sync/disable`
Deaktiviert Cloud Sync.

**Response:**
```json
{
  "success": true,
  "message": "Cloud sync disabled successfully",
  "enabled": false
}
```

### POST `/api/cloud-sync/manual-sync`
Führt manuellen Sync durch.

**Response:**
```json
{
  "success": true,
  "message": "Manual sync completed successfully",
  "stats": {
    "filesUploaded": 2,
    "filesDownloaded": 1
  }
}
```

### POST `/api/cloud-sync/validate-path`
Validiert einen Cloud-Pfad.

**Request:**
```json
{
  "cloudPath": "/path/to/validate"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "error": null
}
```

## Logging

Alle Sync-Operationen werden protokolliert:

```
[CloudSync] Initializing cloud sync engine...
[CloudSync] Configuration loaded: enabled=false, cloudPath=not set
[CloudSync] Enabling sync with cloud path: /path/to/cloud
[CloudSync] Starting initial sync...
[CloudSync] Initial sync completed: 5 uploaded, 0 downloaded, 0 conflicts resolved
[CloudSync] Starting file watchers...
[CloudSync] Local directory watcher started
[CloudSync] Cloud directory watcher started
[CloudSync] Cloud sync enabled successfully
[CloudSync] New local file, uploaded to cloud: test-config.json
[CloudSync] Cloud change detected, downloaded to local: settings.json
```

## Sicherheit & Datenschutz

### Keine Cloud-API-Aufrufe
- Das Tool macht **keine direkten API-Aufrufe** an Cloud-Anbieter
- Nutzt ausschließlich lokale Ordner-Synchronisation
- Cloud-Anbieter übernehmen die eigentliche Cloud-Synchronisation

### Datensicherheit
- **Atomare Schreibvorgänge**: Temporäre Dateien + Rename
- **Kein Datenverlust**: Fehlerbehandlung bei jedem Schritt
- **Preservierung von Timestamps**: Für korrekte Konfliktlösung

### Datenschutz
- Alle Daten bleiben in deinem Cloud-Speicher
- Keine Übertragung an Dritte
- Volle Kontrolle über Daten

## Troubleshooting

### Cloud Sync aktiviert sich nicht
- **Prüfe Pfad**: Stelle sicher, dass der Pfad existiert und beschreibbar ist
- **Prüfe Berechtigung**: Das Tool benötigt Schreib-/Lesezugriff
- **Cloud-Client läuft**: OneDrive/Google Drive/Dropbox muss laufen

### Dateien werden nicht synchronisiert
- **Warte kurz**: Sync hat 1 Sekunde Debounce-Zeit
- **Prüfe Logs**: Überprüfe Console-Output für Fehler
- **Manueller Sync**: Trigger manuellen Sync

### Konflikte
- Werden automatisch gelöst
- Neuere Datei gewinnt
- Statistik zeigt Anzahl der Konflikte

### Performance
- File-Watcher sind ressourcenschonend
- Debouncing verhindert excessive Syncs
- Nur geänderte Dateien werden synchronisiert

## Best Practices

1. **Wähle einen dedizierten Ordner**: Erstelle einen separaten Ordner für TikTok Helper
2. **Regelmäßige Backups**: Cloud-Sync ersetzt keine Backups
3. **Teste erst lokal**: Aktiviere Sync erst nach erfolgreicher Konfiguration
4. **Überwache Statistiken**: Behalte Sync-Stats im Auge
5. **Bei Problemen deaktivieren**: Deaktiviere Sync bei Problemen

## Entwickler-Informationen

### Module
- **`modules/cloud-sync.js`**: Haupt-Engine für Cloud-Synchronisation
- **`public/js/cloud-sync-settings.js`**: Frontend-UI-Handler
- **`server.js`**: Integration und API-Routes

### Erweiterbarkeit
Die Sync-Engine ist modular aufgebaut und kann erweitert werden:
- Zusätzliche Cloud-Anbieter
- Erweiterte Konfliktlösungsstrategien
- Selektive Synchronisation
- Verschlüsselung

### Testing
```bash
node test-cloud-sync.js
```

Führt umfassende Tests der Sync-Engine aus.

## Changelog

### Version 1.0.0 (2025-11-17)
- ✅ Initiale Implementierung
- ✅ Bidirektionale Synchronisation
- ✅ Timestamp-basierte Konfliktlösung
- ✅ File-Watcher für Echtzeit-Sync
- ✅ UI-Integration in Settings
- ✅ API-Endpunkte
- ✅ Umfassendes Logging
- ✅ Atomare Schreibvorgänge
- ✅ Test-Suite

## Support

Bei Problemen:
1. Überprüfe Logs im Terminal
2. Teste mit `node test-cloud-sync.js`
3. Erstelle ein GitHub Issue mit Logs

---

**Entwickelt für Pup Cid's Little TikTok Helper**

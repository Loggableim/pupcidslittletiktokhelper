# Gift Milestone Celebration Plugin

## Übersicht

Das Gift Milestone Celebration Plugin feiert Coin-Meilensteine mit benutzerdefinierten Animationen und Sounds. Es bietet sowohl globale Meilensteine als auch individuelle Benutzer-Tier-Tracking.

## Features

### ✅ Multi-Tier System
- **5 Standard-Tiers**: Bronze (1.000), Silver (5.000), Gold (10.000), Platinum (25.000), Diamond (50.000)
- Unbegrenzt erweiterbar
- Jedes Tier kann eigene Animationen haben (GIF, Video, Audio)
- Tiers können aktiviert/deaktiviert werden

### ✅ Per-User Tracking
- Verfolgt individuelle Benutzerbeiträge
- Zeigt Top-10-Spender
- Tier-Erfolge pro Benutzer
- Automatische Celebration wenn Benutzer neues Tier erreicht

### ✅ Flexible Konfiguration
- Auto-Increment oder fixer Schwellenwert
- Exklusiver oder paralleler Wiedergabe-Modus
- Anpassbare Audio-Lautstärke
- Session-Reset-Option

## Installation

Das Plugin ist bereits installiert und muss nur aktiviert werden:

1. Öffne Dashboard → Plugin Manager
2. Aktiviere "Gift Milestone Celebration"
3. Gehe zu Dashboard → Gift Milestone

## Verwendung

### UI-Konfiguration

#### Basis-Einstellungen
- **Plugin Status**: An/Aus-Schalter
- **Initialer Schwellenwert**: Coins für ersten Meilenstein
- **Schrittweite**: Auto-Increment Schrittgröße
- **Modus**: Auto-Increment oder Fixed
- **Wiedergabe-Modus**: Exklusiv (pausiert andere Alerts) oder Parallel

#### Medien hochladen
- **GIF/Bild**: Animation für Celebrations
- **Video**: MP4, WebM, MOV, AVI
- **Audio**: MP3, WAV, OGG, M4A

#### Tier-Verwaltung
- **Tiers anzeigen**: Liste aller konfigurierten Tiers
- **Tier bearbeiten**: Name und Schwellenwert ändern
- **Tier löschen**: Tier entfernen
- **Neues Tier**: Custom Tier hinzufügen

#### Benutzer-Statistiken
- **Top 10 Spender**: Geordnet nach Gesamtcoins
- **Aktuelles Tier**: Zeigt erreichtes Tier pro Benutzer
- **Letzter Trigger**: Zeitpunkt der letzten Tier-Erreichung

### Overlay

Das Overlay zeigt Celebrations in OBS:

1. Öffne: `http://localhost:3000/gift-milestone/overlay`
2. Füge als Browser Source in OBS hinzu
3. Empfohlene Größe: 1920x1080

#### Celebration-Typen

**Globaler Meilenstein:**
```
🎯 1.000 Coins Milestone! 🎉
```

**Benutzer-Tier:**
```
🏆 Username erreichte Gold! (10.000 Coins) 🎉
```

## API Endpoints

### Tiers

**GET** `/api/gift-milestone/tiers`
- Alle Tiers abrufen

**POST** `/api/gift-milestone/tiers`
- Neues Tier erstellen
```json
{
  "tier_name": "Emerald",
  "threshold": 75000,
  "sort_order": 6
}
```

**PUT** `/api/gift-milestone/tiers/:id`
- Tier aktualisieren

**DELETE** `/api/gift-milestone/tiers/:id`
- Tier löschen

### Benutzer

**GET** `/api/gift-milestone/users`
- Alle Benutzer-Stats abrufen
- Optional: `?userId=XXX` für spezifischen Benutzer

**POST** `/api/gift-milestone/users/:userId/reset`
- Benutzer-Stats zurücksetzen

### Konfiguration

**GET** `/api/gift-milestone/config`
- Aktuelle Konfiguration abrufen

**POST** `/api/gift-milestone/config`
- Konfiguration aktualisieren

**POST** `/api/gift-milestone/toggle`
- Plugin aktivieren/deaktivieren

**POST** `/api/gift-milestone/reset`
- Globale Statistiken zurücksetzen

**POST** `/api/gift-milestone/test`
- Test-Celebration auslösen

## Socket.IO Events

### Empfangen (Client)

**`milestone:celebrate`**
```javascript
{
  milestone: 10000,
  tierName: "Gold",      // Optional bei Tier
  username: "PupCid",     // Optional bei Tier
  totalCoins: 10500,      // Optional bei Tier
  gif: "/path/to/gif",
  video: "/path/to/video",
  audio: "/path/to/audio",
  audioVolume: 80,
  duration: 5000,
  playbackMode: "exclusive",
  isTier: true            // true bei Tier-Celebration
}
```

**`milestone:user-achievement`**
```javascript
{
  userId: "user123",
  username: "PupCid",
  tier: { id: 3, tier_name: "Gold", threshold: 10000 },
  totalCoins: 10500
}
```

**`milestone:stats-update`**
```javascript
{
  cumulative_coins: 5000,
  current_milestone: 10000
}
```

**`milestone:exclusive-start`** / **`milestone:exclusive-end`**
- Signalisiert exklusiven Wiedergabe-Modus für andere Plugins

## Datenbank-Schema

### milestone_tiers
```sql
CREATE TABLE milestone_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_name TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    animation_gif_path TEXT,
    animation_video_path TEXT,
    animation_audio_path TEXT,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### milestone_user_stats
```sql
CREATE TABLE milestone_user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    username TEXT,
    cumulative_coins INTEGER DEFAULT 0,
    current_tier_id INTEGER,
    last_trigger_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Troubleshooting

### Plugin wird nicht angezeigt
- ✅ **Gelöst**: Plugin ist jetzt standardmäßig aktiviert
- Überprüfe Plugin Manager ob "Gift Milestone Celebration" aktiviert ist

### Celebration wird nicht ausgelöst
- Überprüfe ob Plugin-Status auf "Aktiviert" steht
- Stelle sicher dass genug Coins für Schwellenwert erreicht wurden
- Teste mit "🧪 Celebration testen" Button

### Overlay zeigt nichts
- Stelle sicher Overlay-URL korrekt ist
- Aktiviere Audio in OBS Browser Source
- Überprüfe Browser-Console auf Fehler

### Medien werden nicht geladen
- Unterstützte Formate beachten
- Maximale Dateigröße: GIF 25MB, Video 100MB, Audio 25MB
- Überprüfe ob Dateien erfolgreich hochgeladen wurden

## Best Practices

1. **Tier-Abstände**: Verwende sinnvolle Abstände zwischen Tiers (z.B. 1k, 5k, 10k, 25k, 50k)
2. **Media-Größe**: Halte Dateien klein für schnelles Laden
3. **Test-Modus**: Nutze Test-Button vor Live-Stream
4. **Backup**: Exportiere Tier-Konfiguration regelmäßig
5. **Session-Reset**: Aktiviere nur wenn gewünscht (löscht Stats bei Neustart)

## Version History

### v1.0.0 (2025-11-21)
- ✅ Multi-Tier System implementiert
- ✅ Per-User Tracking hinzugefügt
- ✅ UI für Tier-Verwaltung
- ✅ Benutzer-Statistiken-Anzeige
- ✅ Plugin standardmäßig aktiviert
- ✅ CodeQL Security-Check bestanden

## Support

Bei Fragen oder Problemen:
- GitHub Issues: [Repository Issues](https://github.com/Loggableim/pupcidslittletiktokhelper/issues)
- TikTok: [@pupcid](https://www.tiktok.com/@pupcid)

---

**Entwickelt mit ❤️ für die TikTok LIVE Community**

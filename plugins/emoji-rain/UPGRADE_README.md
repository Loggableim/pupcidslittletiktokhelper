# EmojiRain Plugin - Vollständiges Upgrade

## Übersicht

Das EmojiRain-Plugin wurde komplett überarbeitet und um zahlreiche neue Features erweitert. Es bietet jetzt eine vollständige Integration mit dem Automation-Flow-System, SuperFan-Unterstützung, erweiterte Physik-Simulation und Performance-Optimierungen.

## ✨ Neue Features

### 1. 🎯 Gift-Triggered Rain in Automation Flows

Das Plugin ist jetzt vollständig in das Flow-System integriert:

**Flow Action: "Trigger Emoji Rain"**
- **Parameter:**
  - Emoji/Text: Welches Emoji gespawnt werden soll (leer = zufällig)
  - Count: Anzahl der Emojis (1-100)
  - Duration: Dauer in ms (0 = einzelner Burst)
  - Intensity: Multiplikator für Emoji-Anzahl (0.1-5.0)
  - Burst Mode: SuperFan-Stil Burst aktivieren

**Flow Conditions:**
- Gift-Typ: Filtern nach Geschenk-Name
- Gift-Wert: Filtern nach Coin-Wert
- SuperFan Level: Filtern nach SuperFan-Status (1-3)

**Beispiel-Flow:**
```json
{
  "trigger_type": "gift",
  "trigger_condition": {
    "field": "gift_value",
    "operator": ">=",
    "value": 100
  },
  "actions": [
    {
      "type": "emoji_rain_trigger",
      "emoji": "💎",
      "count": 50,
      "intensity": 2.0,
      "burst": true
    }
  ]
}
```

### 2. ⭐ SuperFan Rain Burst

Automatischer Burst-Modus bei SuperFan-Events:

- **Burst Intensity:** Multiplikator für Emoji-Anzahl (1-10x)
- **Burst Duration:** Dauer des Effekts (500-10000ms)
- **Auto-Trigger:** Automatisch bei SuperFan1, SuperFan2, SuperFan3
- **Flow-Integration:** Kann auch manuell über Flows ausgelöst werden

**Konfiguration im UI:**
- Checkbox: SuperFan Burst aktivieren
- Slider: Burst Intensität (Standard: 3.0x)
- Input: Burst Dauer (Standard: 2000ms)

### 3. 👤 Per-User Emoji Selection

Jedem Benutzer kann ein individuelles Emoji zugewiesen werden:

- **User-Mapping:** Speicherung in `/data/plugins/emojirain/users.json`
- **Fallback:** Globales Default-Emoji wenn kein Mapping existiert
- **UI-Verwaltung:**
  - User-Filter zum Suchen
  - Emoji-Auswahl aus Standard-Set oder Custom
  - Hinzufügen/Löschen von Mappings
  - Live-Update ohne Reload

**API-Endpunkte:**
- `GET /api/emoji-rain/user-mappings` - Alle Mappings laden
- `POST /api/emoji-rain/user-mappings` - Mappings speichern

**Beispiel users.json:**
```json
{
  "username1": "🌟",
  "username2": "💎",
  "username3": "🔥"
}
```

### 4. 💨 Wind Simulation

Horizontale Bewegung der Emojis:

- **Wind Enabled:** ON/OFF Toggle
- **Wind Strength:** 0-100 (Stärke)
- **Wind Direction:**
  - Auto: Natürliche Variation
  - Left: Konstanter Wind nach links
  - Right: Konstanter Wind nach rechts
- **Performance:** FPS-optimiert mit Tweening

### 5. 🏀 Enhanced Bounce Physics

Erweiterte Sprungphysik:

- **Floor Enabled:** Boden ein/aus
  - ON: Emojis prallen vom Boden ab
  - OFF: Free-Flow Mode (Emojis fliegen durch)
- **Bounce Height:** Wie hoch Emojis zurückprallen (0-1)
- **Damping:** Energieverlust nach jedem Bounce (0-1)

### 6. 🎨 EmojiColorizer / Theme Tone

Theme-basierte Farbgebung:

**Modi:**
- **Off:** Keine Farbänderung
- **Warm:** Sepia, erhöhte Sättigung, wärmer
- **Cool:** Hue-Shift, kühler
- **Neon:** Maximale Sättigung, hoher Kontrast
- **Pastel:** Reduzierte Sättigung, heller

**Intensität:** 0-1 (Stärke des Effekts)

**Implementierung:** CSS Filter (CSP-kompatibel)

### 7. 🌈 Rainbow Mode

Kontinuierliche Hue-Rotation (Pride-Style):

- **Rainbow Enabled:** ON/OFF Toggle
- **Rainbow Speed:** Rotationsgeschwindigkeit (0.1-5.0)
- **Priorität:** Rainbow-Modus überschreibt ColorTheme
- **Implementierung:** CSS hue-rotate Filter

### 8. 🕹️ Retro Pixel Mode

8-Bit Retro Pixelisierung:

- **Pixel Enabled:** ON/OFF Toggle
- **Pixel Size:** Pixelgröße 1-10 (höher = gröber)
- **Implementierung:** CSS image-rendering: pixelated

### 9. ⚡ Dynamic FPS Optimization

Automatische Performance-Anpassung:

**Features:**
- **FPS Monitoring:** Kontinuierliche Überwachung
- **Performance Modes:**
  - Normal: Alle Features aktiv
  - Reduced: Reduzierte Emoji-Anzahl, manche Effekte deaktiviert
  - Minimal: Minimale Emoji-Anzahl, alle Effekte aus
- **Auto-Adjustments:**
  - Reduktion der Spawn-Rate
  - Reduktion aktiver Emojis
  - Deaktivierung kostenintensiver Effekte (Pixel, Rainbow, Wind)

**Konfiguration:**
- **FPS Optimization Enabled:** ON/OFF
- **Sensitivity:** 0-1 (0 = träge, 1 = aggressiv)
- **Target FPS:** Ziel-Framerate (30-120)

**Performance Display:**
- Aktuelle FPS
- Aktive Emojis
- Performance-Modus

## 🔧 Technische Details

### CSP-Compliance

Alle Änderungen sind Content Security Policy (CSP) kompatibel:

- ✅ Keine Inline-Scripts
- ✅ Keine Inline-Event-Handler (onClick, onInput, etc.)
- ✅ Alle Event-Listener via addEventListener
- ✅ Dynamisches DOM nur mit createElement

### Architektur

```
plugins/emoji-rain/
├── main.js                    # Plugin-Hauptdatei (Backend)
├── ui.html                    # UI-Konfiguration
├── overlay.html               # Overlay für OBS
└── uploads/                   # Hochgeladene Bilder

public/js/
├── emoji-rain-engine.js       # Neue Engine mit allen Features
└── emoji-rain-ui.js           # UI-Controller (CSP-konform)

data/plugins/emojirain/
├── config.json                # Konfiguration
└── users.json                 # User-Emoji-Mappings

modules/
└── flows.js                   # Flow-System (erweitert)
```

### API-Endpunkte

**Neue Endpunkte:**
- `POST /api/emoji-rain/trigger` - Emoji Rain via API auslösen
- `GET /api/emoji-rain/user-mappings` - User-Mappings laden
- `POST /api/emoji-rain/user-mappings` - User-Mappings speichern

**Bestehende Endpunkte:**
- `GET /api/emoji-rain/config` - Konfiguration laden
- `POST /api/emoji-rain/config` - Konfiguration speichern
- `POST /api/emoji-rain/toggle` - Plugin aktivieren/deaktivieren
- `POST /api/emoji-rain/test` - Test-Rain spawnen
- `POST /api/emoji-rain/upload` - Bild hochladen
- `GET /api/emoji-rain/images` - Hochgeladene Bilder
- `DELETE /api/emoji-rain/images/:filename` - Bild löschen

### Socket.IO Events

**Ausgehend (Server → Client):**
- `emoji-rain:spawn` - Emoji spawnen
- `emoji-rain:config-update` - Config aktualisiert
- `emoji-rain:toggle` - Plugin aktiviert/deaktiviert
- `emoji-rain:user-mappings-update` - User-Mappings aktualisiert

### Konfigurationsschema

```javascript
{
  // Basis
  enabled: boolean,
  width_px: number,
  height_px: number,
  emoji_set: string[],
  use_custom_images: boolean,
  image_urls: string[],
  effect: 'bounce' | 'bubble' | 'none',
  
  // Physik
  physics_gravity_y: number,       // 0-3
  physics_air: number,              // 0-0.2
  physics_friction: number,         // 0-1
  physics_restitution: number,      // 0-1
  
  // Wind
  wind_enabled: boolean,
  wind_strength: number,            // 0-100
  wind_direction: 'auto' | 'left' | 'right',
  
  // Bounce
  floor_enabled: boolean,
  bounce_height: number,            // 0-1
  bounce_damping: number,           // 0-1
  
  // Farben
  color_mode: 'off' | 'warm' | 'cool' | 'neon' | 'pastel',
  color_intensity: number,          // 0-1
  
  // Rainbow
  rainbow_enabled: boolean,
  rainbow_speed: number,            // 0.1-5.0
  
  // Pixel
  pixel_enabled: boolean,
  pixel_size: number,               // 1-10
  
  // SuperFan
  superfan_burst_enabled: boolean,
  superfan_burst_intensity: number, // 1-10
  superfan_burst_duration: number,  // 500-10000
  
  // FPS
  fps_optimization_enabled: boolean,
  fps_sensitivity: number,          // 0-1
  target_fps: number,               // 30-120
  
  // Appearance
  emoji_min_size_px: number,        // 20-200
  emoji_max_size_px: number,        // 20-200
  emoji_rotation_speed: number,     // 0-0.2
  emoji_lifetime_ms: number,        // 0-30000
  emoji_fade_duration_ms: number,   // 0-3000
  max_emojis_on_screen: number,     // 10-500
  
  // Scaling
  like_count_divisor: number,
  like_min_emojis: number,
  like_max_emojis: number,
  gift_base_emojis: number,
  gift_coin_multiplier: number,     // 0-1
  gift_max_emojis: number
}
```

## 📖 Verwendung

### 1. Flow-Integration

**Emoji Rain bei teuren Gifts:**
```
Trigger: Gift erhalten
Condition: gift_value >= 1000
Action: Trigger Emoji Rain
  - Emoji: 💎
  - Count: 100
  - Intensity: 3.0
  - Burst: true
```

**User-spezifischer Rain:**
```
Trigger: Gift erhalten
Action: Trigger Emoji Rain
  - Count: 50
  - (Emoji wird automatisch aus user-mappings geladen)
```

### 2. SuperFan Burst

1. SuperFan Burst im UI aktivieren
2. Intensität einstellen (empfohlen: 2-4x)
3. Bei SuperFan-Events wird automatisch Burst ausgelöst
4. Kann auch manuell via Flow mit `burst: true` getriggert werden

### 3. User-Emoji-Mappings

1. Öffne Plugin-UI
2. Scrolle zu "Benutzerspezifische Emojis"
3. Gib Username und Emoji ein
4. Klicke "Hinzufügen"
5. Bei Events von diesem User wird automatisch das zugewiesene Emoji verwendet

### 4. Performance-Optimierung

- FPS-Optimierung standardmäßig aktiviert
- Bei FPS-Drop werden automatisch Effekte reduziert
- Performance-Status im UI überwachen
- Sensitivity anpassen für aggressivere/sanftere Optimierung

## 🎮 OBS Integration

### Standard Overlay
```
URL: http://localhost:3000/emoji-rain/overlay
Breite: 1280 (oder custom)
Höhe: 720 (oder custom)
```

### OBS HUD (High-Quality)
```
URL: http://localhost:3000/emoji-rain/obs-hud
Breite: 1920 (oder custom)
Höhe: 1080 (oder custom)
FPS: 60
```

## 🐛 Debugging

**Debug-Modus aktivieren:**
- Drücke `Ctrl+D` im Overlay
- Zeigt FPS, Emoji-Count, Wind-Kraft, Bodies, etc.

**Console Logs:**
- Engine: `🌧️ Spawned ${count}x ${emoji}`
- Performance: `⚡ FPS optimization: Switching to ${mode}`
- User Mappings: `✅ User emoji mappings loaded`

## 🔒 Sicherheit

Alle Features sind CSP-konform implementiert:

- Keine `eval()` oder `new Function()`
- Keine Inline-Scripts
- Keine Inline-Event-Handler
- Keine unsicheren DOM-Operationen
- Keine externen Script-Quellen (außer definierte)

## 📊 Performance

**Optimierungen:**
- Hardware-Beschleunigung (`transform3d`, `will-change`)
- Effiziente DOM-Updates
- FPS-Throttling
- Automatische Reduktion bei Performance-Problemen
- Lazy Loading von Features
- Objekt-Pooling für Emojis

**Benchmark (1920x1080, 60 FPS):**
- ~200 Emojis: 60 FPS (Normal Mode)
- ~140 Emojis: 60 FPS (Reduced Mode, Wind/Rainbow off)
- ~70 Emojis: 60 FPS (Minimal Mode, alle Effekte off)

## 📝 Changelog

### v3.0.0 - Complete Upgrade
- ✅ Flow-Integration mit Trigger-Action
- ✅ SuperFan Burst-Modus
- ✅ Per-User Emoji Selection
- ✅ Wind Simulation (3 Modi)
- ✅ Enhanced Bounce Physics
- ✅ Color Themes (5 Modi)
- ✅ Rainbow Mode
- ✅ Retro Pixel Mode
- ✅ Dynamic FPS Optimization
- ✅ CSP-Compliance
- ✅ Vollständiges UI für alle Features
- ✅ API-Erweiterungen
- ✅ Performance-Monitoring

## 🤝 Contributing

Alle Änderungen folgen der CSP-Policy. Bei neuen Features beachten:
- Keine Inline-Scripts
- Event-Listener via `addEventListener`
- DOM-Manipulation mit `createElement`
- Performance-Auswirkungen testen

## 📄 License

MIT License - siehe Haupt-Repository

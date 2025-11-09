# Changelog

All notable changes to Pup Cid's Little TikTok Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Plugin System**: Vollständiges Plugin-System für modulare Erweiterungen
  - Plugin-Loader mit Lifecycle-Management (init, destroy)
  - PluginAPI mit sicheren Hooks für Routes, Socket.io und TikTok-Events
  - Plugin-Manager UI im Dashboard (Upload, Enable, Disable, Delete, Reload)
  - Beispiel-Plugin "Topboard" (Top Gifters, Streaks)
  - Plugin-State-Persistierung in `plugins_state.json`
  - Hot-Loading ohne Server-Neustart

- **Update-System**: Automatische Update-Prüfung via GitHub API
  - GitHub Releases API Integration
  - Semantic Versioning Vergleich
  - Auto-Check alle 24 Stunden
  - Update-Download via `git pull` + `npm install`
  - Dashboard-Banner bei verfügbarem Update
  - Manuelle Update-Anleitung als Fallback

- **Audio-Aktivierungs-Banner**: Prominente Warnung auf Dashboard-Homepage
  - Erklärt Browser Autoplay Policy
  - Schritt-für-Schritt-Anleitung
  - Direkter Link zu Overlay
  - Dismissable mit LocalStorage-Persistenz

### Changed
- **TTS zu Plugin migriert**: TTS-Engine jetzt als Plugin (`plugins/tts/`)
  - 75+ Stimmen (TikTok + Google TTS)
  - User-spezifische Voice-Mappings
  - Queue-Management (max 100 Items)
  - Auto-TTS für Chat mit Team-Level-Filter
  - API-Routes: `/api/voices`, `/api/tts/test`

- **VDO.Ninja zu Plugin migriert**: VDO.Ninja Manager jetzt als Plugin (`plugins/vdoninja/`)
  - 20 API-Routes für Room/Guest/Layout-Management
  - 8 Socket.io-Events für Real-time-Kontrolle
  - Multi-Guest-Streaming-Unterstützung
  - Automatische Injektion in Flows für Automation

- **Server.js Refactoring**: ~350 Zeilen entfernt
  - TTS Instanziierung und Routes entfernt
  - VDO.Ninja Instanziierung und Routes entfernt
  - TTS-Aufrufe aus TikTok-Events entfernt
  - VDO.Ninja Socket.io-Events entfernt
  - Flows erhält TTS=null (wird via Plugin injiziert)

- **Dynamic UI Visibility**: Dashboard-Tabs basierend auf aktiven Plugins
  - TTS-Tab nur sichtbar wenn TTS-Plugin aktiv
  - Multi-Guest-Tab nur sichtbar wenn VDO.Ninja-Plugin aktiv
  - Automatisches Ausblenden bei Plugin-Deaktivierung
  - Automatisches Einblenden bei Plugin-Aktivierung
  - Kein Page-Reload erforderlich

### Fixed
- **Update-Checker**: Graceful 404-Handling (keine GitHub Releases = Info statt Error)
- **Plugin-UI-Synchronisation**: UI bleibt nicht mehr sichtbar wenn Plugin deaktiviert wird

### Technical
- **Dependencies**: `zip-lib` für Plugin-ZIP-Extraktion
- **Module**:
  - `modules/plugin-loader.js` (545 Zeilen)
  - `modules/update-checker.js` (261 Zeilen)
- **Routes**:
  - `routes/plugin-routes.js` (484 Zeilen)
  - Plugin-Routes: GET/POST/DELETE `/api/plugins/*`
  - Update-Routes: GET/POST `/api/update/*`
- **Frontend**:
  - `public/js/plugin-manager.js` (372 Zeilen)
  - `public/js/update-checker.js` (270 Zeilen)
- **Architecture**: Event-driven Plugin-System mit Hot-Reloading

### Breaking Changes
- TTS und VDO.Ninja erfordern jetzt Plugin-Aktivierung (standardmäßig aktiviert)
- TTS- und VDO.Ninja-Routes wurden verschoben (von `/api/*` zu Plugin-Routes)
- Keine funktionalen Änderungen für Endnutzer (abwärtskompatibel)

---

## [0.9.0] - VDO.Ninja Multi-Guest Integration

### Added
- **VDO.Ninja Integration**: Multi-Guest-Streaming-Unterstützung
  - Room-Management für Live-Streams
  - Guest-Verwaltung (Add, Remove, Layout)
  - 20+ API-Endpoints für VDO.Ninja-Steuerung
  - Real-time Socket.io-Events
  - Integration mit Flow-Automation

### Technical
- VDO.Ninja Manager Modul (`modules/vdoninja.js`)
- VDO.Ninja Routes (`routes/vdoninja-routes.js`)

---

## [0.8.0] - Emoji Rain & HUD Verbesserungen

### Added
- **Emoji Rain Effekt**: Animierte Emoji-Regen bei Gifts
  - Konfigurierbare Gift-zu-Emoji-Mappings
  - Animationsgeschwindigkeit & Dichte
  - Emoji-Pool-System
  - HUD-Integration

### Changed
- **HUD Positionierung**: Drag & Drop Interface
  - Speicherbare Positionen (Top/Bottom, Left/Right)
  - Live-Vorschau im Dashboard
  - Persistenz in Datenbank

### Fixed
- HUD-Overlays jetzt per Drag & Drop verschiebbar
- Emoji Rain Performance-Optimierungen

---

## [0.7.0] - OBS Custom Browser Docks

### Added
- **OBS Browser Docks**: Direkte OBS-Integration
  - Custom Browser Docks für Dashboard
  - Overlay-URLs für OBS Browser Sources
  - Goal-Tracking direkt in OBS
  - TTS-Kontrolle in OBS

### Technical
- OBS WebSocket Integration vorbereitet
- Dashboard-URLs für OBS-Docks optimiert

---

## [0.6.0] - Goals & User Profiles

### Added
- **Goal-System**: Multi-Goal-Tracking
  - Follower, Likes, Shares Goals
  - Gift-basierte Goals (Coins, Diamonds)
  - Persistente Goal-Progress-Speicherung
  - Real-time Progress-Updates
  - Goal-Completion-Alerts

- **User-Profile-System**: Persistente Nutzer-Verwaltung
  - Automatische Profil-Erstellung bei TikTok-Events
  - User-Statistiken (Gifts, Coins, Chat-Messages)
  - Team-Member-Level-Tracking
  - Follow-Status-Tracking
  - Top-Gifter-Rankings

### Fixed
- Robuste Username-Extraktion aus TikTok-Events
- "Unknown"-Username-Display behoben
- Goal-Reset-Funktionalität verbessert

---

## [0.5.0] - Soundboard Pro

### Added
- **MyInstants API Integration**: 1 Million+ Sounds
  - Suchfunktion für MyInstants-Library
  - Favoriten-System
  - Sound-Preview
  - Custom Sound Upload

- **Soundboard Features**:
  - Volume-Kontrolle pro Sound
  - Hotkey-Support
  - Sound-Kategorien
  - Geschenk-zu-Sound-Mapping
  - Animation Support für Gifts

- **Gift-Katalog-Import**: Automatischer TikTok Gift Catalog
  - 200+ TikTok Gifts mit Icons
  - Automatisches Update beim Serverstart
  - Gift-Browser im Soundboard

### Changed
- Soundboard UI komplett überarbeitet
- Sound-Verwaltung deutlich verbessert

### Fixed
- Overlay Sound Button nicht responsive → behoben
- Database Syntax Errors in SQL Statements
- Server Startup Crashes

---

## [0.4.0] - Google TTS Integration

### Added
- **Google Cloud TTS**: Premium-Stimmen-Support
  - 40+ WaveNet & Standard Stimmen
  - Multi-Language Support (DE, EN-US, EN-GB, ES, FR, IT, JA, KR)
  - API-Key-Konfiguration
  - Provider-Switching (TikTok TTS ↔ Google TTS)

### Changed
- TTS-Engine erweitert für Multi-Provider-Support
- Voice-Auswahl im Dashboard erweitert

---

## [0.3.0] - Flow Automation & TikTok Security

### Added
- **Flow-Engine**: Trigger-basierte Automation
  - Event-Trigger (Chat, Gift, Follow, Share, Like)
  - Aktionen (TTS, Alert, OBS Scene, Sound)
  - Bedingungen (Gift-Value, Username, Text-Match)
  - Flow-Templates

### Fixed
- **Security**: tiktok-live-connector auf v2.1.0 upgraded
  - Sicherheitslücken geschlossen
  - Verbesserte Error-Handling
  - Robuster Retry-Mechanismus bei Connection-Errors

---

## [0.2.0] - Feature-Parität Python → Node.js

### Added
- Alle Features aus Python Soundboard migriert
- Winston Logger Integration
- Daily Rotating Log Files
- Express Rate Limiting
- Swagger API Dokumentation

### Changed
- Kompletter Rewrite von Python zu Node.js
- Modernere Architektur mit Modules

---

## [0.1.0] - Initial Release

### Added
- **Core Features**:
  - TikTok LIVE Connector Integration
  - Socket.io Real-time Communication
  - Express.js REST API
  - SQLite Database (WAL Mode)
  - Basic Dashboard UI
  - Overlay System für OBS

- **TikTok Events**:
  - Chat Messages
  - Gifts
  - Follows
  - Shares
  - Likes

- **TTS System**:
  - TikTok TTS API (75+ Voices)
  - Queue-Management
  - Blacklist-Filter
  - User-Voice-Mapping

- **Alert System**:
  - Gift Alerts
  - Follow Alerts
  - Konfigurierbare Templates

---

## Version Format

`MAJOR.MINOR.PATCH` (z.B. `1.2.0`)

- **MAJOR**: Breaking Changes (Inkompatible API-Änderungen)
- **MINOR**: Neue Features (Abwärtskompatibel)
- **PATCH**: Bug Fixes (Abwärtskompatibel)

---

**Hinweis**: Dieses Changelog wird ab Version 1.0.0 (Plugin System Release) aktiv gepflegt.

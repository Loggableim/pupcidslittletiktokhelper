# MyInstants API Implementation - Vollständige Checklist

## 🎯 Ziel
Implementierung des CarlosDanielDev/api-myinstants Ansatzes mit lokalem Caching und automatischer Bereinigung.

## ✅ Phase 1: Analyse & Vorbereitung

### 1.1 Alte API Traces identifizieren
- [ ] `plugins/soundboard/main.js` - searchMyInstants(), getTrendingSounds(), getRandomSounds(), resolveMyInstantsUrl()
- [ ] `plugins/soundboard/main.js` - Fallback-Methoden (searchMyInstantsFallback, etc.)
- [ ] `public/js/soundboard.js` - Frontend MyInstants API Calls
- [ ] Alle direkten Calls zu myinstants-api.vercel.app
- [ ] Cheerio scraping Code

### 1.2 Neue Struktur planen
- [ ] Server-Proxy Endpoints definieren
- [ ] Cache-Verzeichnis Struktur
- [ ] Datenbank Schema für Cache-Metadaten
- [ ] Cleanup-Job für 6-Wochen-Regel

## ✅ Phase 2: Backend Implementation

### 2.1 MyInstants API Module erstellen
- [ ] `plugins/soundboard/myinstants-api.js` - Hauptmodul
  - [ ] Search-Funktion mit scraping
  - [ ] Trending-Funktion
  - [ ] Random-Funktion
  - [ ] Category-Browsing (optional)
  - [ ] Resolve URL-Funktion

### 2.2 Audio Cache Manager erstellen
- [ ] `plugins/soundboard/audio-cache.js` - Cache Management
  - [ ] Download & speichern von Audio-Dateien
  - [ ] Cache-Verzeichnis: `data/soundboard-cache/`
  - [ ] Metadaten-Tracking (last_played timestamp)
  - [ ] Cache-Hit/Miss Logik
  - [ ] File naming: MD5 hash von URL

### 2.3 Cache Cleanup Job
- [ ] `plugins/soundboard/cache-cleanup.js` - Automatische Bereinigung
  - [ ] Cronjob: täglich um 3:00 Uhr
  - [ ] Prüfe last_played timestamp
  - [ ] Lösche Dateien älter als 6 Wochen (42 Tage)
  - [ ] Logging der gelöschten Dateien
  - [ ] Bereinigung von Metadaten

### 2.4 Server-Proxy Endpoints
- [ ] `/api/myinstants/search` - Search mit Caching
- [ ] `/api/myinstants/trending` - Trending sounds
- [ ] `/api/myinstants/random` - Random sounds
- [ ] `/api/myinstants/categories` - Category browsing (optional)
- [ ] `/api/myinstants/proxy-audio` - **WICHTIGSTER ENDPOINT**
  - [ ] URL Validation
  - [ ] Check Cache first
  - [ ] Download if not cached
  - [ ] Stream to client
  - [ ] Update last_played timestamp
  - [ ] CORS Headers korrekt setzen

### 2.5 Datenbank Schema
- [ ] Tabelle: `soundboard_cache`
  - [ ] id (INTEGER PRIMARY KEY)
  - [ ] url_hash (TEXT UNIQUE) - MD5 von original URL
  - [ ] original_url (TEXT)
  - [ ] file_path (TEXT)
  - [ ] file_size (INTEGER)
  - [ ] created_at (INTEGER)
  - [ ] last_played (INTEGER)
  - [ ] play_count (INTEGER)
  - [ ] sound_name (TEXT)
  - [ ] sound_tags (TEXT JSON)

## ✅ Phase 3: Alte API entfernen

### 3.1 Backend Cleanup
- [ ] Entfernen: searchMyInstantsFallback()
- [ ] Entfernen: getTrendingSoundsFallback()
- [ ] Entfernen: getRandomSoundsFallback()
- [ ] Entfernen: resolveMyInstantsUrl() alte Version
- [ ] Entfernen: axios Calls zu myinstants-api.vercel.app
- [ ] Entfernen: cheerio scraping Code
- [ ] Dependency Check: cheerio noch benötigt?

### 3.2 Frontend Cleanup
- [ ] Entfernen: Direkte API Calls zu myinstants-api.vercel.app
- [ ] Entfernen: Client-seitiges scraping (falls vorhanden)
- [ ] Update: Alle Aufrufe auf neue Proxy-Endpoints

## ✅ Phase 4: Frontend Integration

### 4.1 Audio Preview System
- [ ] Update `public/js/soundboard.js`
  - [ ] playPreview() nutzt `/api/myinstants/proxy-audio`
  - [ ] Keine direkten MP3 URLs mehr
  - [ ] Error Handling für Cache Misses
  - [ ] Loading-Indicator während Download

### 4.2 Search Integration
- [ ] Update Search-Funktionen
  - [ ] Nutze `/api/myinstants/search`
  - [ ] Cache-Status-Anzeige (cached/not cached)
  - [ ] Download-Progress für große Dateien

### 4.3 Picker Modal Updates
- [ ] Browser Tab: Cache-Status anzeigen
- [ ] Search Tab: Neue API nutzen
- [ ] Trending Tab: Neue API nutzen
- [ ] Random Tab: Neue API nutzen
- [ ] Optional: Categories Tab hinzufügen

## ✅ Phase 5: Testing & Validation

### 5.1 Unit Tests
- [ ] Test Cache Download
- [ ] Test Cache Hit/Miss
- [ ] Test Cleanup Job
- [ ] Test Proxy Endpoint
- [ ] Test URL Validation

### 5.2 Integration Tests
- [ ] Test kompletter Search Flow
- [ ] Test Audio Playback via Proxy
- [ ] Test Cache Persistence
- [ ] Test Cleanup nach 6 Wochen
- [ ] Test Server-Restart (Cache bleibt)

### 5.3 Performance Tests
- [ ] Cache Size Monitor
- [ ] Download Speed Tests
- [ ] Concurrent Request Handling
- [ ] Memory Usage bei vielen Sounds

## ✅ Phase 6: Security & Hardening

### 6.1 Security Checks
- [ ] URL Whitelist validation (nur myinstants.com)
- [ ] Path Traversal Protection
- [ ] File Size Limits (max 10MB pro Sound)
- [ ] Rate Limiting für Proxy Endpoint
- [ ] MIME Type Validation (nur audio/*)
- [ ] Disk Space Check vor Download

### 6.2 Error Handling
- [ ] Network Errors
- [ ] Disk Full Errors
- [ ] Invalid URLs
- [ ] Corrupted Cache Files
- [ ] Missing Cache Directory

## ✅ Phase 7: Documentation

### 7.1 Code Documentation
- [ ] JSDoc für alle neuen Module
- [ ] Inline Comments für komplexe Logik
- [ ] README update

### 7.2 User Documentation
- [ ] Cache-System Erklärung
- [ ] Cleanup-Regeln dokumentieren
- [ ] Troubleshooting Guide
- [ ] API Endpoint Dokumentation

## ✅ Phase 8: Deployment

### 8.1 Migration
- [ ] Datenbank Migration Script
- [ ] Cache-Verzeichnis erstellen
- [ ] Alte Daten bereinigen (optional)

### 8.2 Monitoring
- [ ] Cache Size Monitoring
- [ ] Cleanup Job Logging
- [ ] API Performance Metrics
- [ ] Error Rate Tracking

## 📊 Technische Spezifikationen

### Cache-Verzeichnis Struktur
```
data/
  soundboard-cache/
    sounds/
      <hash1>.mp3
      <hash2>.mp3
      ...
    metadata.db (SQLite)
```

### Cleanup-Regel
- Sounds, die länger als **42 Tage** (6 Wochen) nicht abgespielt wurden, werden gelöscht
- Cleanup läuft täglich um 3:00 Uhr
- Mindestens 100MB freier Speicher muss vorhanden bleiben

### Rate Limits
- `/api/myinstants/search`: 30 req/min
- `/api/myinstants/proxy-audio`: 60 req/min
- Download Queue: max 3 concurrent downloads

### File Constraints
- Max File Size: 10MB
- Allowed MIME Types: audio/mpeg, audio/mp3, audio/wav, audio/ogg
- Max Cache Size: 1GB (configurable)

## 🎯 Erfolgs-Kriterien

- [x] Alte API vollständig entfernt
- [ ] Neue API funktioniert für Search
- [ ] Neue API funktioniert für Trending
- [ ] Neue API funktioniert für Random
- [ ] Audio Preview funktioniert über Proxy
- [ ] Cache wird korrekt gespeichert
- [ ] Cache wird nach 6 Wochen gelöscht
- [ ] Keine CORS-Fehler mehr
- [ ] Performance: < 100ms für Cache Hits
- [ ] Performance: < 3s für Cache Misses
- [ ] Disk Space: < 1GB Cache Size

## ⏱️ Zeitplan

- Phase 1: 1 Stunde
- Phase 2: 3-4 Stunden
- Phase 3: 1 Stunde
- Phase 4: 2 Stunden
- Phase 5: 2 Stunden
- Phase 6: 1 Stunde
- Phase 7: 1 Stunde
- Phase 8: 1 Stunde

**Gesamt: ca. 12-13 Stunden (1.5-2 Arbeitstage)**

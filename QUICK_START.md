# 🚀 Quick Start - TTS & TikTok Verbindung

## ⚡ Schnellstart (3 Minuten)

### 1. Server starten
```bash
npm start
```
Warte auf: `✅ Pup Cids little TikTok Helper läuft!`

### 2. Dashboard öffnen
```
http://localhost:3000/dashboard.html
```

### 3. Status überprüfen
**Speechify konfiguriert?**
```bash
curl -s http://localhost:3000/api/tts/status | grep speechify
```
Erwartung: `"speechify": true`

**✅ FERTIG! Speechify ist bereits konfiguriert mit deinem API-Key.**

---

## 🎤 TTS testen (2 Wege)

### Weg 1: Dashboard (GUI)
1. Dashboard → **TTS v2.0** Tab
2. **Queue & Playback** → Text eingeben
3. **Speak** klicken → Audio hören

### Weg 2: API (Terminal)
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

## 📺 TikTok Livestream verbinden

### Voraussetzungen
- ✅ Du bist LIVE auf TikTok
- ✅ 10-15 Sekunden nach Stream-Start gewartet

### Weg 1: Dashboard
1. Dashboard → **Connect** Sektion
2. Username eingeben: `pupcid` (ohne @)
3. **Connect** klicken
4. Warte auf: "✓ Connected to @pupcid"

### Weg 2: API
```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"username": "pupcid"}'
```

### Status überprüfen
```bash
curl -s http://localhost:3000/api/status | python3 -m json.tool
```

Wenn verbunden:
```json
{
  "isConnected": true,
  "username": "pupcid",
  "stats": { "viewers": 123, "likes": 456 }
}
```

---

## 🎯 Automatischer Test

Alles auf einmal testen:
```bash
node test-tts-and-connection.js
```

Erwartung:
- ✓ Server running
- ✓ TTS Plugin initialized
- ✓ Speechify Engine: ✓ Enabled
- ✓ 20+ Voices available
- ⚠️ TTS synthesis (braucht Internet)
- ⚠️ TikTok connection (braucht LIVE Stream)

---

## 📋 Verfügbare Stimmen

### Deutsch
- `mads` - Männlich, Conversational
- `ava` - Weiblich, Friendly

### Englisch
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

## 🔧 Konfiguration ändern

### Stimme ändern
```bash
curl -X POST http://localhost:3000/api/tts/config \
  -H "Content-Type: application/json" \
  -d '{"defaultVoice": "mads"}'
```

### Engine ändern (zurück zu TikTok)
```bash
curl -X POST http://localhost:3000/api/tts/config \
  -H "Content-Type: application/json" \
  -d '{"defaultEngine": "tiktok"}'
```

### Zurück zu Speechify
```bash
curl -X POST http://localhost:3000/api/tts/config \
  -H "Content-Type: application/json" \
  -d '{"defaultEngine": "speechify"}'
```

---

## 🐛 Häufige Probleme

### TTS kein Audio
- ✅ Overlay öffnen: `http://localhost:3000/overlay.html`
- ✅ Im Overlay: "✅ Audio aktivieren" klicken
- ✅ OBS Audio-Mixer: Browser-Source nicht stumm

### TikTok verbindet nicht
- ✅ Bist du LIVE? (Wichtigste Voraussetzung!)
- ✅ 10-15 Sekunden nach Stream-Start warten
- ✅ Username OHNE @: `pupcid` nicht `@pupcid`
- ✅ Bei SIGI_STATE Error: VPN verwenden

### Speechify funktioniert nicht
- ✅ Internet-Verbindung prüfen
- ✅ API-Key korrekt? (Siehe oben: Status überprüfen)
- ✅ Server neu starten: `npm start`

---

## 📚 Detaillierte Dokumentation

**Vollständige Anleitung:**
→ `SETUP_ANLEITUNG.md`

**Enthält:**
- Schritt-für-Schritt Anleitung
- API-Dokumentation
- Troubleshooting Guide
- Erweiterte Konfiguration
- User-Management
- Profanity Filter
- Blacklist/Whitelist

---

## ✅ Aktuelle Konfiguration

**Dein System ist bereits konfiguriert:**
- ✅ Speechify API Key: `RB2weemocwY746BGQcAubfrXgeiC-3KAJao84867EuQ=`
- ✅ Default Engine: `speechify`
- ✅ Default Voice: `george` (Englisch)
- ✅ Auto Language Detection: `aktiviert`
- ✅ TTS für Chat: `aktiviert`

**Stimme anpassen für Deutsch:**
```bash
curl -X POST http://localhost:3000/api/tts/config \
  -H "Content-Type: application/json" \
  -d '{"defaultVoice": "mads"}'
```

---

## 🎓 Nächste Schritte

1. **TTS testen** (siehe oben)
2. **Mit TikTok verbinden** (wenn LIVE)
3. **Im Stream ausprobieren:**
   - Chat-Nachrichten → Automatisches TTS
   - Verschiedene Stimmen testen
   - User-spezifische Stimmen zuweisen

4. **Anpassen:**
   - Volume einstellen (Dashboard)
   - Profanity Filter aktivieren
   - Blacklist für bestimmte User

---

**Bei Fragen:** E-Mail an [loggableim@gmail.com](mailto:loggableim@gmail.com)

**Test-Script:** `node test-tts-and-connection.js`

**Dokumentation:** `SETUP_ANLEITUNG.md`

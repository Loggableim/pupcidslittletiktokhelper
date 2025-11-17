# Setup-Anleitung: TTS (Speechify) & TikTok Connection

## 🎯 Übersicht

Diese Anleitung erklärt, wie du:
1. **Speechify TTS** mit deinem API-Key konfigurierst
2. Dich mit deinem **TikTok Livestream** (@pupcid) verbindest
3. TTS im Livestream testest

---

## ✅ Voraussetzungen

- ✅ Node.js 18+ installiert
- ✅ Server läuft (`npm start`)
- ✅ Internetverbindung vorhanden
- ✅ Speechify API-Key: `RB2weemocwY746BGQcAubfrXgeiC-3KAJao84867EuQ=`

---

## 🚀 Schritt-für-Schritt Anleitung

### Schritt 1: Server starten

```bash
cd /pfad/zu/pupcidslittletiktokhelper
npm start
```

Warten bis du diese Meldung siehst:
```
✅ Pup Cids little TikTok Helper läuft!
📊 Dashboard:     http://localhost:3000/dashboard.html
```

### Schritt 2: Dashboard öffnen

Öffne in deinem Browser:
```
http://localhost:3000/dashboard.html
```

### Schritt 3: Speechify API-Key konfigurieren

**Option A: Über das Dashboard (Empfohlen)**

1. Klicke auf den Tab **"TTS v2.0"** oder **"Text-to-Speech"**
2. Suche nach **"Configuration"** oder **"Einstellungen"**
3. Trage folgende Werte ein:
   - **Speechify API Key**: `RB2weemocwY746BGQcAubfrXgeiC-3KAJao84867EuQ=`
   - **Default Engine**: `speechify`
   - **Default Voice**: `george` (Englisch) oder `mads` (Deutsch)
   - **Enable TTS for Chat**: ✓ (aktiviert)
   - **Auto Language Detection**: ✓ (aktiviert)
4. Klicke auf **"Save Configuration"** oder **"Speichern"**

**Option B: Via API (Alternative)**

```bash
curl -X POST http://localhost:3000/api/tts/config \
  -H "Content-Type: application/json" \
  -d '{
    "speechifyApiKey": "RB2weemocwY746BGQcAubfrXgeiC-3KAJao84867EuQ=",
    "defaultEngine": "speechify",
    "defaultVoice": "george",
    "enabledForChat": true,
    "autoLanguageDetection": true
  }'
```

**Überprüfen, ob die Konfiguration erfolgreich war:**

```bash
curl -s http://localhost:3000/api/tts/status | python3 -m json.tool
```

Erwartete Ausgabe:
```json
{
  "success": true,
  "status": {
    "initialized": true,
    "engines": {
      "tiktok": true,
      "google": false,
      "speechify": true  ← sollte true sein
    },
    "config": {
      "defaultEngine": "speechify",
      "defaultVoice": "george"
    }
  }
}
```

### Schritt 4: Verfügbare Stimmen anzeigen

**Alle Speechify-Stimmen anzeigen:**

```bash
curl -s http://localhost:3000/api/tts/voices?engine=speechify | python3 -m json.tool
```

**Deutsche Stimmen:**
- `mads` - Deutsch (männlich)
- `ava` - Deutsch (weiblich)

**Englische Stimmen:**
- `george` - Conversational (männlich)
- `henry` - Narrative (männlich)
- `gwyneth` - Professional (weiblich)
- `emma` - Friendly (weiblich)
- `mrbeast` - Energetic (männlich)
- `snoop` - Casual (männlich)

... und viele mehr (insgesamt 20+ Stimmen)

### Schritt 5: TTS manuell testen

**Im Dashboard:**
1. Gehe zum TTS-Tab
2. Klicke auf **"Queue & Playback"**
3. Gib einen Test-Text ein: `Hallo, das ist ein Test`
4. Wähle eine Stimme: `mads` (Deutsch) oder `george` (Englisch)
5. Klicke auf **"Speak"**

**Via API:**

```bash
# Deutsch mit Mads-Stimme
curl -X POST http://localhost:3000/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hallo, das ist ein Test der Speechify Funktion",
    "username": "test_user",
    "voice": "mads",
    "engine": "speechify"
  }'

# Englisch mit George-Stimme
curl -X POST http://localhost:3000/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test of the Speechify text-to-speech",
    "username": "test_user",
    "voice": "george",
    "engine": "speechify"
  }'
```

**Hinweis:** Das Audio wird über das Overlay abgespielt. Stelle sicher, dass:
- Das Overlay in OBS geöffnet ist (`http://localhost:3000/overlay.html`)
- Du im Overlay auf "✅ Audio aktivieren" geklickt hast

### Schritt 6: Mit TikTok Livestream verbinden

**Wichtig:** Du musst **LIVE** sein auf TikTok, bevor du dich verbindest!

**Im Dashboard:**
1. Starte deinen TikTok Livestream
2. Warte 10-15 Sekunden nach Stream-Start
3. Gib im Dashboard dein Username ein: `pupcid` (ohne @)
4. Klicke auf **"Connect"**
5. Warte auf die Bestätigung: "✓ Connected to @pupcid"

**Via API:**

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"username": "pupcid"}'
```

**Verbindungsstatus überprüfen:**

```bash
curl -s http://localhost:3000/api/status | python3 -m json.tool
```

Erwartete Ausgabe wenn verbunden:
```json
{
  "isConnected": true,
  "username": "pupcid",
  "stats": {
    "viewers": 123,
    "likes": 456,
    "totalCoins": 789
  }
}
```

### Schritt 7: TTS im Livestream testen

Wenn du mit TikTok verbunden bist:

1. **Automatisches TTS für Chat-Nachrichten:**
   - Schreibe eine Nachricht im TikTok-Chat
   - Das System erkennt automatisch die Sprache (Deutsch/Englisch)
   - TTS wird mit der passenden Stimme abgespielt

2. **Manuelle TTS-Tests während Stream:**
   - Nutze das Dashboard → TTS Tab → "Queue & Playback"
   - Gib Text ein und klicke "Speak"
   - Audio wird über das Overlay abgespielt

3. **User-spezifische Stimmen zuweisen:**
   - Dashboard → TTS Tab → "User Management"
   - Wähle einen User aus der Liste
   - Weise ihm eine bestimmte Stimme zu
   - Ab jetzt wird diese Stimme für diesen User verwendet

---

## 🔧 Automatischer Test-Script

Ich habe einen Test-Script erstellt, der alles automatisch überprüft:

```bash
node test-tts-and-connection.js
```

Der Script testet:
1. ✓ Server-Status
2. ✓ TTS Plugin Initialisierung
3. ✓ Speechify Konfiguration
4. ✓ Verfügbare Stimmen
5. ✓ TTS-Synthese (mit Internet-Verbindung)
6. ✓ TikTok-Verbindung (wenn LIVE)
7. ✓ Debug-Logs

**Erwartete Ausgabe:**
```
╔════════════════════════════════════════════════════════════╗
║     TTS (Speechify) & TikTok Connection Test Script       ║
╚════════════════════════════════════════════════════════════╝

============================================================
1. Testing Server Status
============================================================
✓ Server is running

============================================================
2. Testing TTS Plugin Status
============================================================
✓ TTS Plugin is initialized
  Default Engine: speechify
  Speechify Engine: ✓ Enabled

============================================================
4. Testing Speechify Voices
============================================================
✓ Found 20 Speechify voices
  - george: George - Conversational (en-US, male)
  - mads: Mads - Deutsch (de-DE, male)
  ...
```

---

## 🐛 Troubleshooting

### Problem: TTS funktioniert nicht

**Symptom:** Kein Audio beim TTS-Test

**Lösungen:**
1. ✅ Stelle sicher, dass das Overlay geöffnet ist: `http://localhost:3000/overlay.html`
2. ✅ Klicke im Overlay auf "✅ Audio aktivieren"
3. ✅ Überprüfe die TTS-Konfiguration:
   ```bash
   curl http://localhost:3000/api/tts/status
   ```
4. ✅ Prüfe ob Speechify-Engine aktiviert ist (`"speechify": true`)
5. ✅ Überprüfe Lautstärke-Einstellungen (Volume: 80 ist Standard)

### Problem: "Speechify engine not available"

**Symptom:** TTS fällt zurück auf TikTok-Engine

**Lösungen:**
1. ✅ API-Key erneut konfigurieren (Schritt 3)
2. ✅ Server neu starten:
   ```bash
   # Strg+C zum Stoppen
   npm start
   ```
3. ✅ Überprüfen ob API-Key korrekt ist:
   ```bash
   curl http://localhost:3000/api/tts/config
   ```

### Problem: TikTok-Verbindung schlägt fehl

**Symptom:** "Connection failed" oder "SIGI_STATE error"

**Lösungen:**
1. ✅ Stelle sicher, dass du **LIVE** bist
2. ✅ Warte 10-15 Sekunden nach Stream-Start
3. ✅ Username ohne @ eingeben: `pupcid` (nicht `@pupcid`)
4. ✅ Bei SIGI_STATE-Fehler: VPN verwenden
5. ✅ Internetverbindung überprüfen

### Problem: "ENOTFOUND api.sws.speechify.com"

**Symptom:** TTS-Synthese schlägt mit Netzwerk-Fehler fehl

**Ursache:** Keine Internetverbindung oder DNS-Problem

**Lösungen:**
1. ✅ Internetverbindung prüfen:
   ```bash
   ping api.sws.speechify.com
   ```
2. ✅ DNS-Server überprüfen
3. ✅ Firewall/Antivirus prüfen (Port 443 für HTTPS)
4. ✅ Falls hinter Proxy: Proxy-Einstellungen konfigurieren

### Problem: Audio wird nicht abgespielt

**Symptom:** TTS-Synthese erfolgreich, aber kein Audio

**Lösungen:**
1. ✅ Im Overlay auf "✅ Audio aktivieren" klicken
2. ✅ Browser-Audio-Einstellungen prüfen
3. ✅ OBS Audio-Mixer prüfen (Browser-Source nicht stummgeschaltet)
4. ✅ Volume-Einstellung in TTS-Config erhöhen (80-100)
5. ✅ Queue-Status überprüfen:
   ```bash
   curl http://localhost:3000/api/tts/queue
   ```

---

## 📊 Verfügbare API-Endpoints

### TTS Endpoints

```bash
# Status abfragen
GET http://localhost:3000/api/tts/status

# Konfiguration abrufen
GET http://localhost:3000/api/tts/config

# Konfiguration speichern
POST http://localhost:3000/api/tts/config
Body: { "speechifyApiKey": "...", "defaultEngine": "speechify", ... }

# Verfügbare Stimmen
GET http://localhost:3000/api/tts/voices?engine=speechify

# TTS sprechen
POST http://localhost:3000/api/tts/speak
Body: { "text": "...", "username": "...", "voice": "george", "engine": "speechify" }

# Queue anzeigen
GET http://localhost:3000/api/tts/queue

# Queue leeren
POST http://localhost:3000/api/tts/queue/clear

# Aktuelles Item überspringen
POST http://localhost:3000/api/tts/queue/skip

# Debug-Logs
GET http://localhost:3000/api/tts/debug/logs
```

### TikTok Endpoints

```bash
# Mit Livestream verbinden
POST http://localhost:3000/api/connect
Body: { "username": "pupcid" }

# Verbindung trennen
POST http://localhost:3000/api/disconnect

# Status abfragen
GET http://localhost:3000/api/status
```

---

## 🎓 Erweiterte Konfiguration

### Automatische Sprach-Erkennung

Das System erkennt automatisch die Sprache und wählt die passende Stimme:

- **Deutsch** → `mads` (männlich) oder `ava` (weiblich)
- **Englisch** → `george` (männlich) oder `emma` (weiblich)
- **Weitere Sprachen** → je nach Verfügbarkeit

**Aktivieren:**
```json
{
  "autoLanguageDetection": true
}
```

### User-spezifische Stimmen

Du kannst jedem User eine individuelle Stimme zuweisen:

**Via Dashboard:**
1. TTS Tab → "User Management"
2. User auswählen
3. Stimme + Engine wählen
4. "Assign Voice" klicken

**Via API:**
```bash
curl -X POST http://localhost:3000/api/tts/users/USERNAME/voice \
  -H "Content-Type: application/json" \
  -d '{
    "username": "USERNAME",
    "voiceId": "george",
    "engine": "speechify"
  }'
```

### Blacklist

Bestimmte User vom TTS ausschließen:

```bash
curl -X POST http://localhost:3000/api/tts/users/USERNAME/blacklist \
  -H "Content-Type: application/json" \
  -d '{ "username": "USERNAME" }'
```

### Profanity Filter

Filtert Schimpfwörter aus TTS-Nachrichten:

**Modi:**
- `off` - Kein Filter
- `moderate` - Ersetzt Schimpfwörter mit ***
- `strict` - Blockt Nachrichten mit Schimpfwörtern komplett

**Konfigurieren:**
```json
{
  "profanityFilter": "moderate"
}
```

---

## 📝 Zusammenfassung

### Erfolgreiche Konfiguration erkennen

Wenn alles funktioniert, solltest du sehen:

1. ✅ Server läuft: `http://localhost:3000`
2. ✅ Dashboard erreichbar: `http://localhost:3000/dashboard.html`
3. ✅ TTS-Status zeigt:
   - `"speechify": true`
   - `"defaultEngine": "speechify"`
4. ✅ Speechify-Stimmen verfügbar (20+ Stimmen)
5. ✅ TikTok verbunden: `"isConnected": true`
6. ✅ TTS funktioniert im Chat

### Nächste Schritte

1. ✅ Teste TTS mit verschiedenen Stimmen
2. ✅ Weise deinen Top-Chattern individuelle Stimmen zu
3. ✅ Passe Volume/Speed an deine Präferenzen an
4. ✅ Konfiguriere Profanity-Filter
5. ✅ Richte das Overlay in OBS ein

---

## 🆘 Support

Falls Probleme auftreten:

1. **Logs prüfen:**
   ```bash
   # Server-Logs im Terminal beobachten
   npm start
   
   # TTS Debug-Logs
   curl http://localhost:3000/api/tts/debug/logs
   ```

2. **Test-Script ausführen:**
   ```bash
   node test-tts-and-connection.js
   ```

3. **Browser Console prüfen:**
   - F12 → Console Tab
   - Fehler kopieren und analysieren

4. **E-Mail Support:**
   - [loggableim@gmail.com](mailto:loggableim@gmail.com)
   - Bitte Logs und Screenshots beifügen

---

**Viel Erfolg mit deinem Stream! 🎉**

Bei Fragen oder Problemen: E-Mail an [loggableim@gmail.com](mailto:loggableim@gmail.com)

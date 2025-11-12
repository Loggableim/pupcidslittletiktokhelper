# TTS Plugin - Vollständige Bug-Analyse

**Datum:** 2025-11-12
**Analysierte Version:** 2.0.0
**Analysemethode:** Vollständiger Code-Review aller Komponenten

---

## 🐛 KRITISCHE BUGS

### BUG #1: Null-Pointer-Exception bei Language Detection
**Datei:** `main.js:454-455`
**Schweregrad:** 🔴 KRITISCH
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
const langResult = this.languageDetector.detectAndGetVoice(finalText, engineClass);
selectedVoice = langResult.voiceId;  // ❌ CRASH wenn langResult null ist
```

**Problem:**
- `detectAndGetVoice()` kann `null` zurückgeben wenn engineClass keine `getDefaultVoiceForLanguage` Methode hat
- Kein null-check vor Zugriff auf `.voiceId`
- Führt zu: `TypeError: Cannot read property 'voiceId' of null`

**Reproduktion:**
```javascript
// Falls detectAndGetVoice fehlschlägt:
speak({ text: "Test", userId: "1", username: "Test", engine: "invalid" })
// → CRASH
```

**Fix:**
```javascript
const langResult = this.languageDetector.detectAndGetVoice(finalText, engineClass);
if (langResult && langResult.voiceId) {
    selectedVoice = langResult.voiceId;
    this.logger.info(`Language detected: ${langResult.languageName} (${langResult.langCode}) for "${finalText.substring(0, 30)}..."`);
}
```

---

### BUG #2: Fehlende Input-Validierung in Config-Update
**Datei:** `main.js:129-164`
**Schweregrad:** 🔴 KRITISCH
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key in this.config && key !== 'googleApiKey') {
        this.config[key] = updates[key];  // ❌ KEINE VALIDIERUNG!
    }
});
```

**Problem:**
- Keine Type-Validierung: `{ volume: "hacker" }` wird akzeptiert
- Keine Range-Validierung: `{ volume: -999999 }` wird akzeptiert
- Keine Enum-Validierung: `{ profanityFilter: "invalid" }` wird akzeptiert
- Kann zu unerwünschtem Verhalten führen

**Reproduktion:**
```bash
curl -X POST http://localhost:3000/api/tts/config \
  -H "Content-Type: application/json" \
  -d '{"volume": "HACKED", "speed": -100, "maxQueueSize": 999999999}'
# → Config wird korrumpiert, Plugin verhält sich undefined
```

**Auswirkung:**
- Volume = String → Audio-Berechnung fehlschlägt
- Speed < 0 → TTS-Engines crashen
- MaxQueueSize = 999999999 → Memory exhaustion möglich

**Fix:** Vollständige Validierung nötig (siehe Fix-Sektion unten)

---

### BUG #3: Race-Condition bei Google Engine Initialisierung
**Datei:** `main.js:143-148`
**Schweregrad:** 🟡 MEDIUM
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
if (!this.engines.google) {
    this.engines.google = new GoogleEngine(updates.googleApiKey, this.logger);
    this.logger.info('Google TTS engine initialized via config update');
} else {
    this.engines.google.setApiKey(updates.googleApiKey);
}
```

**Problem:**
- Bei gleichzeitigen POST /api/tts/config Requests kann Google Engine mehrfach initialisiert werden
- Keine Mutex/Lock-Mechanismus
- Potentielles Memory-Leak durch mehrfache Initialisierung

**Reproduktion:**
```javascript
// Sende 2 parallele Requests:
Promise.all([
    fetch('/api/tts/config', { method: 'POST', body: JSON.stringify({googleApiKey: 'key1'}) }),
    fetch('/api/tts/config', { method: 'POST', body: JSON.stringify({googleApiKey: 'key2'}) })
]);
// → Beide prüfen !this.engines.google gleichzeitig
// → Beide erstellen neue GoogleEngine Instanz
```

**Fix:** Mutex oder Atomic Check-And-Set nötig

---

### BUG #4: Volume = 0 Problem bei volume_gain
**Datei:** `main.js:504`
**Schweregrad:** 🟡 MEDIUM
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
volume: this.config.volume * (userSettings?.volume_gain || 1.0),
```

**Problem:**
- Wenn `userSettings.volume_gain = 0`, wird Audio stumm
- `0 || 1.0` evaluiert zu `1.0`, aber `0` ist ein gültiger Wert
- Sollte sein: `userSettings?.volume_gain ?? 1.0`

**Reproduktion:**
```sql
UPDATE tts_user_permissions SET volume_gain = 0 WHERE user_id = 'test';
-- User kann jetzt nichts mehr hören, auch wenn volume = 80
```

**Fix:**
```javascript
volume: this.config.volume * (userSettings?.volume_gain ?? 1.0),
```

---

### BUG #5: Ungenaue Audio-Dauer-Berechnung
**Datei:** `main.js:578`
**Schweregrad:** 🟢 LOW
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
const estimatedDuration = Math.ceil(item.text.length / 10 * 500) + 1000;
```

**Problem:**
- Berechnung basiert nur auf Text-Länge, nicht auf tatsächlicher Audio-Dauer
- Ignoriert `speed` Parameter
- Ignoriert Sprache (Japanisch ist langsamer als Englisch)
- Ignoriert Voice-Typ (Stormtrooper ist langsamer als Female)

**Beispiel:**
```javascript
// Text: "Hi" (2 Zeichen)
estimatedDuration = Math.ceil(2 / 10 * 500) + 1000 = 1100ms
// Aber echte Dauer: ~500ms

// Text: "This is a very long sentence..." (200 Zeichen)
estimatedDuration = Math.ceil(200 / 10 * 500) + 1000 = 11000ms
// Aber echte Dauer mit speed=2.0: ~4000ms
```

**Auswirkung:**
- Queue-Processing wartet zu lange oder zu kurz
- Audio kann überlappen oder abgeschnitten werden

**Fix:** Echte Audio-Dauer aus MP3-Daten extrahieren

---

## 🐛 FEHLERHAFTE ERROR-HANDLING

### BUG #6: Fehlende audioData Validierung
**Datei:** `main.js:478-494`
**Schweregrad:** 🟡 MEDIUM
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
let audioData;
try {
    audioData = await engine.synthesize(finalText, selectedVoice, this.config.speed);
} catch (engineError) {
    // Fallback...
}
// ❌ KEIN CHECK ob audioData leer/null/undefined ist!

const queueResult = this.queueManager.enqueue({
    audioData,  // Könnte undefined sein!
    // ...
});
```

**Problem:**
- Wenn `synthesize()` erfolgreich ist aber `undefined` oder leeren String zurückgibt
- Wird trotzdem zur Queue hinzugefügt
- Client kann Audio nicht abspielen

**Fix:**
```javascript
if (!audioData || audioData.length === 0) {
    throw new Error('Engine returned empty audio data');
}
```

---

### BUG #7: Fehlende Queue-Cleanup bei Errors
**Datei:** `main.js:61-63`
**Schweregrad:** 🔴 KRITISCH
**Status:** ⚠️ UNFIXED

```javascript
// BUGGY CODE:
this.queueManager.startProcessing(async (item) => {
    await this._playAudio(item);
});
```

**Problem:**
- `_playAudio()` kann crashen
- Aber Queue-Processing läuft weiter
- Keine Error-Recovery, keine Cleanup-Logik
- Potentieller Memory-Leak bei dauerhaften Fehlern

**Reproduktion:**
```javascript
// Injiziere kaputtes Item in Queue:
queueManager.enqueue({
    audioData: null,  // ← wird crashen
    // ...
});
// → _playAudio crasht
// → Queue bleibt stecken oder überspringt Items
```

**Fix:** Siehe queue-manager.js Analyse

---

## 🐛 SICHERHEITSLÜCKEN

### BUG #8: XSS via Username/Text in Events
**Datei:** `main.js:521-528, 557-561`
**Schweregrad:** 🟡 MEDIUM
**Status:** ⚠️ UNFIXED

```javascript
// POTENTIELL UNSICHER:
this.api.emit('tts:queued', {
    username,  // ❌ Nicht sanitized
    text: finalText,  // ❌ Nicht sanitized
    // ...
});
```

**Problem:**
- Wenn Client-seitig username/text direkt ins DOM eingefügt wird
- Könnte XSS ermöglichen
- Beispiel: `username: "<script>alert('XSS')</script>"`

**Mitigation:**
- Backend sollte HTML-Escaping machen
- Oder Client muss sanitizen (weniger sicher)

---

### BUG #9: Google API Key im Klartext
**Datei:** `main.js:96-103`
**Schweregrad:** 🟡 MEDIUM
**Status:** ⚠️ UNFIXED

```javascript
// UNSICHER:
this.api.setConfig('config', defaultConfig);
// Speichert googleApiKey im Klartext in SQLite
```

**Problem:**
- API Key liegt unverschlüsselt in Datenbank
- Jeder mit DB-Zugriff kann ihn auslesen
- Sollte verschlüsselt oder in Umgebungsvariable gespeichert werden

---

## 🐛 LOGIC BUGS

### BUG #10: Profanity-Filter kann umgangen werden
**Datei:** `main.js:419-430`
**Schweregrad:** 🟢 LOW
**Status:** ⚠️ UNFIXED

```javascript
const profanityResult = this.profanityFilter.filter(text);

if (this.config.profanityFilter === 'strict' && profanityResult.action === 'drop') {
    // Dropped
}

const filteredText = profanityResult.filtered;
```

**Problem:**
- Bei Mode='moderate' wird profanityResult.filtered verwendet
- Aber keine Prüfung ob tatsächlich gefiltert wurde
- User bekommt keine Warnung dass sein Text verändert wurde

---

### BUG #11: userId vs username Inkonsistenz
**Datei:** `main.js:363-364, 197`
**Schweregrad:** 🟢 LOW
**Status:** ⚠️ UNFIXED

```javascript
// Bei TikTok Chat:
userId: data.userId || data.uniqueId,
username: data.uniqueId || data.nickname,

// Bei Manual:
userId: userId || username,
```

**Problem:**
- Unterschiedliche Fallback-Logik
- userId kann gleich username sein → Verwechslung möglich
- Sollte konsistent sein

---

## 🧪 GETESTETE KOMPONENTEN (folgt...)

Analysiere jetzt die anderen Dateien...

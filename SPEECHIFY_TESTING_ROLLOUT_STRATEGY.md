# Speechify TTS Integration - Testing & Rollout-Strategie

## Inhaltsverzeichnis
1. [Executive Summary](#executive-summary)
2. [Komponenten-Übersicht](#komponenten-übersicht)
3. [Test-Strategie](#test-strategie)
4. [Rollout-Plan](#rollout-plan)
5. [Risiko-Analyse](#risiko-analyse)
6. [Monitoring & Metriken](#monitoring--metriken)
7. [Rollback-Strategie](#rollback-strategie)
8. [Acceptance Criteria](#acceptance-criteria)
9. [Performance Benchmarks](#performance-benchmarks)

---

## Executive Summary

Die Integration von Speechify als dritte TTS-Engine erfordert eine systematische Testing- und Rollout-Strategie, um:
- **Produktions-Stabilität** zu gewährleisten (keine Unterbrechungen)
- **Kosten-Kontrolle** durch API-Monitoring sicherzustellen
- **Qualitäts-Standards** durch umfassende Tests zu garantieren
- **Risiken** durch schrittweises Rollout zu minimieren

**Zeitplan:** 4 Wochen (Development → Testing → Staging → Production)

**Kritische Erfolgsfaktoren:**
- Robuster Engine-Fallback bei API-Fehlern
- Präzise API-Key-Validierung
- Kosten-Tracking & Budget-Alerts
- Zero-Downtime Deployment

---

## Komponenten-Übersicht

### Zu testende Komponenten

#### 1. **Speechify Engine** (`/plugins/tts/engines/speechify-engine.js`)
**Verantwortlichkeiten:**
- API-Kommunikation mit Speechify
- Audio-Synthese (Text → Base64 Audio)
- Fehlerbehandlung & Retries
- Voice-Management
- Rate-Limiting

**Abhängigkeiten:**
- Speechify API (externes Service)
- axios (HTTP-Client)
- Logger

#### 2. **TTS Plugin - Core Integration** (`/plugins/tts/main.js`)
**Modifizierte Bereiche:**
- Engine-Initialisierung (Zeilen 26-39)
- Engine-Fallback-Logik (Zeilen 686-698, 723-756)
- Voice-Selection (Zeilen 638-683)
- Konfiguration (Zeilen 118-146)

**Neue Features:**
- Speechify-Engine in `engines` Map
- Automatic Fallback: Speechify → Google → TikTok
- Voice-Kompatibilitätsprüfung

#### 3. **API Routes** (`/plugins/tts/main.js`)
**Betroffene Endpoints:**
- `GET /api/tts/voices?engine=speechify` (Zeile 224-239)
- `POST /api/tts/config` (Zeile 171-222)
- `GET /api/tts/config` (Zeile 160-168)
- `GET /api/tts/status` (Zeile 398-420)

#### 4. **Admin UI** (`/plugins/tts/ui/tts-admin.js`)
**Neue Features:**
- Speechify-Engine-Auswahl
- API-Key-Eingabefeld
- Voice-Dropdown (Speechify-spezifisch)
- Kosten-Anzeige & Budget-Warnung

#### 5. **Queue Manager** (`/plugins/tts/utils/queue-manager.js`)
**Einfluss:**
- Keine direkten Änderungen
- Indirekt betroffen durch neue Engine

#### 6. **Language Detector** (`/plugins/tts/utils/language-detector.js`)
**Änderungen:**
- Unterstützung für Speechify-Voice-Mapping
- Auto-Language-Detection für Speechify

---

## Test-Strategie

### 3.1 Unit Tests

#### Test Suite 1: Speechify Engine Core

**Datei:** `/tests/unit/speechify-engine.test.js`

```javascript
// Test Case 1.1: Engine Initialization
describe('SpeechifyEngine - Initialization', () => {
    test('should initialize with valid API key', () => {
        const engine = new SpeechifyEngine('valid_api_key', logger);
        expect(engine.apiKey).toBe('valid_api_key');
        expect(engine.apiUrl).toBe('https://api.sws.speechify.com/v1/audio/speech');
    });

    test('should throw error without API key', () => {
        expect(() => new SpeechifyEngine(null, logger)).toThrow('API key required');
    });

    test('should initialize with default timeout', () => {
        const engine = new SpeechifyEngine('key', logger);
        expect(engine.timeout).toBe(30000);
    });
});

// Test Case 1.2: Voice Management
describe('SpeechifyEngine - Voices', () => {
    test('should return all available voices', () => {
        const voices = SpeechifyEngine.getVoices();
        expect(Object.keys(voices).length).toBeGreaterThan(0);
        expect(voices['george']).toBeDefined();
        expect(voices['george'].name).toBe('George (Male, US)');
    });

    test('should return default voice for English', () => {
        const voice = SpeechifyEngine.getDefaultVoiceForLanguage('en');
        expect(voice).toBe('george');
    });

    test('should return default voice for German', () => {
        const voice = SpeechifyEngine.getDefaultVoiceForLanguage('de');
        expect(voice).toBe('mads');
    });

    test('should return fallback for unsupported language', () => {
        const voice = SpeechifyEngine.getDefaultVoiceForLanguage('xyz');
        expect(voice).toBe('george'); // Fallback to English
    });
});

// Test Case 1.3: Audio Synthesis (Mocked API)
describe('SpeechifyEngine - Synthesis', () => {
    let engine;
    let mockAxios;

    beforeEach(() => {
        engine = new SpeechifyEngine('test_key', logger);
        mockAxios = jest.spyOn(axios, 'post');
    });

    afterEach(() => {
        mockAxios.mockRestore();
    });

    test('should synthesize audio successfully', async () => {
        mockAxios.mockResolvedValue({
            data: { audio_data: 'base64_audio_string' }
        });

        const audio = await engine.synthesize('Hello World', 'george', 1.0);
        expect(audio).toBe('base64_audio_string');
        expect(mockAxios).toHaveBeenCalledWith(
            'https://api.sws.speechify.com/v1/audio/speech',
            {
                input: 'Hello World',
                voice_id: 'george',
                audio_format: 'mp3',
                speed: 1.0
            },
            expect.any(Object)
        );
    });

    test('should retry on network error', async () => {
        mockAxios
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ data: { audio_data: 'success' } });

        const audio = await engine.synthesize('Test', 'george', 1.0);
        expect(audio).toBe('success');
        expect(mockAxios).toHaveBeenCalledTimes(3);
    });

    test('should throw error after max retries', async () => {
        mockAxios.mockRejectedValue(new Error('Network error'));

        await expect(engine.synthesize('Test', 'george', 1.0))
            .rejects.toThrow('Network error');
        expect(mockAxios).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    test('should handle API error responses', async () => {
        mockAxios.mockRejectedValue({
            response: {
                status: 401,
                data: { error: 'Invalid API key' }
            }
        });

        await expect(engine.synthesize('Test', 'george', 1.0))
            .rejects.toThrow('Speechify API error (401): Invalid API key');
    });

    test('should handle rate limiting (429)', async () => {
        mockAxios.mockRejectedValue({
            response: {
                status: 429,
                data: { error: 'Rate limit exceeded' }
            }
        });

        await expect(engine.synthesize('Test', 'george', 1.0))
            .rejects.toThrow('Rate limit exceeded');
    });
});

// Test Case 1.4: API Key Validation
describe('SpeechifyEngine - API Key Validation', () => {
    test('should validate API key format', () => {
        expect(() => new SpeechifyEngine('', logger)).toThrow();
        expect(() => new SpeechifyEngine('   ', logger)).toThrow();
        expect(() => new SpeechifyEngine(123, logger)).toThrow();
    });

    test('should accept valid API key', async () => {
        const engine = new SpeechifyEngine('sk_1234567890abcdef', logger);
        expect(engine.apiKey).toBe('sk_1234567890abcdef');
    });
});

// Test Case 1.5: Cost Tracking
describe('SpeechifyEngine - Cost Tracking', () => {
    test('should track character count', async () => {
        const engine = new SpeechifyEngine('key', logger);
        jest.spyOn(axios, 'post').mockResolvedValue({
            data: { audio_data: 'audio' }
        });

        await engine.synthesize('Hello World', 'george', 1.0);

        const stats = engine.getUsageStats();
        expect(stats.totalCharacters).toBe(11); // "Hello World"
        expect(stats.totalRequests).toBe(1);
    });

    test('should estimate costs correctly', () => {
        const engine = new SpeechifyEngine('key', logger);
        const cost = engine.estimateCost(10000); // 10k characters
        // Assume $0.015 per 1k chars
        expect(cost).toBeCloseTo(0.15, 2);
    });
});
```

**Kritische Test-Cases:**
- ✅ Engine-Initialisierung mit/ohne API-Key
- ✅ Voice-Auswahl & Fallbacks
- ✅ API-Kommunikation (Success/Failure)
- ✅ Retry-Logik (3 Versuche)
- ✅ Error-Handling (401, 429, 500, Network)
- ✅ Cost-Tracking
- ✅ Rate-Limiting

---

#### Test Suite 2: TTS Plugin Integration

**Datei:** `/tests/unit/tts-plugin-speechify.test.js`

```javascript
// Test Case 2.1: Engine Selection & Fallback
describe('TTSPlugin - Speechify Integration', () => {
    let plugin;
    let mockAPI;

    beforeEach(() => {
        mockAPI = new MockPluginAPI();
        plugin = new TTSPlugin(mockAPI);
    });

    test('should initialize Speechify if API key provided', () => {
        plugin.config.speechifyApiKey = 'sk_test123';
        plugin._initializeEngines();
        expect(plugin.engines.speechify).toBeDefined();
    });

    test('should NOT initialize Speechify without API key', () => {
        plugin.config.speechifyApiKey = null;
        plugin._initializeEngines();
        expect(plugin.engines.speechify).toBeNull();
    });

    test('should fallback from Speechify to Google on error', async () => {
        plugin.config.speechifyApiKey = 'key';
        plugin.config.googleApiKey = 'google_key';
        plugin._initializeEngines();

        // Mock Speechify failure
        jest.spyOn(plugin.engines.speechify, 'synthesize')
            .mockRejectedValue(new Error('Speechify API error'));

        // Mock Google success
        jest.spyOn(plugin.engines.google, 'synthesize')
            .mockResolvedValue('google_audio_data');

        const result = await plugin.speak({
            text: 'Test',
            userId: 'user1',
            username: 'TestUser',
            engine: 'speechify'
        });

        expect(result.success).toBe(true);
        expect(result.engine).toBe('google'); // Fallback
    });

    test('should fallback from Speechify to TikTok if Google unavailable', async () => {
        plugin.config.speechifyApiKey = 'key';
        plugin.config.googleApiKey = null; // No Google
        plugin._initializeEngines();

        jest.spyOn(plugin.engines.speechify, 'synthesize')
            .mockRejectedValue(new Error('Speechify error'));
        jest.spyOn(plugin.engines.tiktok, 'synthesize')
            .mockResolvedValue('tiktok_audio');

        const result = await plugin.speak({
            text: 'Test',
            userId: 'user1',
            username: 'User',
            engine: 'speechify'
        });

        expect(result.success).toBe(true);
        expect(result.engine).toBe('tiktok');
    });
});

// Test Case 2.2: Voice Compatibility
describe('TTSPlugin - Voice Compatibility', () => {
    test('should reject incompatible voice/engine combination', async () => {
        const plugin = new TTSPlugin(mockAPI);
        plugin.config.speechifyApiKey = 'key';
        plugin._initializeEngines();

        const result = await plugin.speak({
            text: 'Test',
            userId: 'user1',
            username: 'User',
            engine: 'speechify',
            voiceId: 'en_us_ghostface' // TikTok voice, not Speechify
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('incompatible');
    });

    test('should auto-select compatible voice', async () => {
        const plugin = new TTSPlugin(mockAPI);
        plugin.config.speechifyApiKey = 'key';
        plugin.config.defaultEngine = 'speechify';
        plugin._initializeEngines();

        jest.spyOn(plugin.engines.speechify, 'synthesize')
            .mockResolvedValue('audio');

        const result = await plugin.speak({
            text: 'Hello World',
            userId: 'user1',
            username: 'User'
            // No voiceId specified → should auto-detect
        });

        expect(result.success).toBe(true);
        expect(result.voice).toBe('george'); // English default
    });
});

// Test Case 2.3: Configuration Management
describe('TTSPlugin - Speechify Config', () => {
    test('should save Speechify API key', async () => {
        const plugin = new TTSPlugin(mockAPI);

        await plugin._handleConfigUpdate({
            speechifyApiKey: 'sk_new_key'
        });

        expect(plugin.config.speechifyApiKey).toBe('sk_new_key');
        expect(plugin.engines.speechify).toBeDefined();
    });

    test('should hide API key in config response', () => {
        const plugin = new TTSPlugin(mockAPI);
        plugin.config.speechifyApiKey = 'sk_secret123';

        const configResponse = plugin._getConfigForResponse();
        expect(configResponse.speechifyApiKey).toBe('***HIDDEN***');
    });

    test('should not overwrite API key with placeholder', async () => {
        const plugin = new TTSPlugin(mockAPI);
        plugin.config.speechifyApiKey = 'sk_real_key';

        await plugin._handleConfigUpdate({
            speechifyApiKey: '***HIDDEN***'
        });

        expect(plugin.config.speechifyApiKey).toBe('sk_real_key'); // Unchanged
    });
});
```

---

### 3.2 Integration Tests (End-to-End)

**Datei:** `/tests/integration/speechify-e2e.test.js`

```javascript
// Test Case 3.1: Full TTS Pipeline
describe('E2E: Speechify TTS Pipeline', () => {
    let server;
    let client;

    beforeAll(async () => {
        server = await startTestServer();
        client = createTestClient();
    });

    afterAll(async () => {
        await server.close();
    });

    test('should process TTS request from chat to audio playback', async () => {
        // Step 1: Set Speechify as default engine
        await client.post('/api/tts/config', {
            defaultEngine: 'speechify',
            speechifyApiKey: process.env.SPEECHIFY_API_KEY_TEST
        });

        // Step 2: Simulate TikTok chat message
        const chatEvent = {
            uniqueId: 'testuser123',
            nickname: 'TestUser',
            message: 'Hello from Speechify!',
            teamMemberLevel: 1,
            userId: 'user_123'
        };

        server.emitTikTokEvent('chat', chatEvent);

        // Step 3: Wait for processing
        await sleep(2000);

        // Step 4: Verify queue
        const queueRes = await client.get('/api/tts/queue');
        expect(queueRes.data.queue.size).toBe(1);
        expect(queueRes.data.queue.current.engine).toBe('speechify');

        // Step 5: Verify audio playback event
        const playbackEvent = await client.waitForSocketEvent('tts:play', 5000);
        expect(playbackEvent.engine).toBe('speechify');
        expect(playbackEvent.audioData).toBeDefined();
        expect(playbackEvent.audioData.length).toBeGreaterThan(100);
    });

    test('should fallback to Google when Speechify fails', async () => {
        // Temporarily invalidate Speechify API key
        await client.post('/api/tts/config', {
            speechifyApiKey: 'invalid_key',
            googleApiKey: process.env.GOOGLE_API_KEY_TEST
        });

        const chatEvent = {
            uniqueId: 'user',
            message: 'Test fallback',
            userId: 'u1'
        };

        server.emitTikTokEvent('chat', chatEvent);
        await sleep(2000);

        const playbackEvent = await client.waitForSocketEvent('tts:play');
        expect(playbackEvent.engine).toBe('google'); // Fallback!
    });
});

// Test Case 3.2: Multi-Engine Comparison
describe('E2E: Multi-Engine Comparison', () => {
    test('should handle concurrent requests to different engines', async () => {
        const requests = [
            client.post('/api/tts/speak', {
                text: 'TikTok test',
                username: 'User1',
                engine: 'tiktok'
            }),
            client.post('/api/tts/speak', {
                text: 'Google test',
                username: 'User2',
                engine: 'google'
            }),
            client.post('/api/tts/speak', {
                text: 'Speechify test',
                username: 'User3',
                engine: 'speechify'
            })
        ];

        const results = await Promise.all(requests);

        expect(results[0].data.engine).toBe('tiktok');
        expect(results[1].data.engine).toBe('google');
        expect(results[2].data.engine).toBe('speechify');
        expect(results.every(r => r.data.success)).toBe(true);
    });
});

// Test Case 3.3: API Key Validation Flow
describe('E2E: API Key Validation', () => {
    test('should reject invalid API key immediately', async () => {
        const res = await client.post('/api/tts/config', {
            speechifyApiKey: 'invalid_format'
        });

        expect(res.status).toBe(400);
        expect(res.data.error).toContain('Invalid API key');
    });

    test('should validate API key with test request', async () => {
        const res = await client.post('/api/tts/validate-key', {
            engine: 'speechify',
            apiKey: process.env.SPEECHIFY_API_KEY_TEST
        });

        expect(res.data.valid).toBe(true);
        expect(res.data.message).toContain('success');
    });
});
```

---

### 3.3 Manueller Test-Plan (Schritt-für-Schritt)

#### Phase 1: Basis-Funktionalität (30 Min)

**Test 1.1: Engine-Initialisierung**
1. ✅ Server starten: `npm start`
2. ✅ Admin-Panel öffnen: `http://localhost:3000/dashboard.html`
3. ✅ TTS-Plugin-Status prüfen
   - Erwartung: `speechify: false` (kein API-Key)
4. ✅ Speechify API-Key eingeben
5. ✅ Konfiguration speichern
6. ✅ Status erneut prüfen
   - Erwartung: `speechify: true`

**Test 1.2: Voice-Auswahl**
1. ✅ Engine auf "Speechify" umstellen
2. ✅ Voice-Dropdown öffnen
   - Erwartung: Liste mit Speechify-Voices (george, mads, etc.)
3. ✅ Voice "george" auswählen
4. ✅ Test-Button "Speak Test Message"
   - Erwartung: Audio-Playback mit Speechify-Voice

**Test 1.3: Manuelle TTS-Anfrage**
1. ✅ Text eingeben: "Hello, this is a Speechify test"
2. ✅ Username: "ManualTest"
3. ✅ Engine: "Speechify"
4. ✅ Voice: "george"
5. ✅ Submit
   - Erwartung: Audio-Playback innerhalb von 5 Sekunden
   - Qualität: Klar, natürlich, keine Störgeräusche

#### Phase 2: Fehler-Handling (45 Min)

**Test 2.1: Ungültiger API-Key**
1. ✅ Speechify API-Key ändern auf "invalid_key_123"
2. ✅ Konfiguration speichern
3. ✅ TTS-Anfrage senden
   - Erwartung: Fehlermeldung "Invalid API key"
   - Debug-Logs: ERROR-Level mit 401-Status

**Test 2.2: Engine-Fallback (Speechify → Google)**
1. ✅ Speechify API-Key: `invalid`
2. ✅ Google API-Key: `valid`
3. ✅ Default-Engine: "Speechify"
4. ✅ TTS-Anfrage senden
   - Erwartung: Fallback zu Google
   - Debug-Logs: "Speechify failed, trying Google"
   - Audio-Playback mit Google-Voice

**Test 2.3: Engine-Fallback (Speechify → TikTok)**
1. ✅ Speechify API-Key: `invalid`
2. ✅ Google API-Key: `null`
3. ✅ Default-Engine: "Speechify"
4. ✅ TTS-Anfrage senden
   - Erwartung: Fallback zu TikTok
   - Audio-Playback mit TikTok-Voice

**Test 2.4: Voice-Inkompatibilität**
1. ✅ Engine: "Speechify"
2. ✅ Voice: "en_us_ghostface" (TikTok-Voice)
3. ✅ TTS-Anfrage senden
   - Erwartung: Fehler "Voice incompatible with engine"
   - Auto-Fallback zu "george"

**Test 2.5: Rate-Limiting**
1. ✅ 50 TTS-Anfragen in 10 Sekunden senden
   - Erwartung: Erste 30 erfolgreich, danach 429-Fehler
   - Debug-Logs: "Rate limit exceeded"
   - Retry nach Cooldown-Period

**Test 2.6: Netzwerk-Timeout**
1. ✅ Internet-Verbindung unterbrechen
2. ✅ TTS-Anfrage senden
   - Erwartung: 3 Retry-Versuche (45s Gesamt-Timeout)
   - Danach: Fallback zu TikTok (kostenlos, funktioniert offline)

#### Phase 3: Auto-Language-Detection (30 Min)

**Test 3.1: Englisch**
1. ✅ Text: "Hello, how are you?"
2. ✅ Auto-Language-Detection: ON
3. ✅ TTS-Anfrage
   - Erwartung: Voice "george" (EN-Standard)

**Test 3.2: Deutsch**
1. ✅ Text: "Guten Tag, wie geht es dir?"
2. ✅ Auto-Language-Detection: ON
3. ✅ TTS-Anfrage
   - Erwartung: Voice "mads" (DE-Standard)

**Test 3.3: Spanisch**
1. ✅ Text: "Hola, ¿cómo estás?"
2. ✅ Auto-Language-Detection: ON
3. ✅ TTS-Anfrage
   - Erwartung: Voice "diego" (ES-Standard)

**Test 3.4: Gemischter Text (Code-Switching)**
1. ✅ Text: "Hello, ich bin ein mixed text"
2. ✅ Auto-Language-Detection: ON
3. ✅ TTS-Anfrage
   - Erwartung: Erkennung der dominanten Sprache (EN)
   - Voice: "george"

#### Phase 4: TikTok-Chat-Integration (45 Min)

**Test 4.1: Chat-Message → TTS**
1. ✅ TikTok-Stream verbinden
2. ✅ Default-Engine: "Speechify"
3. ✅ Chat-TTS aktivieren: `enabledForChat: true`
4. ✅ Chat-Nachricht senden (von TikTok-Account)
   - Erwartung: Automatische TTS-Wiedergabe
   - Engine: Speechify
   - Latenz: < 3 Sekunden

**Test 4.2: Team-Level-Permissions**
1. ✅ `teamMinLevel: 1` (nur Moderatoren)
2. ✅ Chat-Nachricht von Nicht-Moderator
   - Erwartung: TTS blockiert
   - Debug-Logs: "Permission denied: teamLevel 0 < 1"
3. ✅ Chat-Nachricht von Moderator (teamLevel=1)
   - Erwartung: TTS erfolgreich

**Test 4.3: Profanity-Filter**
1. ✅ Profanity-Mode: "moderate"
2. ✅ Chat: "This is a shit test"
   - Erwartung: TTS mit "This is a **** test"
3. ✅ Profanity-Mode: "strict"
4. ✅ Chat: "This is bullshit"
   - Erwartung: TTS blockiert
   - Debug-Logs: "Dropped due to profanity"

**Test 4.4: Queue-Management**
1. ✅ 5 Chat-Nachrichten gleichzeitig senden
   - Erwartung: Queue-Size = 5
   - Wiedergabe in FIFO-Reihenfolge
   - Jede Nachricht komplett abgespielt
2. ✅ Queue-Clear-Button
   - Erwartung: Queue geleert, aktuelle Wiedergabe gestoppt
3. ✅ Skip-Button
   - Erwartung: Aktueller Eintrag übersprungen, nächster startet

#### Phase 5: Performance & Kosten (60 Min)

**Test 5.1: Latenz-Messung**
1. ✅ 10 TTS-Anfragen mit Timer
   - Messung: Zeit von Request bis Audio-Start
   - Ziel: < 2 Sekunden (95. Perzentil)
2. ✅ Vergleich: TikTok vs. Google vs. Speechify
   - Erwartung: Speechify ~1.5s, Google ~1.2s, TikTok ~0.8s

**Test 5.2: Audio-Qualität (Subjektiv)**
1. ✅ Gleicher Text in allen 3 Engines
   - Text: "The quick brown fox jumps over the lazy dog"
2. ✅ Bewertung (1-10):
   - TikTok: Natürlichkeit, Aussprache
   - Google: Natürlichkeit, Aussprache
   - Speechify: Natürlichkeit, Aussprache
3. ✅ Dokumentation der Unterschiede

**Test 5.3: Cost-Tracking**
1. ✅ 100 TTS-Anfragen (je 50 Zeichen)
   - Erwartung: 5000 Characters total
   - Cost: ~$0.075 (at $0.015/1k chars)
2. ✅ Admin-Panel: Kosten-Anzeige prüfen
   - "Total Cost Today: $0.075"
3. ✅ Budget-Warning (wenn > $10/Tag)
   - Simulation: 700.000 Zeichen
   - Erwartung: Warning-Banner "Daily budget exceeded!"

**Test 5.4: Concurrent Requests**
1. ✅ 20 parallele TTS-Anfragen
   - Erwartung: Alle erfolgreich (Rate-Limit beachtet)
   - Keine Request-Verluste
   - Max. Latenz: < 5s

#### Phase 6: Edge Cases (45 Min)

**Test 6.1: Sehr langer Text**
1. ✅ Text: 1000 Zeichen
   - Erwartung: Truncated auf `maxTextLength` (300 Zeichen)
   - Debug-Logs: "Text truncated"

**Test 6.2: Leerer Text**
1. ✅ Text: ""
   - Erwartung: Fehler "Empty text"

**Test 6.3: Sonderzeichen**
1. ✅ Text: "Test !@#$%^&*() test"
   - Erwartung: Korrekte Verarbeitung, keine Crashes

**Test 6.4: Emojis**
1. ✅ Text: "Hello 👋 World 🌍"
   - Erwartung: Emojis ignoriert oder als Text gesprochen

**Test 6.5: Unicode (Chinesisch)**
1. ✅ Text: "你好世界"
   - Erwartung: Sprachenerkennung → Chinesisch
   - Voice: "snowy" (ZH-Voice)

**Test 6.6: Server-Neustart während Wiedergabe**
1. ✅ TTS-Wiedergabe starten
2. ✅ Server stoppen: `Ctrl+C`
3. ✅ Server neu starten: `npm start`
   - Erwartung: Queue geleert
   - Keine Crashes beim Reconnect

---

### 3.4 Last-Tests (Performance & Load)

**Tool:** Apache Bench (ab) oder k6

**Test 7.1: Sustained Load**
```bash
# 1000 Requests über 60 Sekunden (16 req/s)
k6 run --vus 10 --duration 60s load-test-speechify.js
```
**Erwartung:**
- Success-Rate: > 99%
- P95-Latenz: < 3s
- P99-Latenz: < 5s
- Keine Memory-Leaks

**Test 7.2: Spike Load**
```bash
# 500 Requests in 10 Sekunden (50 req/s)
k6 run --vus 50 --duration 10s load-test-speechify.js
```
**Erwartung:**
- Success-Rate: > 95%
- Rate-Limiting greift
- Keine Server-Crashes

---

## Rollout-Plan

### 4.1 Phase 0: Development (Woche 1)

**Ziele:**
- Speechify-Engine implementieren
- Plugin-Integration
- Unit-Tests schreiben

**Schritte:**
1. ✅ Branch erstellen: `feature/speechify-integration`
2. ✅ Speechify-Engine entwickeln (`/plugins/tts/engines/speechify-engine.js`)
3. ✅ Main-Plugin anpassen (`/plugins/tts/main.js`)
4. ✅ Admin-UI erweitern (`/plugins/tts/ui/tts-admin.js`)
5. ✅ Unit-Tests schreiben (100% Coverage)
6. ✅ Code-Review (2 Entwickler)
7. ✅ Merge in `develop` Branch

**Success-Criteria:**
- Alle Unit-Tests bestehen (100%)
- Code-Coverage: > 90%
- Keine ESLint-Warnings
- Peer-Review approved

---

### 4.2 Phase 1: Internal Testing (Woche 2)

**Ziele:**
- Manuelles Testing durch Dev-Team
- Bug-Fixing
- Performance-Optimierung

**Environment:** `development` (lokale Instanzen)

**Schritte:**
1. ✅ Development-Server deployen
2. ✅ Test-API-Key einrichten (Speechify Test-Account)
3. ✅ Manueller Test-Plan abarbeiten (siehe 3.3)
4. ✅ Bug-Tracking in JIRA/GitHub Issues
5. ✅ Performance-Tests durchführen
6. ✅ Fixes entwickeln & testen
7. ✅ Code Freeze für Phase 2

**Success-Criteria:**
- Alle kritischen Bugs behoben
- 0 High-Priority Issues offen
- Latenz-Ziele erreicht (P95 < 2s)
- Cost-Tracking funktioniert

**Rollback-Trigger:**
- > 5 kritische Bugs
- Performance-Ziele nicht erreichbar
- API-Kosten unerwartet hoch

---

### 4.3 Phase 2: Staging/Beta (Woche 3)

**Ziele:**
- Testing mit echten Daten (aber nicht Production)
- Closed-Beta mit ausgewählten Usern
- Monitoring & Kosten-Analyse

**Environment:** `staging` (identisch zu Production)

**Schritte:**
1. ✅ Staging-Server vorbereiten
   - Identische Konfiguration wie Production
   - Separate Datenbank (Clone von Production)
2. ✅ Speechify-API-Key (Production-Key, aber separates Budget)
3. ✅ Feature-Flag aktivieren: `ENABLE_SPEECHIFY=true` (nur für Beta-User)
4. ✅ Beta-User-Gruppe erstellen (10-20 Streamer)
   ```sql
   INSERT INTO beta_features (user_id, feature, enabled)
   VALUES ('user123', 'speechify_tts', true);
   ```
5. ✅ Beta-Einladung versenden
6. ✅ Monitoring aufsetzen (siehe 6.0)
7. ✅ Woche 3: Monitoring & Feedback sammeln
8. ✅ Bug-Fixes deployen (Hotfixes)

**Beta-User Feedback:**
- Umfrage: Audio-Qualität (1-10)
- Umfrage: Latenz-Zufriedenheit
- Bug-Reports sammeln
- Feature-Requests dokumentieren

**Success-Criteria:**
- Beta-User Satisfaction: > 8/10
- Error-Rate: < 0.5%
- Keine kritischen Bugs
- Kosten im Budget (< $10/Tag bei 20 Beta-Usern)

**Rollback-Trigger:**
- Error-Rate > 2%
- Kosten > $20/Tag unerwartet
- Kritischer Bug (Data-Loss, Security)
- Beta-User Satisfaction < 6/10

---

### 4.4 Phase 3: Production Rollout (Woche 4)

**Ziele:**
- Schrittweises Rollout für alle User
- 24/7 Monitoring
- Schnelle Reaktion auf Probleme

**Environment:** `production`

**Rollout-Strategie: Canary Deployment**

#### Day 1-2: 5% Traffic
1. ✅ Feature-Flag: `SPEECHIFY_ROLLOUT_PERCENTAGE=5`
   - Zufällige 5% der User erhalten Speechify als Option
2. ✅ Monitoring intensiv (alle 5 Minuten)
3. ✅ Alert-Regeln aktiv (siehe 6.2)

**Go/No-Go Decision:**
- Error-Rate < 1%
- Latenz P95 < 2.5s
- Kosten < $2/Tag (bei 5% Traffic)
- Keine kritischen Alerts

#### Day 3-4: 25% Traffic
1. ✅ Feature-Flag: `SPEECHIFY_ROLLOUT_PERCENTAGE=25`
2. ✅ Monitoring weiterhin intensiv
3. ✅ User-Feedback sammeln (In-App-Umfrage)

**Go/No-Go Decision:**
- Error-Rate < 0.8%
- User-Satisfaction > 7/10
- Kosten-Prognose für 100% akzeptabel

#### Day 5-6: 50% Traffic
1. ✅ Feature-Flag: `SPEECHIFY_ROLLOUT_PERCENTAGE=50`
2. ✅ Kosten-Tracking tägliches Review

**Go/No-Go Decision:**
- Error-Rate < 0.5%
- Keine unerwarteten Kosten-Spitzen

#### Day 7: 100% Traffic
1. ✅ Feature-Flag: `SPEECHIFY_ROLLOUT_PERCENTAGE=100`
2. ✅ Ankündigung in Release-Notes
3. ✅ Tutorial/Dokumentation veröffentlichen

**Post-Rollout (Woche 5):**
- ✅ Monitoring für 7 Tage intensiv
- ✅ Bug-Fixing-Sprint
- ✅ Kosten-Analyse & Optimierung
- ✅ Feature-Flag entfernen (Permanent aktiviert)

**Success-Criteria:**
- Error-Rate: < 0.3% (stabilisiert)
- User-Satisfaction: > 8/10
- Kosten im Budget (< $50/Tag bei 100% Traffic)
- Keine Rollbacks erforderlich

---

## Risiko-Analyse

### 5.1 Technische Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation | Contingency |
|--------|-------------------|--------|------------|-------------|
| **Speechify API-Ausfall** | Mittel (15%) | Hoch | Robuster Fallback zu Google/TikTok | Automatischer Fallback innerhalb 5s |
| **API-Key-Leak** | Niedrig (5%) | Kritisch | API-Key in Environment-Variablen, Rotation-Policy | Key sofort widerrufen, neue Key deployen |
| **Rate-Limiting unerwartet** | Mittel (20%) | Mittel | Rate-Limit-Monitoring, Client-Side-Throttling | Fallback zu TikTok, Alert an DevOps |
| **Kosten-Explosion** | Mittel (25%) | Hoch | Budget-Alerts, Daily-Limit in Code | Auto-Disable bei > $100/Tag, Email-Alert |
| **Inkompatible Voice-IDs** | Niedrig (10%) | Niedrig | Voice-Validation vor Synthesis, Fallback | Auto-Fallback zu Default-Voice |
| **Latenz > 5s** | Niedrig (8%) | Mittel | Timeout-Handling, Fallback | Fallback zu TikTok (schnellere API) |
| **Memory-Leak (Audio-Caching)** | Niedrig (5%) | Mittel | Cache-Size-Limit, LRU-Eviction | Server-Neustart, Cache-Clear |
| **Audio-Format-Fehler** | Sehr niedrig (2%) | Niedrig | Format-Validation, Base64-Check | Fehler-Logging, Re-Request |

**Kritischste Risiken (Priorisierung):**
1. **Kosten-Explosion** → Tägliches Budget-Limit hardcoded
2. **Speechify API-Ausfall** → 3-Stufen-Fallback (Speechify → Google → TikTok)
3. **API-Key-Leak** → Automated Secret-Scanning (GitHub Secrets)

---

### 5.2 Business-Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| **User-Unzufriedenheit (Qualität schlechter als erwartet)** | Niedrig (10%) | Mittel | A/B-Testing, User-Umfrage, Option zur Engine-Wahl |
| **Unerwartete Kosten (Budget überschritten)** | Mittel (30%) | Hoch | Kosten-Cap, Monitoring, Free-Tier priorisieren |
| **Vendor Lock-In (Abhängigkeit von Speechify)** | Mittel (20%) | Mittel | Multi-Engine-Architektur, einfacher Wechsel zu anderen APIs |
| **Compliance-Probleme (GDPR, Datenschutz)** | Sehr niedrig (3%) | Kritisch | Speechify ist GDPR-compliant, Datenverarbeitung transparent |

---

### 5.3 Operational-Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| **Fehlende Dokumentation** | Mittel (25%) | Niedrig | Vollständige API-Docs, In-Code-Kommentare, Runbook |
| **Unzureichendes Monitoring** | Niedrig (10%) | Mittel | Prometheus + Grafana, Custom-Dashboards, Alerts |
| **Rollback-Komplexität** | Niedrig (8%) | Hoch | Feature-Flags, Database-Migrations rückwärts-kompatibel |
| **Team-Wissen-Verlust (Key-Person-Risk)** | Niedrig (5%) | Mittel | Pair-Programming, Code-Reviews, Dokumentation |

---

## Monitoring & Metriken

### 6.1 Technische Metriken

**Prometheus-Metriken:**

```javascript
// /plugins/tts/engines/speechify-engine.js
const { Counter, Histogram, Gauge } = require('prom-client');

// Request-Metriken
const speechifyRequestsTotal = new Counter({
    name: 'speechify_requests_total',
    help: 'Total number of Speechify TTS requests',
    labelNames: ['status', 'voice']
});

const speechifyRequestDuration = new Histogram({
    name: 'speechify_request_duration_seconds',
    help: 'Speechify API request duration',
    buckets: [0.5, 1, 2, 3, 5, 10]
});

const speechifyErrorsTotal = new Counter({
    name: 'speechify_errors_total',
    help: 'Total number of Speechify errors',
    labelNames: ['error_type', 'status_code']
});

// Kosten-Metriken
const speechifyCharactersTotal = new Counter({
    name: 'speechify_characters_total',
    help: 'Total characters synthesized',
    labelNames: ['voice']
});

const speechifyCostTotal = new Counter({
    name: 'speechify_cost_total',
    help: 'Total estimated cost in USD'
});

// Fallback-Metriken
const speechifyFallbacksTotal = new Counter({
    name: 'speechify_fallbacks_total',
    help: 'Number of fallbacks to other engines',
    labelNames: ['target_engine']
});
```

**Grafana-Dashboard:**

```yaml
Dashboard: "TTS Speechify Integration"

Panels:
  1. Request Rate (req/s)
     Query: rate(speechify_requests_total[5m])

  2. Success Rate (%)
     Query: (sum(rate(speechify_requests_total{status="success"}[5m])) / sum(rate(speechify_requests_total[5m]))) * 100
     Alert: < 95%

  3. P95 Latency
     Query: histogram_quantile(0.95, speechify_request_duration_seconds)
     Alert: > 3s

  4. Error Rate by Type
     Query: sum(rate(speechify_errors_total[5m])) by (error_type)

  5. Daily Cost
     Query: increase(speechify_cost_total[1d])
     Alert: > $50

  6. Characters Processed
     Query: increase(speechify_characters_total[1h])

  7. Fallback Rate
     Query: rate(speechify_fallbacks_total[5m])
     Alert: > 0.1 (10% Fallback-Rate kritisch)

  8. API Key Validation Failures
     Query: sum(rate(speechify_errors_total{status_code="401"}[5m]))
     Alert: > 0
```

---

### 6.2 Business-Metriken

**Daily Report (Email):**

```
Subject: TTS Speechify - Daily Report (2025-11-14)

=== Usage Summary ===
- Total Requests: 15,243
- Success Rate: 98.7%
- Fallback Rate: 1.2%
- Average Latency: 1.8s (P95: 2.3s)

=== Cost Analysis ===
- Characters Processed: 762,150
- Estimated Cost: $11.43 (at $0.015/1k chars)
- Budget Remaining: $38.57 / $50 daily

=== Top Voices ===
1. george (EN): 8,345 requests
2. mads (DE): 3,122 requests
3. diego (ES): 2,456 requests

=== Errors ===
- 401 Unauthorized: 0
- 429 Rate Limit: 23
- 500 Server Error: 5
- Timeout: 12

=== Action Items ===
- ⚠️ Budget at 23% → Consider optimization
- ✅ Success rate healthy
- ⚠️ 23 rate-limit errors → Review rate-limiting config
```

---

### 6.3 Alert-Regeln

**PagerDuty/Slack-Alerts:**

| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| **Error-Rate** | > 5% | Critical | Immediate rollback |
| **Cost per Hour** | > $5 | High | Disable Speechify, investigate |
| **Latency P95** | > 5s | High | Enable TikTok fallback |
| **API 401 Errors** | > 0 | Critical | API key compromised, rotate immediately |
| **Fallback-Rate** | > 20% | Medium | Speechify API issues, contact support |
| **Daily Budget** | > $50 | High | Auto-disable Speechify for 24h |
| **Memory Usage** | > 2GB | Medium | Check for memory leaks, restart server |

**Alert-Channels:**
- Critical: PagerDuty (24/7 On-Call)
- High: Slack #tts-alerts
- Medium: Slack #tts-monitoring
- Low: Email (Daily Digest)

---

## Rollback-Strategie

### 7.1 Rollback-Trigger

**Automatische Rollback-Bedingungen:**
1. ✅ Error-Rate > 10% für 5 Minuten
2. ✅ Cost per Hour > $10
3. ✅ API 401-Errors (API-Key invalid)
4. ✅ Latenz P95 > 10s für 10 Minuten
5. ✅ Server-Crashes (> 3 in 1 Stunde)

**Manuelle Rollback-Entscheidung:**
- Product-Owner entscheidet bei Business-Risiken
- Tech-Lead entscheidet bei technischen Problemen
- 24/7 On-Call hat Rollback-Authority

---

### 7.2 Rollback-Prozedur

#### Rollback-Level 1: Feature-Flag Disable (2 Minuten)

**Schnellste Option, keine Code-Änderungen**

```bash
# 1. Feature-Flag deaktivieren
curl -X POST https://api.example.com/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"speechify_enabled": false}'

# 2. Verify
curl https://api.example.com/api/tts/status | jq '.engines.speechify'
# Expected: false

# 3. Monitoring prüfen
# - Error-Rate sollte sofort sinken
# - Fallback zu Google/TikTok sollte greifen
```

**Impact:**
- ✅ Speechify deaktiviert
- ✅ User nutzen automatisch Google/TikTok
- ✅ Keine Code-Änderungen
- ✅ Keine Server-Neustarts

**Rollback-Zeit:** 2 Minuten

---

#### Rollback-Level 2: Configuration Rollback (5 Minuten)

**Config in Datenbank zurücksetzen**

```sql
-- Speechify API-Key entfernen
UPDATE settings
SET value = NULL
WHERE key = 'speechify_api_key';

-- Default-Engine auf TikTok setzen
UPDATE settings
SET value = '{"defaultEngine": "tiktok"}'
WHERE key = 'tts_config';
```

```bash
# Server-Reload (ohne Neustart)
curl -X POST https://api.example.com/admin/reload-config \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Rollback-Zeit:** 5 Minuten

---

#### Rollback-Level 3: Code Rollback (15 Minuten)

**Git-Revert & Redeploy**

```bash
# 1. Code-Rollback
git revert <commit-hash-speechify-merge>
git push origin main

# 2. Deploy
npm run deploy:production

# 3. Verify
curl https://api.example.com/api/tts/status
```

**Rollback-Zeit:** 15 Minuten (CI/CD Pipeline)

---

#### Rollback-Level 4: Database Rollback (30 Minuten)

**Nur bei Database-Migration-Problemen**

```bash
# 1. Database-Migration rückgängig machen
npm run migrate:down -- --name add_speechify_config

# 2. Code rollback (siehe Level 3)

# 3. Server-Neustart
pm2 restart tts-server

# 4. Verify
psql -c "SELECT * FROM settings WHERE key LIKE '%speechify%';"
# Expected: 0 rows
```

**Rollback-Zeit:** 30 Minuten

---

### 7.3 Rollback-Kommunikation

**Intern (Team):**
1. ✅ Slack-Nachricht in #incidents: "Rollback initiated: Speechify TTS"
2. ✅ PagerDuty-Incident erstellen
3. ✅ Post-Mortem-Meeting innerhalb 24h

**Extern (User):**
- ✅ Status-Page: "TTS experiencing issues, using fallback engines"
- ✅ In-App-Notification (falls sichtbare Änderungen)
- ✅ Twitter/Discord (bei längerem Ausfall > 1h)

**Post-Rollback:**
- ✅ Root-Cause-Analysis (RCA)
- ✅ Bugfix & Tests
- ✅ Erneutes Rollout (Phase 2: Staging)

---

## Acceptance Criteria

### 8.1 Funktionale Criteria

**Muss-Kriterien (MUST-HAVE):**
- ✅ Speechify-Engine erfolgreich integriert
- ✅ Admin-UI: Speechify-Konfiguration möglich (API-Key, Voice-Auswahl)
- ✅ TTS-Anfragen über Speechify erfolgreich (Success-Rate > 95%)
- ✅ Auto-Language-Detection funktioniert (EN, DE, ES)
- ✅ Fallback-Logik: Speechify → Google → TikTok (100% Coverage)
- ✅ Kosten-Tracking & Budget-Alerts implementiert
- ✅ API-Key-Validierung (401-Fehler richtig behandelt)
- ✅ Rate-Limiting-Handling (429-Fehler, Retries)
- ✅ Voice-Kompatibilitätsprüfung (Fehler bei Inkompatibilität)
- ✅ Debug-Logs & Monitoring (Prometheus-Metriken)

**Soll-Kriterien (SHOULD-HAVE):**
- ✅ A/B-Testing-Framework (User-Gruppen für Engine-Tests)
- ✅ Audio-Quality-Vergleich (TikTok vs. Google vs. Speechify)
- ✅ Kosten-Optimierung (Caching für häufige Phrasen)
- ✅ User-Feedback-Mechanismus (In-App-Rating)

**Kann-Kriterien (NICE-TO-HAVE):**
- ⚠️ SSML-Support (Speech Synthesis Markup Language)
- ⚠️ Custom-Voice-Training (falls Speechify API unterstützt)
- ⚠️ Streaming-Audio (Real-Time TTS statt Batch)

---

### 8.2 Nicht-Funktionale Criteria

**Performance:**
- ✅ Latenz P95 < 2.5 Sekunden (Request → Audio-Start)
- ✅ Latenz P99 < 5 Sekunden
- ✅ Throughput: > 50 req/s (bei 100% Auslastung)
- ✅ Memory-Footprint: < 500MB pro Server-Instanz

**Reliability:**
- ✅ Success-Rate: > 99% (inkl. Fallbacks)
- ✅ Uptime: > 99.9% (gemessen über Fallback-Verfügbarkeit)
- ✅ Fallback-Rate: < 5% (unter Normalbedingungen)
- ✅ Zero-Downtime-Deployment (Rolling-Update)

**Security:**
- ✅ API-Key in Environment-Variablen (nie im Code)
- ✅ API-Key nie in Logs/Responses (***HIDDEN***)
- ✅ HTTPS für alle API-Calls
- ✅ Rate-Limiting (Client-Side & Server-Side)

**Maintainability:**
- ✅ Code-Coverage: > 85%
- ✅ ESLint: 0 Errors, 0 Warnings
- ✅ Dokumentation vollständig (README, API-Docs, Runbook)
- ✅ Runbook für On-Call (Rollback-Prozedur)

**Cost:**
- ✅ Daily Budget: < $50 (bei 1000 aktiven Usern)
- ✅ Cost per Request: < $0.001
- ✅ Budget-Alert bei > 80% (Auto-Disable bei 100%)

---

### 8.3 Testing Criteria

**Unit-Tests:**
- ✅ 100% Coverage für `speechify-engine.js`
- ✅ > 80% Coverage für `main.js` (modifizierte Teile)
- ✅ Alle Edge-Cases getestet (siehe 3.1)

**Integration-Tests:**
- ✅ E2E-Test: Chat → TTS → Audio (alle 3 Engines)
- ✅ Fallback-Test: Speechify-Failure → Google
- ✅ API-Key-Validation-Test

**Manuell-Tests:**
- ✅ Alle 6 Test-Phasen erfolgreich (siehe 3.3)
- ✅ Beta-User-Feedback: > 8/10 Zufriedenheit

**Last-Tests:**
- ✅ Sustained Load: 1000 req / 60s (Success-Rate > 99%)
- ✅ Spike Load: 500 req / 10s (keine Crashes)

---

## Performance Benchmarks

### 9.1 Latenz-Vergleich

**Test-Setup:**
- Text: "The quick brown fox jumps over the lazy dog" (44 Zeichen)
- Voice: Standard-Male-Voice pro Engine
- Messung: Zeit von API-Request bis Audio-Playback-Start
- Iterationen: 100 Requests pro Engine

**Ergebnisse (Prognose):**

| Engine | P50 | P95 | P99 | Max |
|--------|-----|-----|-----|-----|
| **TikTok** | 0.8s | 1.2s | 1.5s | 2.1s |
| **Google** | 1.0s | 1.5s | 2.0s | 2.8s |
| **Speechify** | 1.2s | 2.0s | 3.0s | 4.5s |

**Analyse:**
- TikTok: Schnellste Engine (kostenlos, optimiert für Echtzeit)
- Google: Mittlere Latenz (Premium-Qualität)
- Speechify: Langsamste (aber beste Qualität)

**Empfehlung:**
- Latenz-kritische Use-Cases: TikTok
- Qualitäts-kritisch: Speechify
- Balanced: Google

---

### 9.2 Audio-Qualität (Subjektiv)

**Test-Setup:**
- 10 Tester (blind)
- 3 Audio-Samples (gleicher Text, verschiedene Engines)
- Bewertung: Natürlichkeit (1-10), Aussprache (1-10), Emotion (1-10)

**Erwartete Ergebnisse:**

| Engine | Natürlichkeit | Aussprache | Emotion | Gesamt |
|--------|--------------|------------|---------|--------|
| **TikTok** | 6.5 | 7.0 | 5.5 | 6.3 |
| **Google** | 8.0 | 8.5 | 7.5 | 8.0 |
| **Speechify** | 9.0 | 9.5 | 9.0 | 9.2 |

**Analyse:**
- Speechify: Beste Qualität (menschenähnlich)
- Google: Sehr gut (professionell)
- TikTok: Akzeptabel (erkennbar synthetisch)

---

### 9.3 Kosten-Vergleich

**Annahmen:**
- Average Text-Length: 50 Zeichen/Request
- Daily Requests: 10,000 (bei 100 aktiven Streamern)

| Engine | Cost per 1k Chars | Daily Cost (500k chars) | Monthly Cost |
|--------|------------------|------------------------|--------------|
| **TikTok** | $0.00 | $0.00 | $0.00 |
| **Google** | $0.004 | $2.00 | $60.00 |
| **Speechify** | $0.015 | $7.50 | $225.00 |

**Kosten-Optimierung:**
- ✅ Default-Engine: TikTok (kostenlos)
- ✅ Speechify: Opt-In für Premium-User
- ✅ Caching häufiger Phrasen (z.B. "Welcome!", "Thank you!")
- ✅ Budget-Cap: $50/Tag (automatisches Fallback zu TikTok)

**ROI-Analyse:**
- Wenn Premium-User $5/Monat zahlen → Break-Even bei 45 Usern
- Kosten-Reduktion durch Caching: ~30% (geschätzt)

---

### 9.4 Throughput-Test

**Test-Setup:**
- 1000 parallele Requests
- Messung: Requests pro Sekunde (RPS)

**Ergebnisse (Prognose):**

| Engine | Max RPS | Avg Latency | Errors |
|--------|---------|-------------|--------|
| **TikTok** | 120 | 1.2s | 0.2% |
| **Google** | 80 | 1.8s | 0.1% |
| **Speechify** | 50 | 2.5s | 0.3% |

**Bottleneck:**
- Speechify: API-Rate-Limit (vermutlich 50 req/s)
- Empfehlung: Client-Side-Queueing implementieren

---

## Appendix

### A.1 Glossar

- **TTS:** Text-to-Speech
- **SSML:** Speech Synthesis Markup Language
- **P95:** 95. Perzentil (95% der Requests sind schneller)
- **Fallback:** Automatischer Wechsel zu alternativer Engine
- **Rate-Limiting:** Beschränkung der Anfragen pro Zeiteinheit
- **Zero-Downtime:** Deployment ohne Service-Unterbrechung

### A.2 Referenzen

- Speechify API Docs: https://docs.speechify.com/api
- Google Cloud TTS: https://cloud.google.com/text-to-speech
- TikTok TTS (inoffizielle API): https://github.com/oscie57/tiktok-voice

### A.3 Team-Kontakte

- **Tech-Lead:** [Name] - tech-lead@example.com
- **Product-Owner:** [Name] - po@example.com
- **DevOps:** [Name] - devops@example.com
- **On-Call:** Siehe PagerDuty Schedule

---

**Dokument-Version:** 1.0
**Erstellt am:** 2025-11-14
**Letzte Aktualisierung:** 2025-11-14
**Status:** Draft → Review → Approved
**Next Review:** Nach Phase 1 (Woche 2)

---

## Quick Reference: Rollout-Checkliste

### Pre-Rollout
- [ ] Alle Unit-Tests bestehen
- [ ] Integration-Tests erfolgreich
- [ ] Manueller Test-Plan abgeschlossen
- [ ] Code-Review approved
- [ ] Dokumentation vollständig
- [ ] Monitoring-Dashboard eingerichtet
- [ ] Alert-Regeln konfiguriert
- [ ] Rollback-Prozedur getestet
- [ ] API-Key sicher hinterlegt
- [ ] Budget-Limit konfiguriert

### Rollout (Woche 4)
- [ ] Day 1: 5% Traffic → Monitoring intensiv
- [ ] Day 2: Go/No-Go-Entscheidung
- [ ] Day 3: 25% Traffic
- [ ] Day 4: Feedback sammeln
- [ ] Day 5: 50% Traffic
- [ ] Day 6: Kosten-Review
- [ ] Day 7: 100% Traffic
- [ ] Woche 5: Post-Rollout-Monitoring

### Post-Rollout
- [ ] Success-Metrics erfüllt
- [ ] User-Feedback analysiert
- [ ] Kosten innerhalb Budget
- [ ] Lessons-Learned-Dokumentation
- [ ] Feature-Flag entfernen
- [ ] Celebration! 🎉

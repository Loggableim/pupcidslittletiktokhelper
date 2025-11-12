# TTS Plugin - Komplette Bug-Fixes

**Datum:** 2025-11-12
**Basis-Version:** 2.0.0
**Analysierte Bugs:** 30+
**Status:** ⚠️ UNFIXED → Fixes werden implementiert

---

## 🚨 KRITISCHE FIXES (PRIORITÄT 1 - SOFORT)

### FIX #1: Security Bypass in permission-manager.js - denyUser()
**Datei:** `plugins/tts/utils/permission-manager.js:185-191`
**Bug:** Assigned Voice bleibt aktiv nach denyUser()

```javascript
// VORHER (BUGGY):
const stmt = this.db.db.prepare(`
    INSERT INTO tts_user_permissions (user_id, username, allow_tts, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
        allow_tts = 0,
        updated_at = excluded.updated_at
`);

// NACHHER (FIXED):
const stmt = this.db.db.prepare(`
    INSERT INTO tts_user_permissions (user_id, username, allow_tts, assigned_voice_id, assigned_engine, created_at, updated_at)
    VALUES (?, ?, 0, NULL, NULL, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
        allow_tts = 0,
        assigned_voice_id = NULL,
        assigned_engine = NULL,
        updated_at = excluded.updated_at
`);
```

---

### FIX #2: Null-Pointer-Exception in main.js - detectAndGetVoice()
**Datei:** `plugins/tts/main.js:454-458`
**Bug:** Kein null-check vor Zugriff auf langResult.voiceId

```javascript
// VORHER (BUGGY):
const langResult = this.languageDetector.detectAndGetVoice(finalText, engineClass);
selectedVoice = langResult.voiceId;
this.logger.info(`Language detected: ${langResult.languageName} (${langResult.langCode}) for "${finalText.substring(0, 30)}..."`);

// NACHHER (FIXED):
const langResult = this.languageDetector.detectAndGetVoice(finalText, engineClass);
if (langResult && langResult.voiceId) {
    selectedVoice = langResult.voiceId;
    this.logger.info(`Language detected: ${langResult.languageName} (${langResult.langCode}) for "${finalText.substring(0, 30)}..."`);
}
```

---

### FIX #3: Input-Validierung in main.js - Config Update
**Datei:** `plugins/tts/main.js:129-164`
**Bug:** Keine Type/Range-Validierung bei Config-Updates

```javascript
// VORHER (BUGGY):
Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key in this.config && key !== 'googleApiKey') {
        this.config[key] = updates[key];  // ❌ KEINE VALIDIERUNG
    }
});

// NACHHER (FIXED):
const validators = {
    volume: (v) => typeof v === 'number' && v >= 0 && v <= 100,
    speed: (v) => typeof v === 'number' && v >= 0.25 && v <= 4.0,
    teamMinLevel: (v) => typeof v === 'number' && v >= 0 && Number.isInteger(v),
    rateLimit: (v) => typeof v === 'number' && v >= 1 && Number.isInteger(v),
    rateLimitWindow: (v) => typeof v === 'number' && v >= 1 && Number.isInteger(v),
    maxQueueSize: (v) => typeof v === 'number' && v >= 1 && v <= 10000 && Number.isInteger(v),
    maxTextLength: (v) => typeof v === 'number' && v >= 1 && v <= 5000 && Number.isInteger(v),
    profanityFilter: (v) => ['off', 'moderate', 'strict'].includes(v),
    duckOtherAudio: (v) => typeof v === 'boolean',
    duckVolume: (v) => typeof v === 'number' && v >= 0 && v <= 1.0,
    enabledForChat: (v) => typeof v === 'boolean',
    autoLanguageDetection: (v) => typeof v === 'boolean'
};

const errors = [];
Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && key in this.config && key !== 'googleApiKey') {
        if (validators[key] && !validators[key](updates[key])) {
            errors.push(`Invalid value for ${key}: ${updates[key]}`);
        } else {
            this.config[key] = updates[key];
        }
    }
});

if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
}
```

---

### FIX #4: Memory-Leak in queue-manager.js - userRateLimits
**Datei:** `plugins/tts/utils/queue-manager.js:259-262`
**Bug:** userRateLimits Map wächst unbegrenzt

```javascript
// VORHER (BUGGY):
_recordUserMessage(userId) {
    const now = Date.now();
    const userLimit = this.userRateLimits.get(userId);

    if (!userLimit) {
        this.userRateLimits.set(userId, {
            timestamps: [now],
            username: userId
        });
    } else {
        userLimit.timestamps.push(now);

        // Limit cache size (LRU) - ❌ LÖSCHT NUR 1 EINTRAG!
        if (this.userRateLimits.size > 1000) {
            const firstKey = this.userRateLimits.keys().next().value;
            this.userRateLimits.delete(firstKey);
        }
    }
}

// NACHHER (FIXED):
_recordUserMessage(userId) {
    const now = Date.now();
    const userLimit = this.userRateLimits.get(userId);

    if (!userLimit) {
        this.userRateLimits.set(userId, {
            timestamps: [now],
            username: userId,
            lastActivity: now
        });
    } else {
        userLimit.timestamps.push(now);
        userLimit.lastActivity = now;
    }

    // Aggressive cleanup: Entferne inaktive User
    if (this.userRateLimits.size > 1000) {
        const windowMs = this.config.rateLimitWindow * 1000;
        const inactiveThreshold = now - 7200000; // 2 Stunden

        for (const [uid, limit] of this.userRateLimits.entries()) {
            // Entferne User die > 2h inaktiv sind
            if (limit.lastActivity < inactiveThreshold) {
                this.userRateLimits.delete(uid);
            }
        }

        // Falls immer noch > 1000: Entferne älteste
        if (this.userRateLimits.size > 1000) {
            const entries = Array.from(this.userRateLimits.entries())
                .sort((a, b) => a[1].lastActivity - b[1].lastActivity);

            const toDelete = entries.slice(0, this.userRateLimits.size - 1000);
            toDelete.forEach(([uid]) => this.userRateLimits.delete(uid));
        }
    }
}
```

---

### FIX #5: Race-Condition in queue-manager.js - _processNext()
**Datei:** `plugins/tts/utils/queue-manager.js:137-168`
**Bug:** Infinite Loop möglich bei Stop/Start

```javascript
// VORHER (BUGGY):
async _processNext(playCallback) {
    if (!this.isProcessing) {
        return;
    }

    const item = this.dequeue();

    if (!item) {
        setTimeout(() => this._processNext(playCallback), 1000);
        return;
    }

    this.currentItem = item;

    try {
        await playCallback(item);
        this.stats.totalPlayed++;
        this.logger.info(`TTS played: "${item.text.substring(0, 30)}..." (queue remaining: ${this.queue.length})`);
    } catch (error) {
        this.logger.error(`TTS playback error: ${error.message}`);
    } finally {
        this.currentItem = null;
        setTimeout(() => this._processNext(playCallback), 100);
    }
}

// NACHHER (FIXED):
async _processNext(playCallback) {
    if (!this.isProcessing) {
        return;
    }

    const item = this.dequeue();

    if (!item) {
        if (!this.isProcessing) return; // ✅ Doppel-Check
        this._nextTimeout = setTimeout(() => this._processNext(playCallback), 1000);
        return;
    }

    this.currentItem = item;

    try {
        await playCallback(item);
        this.stats.totalPlayed++;
        this.logger.info(`TTS played: "${item.text.substring(0, 30)}..." (queue remaining: ${this.queue.length})`);
    } catch (error) {
        this.logger.error(`TTS playback error: ${error.message}`);
    } finally {
        this.currentItem = null;
        if (!this.isProcessing) return; // ✅ Doppel-Check
        this._nextTimeout = setTimeout(() => this._processNext(playCallback), 100);
    }
}

stopProcessing() {
    this.isProcessing = false;
    this.currentItem = null;

    // ✅ Timeout clearen
    if (this._nextTimeout) {
        clearTimeout(this._nextTimeout);
        this._nextTimeout = null;
    }

    this.logger.info('TTS Queue processing stopped');
}
```

---

## 🔴 HOHE PRIORITÄT FIXES (PRIORITÄT 2 - HEUTE)

### FIX #6: Cache nicht invalidiert in permission-manager.js
**Datei:** `plugins/tts/utils/permission-manager.js:334-350`

```javascript
// VORHER (BUGGY):
setVolumeGain(userId, gain) {
    try {
        const stmt = this.db.db.prepare(`...`);
        stmt.run(gain, Math.floor(Date.now() / 1000), userId);
        // ❌ MISSING: this.clearCache();
        return true;
    } catch (error) {
        this.logger.error(`Failed to set volume gain for ${userId}: ${error.message}`);
        return false;
    }
}

// NACHHER (FIXED):
setVolumeGain(userId, gain) {
    try {
        const stmt = this.db.db.prepare(`...`);
        stmt.run(gain, Math.floor(Date.now() / 1000), userId);
        this.clearCache(); // ✅ ADDED
        return true;
    } catch (error) {
        this.logger.error(`Failed to set volume gain for ${userId}: ${error.message}`);
        return false;
    }
}
```

---

### FIX #7: Volume = 0 Problem in main.js
**Datei:** `plugins/tts/main.js:504`

```javascript
// VORHER (BUGGY):
volume: this.config.volume * (userSettings?.volume_gain || 1.0),
// Problem: volume_gain = 0 wird zu 1.0

// NACHHER (FIXED):
volume: this.config.volume * (userSettings?.volume_gain ?? 1.0),
```

---

### FIX #8: audioData Validierung in main.js
**Datei:** `plugins/tts/main.js:478-494`

```javascript
// VORHER (BUGGY):
let audioData;
try {
    audioData = await engine.synthesize(finalText, selectedVoice, this.config.speed);
} catch (engineError) {
    // Fallback...
}
// ❌ KEIN CHECK ob audioData leer ist!

// NACHHER (FIXED):
let audioData;
try {
    audioData = await engine.synthesize(finalText, selectedVoice, this.config.speed);
} catch (engineError) {
    // Fallback...
}

// ✅ Validierung hinzugefügt
if (!audioData || audioData.length === 0) {
    throw new Error('Engine returned empty audio data');
}
```

---

### FIX #9: Performance - Doppelte sortQueue() Aufrufe
**Datei:** `plugins/tts/utils/queue-manager.js:68, 105`

```javascript
// VORHER (BUGGY):
enqueue(item) {
    // ...
    this.queue.push(item);
    this._sortQueue(); // ❌ Sortiert
    // ...
}

dequeue() {
    if (this.queue.length === 0) {
        return null;
    }
    this._sortQueue(); // ❌ Sortiert NOCHMAL!
    return this.queue.shift();
}

// NACHHER (FIXED):
enqueue(item) {
    // ...
    this._insertInSortedOrder(item); // ✅ Direkt sortiert einfügen
    // ...
}

dequeue() {
    if (this.queue.length === 0) {
        return null;
    }
    // ✅ KEIN sortQueue() - Queue ist bereits sortiert
    return this.queue.shift();
}

_insertInSortedOrder(item) {
    // Binary search für Insert-Position
    let left = 0, right = this.queue.length;

    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (this._comparePriority(this.queue[mid], item) > 0) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }

    this.queue.splice(left, 0, item);
}

_comparePriority(a, b) {
    if (a.priority !== b.priority) {
        return b.priority - a.priority;
    }
    return a.timestamp - b.timestamp;
}
```

---

## 🟡 MEDIUM PRIORITÄT FIXES (PRIORITÄT 3 - DIESE WOCHE)

### FIX #10: Cache Memory Leak in permission-manager.js
**Datei:** `plugins/tts/utils/permission-manager.js:14-16, 129-140`

```javascript
// NEUE METHODE HINZUFÜGEN:
_cleanupOldCacheEntries() {
    const now = Date.now();
    const entriesToDelete = [];

    for (const [key, value] of this.permissionCache.entries()) {
        if (now - value.timestamp > this.cacheTimeout) {
            entriesToDelete.push(key);
        }
    }

    entriesToDelete.forEach(key => this.permissionCache.delete(key));

    if (entriesToDelete.length > 0) {
        this.logger.info(`Cleaned up ${entriesToDelete.length} old cache entries`);
    }
}

// IN CONSTRUCTOR HINZUFÜGEN:
constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this._initTables();
    this.permissionCache = new Map();
    this.cacheTimeout = 60000;

    // ✅ Automatische Cache-Bereinigung alle 5 Minuten
    this._cacheCleanupInterval = setInterval(() => {
        this._cleanupOldCacheEntries();
    }, 300000);
}

// IN DESTROY METHOD HINZUFÜGEN (falls es eine gibt):
destroy() {
    if (this._cacheCleanupInterval) {
        clearInterval(this._cacheCleanupInterval);
    }
}
```

---

### FIX #11: FIFO statt LRU in permission-manager.js
**Datei:** `plugins/tts/utils/permission-manager.js:137-138`

```javascript
// VORHER (FIFO):
if (this.permissionCache.size > 1000) {
    const firstKey = this.permissionCache.keys().next().value;
    this.permissionCache.delete(firstKey);
}

// NACHHER (ECHTES LRU):
_cacheResult(key, result) {
    this.permissionCache.set(key, {
        result,
        timestamp: Date.now(),
        accessCount: 0
    });

    if (this.permissionCache.size > 1000) {
        // Finde am wenigsten genutzten Eintrag
        let lruKey = null;
        let lruAccessCount = Infinity;
        let lruTimestamp = Infinity;

        for (const [k, v] of this.permissionCache.entries()) {
            if (v.accessCount < lruAccessCount ||
                (v.accessCount === lruAccessCount && v.timestamp < lruTimestamp)) {
                lruKey = k;
                lruAccessCount = v.accessCount;
                lruTimestamp = v.timestamp;
            }
        }

        if (lruKey) {
            this.permissionCache.delete(lruKey);
        }
    }
}

// UPDATE ACCESS COUNT BEI CACHE-HIT:
checkPermission(userId, username, teamLevel = 0, minTeamLevel = 0) {
    // ...
    const cacheKey = `${userId}_${teamLevel}_${minTeamLevel}`;
    const cached = this.permissionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        cached.accessCount++; // ✅ Increment access count
        return cached.result;
    }
    // ...
}
```

---

## 🟢 NIEDRIGE PRIORITÄT FIXES (OPTIONAL)

### FIX #12: Username in _recordUserMessage()
**Datei:** `plugins/tts/utils/queue-manager.js:246-263`

```javascript
// VORHER:
_recordUserMessage(userId) {
    // ...
    this.userRateLimits.set(userId, {
        timestamps: [now],
        username: userId  // ❌ userId statt echter username
    });
}

// NACHHER:
_recordUserMessage(userId, username) {
    // ...
    this.userRateLimits.set(userId, {
        timestamps: [now],
        username: username || userId  // ✅ Echter username
    });
}

// IN enqueue() AUFRUFEN:
this._recordUserMessage(item.userId, item.username);
```

---

### FIX #13: Priority Check Logik
**Datei:** `plugins/tts/utils/queue-manager.js:62-64`

```javascript
// VORHER:
if (item.priority === undefined) {
    item.priority = this._calculatePriority(item);
}

// NACHHER:
if (!('priority' in item) || item.priority === null || item.priority === undefined) {
    item.priority = this._calculatePriority(item);
}
```

---

### FIX #14: Input-Validierung in assignVoice()
**Datei:** `plugins/tts/utils/permission-manager.js:259-284`

```javascript
// VORHER:
assignVoice(userId, username, voiceId, engine) {
    // ❌ Keine Validierung

    const stmt = this.db.db.prepare(`...`);
    stmt.run(userId, username, voiceId, engine, now, now);
}

// NACHHER:
assignVoice(userId, username, voiceId, engine) {
    // ✅ Input-Validierung
    if (!voiceId || typeof voiceId !== 'string' || voiceId.length > 100) {
        this.logger.error(`Invalid voiceId: ${voiceId}`);
        return false;
    }

    if (!engine || !['tiktok', 'google'].includes(engine)) {
        this.logger.error(`Invalid engine: ${engine}`);
        return false;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const stmt = this.db.db.prepare(`...`);
        stmt.run(userId, username, voiceId, engine, now, now);
        this.clearCache();
        this.logger.info(`Voice assigned to ${username}: ${voiceId} (${engine})`);
        return true;
    } catch (error) {
        this.logger.error(`Failed to assign voice to ${username}: ${error.message}`);
        return false;
    }
}
```

---

## 📊 FIX-ZUSAMMENFASSUNG

| Fix # | Datei | Schweregrad | Status |
|-------|-------|-------------|--------|
| 1 | permission-manager.js | KRITISCH | ⏳ Pending |
| 2 | main.js | KRITISCH | ⏳ Pending |
| 3 | main.js | KRITISCH | ⏳ Pending |
| 4 | queue-manager.js | KRITISCH | ⏳ Pending |
| 5 | queue-manager.js | KRITISCH | ⏳ Pending |
| 6 | permission-manager.js | HOCH | ⏳ Pending |
| 7 | main.js | HOCH | ⏳ Pending |
| 8 | main.js | HOCH | ⏳ Pending |
| 9 | queue-manager.js | HOCH | ⏳ Pending |
| 10 | permission-manager.js | MEDIUM | ⏳ Pending |
| 11 | permission-manager.js | MEDIUM | ⏳ Pending |
| 12 | queue-manager.js | LOW | ⏳ Pending |
| 13 | queue-manager.js | LOW | ⏳ Pending |
| 14 | permission-manager.js | LOW | ⏳ Pending |

**Total:** 14 Fixes
**Kritisch:** 5
**Hoch:** 4
**Medium:** 2
**Niedrig:** 3

---

## 🎯 IMPLEMENTIERUNGS-REIHENFOLGE

### Phase 1: Kritische Security-Fixes (SOFORT)
1. Fix #1 - Security Bypass
2. Fix #2 - Null-Pointer
3. Fix #3 - Input-Validierung

### Phase 2: Stabilität (HEUTE)
4. Fix #4 - Memory-Leak userRateLimits
5. Fix #5 - Race-Condition _processNext
6. Fix #6 - Cache-Invalidierung
7. Fix #7 - Volume=0 Problem
8. Fix #8 - audioData Validierung

### Phase 3: Performance (DIESE WOCHE)
9. Fix #9 - Doppelte sortQueue()
10. Fix #10 - Cache Memory-Leak
11. Fix #11 - FIFO→LRU

### Phase 4: Code-Quality (OPTIONAL)
12. Fix #12 - Username korrekt
13. Fix #13 - Priority Check
14. Fix #14 - assignVoice Validierung

---

**Nächste Schritte:**
1. Alle Fixes implementieren
2. Umfassende Tests schreiben
3. Integration-Tests laufen lassen
4. Production-Deployment vorbereiten

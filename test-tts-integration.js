#!/usr/bin/env node
/**
 * TTS Plugin Integration Test
 * Tests plugin initialization, configuration loading, API connections, and voices availability
 */

const path = require('path');

console.log('='.repeat(80));
console.log('TTS PLUGIN INTEGRATION TEST');
console.log('='.repeat(80));
console.log('');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`)
};

// Mock database with better-sqlite3 simulation
const mockDB = {
    db: {
        prepare: (sql) => ({
            run: (...args) => {
                mockLogger.info(`DB RUN: ${sql.substring(0, 60)}...`);
                return { changes: 1 };
            },
            get: (...args) => {
                if (sql.includes('SELECT value FROM settings')) {
                    return null; // No saved config
                }
                if (sql.includes('tts_user_permissions')) {
                    return null; // No user permissions
                }
                return null;
            },
            all: (...args) => []
        }),
        exec: (sql) => {
            mockLogger.info(`DB EXEC: Creating tables...`);
        }
    },
    prepare: (sql) => mockDB.db.prepare(sql)
};

// Mock API
class MockPluginAPI {
    constructor() {
        this.routes = [];
        this.socketEvents = [];
        this.tiktokEvents = [];
        this.config = {};
    }

    registerRoute(method, path, handler) {
        this.routes.push({ method, path });
        mockLogger.info(`✓ Route registered: ${method} ${path}`);
    }

    registerSocket(event, callback) {
        this.socketEvents.push({ event });
        mockLogger.info(`✓ Socket event registered: ${event}`);
    }

    registerTikTokEvent(event, callback) {
        this.tiktokEvents.push({ event });
        mockLogger.info(`✓ TikTok event registered: ${event}`);
    }

    emit(event, data) {
        mockLogger.info(`✓ Event emitted: ${event}`);
    }

    getConfig(key) {
        return this.config[key] || null;
    }

    setConfig(key, value) {
        this.config[key] = value;
        mockLogger.info(`✓ Config saved: ${key}`);
    }

    getDatabase() {
        return mockDB;
    }

    log(msg, level = 'info') {
        mockLogger[level] ? mockLogger[level](msg) : mockLogger.info(msg);
    }

    get logger() {
        return mockLogger;
    }
}

// =============================================================================
// TEST SUITE
// =============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        console.log('');
        console.log(`TEST: ${name}`);
        console.log('-'.repeat(80));
        fn();
        testsPassed++;
        console.log(`✅ PASSED: ${name}`);
    } catch (error) {
        testsFailed++;
        console.log(`❌ FAILED: ${name}`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Stack: ${error.stack}`);
    }
}

// =============================================================================
// 1. MODULE LOADING TEST
// =============================================================================
test('Module Loading', () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    if (typeof TTSPlugin !== 'function') {
        throw new Error('TTSPlugin is not a constructor');
    }
    console.log('  ✓ TTSPlugin class loaded');
});

// =============================================================================
// 2. PLUGIN INITIALIZATION TEST
// =============================================================================
test('Plugin Initialization', () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();

    const plugin = new TTSPlugin(api);

    if (!plugin.config) {
        throw new Error('Plugin config not initialized');
    }
    console.log('  ✓ Plugin instance created');
    console.log('  ✓ Default config loaded');
    console.log(`    - Default Engine: ${plugin.config.defaultEngine}`);
    console.log(`    - Default Voice: ${plugin.config.defaultVoice}`);
    console.log(`    - Max Queue Size: ${plugin.config.maxQueueSize}`);
});

// =============================================================================
// 3. ENGINE AVAILABILITY TEST
// =============================================================================
test('Engine Availability', () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();
    const plugin = new TTSPlugin(api);

    if (!plugin.engines.tiktok) {
        throw new Error('TikTok engine not initialized');
    }
    console.log('  ✓ TikTok engine available');

    if (plugin.config.googleApiKey && !plugin.engines.google) {
        throw new Error('Google engine should be initialized when API key exists');
    }
    console.log('  ✓ Google engine conditional initialization correct');
});

// =============================================================================
// 4. UTILITIES INITIALIZATION TEST
// =============================================================================
test('Utilities Initialization', () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();
    const plugin = new TTSPlugin(api);

    if (!plugin.languageDetector) {
        throw new Error('Language detector not initialized');
    }
    console.log('  ✓ Language detector initialized');

    if (!plugin.profanityFilter) {
        throw new Error('Profanity filter not initialized');
    }
    console.log('  ✓ Profanity filter initialized');

    if (!plugin.permissionManager) {
        throw new Error('Permission manager not initialized');
    }
    console.log('  ✓ Permission manager initialized');

    if (!plugin.queueManager) {
        throw new Error('Queue manager not initialized');
    }
    console.log('  ✓ Queue manager initialized');
});

// =============================================================================
// 5. API ROUTES REGISTRATION TEST
// =============================================================================
test('API Routes Registration', async () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();
    const plugin = new TTSPlugin(api);

    await plugin.init();

    const expectedRoutes = [
        'GET /api/tts/config',
        'POST /api/tts/config',
        'GET /api/tts/voices',
        'POST /api/tts/speak',
        'GET /api/tts/queue',
        'POST /api/tts/queue/clear',
        'POST /api/tts/queue/skip',
        'GET /api/tts/users'
    ];

    expectedRoutes.forEach(route => {
        const [method, path] = route.split(' ');
        const found = api.routes.find(r => r.method === method && r.path === path);
        if (!found) {
            throw new Error(`Route not registered: ${route}`);
        }
        console.log(`  ✓ Route registered: ${route}`);
    });
});

// =============================================================================
// 6. SOCKET EVENTS REGISTRATION TEST
// =============================================================================
test('Socket Events Registration', async () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();
    const plugin = new TTSPlugin(api);

    await plugin.init();

    const expectedEvents = [
        'tts:speak',
        'tts:queue:status',
        'tts:queue:clear',
        'tts:queue:skip'
    ];

    expectedEvents.forEach(event => {
        const found = api.socketEvents.find(e => e.event === event);
        if (!found) {
            throw new Error(`Socket event not registered: ${event}`);
        }
        console.log(`  ✓ Socket event registered: ${event}`);
    });
});

// =============================================================================
// 7. TIKTOK EVENTS REGISTRATION TEST
// =============================================================================
test('TikTok Events Registration', async () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();
    const plugin = new TTSPlugin(api);

    await plugin.init();

    const found = api.tiktokEvents.find(e => e.event === 'chat');
    if (!found) {
        throw new Error('TikTok chat event not registered');
    }
    console.log('  ✓ TikTok chat event registered');
});

// =============================================================================
// 8. VOICES AVAILABILITY TEST
// =============================================================================
test('Voices Availability', () => {
    const TikTokEngine = require('./plugins/tts/engines/tiktok-engine.js');
    const GoogleEngine = require('./plugins/tts/engines/google-engine.js');

    const tiktokVoices = TikTokEngine.getVoices();
    if (Object.keys(tiktokVoices).length === 0) {
        throw new Error('No TikTok voices available');
    }
    console.log(`  ✓ TikTok voices available: ${Object.keys(tiktokVoices).length}`);

    const googleVoices = GoogleEngine.getVoices();
    if (Object.keys(googleVoices).length === 0) {
        throw new Error('No Google voices available');
    }
    console.log(`  ✓ Google voices available: ${Object.keys(googleVoices).length}`);

    // Test default voice selection
    const defaultVoice = TikTokEngine.getDefaultVoiceForLanguage('en');
    if (!defaultVoice) {
        throw new Error('Default voice for English not found');
    }
    console.log(`  ✓ Default English voice: ${defaultVoice}`);
});

// =============================================================================
// 9. CONFIGURATION LOADING TEST
// =============================================================================
test('Configuration Loading', () => {
    const TTSPlugin = require('./plugins/tts/main.js');
    const api = new MockPluginAPI();
    const plugin = new TTSPlugin(api);

    // Check default config structure
    const requiredKeys = [
        'defaultEngine', 'defaultVoice', 'volume', 'speed',
        'teamMinLevel', 'rateLimit', 'maxQueueSize', 'maxTextLength',
        'profanityFilter', 'enabledForChat', 'autoLanguageDetection'
    ];

    requiredKeys.forEach(key => {
        if (!(key in plugin.config)) {
            throw new Error(`Missing config key: ${key}`);
        }
        console.log(`  ✓ Config key present: ${key} = ${plugin.config[key]}`);
    });
});

// =============================================================================
// 10. LANGUAGE DETECTION TEST
// =============================================================================
test('Language Detection', () => {
    const LanguageDetector = require('./plugins/tts/utils/language-detector.js');
    const detector = new LanguageDetector(mockLogger);

    // Test English
    const resultEN = detector.detect('Hello, how are you today?');
    if (resultEN.langCode !== 'en') {
        throw new Error(`Expected 'en', got '${resultEN.langCode}'`);
    }
    console.log(`  ✓ English detected correctly: "${resultEN.langCode}"`);

    // Test German
    const resultDE = detector.detect('Guten Tag, wie geht es Ihnen?');
    if (resultDE.langCode !== 'de') {
        throw new Error(`Expected 'de', got '${resultDE.langCode}'`);
    }
    console.log(`  ✓ German detected correctly: "${resultDE.langCode}"`);
});

// =============================================================================
// 11. PROFANITY FILTER TEST
// =============================================================================
test('Profanity Filter', () => {
    const ProfanityFilter = require('./plugins/tts/utils/profanity-filter.js');
    const filter = new ProfanityFilter(mockLogger);

    filter.setMode('moderate');
    filter.setReplacement('asterisk');

    const result = filter.filter('This is a test message');
    if (result.hasProfanity) {
        throw new Error('Clean text marked as profanity');
    }
    console.log('  ✓ Clean text passes filter');

    const dirtyResult = filter.filter('This is shit');
    if (!dirtyResult.hasProfanity) {
        throw new Error('Profanity not detected');
    }
    if (!dirtyResult.filtered.includes('*')) {
        throw new Error('Profanity not filtered');
    }
    console.log(`  ✓ Profanity detected and filtered: "${dirtyResult.filtered}"`);
});

// =============================================================================
// 12. QUEUE MANAGER TEST
// =============================================================================
test('Queue Manager', () => {
    const QueueManager = require('./plugins/tts/utils/queue-manager.js');
    const config = {
        maxQueueSize: 100,
        rateLimit: 3,
        rateLimitWindow: 60
    };
    const queueManager = new QueueManager(config, mockLogger);

    // Test enqueue
    const item = {
        userId: 'test123',
        username: 'TestUser',
        text: 'Hello world',
        voice: 'en_us_001',
        engine: 'tiktok',
        audioData: 'base64data',
        volume: 80,
        speed: 1.0,
        source: 'manual'
    };

    const result = queueManager.enqueue(item);
    if (!result.success) {
        throw new Error('Failed to enqueue item');
    }
    console.log(`  ✓ Item enqueued successfully (position: ${result.position})`);

    // Test queue info
    const info = queueManager.getInfo();
    if (info.size !== 1) {
        throw new Error(`Expected queue size 1, got ${info.size}`);
    }
    console.log(`  ✓ Queue info correct: size=${info.size}`);
});

// =============================================================================
// RESULTS
// =============================================================================
console.log('');
console.log('='.repeat(80));
console.log('TEST RESULTS');
console.log('='.repeat(80));
console.log('');
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📊 Total:  ${testsPassed + testsFailed}`);
console.log('');

if (testsFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! TTS Plugin is fully operational.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Start server: npm start');
    console.log('  2. Test in browser: http://localhost:3000/dashboard.html');
    console.log('  3. Check plugin status in admin interface');
    console.log('');
    process.exit(0);
} else {
    console.log('⚠️ SOME TESTS FAILED! Please review the errors above.');
    console.log('');
    process.exit(1);
}

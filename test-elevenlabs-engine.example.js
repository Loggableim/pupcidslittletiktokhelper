#!/usr/bin/env node
/**
 * ElevenLabs Engine - Unit Test Example
 *
 * This is a comprehensive test suite for the ElevenLabs TTS engine.
 * Run with: node test-elevenlabs-engine.example.js
 *
 * NOTE: To run the full API tests, you need to set the ELEVENLABS_API_KEY
 * environment variable with a valid ElevenLabs API key.
 */

const ElevenLabsEngine = require('./plugins/tts/engines/elevenlabs-engine');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`)
};

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
    }
}

async function asyncTest(name, fn) {
    try {
        console.log('');
        console.log(`TEST: ${name}`);
        console.log('-'.repeat(80));
        await fn();
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
// 1. INITIALIZATION TESTS
// =============================================================================

test('Engine should initialize with valid API key', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    if (!engine.apiKey) {
        throw new Error('API key not set');
    }
    console.log('  ✓ API key stored correctly');
    console.log(`  ✓ Default model: ${engine.defaultModel}`);
    console.log(`  ✓ API Base URL: ${engine.apiBaseUrl}`);
});

test('Engine should throw error without API key', () => {
    let threw = false;
    let errorMessage = '';
    
    try {
        new ElevenLabsEngine(null, mockLogger);
    } catch (error) {
        threw = true;
        errorMessage = error.message;
    }
    
    if (!threw) {
        throw new Error('Should have thrown error but did not');
    }
    
    if (!errorMessage.includes('API key') && !errorMessage.includes('required')) {
        throw new Error(`Wrong error message: ${errorMessage}`);
    }
    
    console.log('  ✓ Error thrown correctly');
    console.log(`  ✓ Error message: ${errorMessage}`);
});

test('Engine should throw error with empty API key', () => {
    try {
        new ElevenLabsEngine('', mockLogger);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('non-empty string')) {
            console.log('  ✓ Error thrown correctly for empty string');
        } else {
            throw error;
        }
    }
});

// =============================================================================
// 2. CONFIGURATION TESTS
// =============================================================================

test('Engine should have correct default configuration', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    
    if (engine.timeout !== 15000) {
        throw new Error('Timeout should be 15000ms');
    }
    console.log('  ✓ Timeout: 15000ms');
    
    if (engine.maxRetries !== 2) {
        throw new Error('Max retries should be 2');
    }
    console.log('  ✓ Max retries: 2');
    
    if (engine.cacheTTL !== 3600000) {
        throw new Error('Cache TTL should be 1 hour');
    }
    console.log('  ✓ Cache TTL: 1 hour');
    
    if (engine.defaultModel !== 'eleven_multilingual_v2') {
        throw new Error('Default model should be eleven_multilingual_v2');
    }
    console.log('  ✓ Default model: eleven_multilingual_v2');
});

test('Engine should provide correct API endpoints', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    
    if (engine.apiBaseUrl !== 'https://api.elevenlabs.io/v1') {
        throw new Error('API base URL incorrect');
    }
    console.log('  ✓ API Base URL: https://api.elevenlabs.io/v1');
    
    if (engine.apiVoicesUrl !== 'https://api.elevenlabs.io/v1/voices') {
        throw new Error('Voices URL incorrect');
    }
    console.log('  ✓ Voices URL: https://api.elevenlabs.io/v1/voices');
});

// =============================================================================
// 3. STATIC METHOD TESTS
// =============================================================================

test('Static method: getDefaultVoiceForLanguage', () => {
    const voiceEN = ElevenLabsEngine.getDefaultVoiceForLanguage('en');
    if (!voiceEN || typeof voiceEN !== 'string') {
        throw new Error('Should return voice ID for English');
    }
    console.log(`  ✓ English voice: ${voiceEN}`);
    
    const voiceDE = ElevenLabsEngine.getDefaultVoiceForLanguage('de');
    if (!voiceDE || typeof voiceDE !== 'string') {
        throw new Error('Should return voice ID for German');
    }
    console.log(`  ✓ German voice: ${voiceDE}`);
    
    const voiceUnknown = ElevenLabsEngine.getDefaultVoiceForLanguage('unknown');
    if (!voiceUnknown || typeof voiceUnknown !== 'string') {
        throw new Error('Should return fallback voice for unknown language');
    }
    console.log(`  ✓ Fallback voice for unknown language: ${voiceUnknown}`);
});

// =============================================================================
// 4. INSTANCE METHOD TESTS
// =============================================================================

test('Instance method: getInfo', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    const info = engine.getInfo();
    
    if (info.name !== 'ElevenLabs') {
        throw new Error('Name should be ElevenLabs');
    }
    console.log(`  ✓ Name: ${info.name}`);
    
    if (!info.version) {
        throw new Error('Should have version');
    }
    console.log(`  ✓ Version: ${info.version}`);
    
    if (!info.apiBaseUrl) {
        throw new Error('Should have API base URL');
    }
    console.log(`  ✓ API Base URL: ${info.apiBaseUrl}`);
});

test('Instance method: getFallbackVoices', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    const voices = engine._getFallbackVoices();
    
    if (!voices || typeof voices !== 'object') {
        throw new Error('Should return voice object');
    }
    
    const voiceCount = Object.keys(voices).length;
    if (voiceCount === 0) {
        throw new Error('Should have at least one fallback voice');
    }
    console.log(`  ✓ Fallback voices count: ${voiceCount}`);
    
    // Check Rachel voice (most popular)
    const rachel = voices['21m00Tcm4TlvDq8ikWAM'];
    if (!rachel) {
        throw new Error('Should have Rachel voice as fallback');
    }
    console.log(`  ✓ Rachel voice available: ${rachel.name}`);
});

test('Instance method: setApiKey', () => {
    const engine = new ElevenLabsEngine('xi_old_key', mockLogger);
    
    engine.setApiKey('xi_new_key');
    if (engine.apiKey !== 'xi_new_key') {
        throw new Error('API key should be updated');
    }
    console.log('  ✓ API key updated successfully');
    
    try {
        engine.setApiKey('');
        throw new Error('Should throw error for empty key');
    } catch (error) {
        if (error.message.includes('non-empty string')) {
            console.log('  ✓ Error thrown for empty key');
        } else {
            throw error;
        }
    }
});

test('Instance method: estimateCost', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    
    const cost1000 = engine.estimateCost(1000);
    if (cost1000 <= 0) {
        throw new Error('Cost for 1000 chars should be > 0');
    }
    console.log(`  ✓ Cost for 1000 chars: $${cost1000.toFixed(4)}`);
    
    const cost5000 = engine.estimateCost(5000);
    if (cost5000 <= cost1000) {
        throw new Error('Cost for 5000 chars should be > cost for 1000 chars');
    }
    console.log(`  ✓ Cost for 5000 chars: $${cost5000.toFixed(4)}`);
});

test('Instance method: getUsageStats', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    const stats = engine.getUsageStats();
    
    if (typeof stats.totalRequests !== 'number') {
        throw new Error('Should have totalRequests');
    }
    console.log(`  ✓ Total requests: ${stats.totalRequests}`);
    
    if (typeof stats.successfulRequests !== 'number') {
        throw new Error('Should have successfulRequests');
    }
    console.log(`  ✓ Successful requests: ${stats.successfulRequests}`);
    
    if (typeof stats.failedRequests !== 'number') {
        throw new Error('Should have failedRequests');
    }
    console.log(`  ✓ Failed requests: ${stats.failedRequests}`);
    
    if (typeof stats.totalCost !== 'number') {
        throw new Error('Should have totalCost');
    }
    console.log(`  ✓ Total cost: $${stats.totalCost.toFixed(4)}`);
});

test('Instance method: resetUsageStats', () => {
    const engine = new ElevenLabsEngine('xi_test123', mockLogger);
    
    // Simulate some usage
    engine.usageStats.totalRequests = 10;
    engine.usageStats.successfulRequests = 8;
    engine.usageStats.failedRequests = 2;
    engine.usageStats.totalCost = 0.5;
    
    engine.resetUsageStats();
    
    const stats = engine.getUsageStats();
    if (stats.totalRequests !== 0 || stats.successfulRequests !== 0 || 
        stats.failedRequests !== 0 || stats.totalCost !== 0) {
        throw new Error('Stats should be reset to 0');
    }
    console.log('  ✓ Usage stats reset successfully');
});

// =============================================================================
// 5. API TESTS (requires valid API key)
// =============================================================================

const apiKey = process.env.ELEVENLABS_API_KEY;

if (apiKey) {
    console.log('\n');
    console.log('='.repeat(80));
    console.log('API TESTS (using real API key)');
    console.log('='.repeat(80));
    
    asyncTest('API: Fetch voices from ElevenLabs', async () => {
        const engine = new ElevenLabsEngine(apiKey, mockLogger);
        const voices = await engine.getVoices();
        
        if (!voices || typeof voices !== 'object') {
            throw new Error('Should return voices object');
        }
        
        const voiceCount = Object.keys(voices).length;
        if (voiceCount === 0) {
            throw new Error('Should return at least one voice');
        }
        console.log(`  ✓ Fetched ${voiceCount} voices from API`);
        
        // Show first voice as example
        const firstVoiceId = Object.keys(voices)[0];
        const firstVoice = voices[firstVoiceId];
        console.log(`  ✓ Example voice: ${firstVoice.name} (${firstVoice.lang})`);
    });
    
    asyncTest('API: Test connectivity', async () => {
        const engine = new ElevenLabsEngine(apiKey, mockLogger);
        const isAvailable = await engine.test();
        
        if (!isAvailable) {
            throw new Error('Engine should be available');
        }
        console.log('  ✓ Engine connectivity test passed');
    });
    
    asyncTest('API: Synthesize short text', async () => {
        const engine = new ElevenLabsEngine(apiKey, mockLogger);
        const text = 'Hello, this is a test.';
        const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel
        
        const audioData = await engine.synthesize(text, voiceId);
        
        if (!audioData || audioData.length === 0) {
            throw new Error('Should return audio data');
        }
        console.log(`  ✓ Synthesized "${text}"`);
        console.log(`  ✓ Audio data length: ${audioData.length} bytes (base64)`);
        
        const stats = engine.getUsageStats();
        console.log(`  ✓ Total cost: $${stats.totalCost.toFixed(4)}`);
    });
} else {
    console.log('\n');
    console.log('='.repeat(80));
    console.log('SKIPPING API TESTS (no ELEVENLABS_API_KEY environment variable)');
    console.log('To run API tests, set: export ELEVENLABS_API_KEY=your_api_key');
    console.log('='.repeat(80));
}

// =============================================================================
// TEST SUMMARY
// =============================================================================

console.log('\n');
console.log('='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
} else {
    console.log('\n⚠️  Some tests failed!');
    process.exit(1);
}

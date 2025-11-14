#!/usr/bin/env node
/**
 * Speechify Engine - Unit Test Example
 *
 * This is a comprehensive test suite for the Speechify TTS engine.
 * Run with: npm test -- test-speechify-engine.example.js
 */

const SpeechifyEngine = require('./plugins/tts/engines/speechify-engine');
const axios = require('axios');

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
    }
}

// =============================================================================
// 1. INITIALIZATION TESTS
// =============================================================================

test('Engine should initialize with valid API key', () => {
    const engine = new SpeechifyEngine('sk_test123', mockLogger);
    if (!engine.apiKey) {
        throw new Error('API key not set');
    }
    console.log('  ✓ API key stored correctly');
});

test('Engine should throw error without API key', () => {
    try {
        new SpeechifyEngine(null, mockLogger);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('API key required')) {
            console.log('  ✓ Error thrown correctly');
        } else {
            throw error;
        }
    }
});

test('Engine should have correct default values', () => {
    const engine = new SpeechifyEngine('key', mockLogger);
    if (engine.timeout !== 30000) {
        throw new Error(`Expected timeout 30000, got ${engine.timeout}`);
    }
    if (engine.maxRetries !== 3) {
        throw new Error(`Expected maxRetries 3, got ${engine.maxRetries}`);
    }
    console.log('  ✓ Default timeout: 30000ms');
    console.log('  ✓ Default maxRetries: 3');
});

// =============================================================================
// 2. VOICE MANAGEMENT TESTS
// =============================================================================

test('Should return all available voices', () => {
    const voices = SpeechifyEngine.getVoices();
    if (Object.keys(voices).length === 0) {
        throw new Error('No voices available');
    }
    console.log(`  ✓ ${Object.keys(voices).length} voices available`);

    // Check for expected voices
    const expectedVoices = ['george', 'mads', 'diego', 'henry'];
    expectedVoices.forEach(voiceId => {
        if (!voices[voiceId]) {
            throw new Error(`Expected voice '${voiceId}' not found`);
        }
        console.log(`  ✓ Voice found: ${voiceId} - ${voices[voiceId].name}`);
    });
});

test('Should return correct default voice for English', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('en');
    if (voice !== 'george') {
        throw new Error(`Expected 'george', got '${voice}'`);
    }
    console.log('  ✓ Default English voice: george');
});

test('Should return correct default voice for German', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('de');
    if (voice !== 'mads') {
        throw new Error(`Expected 'mads', got '${voice}'`);
    }
    console.log('  ✓ Default German voice: mads');
});

test('Should fallback to English for unsupported language', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('xyz');
    if (voice !== 'george') {
        throw new Error(`Expected 'george' as fallback, got '${voice}'`);
    }
    console.log('  ✓ Fallback voice: george');
});

// =============================================================================
// 3. API COMMUNICATION TESTS (MOCKED)
// =============================================================================

asyncTest('Should synthesize audio successfully (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    // Mock axios.post
    const originalPost = axios.post;
    axios.post = async (url, data, config) => {
        console.log('  ✓ API called with correct URL:', url);
        console.log('  ✓ Request data:', JSON.stringify(data));
        return {
            data: {
                audio_data: 'base64_encoded_audio_data_example'
            }
        };
    };

    try {
        const audio = await engine.synthesize('Hello World', 'george', 1.0);
        if (!audio) {
            throw new Error('No audio data returned');
        }
        if (audio !== 'base64_encoded_audio_data_example') {
            throw new Error('Incorrect audio data');
        }
        console.log('  ✓ Audio synthesized successfully');
    } finally {
        axios.post = originalPost; // Restore
    }
});

asyncTest('Should retry on network error (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    let attempts = 0;
    const originalPost = axios.post;
    axios.post = async (url, data, config) => {
        attempts++;
        if (attempts < 3) {
            throw new Error('Network error (simulated)');
        }
        return { data: { audio_data: 'success_after_retries' } };
    };

    try {
        const audio = await engine.synthesize('Test', 'george', 1.0);
        if (attempts !== 3) {
            throw new Error(`Expected 3 attempts, got ${attempts}`);
        }
        console.log('  ✓ Retried 3 times');
        console.log('  ✓ Succeeded after retries');
    } finally {
        axios.post = originalPost;
    }
});

asyncTest('Should throw error after max retries (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
        throw new Error('Persistent network error');
    };

    try {
        await engine.synthesize('Test', 'george', 1.0);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('Persistent network error')) {
            console.log('  ✓ Error thrown after max retries');
        } else {
            throw error;
        }
    } finally {
        axios.post = originalPost;
    }
});

asyncTest('Should handle API error responses (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
        const error = new Error('API error');
        error.response = {
            status: 401,
            data: { error: 'Invalid API key' }
        };
        throw error;
    };

    try {
        await engine.synthesize('Test', 'george', 1.0);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('401')) {
            console.log('  ✓ 401 error handled correctly');
        } else {
            throw error;
        }
    } finally {
        axios.post = originalPost;
    }
});

asyncTest('Should handle rate limiting (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
        const error = new Error('Rate limit');
        error.response = {
            status: 429,
            data: { error: 'Rate limit exceeded' }
        };
        throw error;
    };

    try {
        await engine.synthesize('Test', 'george', 1.0);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('Rate limit')) {
            console.log('  ✓ 429 rate limit handled correctly');
        } else {
            throw error;
        }
    } finally {
        axios.post = originalPost;
    }
});

// =============================================================================
// 4. COST TRACKING TESTS
// =============================================================================

asyncTest('Should track character count (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
        await engine.synthesize('Hello World', 'george', 1.0); // 11 chars

        const stats = engine.getUsageStats();
        if (stats.totalCharacters !== 11) {
            throw new Error(`Expected 11 characters, got ${stats.totalCharacters}`);
        }
        if (stats.totalRequests !== 1) {
            throw new Error(`Expected 1 request, got ${stats.totalRequests}`);
        }
        console.log('  ✓ Characters tracked: 11');
        console.log('  ✓ Requests tracked: 1');
    } finally {
        axios.post = originalPost;
    }
});

test('Should estimate costs correctly', () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const cost10k = engine.estimateCost(10000);
    if (Math.abs(cost10k - 0.15) > 0.01) { // $0.015 per 1k chars
        throw new Error(`Expected $0.15, got $${cost10k}`);
    }
    console.log('  ✓ Cost for 10k chars: $0.15');

    const cost1M = engine.estimateCost(1000000);
    if (Math.abs(cost1M - 15.00) > 0.01) {
        throw new Error(`Expected $15.00, got $${cost1M}`);
    }
    console.log('  ✓ Cost for 1M chars: $15.00');
});

// =============================================================================
// 5. EDGE CASES
// =============================================================================

test('Should handle empty API key string', () => {
    try {
        new SpeechifyEngine('', mockLogger);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('API key required')) {
            console.log('  ✓ Empty string rejected');
        } else {
            throw error;
        }
    }
});

test('Should handle whitespace-only API key', () => {
    try {
        new SpeechifyEngine('   ', mockLogger);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('API key required')) {
            console.log('  ✓ Whitespace-only rejected');
        } else {
            throw error;
        }
    }
});

test('Should handle non-string API key', () => {
    try {
        new SpeechifyEngine(12345, mockLogger);
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message.includes('API key') || error.message.includes('string')) {
            console.log('  ✓ Non-string rejected');
        } else {
            throw error;
        }
    }
});

// =============================================================================
// RESULTS
// =============================================================================

async function runTests() {
    console.log('='.repeat(80));
    console.log('SPEECHIFY ENGINE - UNIT TESTS');
    console.log('='.repeat(80));

    // Wait for all async tests to complete
    await new Promise(resolve => setTimeout(resolve, 100));

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
        console.log('🎉 ALL TESTS PASSED! Speechify Engine is ready for integration.');
        console.log('');
        process.exit(0);
    } else {
        console.log('⚠️ SOME TESTS FAILED! Please fix before proceeding.');
        console.log('');
        process.exit(1);
    }
}

runTests();

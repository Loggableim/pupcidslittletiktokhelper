/**
 * Test suite for TTS Invalid Engine Handling
 * Tests that the system correctly handles invalid/unknown engine configurations
 */

const assert = require('assert');

// Mock logger
const mockLogger = {
    info: () => {},
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: () => {}
};

console.log('🧪 Running TTS Invalid Engine Handling Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        console.error(`  Stack: ${error.stack}`);
        failed++;
    }
}

// Test 1: Valid engines constant exists
runTest('TTSPlugin should have VALID_ENGINES constant', () => {
    // Load the TTS plugin to check the constant
    const TTSPlugin = require('../plugins/tts/main');
    assert.ok(TTSPlugin.VALID_ENGINES);
    assert.ok(Array.isArray(TTSPlugin.VALID_ENGINES));
    assert.ok(TTSPlugin.VALID_ENGINES.length > 0);
    assert.ok(TTSPlugin.VALID_ENGINES.includes('google'));
    assert.ok(TTSPlugin.VALID_ENGINES.includes('openai'));
    assert.ok(TTSPlugin.VALID_ENGINES.includes('elevenlabs'));
    assert.ok(TTSPlugin.VALID_ENGINES.includes('speechify'));
    assert.ok(TTSPlugin.VALID_ENGINES.includes('fishspeech'));
});

// Test 2: Invalid engine name not in valid engines
runTest('VALID_ENGINES should not include invalid engines', () => {
    const TTSPlugin = require('../plugins/tts/main');
    assert.ok(!TTSPlugin.VALID_ENGINES.includes('tiktok'));
    assert.ok(!TTSPlugin.VALID_ENGINES.includes('unknown'));
    assert.ok(!TTSPlugin.VALID_ENGINES.includes('invalid'));
});

// Test 3: VALID_ENGINES has exactly the expected engines
runTest('VALID_ENGINES should contain exactly 5 engines', () => {
    const TTSPlugin = require('../plugins/tts/main');
    assert.strictEqual(TTSPlugin.VALID_ENGINES.length, 5);
    const expectedEngines = ['google', 'speechify', 'elevenlabs', 'openai', 'fishspeech'];
    expectedEngines.forEach(engine => {
        assert.ok(TTSPlugin.VALID_ENGINES.includes(engine), `Expected ${engine} to be in VALID_ENGINES`);
    });
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);

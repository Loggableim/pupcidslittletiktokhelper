/**
 * Test suite for Soundboard Fetcher
 * Tests path validation and URL whitelist functionality
 */

const path = require('path');
const SoundboardFetcher = require('./plugins/soundboard/fetcher');

console.log('\n🧪 Testing SoundboardFetcher...\n');

// Test instance
const fetcher = new SoundboardFetcher();
const testSoundsDir = path.join(__dirname, 'public', 'sounds');

// Test counters
let tests = 0;
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests++;
    try {
        fn();
        passed++;
        console.log(`✅ ${name}`);
    } catch (error) {
        failed++;
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
    }
}

function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || 'Expected true, got false');
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(message || 'Expected false, got true');
    }
}

// ========== Path Validation Tests ==========

console.log('📁 Path Validation Tests:\n');

test('Valid MP3 filename', () => {
    const result = fetcher.validateLocalPath('test.mp3', testSoundsDir);
    assertTrue(result.valid, 'Should accept valid MP3 filename');
    assertEquals(result.filename, 'test.mp3', 'Filename should match');
});

test('Valid WAV filename', () => {
    const result = fetcher.validateLocalPath('sound.wav', testSoundsDir);
    assertTrue(result.valid, 'Should accept valid WAV filename');
});

test('Valid OGG filename', () => {
    const result = fetcher.validateLocalPath('audio.ogg', testSoundsDir);
    assertTrue(result.valid, 'Should accept valid OGG filename');
});

test('Valid M4A filename', () => {
    const result = fetcher.validateLocalPath('music.m4a', testSoundsDir);
    assertTrue(result.valid, 'Should accept valid M4A filename');
});

test('Reject path traversal with ..', () => {
    const result = fetcher.validateLocalPath('../../../etc/passwd', testSoundsDir);
    assertFalse(result.valid, 'Should reject path traversal');
    assertTrue(result.error.includes('traversal'), 'Error should mention traversal');
});

test('Reject path with forward slash', () => {
    const result = fetcher.validateLocalPath('subdir/file.mp3', testSoundsDir);
    assertFalse(result.valid, 'Should reject path with slash');
});

test('Reject path with backslash', () => {
    const result = fetcher.validateLocalPath('subdir\\file.mp3', testSoundsDir);
    assertFalse(result.valid, 'Should reject path with backslash');
});

test('Reject invalid file extension', () => {
    const result = fetcher.validateLocalPath('malicious.exe', testSoundsDir);
    assertFalse(result.valid, 'Should reject non-audio extension');
    assertTrue(result.error.includes('extension'), 'Error should mention extension');
});

test('Reject invalid file extension (.js)', () => {
    const result = fetcher.validateLocalPath('script.js', testSoundsDir);
    assertFalse(result.valid, 'Should reject .js files');
});

test('Reject null filename', () => {
    const result = fetcher.validateLocalPath(null, testSoundsDir);
    assertFalse(result.valid, 'Should reject null filename');
});

test('Reject empty filename', () => {
    const result = fetcher.validateLocalPath('', testSoundsDir);
    assertFalse(result.valid, 'Should reject empty filename');
});

test('Case insensitive extension', () => {
    const result = fetcher.validateLocalPath('sound.MP3', testSoundsDir);
    assertTrue(result.valid, 'Should accept uppercase extension');
});

// ========== URL Validation Tests ==========

console.log('\n🌐 URL Validation Tests:\n');

test('Valid MyInstants URL', () => {
    const result = fetcher.validateExternalUrl('https://www.myinstants.com/media/sounds/test.mp3');
    assertTrue(result.valid, 'Should accept MyInstants URL');
});

test('Valid MyInstants subdomain', () => {
    const result = fetcher.validateExternalUrl('https://cdn.myinstants.com/sounds/test.mp3');
    assertTrue(result.valid, 'Should accept MyInstants subdomain');
});

test('Valid OpenShock URL', () => {
    const result = fetcher.validateExternalUrl('https://openshock.com/audio/test.mp3');
    assertTrue(result.valid, 'Should accept OpenShock URL');
});

test('Valid www.openshock.com URL', () => {
    const result = fetcher.validateExternalUrl('https://www.openshock.com/sounds/beep.mp3');
    assertTrue(result.valid, 'Should accept www.openshock.com URL');
});

test('Reject non-whitelisted host', () => {
    const result = fetcher.validateExternalUrl('https://evil.com/malware.mp3');
    assertFalse(result.valid, 'Should reject non-whitelisted host');
    assertTrue(result.error.includes('not allowed'), 'Error should mention host not allowed');
});

test('Reject file:// protocol', () => {
    const result = fetcher.validateExternalUrl('file:///etc/passwd');
    assertFalse(result.valid, 'Should reject file:// protocol');
    assertTrue(result.error.includes('HTTP'), 'Error should mention HTTP/HTTPS');
});

test('Reject ftp:// protocol', () => {
    const result = fetcher.validateExternalUrl('ftp://example.com/file.mp3');
    assertFalse(result.valid, 'Should reject ftp:// protocol');
});

test('Reject javascript: protocol', () => {
    const result = fetcher.validateExternalUrl('javascript:alert(1)');
    assertFalse(result.valid, 'Should reject javascript: protocol');
});

test('Reject data: protocol', () => {
    const result = fetcher.validateExternalUrl('data:text/html,<script>alert(1)</script>');
    assertFalse(result.valid, 'Should reject data: protocol');
});

test('Reject malformed URL', () => {
    const result = fetcher.validateExternalUrl('not a url');
    assertFalse(result.valid, 'Should reject malformed URL');
    assertTrue(result.error.includes('Malformed'), 'Error should mention malformed URL');
});

test('Reject null URL', () => {
    const result = fetcher.validateExternalUrl(null);
    assertFalse(result.valid, 'Should reject null URL');
});

test('Reject empty URL', () => {
    const result = fetcher.validateExternalUrl('');
    assertFalse(result.valid, 'Should reject empty URL');
});

test('HTTP protocol allowed', () => {
    const result = fetcher.validateExternalUrl('http://www.myinstants.com/test.mp3');
    assertTrue(result.valid, 'Should accept HTTP (not just HTTPS)');
});

test('URL normalization', () => {
    const result = fetcher.validateExternalUrl('https://www.myinstants.com/test.mp3?param=value');
    assertTrue(result.valid, 'Should accept URL with query params');
    assertTrue(result.url.includes('?param=value'), 'Should preserve query params');
});

// ========== Dynamic Whitelist Tests ==========

console.log('\n➕ Dynamic Whitelist Tests:\n');

test('Add new allowed host', () => {
    const initialCount = fetcher.getAllowedHosts().length;
    fetcher.addAllowedHost('example.com');
    const newCount = fetcher.getAllowedHosts().length;
    assertEquals(newCount, initialCount + 1, 'Should add new host');
});

test('Newly added host is allowed', () => {
    fetcher.addAllowedHost('test-domain.com');
    const result = fetcher.validateExternalUrl('https://test-domain.com/audio.mp3');
    assertTrue(result.valid, 'Should accept newly whitelisted host');
});

test('Get allowed hosts list', () => {
    const hosts = fetcher.getAllowedHosts();
    assertTrue(Array.isArray(hosts), 'Should return array');
    assertTrue(hosts.length > 0, 'Should have at least default hosts');
    assertTrue(hosts.includes('myinstants.com'), 'Should include myinstants.com');
    assertTrue(hosts.includes('openshock.com'), 'Should include openshock.com');
});

test('Duplicate hosts not added', () => {
    const initialCount = fetcher.getAllowedHosts().length;
    fetcher.addAllowedHost('myinstants.com'); // Already exists
    const newCount = fetcher.getAllowedHosts().length;
    assertEquals(newCount, initialCount, 'Should not add duplicate');
});

// ========== Results ==========

console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results:`);
console.log(`   Total: ${tests}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    console.log('\n⚠️  Some tests failed!');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}

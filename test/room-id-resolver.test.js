/**
 * Test for Enhanced Room ID Resolver
 * 
 * This test validates the new Room ID resolution system with:
 * - Multiple fallback methods
 * - Retry logic with exponential backoff
 * - Caching mechanism
 * - Full browser simulation
 */

const assert = require('assert');
const RoomIdResolver = require('../modules/room-id-resolver');

// Mock database
class MockDB {
    constructor() {
        this.settings = {};
    }
    
    getSetting(key) {
        return this.settings[key] || null;
    }
    
    setSetting(key, value) {
        this.settings[key] = value;
    }
}

// Mock diagnostics
class MockDiagnostics {
    constructor() {
        this.attempts = [];
    }
    
    logConnectionAttempt(username, success, errorType, errorMessage) {
        this.attempts.push({ username, success, errorType, errorMessage });
    }
}

// Test suite
const tests = [
    {
        name: 'RoomIdResolver initializes correctly',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            assert.ok(resolver, 'Resolver should be created');
            assert.ok(resolver.roomIdCache, 'Cache should be initialized');
            assert.strictEqual(resolver.cacheExpiryMs, 5 * 60 * 1000, 'Cache expiry should be 5 minutes');
        }
    },
    {
        name: 'Browser headers include all required fields',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            const headers = resolver._getBrowserHeaders();
            
            assert.ok(headers['User-Agent'], 'Should have User-Agent');
            assert.ok(headers['Accept'], 'Should have Accept');
            assert.ok(headers['Accept-Language'], 'Should have Accept-Language');
            assert.ok(headers['Accept-Encoding'], 'Should have Accept-Encoding');
            assert.ok(headers['DNT'], 'Should have DNT');
            assert.ok(headers['Connection'], 'Should have Connection');
            assert.ok(headers['Sec-Fetch-Dest'], 'Should have Sec-Fetch-Dest');
            assert.ok(headers['Sec-Fetch-Mode'], 'Should have Sec-Fetch-Mode');
            assert.ok(headers['Sec-Fetch-Site'], 'Should have Sec-Fetch-Site');
            assert.ok(headers['Sec-Fetch-User'], 'Should have Sec-Fetch-User');
            assert.ok(headers['sec-ch-ua'], 'Should have sec-ch-ua');
            assert.ok(headers['sec-ch-ua-mobile'], 'Should have sec-ch-ua-mobile');
            assert.ok(headers['sec-ch-ua-platform'], 'Should have sec-ch-ua-platform');
        }
    },
    {
        name: 'Browser headers include referer when provided',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            const headers = resolver._getBrowserHeaders('https://www.tiktok.com');
            
            assert.strictEqual(headers['Referer'], 'https://www.tiktok.com', 'Should have Referer');
            assert.strictEqual(headers['Sec-Fetch-Site'], 'same-origin', 'Sec-Fetch-Site should change with referer');
        }
    },
    {
        name: 'Exponential backoff calculates correctly',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            // Disable jitter for predictable testing
            resolver.retryConfig.jitter = false;
            
            const delay0 = resolver._calculateRetryDelay(0);
            const delay1 = resolver._calculateRetryDelay(1);
            const delay2 = resolver._calculateRetryDelay(2);
            const delay3 = resolver._calculateRetryDelay(3);
            
            assert.strictEqual(delay0, 1000, 'First retry should be 1s');
            assert.strictEqual(delay1, 2000, 'Second retry should be 2s');
            assert.strictEqual(delay2, 4000, 'Third retry should be 4s');
            assert.strictEqual(delay3, 8000, 'Fourth retry should be 8s');
        }
    },
    {
        name: 'Exponential backoff respects max delay',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            // Disable jitter for predictable testing
            resolver.retryConfig.jitter = false;
            
            const delay10 = resolver._calculateRetryDelay(10);
            
            assert.ok(delay10 <= 30000, 'Delay should not exceed max delay of 30s');
        }
    },
    {
        name: 'Jitter adds randomness to delays',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            // Enable jitter
            resolver.retryConfig.jitter = true;
            
            const delays = [];
            for (let i = 0; i < 10; i++) {
                delays.push(resolver._calculateRetryDelay(1));
            }
            
            // Check that not all delays are identical (jitter is working)
            const uniqueDelays = new Set(delays);
            assert.ok(uniqueDelays.size > 1, 'Jitter should produce different delays');
            
            // All delays should be within range (1800-2200 for attempt 1 with 10% jitter)
            delays.forEach(delay => {
                assert.ok(delay >= 1800 && delay <= 2200, 'Delay should be within jitter range');
            });
        }
    },
    {
        name: 'Cache stores and retrieves Room IDs',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            resolver._cacheRoomId('testuser', '123456789');
            const cached = resolver._getCachedRoomId('testuser');
            
            assert.strictEqual(cached, '123456789', 'Should retrieve cached Room ID');
        }
    },
    {
        name: 'Cache expires after expiry time',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            // Set very short expiry for testing
            resolver.cacheExpiryMs = 100; // 100ms
            
            resolver._cacheRoomId('testuser', '123456789');
            
            // Wait for expiry
            return new Promise((resolve) => {
                setTimeout(() => {
                    const cached = resolver._getCachedRoomId('testuser');
                    assert.strictEqual(cached, null, 'Cached value should expire');
                    resolve();
                }, 150);
            });
        }
    },
    {
        name: 'Cache can be cleared for specific user',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            resolver._cacheRoomId('user1', '111');
            resolver._cacheRoomId('user2', '222');
            
            resolver.clearCache('user1');
            
            assert.strictEqual(resolver._getCachedRoomId('user1'), null, 'User1 cache should be cleared');
            assert.strictEqual(resolver._getCachedRoomId('user2'), '222', 'User2 cache should remain');
        }
    },
    {
        name: 'Cache can be cleared for all users',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            resolver._cacheRoomId('user1', '111');
            resolver._cacheRoomId('user2', '222');
            
            resolver.clearCache();
            
            assert.strictEqual(resolver._getCachedRoomId('user1'), null, 'User1 cache should be cleared');
            assert.strictEqual(resolver._getCachedRoomId('user2'), null, 'User2 cache should be cleared');
        }
    },
    {
        name: 'Cache stats are accurate',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            resolver._cacheRoomId('user1', '111');
            resolver._cacheRoomId('user2', '222');
            
            const stats = resolver.getCacheStats();
            
            assert.strictEqual(stats.size, 2, 'Should report correct cache size');
            assert.strictEqual(stats.maxAge, 300, 'Should report correct max age (5 minutes = 300s)');
            assert.strictEqual(stats.entries.length, 2, 'Should report correct number of entries');
            
            // Check entries have required fields
            stats.entries.forEach(entry => {
                assert.ok(entry.username, 'Entry should have username');
                assert.ok(entry.roomId, 'Entry should have roomId');
                assert.ok(typeof entry.age === 'number', 'Entry should have age');
                assert.ok(typeof entry.expiresIn === 'number', 'Entry should have expiresIn');
            });
        }
    },
    {
        name: 'Timeout configuration is correct',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            assert.strictEqual(resolver.timeoutConfig.html, 15000, 'HTML timeout should be 15s');
            assert.strictEqual(resolver.timeoutConfig.api, 10000, 'API timeout should be 10s');
            assert.strictEqual(resolver.timeoutConfig.euler, 12000, 'Euler timeout should be 12s');
        }
    },
    {
        name: 'Retry configuration is correct',
        fn: () => {
            const db = new MockDB();
            const diagnostics = new MockDiagnostics();
            const resolver = new RoomIdResolver(db, diagnostics);
            
            assert.strictEqual(resolver.retryConfig.maxRetries, 5, 'Max retries should be 5');
            assert.strictEqual(resolver.retryConfig.initialDelay, 1000, 'Initial delay should be 1s');
            assert.strictEqual(resolver.retryConfig.maxDelay, 30000, 'Max delay should be 30s');
            assert.strictEqual(resolver.retryConfig.backoffMultiplier, 2, 'Backoff multiplier should be 2');
            assert.strictEqual(resolver.retryConfig.jitter, true, 'Jitter should be enabled');
        }
    }
];

// Run tests
async function runTests() {
    console.log('🧪 Running Enhanced Room ID Resolver Tests...\n');
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            await test.fn();
            console.log(`✅ ${test.name}`);
            passed++;
        } catch (error) {
            console.error(`❌ ${test.name}`);
            console.error(`   Error: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack.split('\n')[1]}`);
            }
            failed++;
        }
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Fatal error running tests:', error);
        process.exit(1);
    });
}

module.exports = { runTests, tests };

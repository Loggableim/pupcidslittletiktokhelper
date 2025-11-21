/**
 * Test script to verify coin calculation fixes
 * 
 * This test simulates TikTok gift events with various configurations
 * to ensure coins are calculated correctly across all modules.
 */

const EventEmitter = require('events');

// Mock database
class MockDatabase {
    constructor() {
        this.settings = {};
        this.events = [];
    }
    
    getSetting(key) {
        return this.settings[key];
    }
    
    setSetting(key, value) {
        this.settings[key] = value;
    }
    
    logEvent(type, username, data) {
        this.events.push({ type, username, data, timestamp: Date.now() });
    }
    
    getGift(giftId) {
        const catalog = {
            5655: { id: 5655, name: 'Rose', diamond_count: 1 },
            5655: { id: 5827, name: 'TikTok', diamond_count: 1 },
            6064: { id: 6064, name: 'Heart Me', diamond_count: 10 },
            5509: { id: 5509, name: 'Perfume', diamond_count: 20 },
        };
        return catalog[giftId];
    }
}

// Mock Socket.IO
class MockSocketIO extends EventEmitter {
    to(room) {
        return this;
    }
}

// Test cases
const testCases = [
    {
        name: 'Rose x1 (Non-streakable)',
        input: {
            gift: { id: 5655, name: 'Rose', diamond_count: 1 },
            repeatCount: 1,
            repeatEnd: true,
            giftType: 0,
            user: { uniqueId: 'testuser1', nickname: 'Test User 1' }
        },
        expected: {
            diamondCount: 1,
            repeatCount: 1,
            coins: 1 // 1 diamond * 1 repeat
        }
    },
    {
        name: 'Rose x10 (Streakable, not ended)',
        input: {
            gift: { id: 5655, name: 'Rose', diamond_count: 1 },
            repeatCount: 10,
            repeatEnd: false,
            giftType: 1,
            user: { uniqueId: 'testuser2', nickname: 'Test User 2' }
        },
        expected: {
            diamondCount: 1,
            repeatCount: 10,
            coins: 10, // 1 diamond * 10 repeat
            shouldCount: false // Streak not ended
        }
    },
    {
        name: 'Rose x10 (Streakable, ended)',
        input: {
            gift: { id: 5655, name: 'Rose', diamond_count: 1 },
            repeatCount: 10,
            repeatEnd: true,
            giftType: 1,
            user: { uniqueId: 'testuser3', nickname: 'Test User 3' }
        },
        expected: {
            diamondCount: 1,
            repeatCount: 10,
            coins: 10, // 1 diamond * 10 repeat
            shouldCount: true
        }
    },
    {
        name: 'Heart Me x5',
        input: {
            gift: { id: 6064, name: 'Heart Me', diamond_count: 10 },
            repeatCount: 5,
            repeatEnd: true,
            giftType: 0,
            user: { uniqueId: 'testuser4', nickname: 'Test User 4' }
        },
        expected: {
            diamondCount: 10,
            repeatCount: 5,
            coins: 50 // 10 diamonds * 5 repeat
        }
    },
    {
        name: 'Perfume x3',
        input: {
            gift: { id: 5509, name: 'Perfume', diamond_count: 20 },
            repeatCount: 3,
            repeatEnd: true,
            giftType: 0,
            user: { uniqueId: 'testuser5', nickname: 'Test User 5' }
        },
        expected: {
            diamondCount: 20,
            repeatCount: 3,
            coins: 60 // 20 diamonds * 3 repeat
        }
    }
];

// Import TikTok connector
const TikTokConnector = require('./modules/tiktok');

async function runTests() {
    console.log('🧪 Starting Coin Calculation Tests\n');
    console.log('='.repeat(80));
    
    let passedTests = 0;
    let failedTests = 0;
    
    for (const testCase of testCases) {
        console.log(`\n📋 Test: ${testCase.name}`);
        console.log('-'.repeat(80));
        
        // Create mock instances
        const mockDb = new MockDatabase();
        const mockIo = new MockSocketIO();
        const connector = new TikTokConnector(mockIo, mockDb);
        
        // Extract gift data
        const giftData = connector.extractGiftData(testCase.input);
        
        // Calculate coins
        const repeatCount = giftData.repeatCount;
        const diamondCount = giftData.diamondCount;
        const coins = diamondCount > 0 ? diamondCount * repeatCount : 0;
        
        // Check if gift should be counted
        const isStreakable = giftData.giftType === 1;
        const isStreakEnd = giftData.repeatEnd;
        const shouldCount = !isStreakable || (isStreakable && isStreakEnd);
        
        console.log(`   Input:     diamondCount=${diamondCount}, repeatCount=${repeatCount}, giftType=${giftData.giftType}, repeatEnd=${giftData.repeatEnd}`);
        console.log(`   Calculated: coins=${coins}, shouldCount=${shouldCount}`);
        console.log(`   Expected:   coins=${testCase.expected.coins}, shouldCount=${testCase.expected.shouldCount !== false}`);
        
        // Verify results
        let testPassed = true;
        
        if (diamondCount !== testCase.expected.diamondCount) {
            console.log(`   ❌ FAIL: diamondCount mismatch (got ${diamondCount}, expected ${testCase.expected.diamondCount})`);
            testPassed = false;
        }
        
        if (repeatCount !== testCase.expected.repeatCount) {
            console.log(`   ❌ FAIL: repeatCount mismatch (got ${repeatCount}, expected ${testCase.expected.repeatCount})`);
            testPassed = false;
        }
        
        if (coins !== testCase.expected.coins) {
            console.log(`   ❌ FAIL: coins mismatch (got ${coins}, expected ${testCase.expected.coins})`);
            testPassed = false;
        }
        
        if (testCase.expected.shouldCount !== undefined && shouldCount !== testCase.expected.shouldCount) {
            console.log(`   ❌ FAIL: shouldCount mismatch (got ${shouldCount}, expected ${testCase.expected.shouldCount})`);
            testPassed = false;
        }
        
        if (testPassed) {
            console.log(`   ✅ PASS`);
            passedTests++;
        } else {
            failedTests++;
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Test Results:`);
    console.log(`   ✅ Passed: ${passedTests}/${testCases.length}`);
    console.log(`   ❌ Failed: ${failedTests}/${testCases.length}`);
    
    if (failedTests === 0) {
        console.log(`\n🎉 All tests passed!`);
        process.exit(0);
    } else {
        console.log(`\n⚠️  Some tests failed!`);
        process.exit(1);
    }
}

// Run tests
runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});

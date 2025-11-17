/**
 * Test script to verify stream time extraction works correctly
 * Tests different scenarios for stream start time detection
 */

const TikTokConnector = require('./modules/tiktok');

// Mock database
const mockDb = {
    getSetting: (key) => {
        const settings = {
            'tiktok_http_timeout': '20000',
            'tiktok_connection_timeout': '60000',
            'tiktok_enable_euler_fallbacks': 'false',
            'tiktok_connect_with_unique_id': 'false'
        };
        return settings[key];
    },
    setSetting: () => {},
    logEvent: () => {},
    getGift: () => null,
    getGiftCatalog: () => []
};

// Mock Socket.IO
const mockIo = {
    emit: (event, data) => {
        console.log(`📡 [MOCK IO] ${event}:`, JSON.stringify(data, null, 2));
    }
};

console.log('=== Testing Stream Time Extraction ===\n');

// Create connector
const connector = new TikTokConnector(mockIo, mockDb);

// Test 1: roomInfo with start_time field
console.log('Test 1: roomInfo with start_time (seconds)');
const now = Date.now();
const fiveMinutesAgo = Math.floor((now - 5 * 60 * 1000) / 1000); // 5 minutes ago in seconds
const roomInfo1 = { start_time: fiveMinutesAgo };
const result1 = connector._extractStreamStartTime(roomInfo1);
console.log(`Result: ${new Date(result1).toISOString()}`);
console.log(`Expected: ~5 minutes ago`);
console.log(`✅ Test 1 ${Math.abs(result1 - fiveMinutesAgo * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

// Test 2: roomInfo with createTime (milliseconds)
console.log('Test 2: roomInfo with createTime (milliseconds)');
const tenMinutesAgo = now - 10 * 60 * 1000; // 10 minutes ago in ms
const roomInfo2 = { createTime: tenMinutesAgo };
const result2 = connector._extractStreamStartTime(roomInfo2);
console.log(`Result: ${new Date(result2).toISOString()}`);
console.log(`Expected: ~10 minutes ago`);
console.log(`✅ Test 2 ${result2 === tenMinutesAgo ? 'PASSED' : 'FAILED'}\n`);

// Test 3: roomInfo with string timestamp
console.log('Test 3: roomInfo with string timestamp');
const fifteenMinutesAgo = Math.floor((now - 15 * 60 * 1000) / 1000);
const roomInfo3 = { startTime: fifteenMinutesAgo.toString() };
const result3 = connector._extractStreamStartTime(roomInfo3);
console.log(`Result: ${new Date(result3).toISOString()}`);
console.log(`Expected: ~15 minutes ago`);
console.log(`✅ Test 3 ${Math.abs(result3 - fifteenMinutesAgo * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

// Test 4: Empty roomInfo (should use current time as fallback)
console.log('Test 4: Empty roomInfo (fallback)');
const roomInfo4 = {};
const before = Date.now();
const result4 = connector._extractStreamStartTime(roomInfo4);
const after = Date.now();
console.log(`Result: ${new Date(result4).toISOString()}`);
console.log(`Expected: Current time (within last second)`);
console.log(`✅ Test 4 ${result4 >= before && result4 <= after ? 'PASSED' : 'FAILED'}\n`);

// Test 5: Invalid/future timestamp (should fallback)
console.log('Test 5: Invalid future timestamp');
const futureTime = Math.floor((now + 24 * 60 * 60 * 1000) / 1000);
const roomInfo5 = { start_time: futureTime };
const result5 = connector._extractStreamStartTime(roomInfo5);
console.log(`Result: ${new Date(result5).toISOString()}`);
console.log(`Expected: Current time (rejects future timestamp)`);
const now2 = Date.now();
console.log(`✅ Test 5 ${result5 >= now - 1000 && result5 <= now2 + 1000 ? 'PASSED' : 'FAILED'}\n`);

// Test 6: Earliest event time tracking
console.log('Test 6: Earliest event time tracking');
connector._earliestEventTime = now - 3 * 60 * 1000; // 3 minutes ago
const roomInfo6 = {}; // No time fields
const result6 = connector._extractStreamStartTime(roomInfo6);
console.log(`Result: ${new Date(result6).toISOString()}`);
console.log(`Expected: ~3 minutes ago (from earliest event)`);
console.log(`✅ Test 6 ${result6 === connector._earliestEventTime ? 'PASSED' : 'FAILED'}\n`);

// Test 7: Priority - prefer start_time over createTime
console.log('Test 7: Field priority (start_time > createTime)');
const roomInfo7 = {
    createTime: Math.floor((now - 20 * 60 * 1000) / 1000), // 20 minutes ago
    start_time: Math.floor((now - 10 * 60 * 1000) / 1000)  // 10 minutes ago
};
const result7 = connector._extractStreamStartTime(roomInfo7);
console.log(`Result: ${new Date(result7).toISOString()}`);
console.log(`Expected: ~10 minutes ago (start_time, not createTime)`);
console.log(`✅ Test 7 ${Math.abs(result7 - roomInfo7.start_time * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

console.log('=== All Tests Complete ===');
process.exit(0);

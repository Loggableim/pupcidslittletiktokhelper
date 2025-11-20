/**
 * Enhanced test script for stream time extraction
 * Tests new scenarios: nested room object, duration field, and additional field names
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

console.log('=== Testing Enhanced Stream Time Extraction ===\n');

// Create connector
const connector = new TikTokConnector(mockIo, mockDb);

const now = Date.now();

// Test 8: Nested room.start_time
console.log('Test 8: Nested room.start_time');
const roomInfo8 = {
    id: '12345',
    room: {
        start_time: Math.floor((now - 8 * 60 * 1000) / 1000), // 8 minutes ago
        title: 'Test Stream'
    }
};
const result8 = connector._extractStreamStartTime(roomInfo8);
console.log(`Result: ${new Date(result8).toISOString()}`);
console.log(`Expected: ~8 minutes ago`);
console.log(`✅ Test 8 ${Math.abs(result8 - roomInfo8.room.start_time * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

// Test 9: Nested room.createTime
console.log('Test 9: Nested room.createTime');
const roomInfo9 = {
    id: '12345',
    room: {
        createTime: now - 12 * 60 * 1000 // 12 minutes ago
    }
};
const result9 = connector._extractStreamStartTime(roomInfo9);
console.log(`Result: ${new Date(result9).toISOString()}`);
console.log(`Expected: ~12 minutes ago`);
console.log(`✅ Test 9 ${result9 === roomInfo9.room.createTime ? 'PASSED' : 'FAILED'}\n`);

// Test 10: Duration field (seconds since stream started)
console.log('Test 10: Duration field (calculate from duration)');
const roomInfo10 = {
    id: '12345',
    duration: 600 // 10 minutes in seconds
};
const result10 = connector._extractStreamStartTime(roomInfo10);
const expectedTime = now - 600000; // 10 minutes ago
console.log(`Result: ${new Date(result10).toISOString()}`);
console.log(`Expected: ~10 minutes ago`);
console.log(`Difference: ${Math.abs(result10 - expectedTime)}ms`);
console.log(`✅ Test 10 ${Math.abs(result10 - expectedTime) < 2000 ? 'PASSED' : 'FAILED'}\n`);

// Test 11: Duration as string
console.log('Test 11: Duration as string');
const roomInfo11 = {
    id: '12345',
    duration: '900' // 15 minutes as string
};
const result11 = connector._extractStreamStartTime(roomInfo11);
const expectedTime11 = now - 900000; // 15 minutes ago
console.log(`Result: ${new Date(result11).toISOString()}`);
console.log(`Expected: ~15 minutes ago`);
console.log(`✅ Test 11 ${Math.abs(result11 - expectedTime11) < 2000 ? 'PASSED' : 'FAILED'}\n`);

// Test 12: create_time (underscore version)
console.log('Test 12: create_time field');
const roomInfo12 = {
    create_time: Math.floor((now - 7 * 60 * 1000) / 1000) // 7 minutes ago
};
const result12 = connector._extractStreamStartTime(roomInfo12);
console.log(`Result: ${new Date(result12).toISOString()}`);
console.log(`Expected: ~7 minutes ago`);
console.log(`✅ Test 12 ${Math.abs(result12 - roomInfo12.create_time * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

// Test 13: streamStartTime (explicit field)
console.log('Test 13: streamStartTime field');
const roomInfo13 = {
    streamStartTime: now - 20 * 60 * 1000 // 20 minutes ago
};
const result13 = connector._extractStreamStartTime(roomInfo13);
console.log(`Result: ${new Date(result13).toISOString()}`);
console.log(`Expected: ~20 minutes ago`);
console.log(`✅ Test 13 ${result13 === roomInfo13.streamStartTime ? 'PASSED' : 'FAILED'}\n`);

// Test 14: stream_start_time (underscore version)
console.log('Test 14: stream_start_time field');
const roomInfo14 = {
    stream_start_time: Math.floor((now - 18 * 60 * 1000) / 1000) // 18 minutes ago
};
const result14 = connector._extractStreamStartTime(roomInfo14);
console.log(`Result: ${new Date(result14).toISOString()}`);
console.log(`Expected: ~18 minutes ago`);
console.log(`✅ Test 14 ${Math.abs(result14 - roomInfo14.stream_start_time * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

// Test 15: Priority - start_time over duration
console.log('Test 15: Priority - start_time over duration');
const roomInfo15 = {
    start_time: Math.floor((now - 10 * 60 * 1000) / 1000), // 10 minutes ago
    duration: 600 // 10 minutes (should be ignored)
};
const result15 = connector._extractStreamStartTime(roomInfo15);
console.log(`Result: ${new Date(result15).toISOString()}`);
console.log(`Expected: ~10 minutes ago (from start_time, not duration)`);
console.log(`✅ Test 15 ${Math.abs(result15 - roomInfo15.start_time * 1000) < 1000 ? 'PASSED' : 'FAILED'}\n`);

console.log('=== All Enhanced Tests Complete ===');
process.exit(0);

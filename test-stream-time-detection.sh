#!/bin/bash
# Quick test to verify the stream time detection improvements

echo "==================================="
echo "Stream Time Detection - Quick Test"
echo "==================================="
echo ""

# Run the unit tests
echo "1. Running unit tests..."
echo "-----------------------------------"
node test-stream-time-fix.js

echo ""
echo "==================================="
echo "2. Testing console output format..."
echo "-----------------------------------"

# Create a test script that shows what the console output will look like
cat > /tmp/test-detection.js << 'EOF'
const TikTokConnector = require('./modules/tiktok');

// Mock database
const mockDb = {
    getSetting: () => null,
    setSetting: () => {},
    logEvent: () => {},
    getGift: () => null,
    getGiftCatalog: () => []
};

// Mock Socket.IO
const mockIo = {
    emit: (event, data) => {
        if (event === 'tiktok:streamTimeInfo') {
            console.log('📡 [FRONTEND] Stream Time Info:');
            console.log(`   Stream Start: ${data.streamStartISO}`);
            console.log(`   Duration: ${data.currentDuration}s`);
            console.log(`   Method: ${data.detectionMethod}`);
        }
    }
};

console.log('\n=== Simulating Connection with Different RoomInfo Structures ===\n');

const connector = new TikTokConnector(mockIo, mockDb);

// Test 1: Modern API format (most likely)
console.log('Test A: Modern API (start_time field)');
const now = Date.now();
const roomInfo1 = { 
    start_time: Math.floor((now - 600000) / 1000), // 10 minutes ago
    id: '12345',
    title: 'Test Stream'
};
connector._extractStreamStartTime(roomInfo1);
console.log('');

// Test 2: Nested in room object
console.log('Test B: Nested format (room.start_time)');
const roomInfo2 = {
    room: {
        start_time: Math.floor((now - 900000) / 1000), // 15 minutes ago
        id: '12345'
    }
};
connector._extractStreamStartTime(roomInfo2);
console.log('');

// Test 3: Duration-based
console.log('Test C: Duration-based calculation');
const roomInfo3 = {
    duration: 1200, // 20 minutes
    id: '12345'
};
connector._extractStreamStartTime(roomInfo3);
console.log('');

// Test 4: No time info (will use fallback)
console.log('Test D: No time info (fallback)');
const roomInfo4 = {
    id: '12345',
    title: 'Test Stream',
    owner: {}
};
connector._extractStreamStartTime(roomInfo4);
console.log('');

EOF

node /tmp/test-detection.js
rm /tmp/test-detection.js

echo ""
echo "==================================="
echo "3. Next Steps for Real Testing"
echo "==================================="
echo ""
echo "To test with a real TikTok stream:"
echo "1. Start the server: npm start"
echo "2. Open dashboard: http://localhost:3000"
echo "3. Connect to a LIVE TikTok user"
echo "4. Check the debug panel (blue box below connection)"
echo "5. Look for:"
echo "   - Detection Method (should be green or orange)"
echo "   - Stream Start Time (should match when stream started)"
echo "   - Duration should increase every second"
echo ""
echo "If Detection Method shows red 'Connection Time':"
echo "1. Check console logs for available roomInfo keys"
echo "2. Enable debug dump: Run in browser console:"
echo "   fetch('/api/settings', {"
echo "     method: 'POST',"
echo "     headers: { 'Content-Type': 'application/json' },"
echo "     body: JSON.stringify({ key: 'tiktok_debug_roominfo', value: 'true' })"
echo "   })"
echo "3. Reconnect and check data/debug/ folder"
echo "4. Share the roomInfo JSON for analysis"
echo ""
echo "==================================="

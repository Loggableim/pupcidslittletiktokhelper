/**
 * Test EulerStream WebSocket Connection
 * This test verifies the connection and authentication
 */

const { WebcastEventEmitter, createWebSocketUrl, ClientCloseCode } = require('@eulerstream/euler-websocket-sdk');
const WebSocket = require('ws');

// Test with environment variable or hardcoded test key
const API_KEY = process.env.EULER_API_KEY || process.env.SIGN_API_KEY;
const USERNAME = process.argv[2] || 'tiktok'; // Default to a common username

if (!API_KEY) {
    console.error('❌ No API key found. Set EULER_API_KEY or SIGN_API_KEY environment variable.');
    process.exit(1);
}

console.log('='.repeat(60));
console.log('EulerStream WebSocket Connection Test');
console.log('='.repeat(60));
console.log(`Username: @${USERNAME}`);
console.log(`API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`);
console.log('');

// Create WebSocket URL with basic configuration
console.log('Creating WebSocket URL...');
const wsUrl = createWebSocketUrl({
    uniqueId: USERNAME,
    apiKey: API_KEY
    // Note: useEnterpriseApi requires Enterprise plan upgrade
    // features: {
    //     useEnterpriseApi: true
    // }
});

console.log(`WebSocket URL created`);
console.log(`  Base: wss://ws.eulerstream.com`);
console.log(`  uniqueId: ${USERNAME}`);
console.log(`  apiKey: ${API_KEY.substring(0, 8)}...`);
console.log('');

// Create WebSocket connection
console.log('Connecting to WebSocket...');
const ws = new WebSocket(wsUrl);

let connected = false;
let messagesReceived = 0;

ws.on('open', () => {
    connected = true;
    console.log('✅ WebSocket connected successfully!');
    console.log('');
    console.log('Waiting for events (30 seconds)...');
});

ws.on('close', (code, reason) => {
    const reasonText = Buffer.isBuffer(reason) ? reason.toString('utf-8') : (reason || '');
    console.log('');
    console.log('='.repeat(60));
    console.log(`🔴 WebSocket closed`);
    console.log(`  Code: ${code}`);
    console.log(`  Name: ${ClientCloseCode[code] || 'UNKNOWN'}`);
    console.log(`  Reason: ${reasonText}`);
    console.log(`  Messages Received: ${messagesReceived}`);
    console.log('='.repeat(60));
    
    // Analyze the close code
    if (code === 4401) {
        console.log('\n❌ INVALID_AUTH - Your API key is invalid or expired');
        console.log('   Please check your Eulerstream API key at https://www.eulerstream.com');
    } else if (code === 4400) {
        console.log('\n❌ INVALID_OPTIONS - The connection parameters are incorrect');
        console.log('   Check that the username is valid');
    } else if (code === 4404) {
        console.log('\n⚠️  NOT_LIVE - The user is not currently streaming');
        console.log(`   Make sure @${USERNAME} is live on TikTok`);
    } else if (code === 1000) {
        console.log('\n✅ Normal closure');
    }
    
    process.exit(code === 1000 ? 0 : 1);
});

ws.on('error', (err) => {
    console.log('❌ WebSocket error:', err.message);
});

ws.on('message', (data) => {
    messagesReceived++;
    if (messagesReceived === 1) {
        console.log('📨 Receiving messages...');
    }
});

// Create event emitter
const eventEmitter = new WebcastEventEmitter(ws);

eventEmitter.on('chat', (data) => {
    const user = data.user || {};
    const username = user.uniqueId || user.username || 'Unknown';
    const message = data.comment || data.message || '';
    console.log(`💬 [CHAT] ${username}: ${message}`);
});

eventEmitter.on('gift', (data) => {
    const user = data.user || {};
    const gift = data.gift || {};
    const username = user.uniqueId || user.username || 'Unknown';
    const giftName = gift.name || gift.giftName || 'Unknown';
    console.log(`🎁 [GIFT] ${username} sent ${giftName}`);
});

eventEmitter.on('like', (data) => {
    console.log(`💗 [LIKE] +${data.likeCount || 1} likes`);
});

eventEmitter.on('roomUser', (data) => {
    console.log(`👥 [VIEWERS] ${data.viewerCount || 0} viewers`);
});

eventEmitter.on('social', (data) => {
    const user = data.user || {};
    const username = user.uniqueId || user.username || 'Unknown';
    if (data.displayType === 'pm_main_follow_message_viewer_2' || data.action === 1) {
        console.log(`👤 [FOLLOW] ${username} followed`);
    }
});

eventEmitter.on('share', (data) => {
    const user = data.user || {};
    const username = user.uniqueId || user.username || 'Unknown';
    console.log(`🔗 [SHARE] ${username} shared`);
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('');
    console.log('⏱️  Test completed (30 seconds)');
    ws.close();
}, 30000);

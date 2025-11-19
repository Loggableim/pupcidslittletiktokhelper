const { WebcastEventEmitter, createWebSocketUrl } = require('@eulerstream/euler-websocket-sdk');
const WebSocket = require('ws');

// Test connection to a known live user
const username = 'pupcid'; // or another username you know is live
const apiKey = process.env.EULER_API_KEY || process.env.SIGN_API_KEY;

if (!apiKey) {
    console.error('❌ No API key found. Set EULER_API_KEY or SIGN_API_KEY environment variable.');
    process.exit(1);
}

console.log(`Testing Eulerstream connection to @${username}...`);

// Create WebSocket URL with Enterprise API enabled (recommended)
const wsUrl = createWebSocketUrl({
    uniqueId: username,
    apiKey: apiKey,
    features: {
        useEnterpriseApi: true  // Use Enterprise API infrastructure for better reliability
    }
});

console.log('Connecting to Eulerstream WebSocket...');

// Create WebSocket connection
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
});

ws.on('close', (code, reason) => {
    console.log(`WebSocket closed: ${code} - ${reason}`);
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
});

// Create event emitter
const eventEmitter = new WebcastEventEmitter(ws);

eventEmitter.on('chat', (data) => {
    console.log('💬 Chat:', data.user?.uniqueId || 'unknown', '-', data.comment);
});

eventEmitter.on('gift', (data) => {
    console.log('🎁 Gift:', data.user?.uniqueId || 'unknown', '-', data.gift?.name || 'unknown gift');
});

eventEmitter.on('member', (data) => {
    console.log('👋 Member joined:', data.user?.uniqueId || 'unknown');
});

// Disconnect after 30 seconds
setTimeout(() => {
    console.log('Test complete, disconnecting...');
    ws.close();
}, 30000);


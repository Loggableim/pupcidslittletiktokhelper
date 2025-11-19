/**
 * Test Eulerstream WebSocket Connection
 * This test helps diagnose the authentication issue
 */

const { WebcastEventEmitter, createWebSocketUrl, ClientCloseCode } = require('@eulerstream/euler-websocket-sdk');
const WebSocket = require('ws');

const API_KEY = '69247cb1f28bac46e315f650c64507e828acb4f61718b2bf5526c5fbbdebb7a8';
const USERNAME = 'xxmegsxx'; // Live user

console.log('='.repeat(60));
console.log('Testing Eulerstream WebSocket Connection');
console.log('='.repeat(60));
console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
console.log(`Username: ${USERNAME}`);
console.log('');

// Test 1: Check what URL is generated
console.log('Test 1: Generate WebSocket URL');
const wsUrl = createWebSocketUrl({
    uniqueId: USERNAME,
    apiKey: API_KEY,
    features: {
        useEnterpriseApi: true  // Use Enterprise API infrastructure (recommended)
    }
});
console.log(`Generated URL: ${wsUrl}`);
console.log('');

// Test 2: Try to connect
console.log('Test 2: Connect to WebSocket');
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
});

ws.on('close', (code, reason) => {
    console.log(`❌ WebSocket closed: ${code} - ${ClientCloseCode[code] || reason}`);
    console.log(`Close code: ${code}`);
    console.log(`Reason: ${reason.toString()}`);
    
    // Decode the reason if it's a Buffer
    if (Buffer.isBuffer(reason)) {
        console.log(`Reason (decoded): ${reason.toString('utf-8')}`);
    }
    
    process.exit(code === 1000 ? 0 : 1);
});

ws.on('error', (err) => {
    console.log('❌ WebSocket error:', err.message);
});

ws.on('message', (data) => {
    console.log('📨 Received message:', data.toString().substring(0, 200));
});

// Test 3: Create event emitter
const eventEmitter = new WebcastEventEmitter(ws);

eventEmitter.on('chat', (data) => {
    console.log('💬 Chat event:', data);
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('\n⏱️  Test timeout (30s) - closing connection');
    ws.close();
}, 30000);

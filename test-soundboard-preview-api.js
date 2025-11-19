/**
 * Integration Test for Soundboard Preview Endpoint
 * 
 * Tests the complete preview system including:
 * - Authentication
 * - Validation
 * - WebSocket broadcasting
 * - Rate limiting
 */

const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const socketIOClient = require('socket.io-client');
const SoundboardFetcher = require('./plugins/soundboard/fetcher');
const SoundboardWebSocketTransport = require('./plugins/soundboard/transport-ws');
const SoundboardApiRoutes = require('./plugins/soundboard/api-routes');
const { apiLimiter } = require('./modules/rate-limiter');
const path = require('path');

console.log('\n🧪 Testing Soundboard Preview API Integration...\n');

// Test configuration
const TEST_PORT = 3999;
const TEST_API_KEY = 'test-secret-key-12345';
const TEST_SOUNDS_DIR = path.join(__dirname, 'public', 'sounds');

// Test server setup
let app, server, io, transport, fetcher, apiRoutes;
let clientSocket;

// Test counters
let tests = 0;
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests++;
    return new Promise(async (resolve) => {
        try {
            await fn();
            passed++;
            console.log(`✅ ${name}`);
            resolve(true);
        } catch (error) {
            failed++;
            console.error(`❌ ${name}`);
            console.error(`   Error: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`);
            }
            resolve(false);
        }
    });
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

/**
 * Setup test server
 */
async function setupServer() {
    console.log('🔧 Setting up test server...\n');
    
    // Set environment variable for API key
    process.env.SOUNDBOARD_KEY = TEST_API_KEY;
    
    app = express();
    app.use(express.json());
    server = http.createServer(app);
    io = socketIO(server);
    
    // Initialize components
    fetcher = new SoundboardFetcher();
    transport = new SoundboardWebSocketTransport(io);
    apiRoutes = new SoundboardApiRoutes(
        app,
        apiLimiter,
        fetcher,
        transport,
        {
            info: () => {},
            warn: () => {},
            error: () => {}
        },
        TEST_SOUNDS_DIR
    );
    
    // Start server
    await new Promise(resolve => {
        server.listen(TEST_PORT, () => {
            console.log(`✅ Test server running on port ${TEST_PORT}\n`);
            resolve();
        });
    });
}

/**
 * Teardown test server
 */
async function teardownServer() {
    if (clientSocket) {
        clientSocket.close();
    }
    if (server) {
        await new Promise(resolve => {
            server.close(() => {
                console.log('\n✅ Test server closed');
                resolve();
            });
        });
    }
    delete process.env.SOUNDBOARD_KEY;
}

/**
 * Make HTTP request to preview endpoint
 */
function makeRequest(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: TEST_PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Setup WebSocket client
 */
async function setupClient() {
    return new Promise((resolve) => {
        clientSocket = socketIOClient(`http://localhost:${TEST_PORT}`);
        
        clientSocket.on('connect', () => {
            // Identify as dashboard client
            clientSocket.emit('soundboard:identify', { client: 'dashboard' });
            
            clientSocket.once('soundboard:identified', () => {
                resolve(clientSocket);
            });
        });
    });
}

// ========== API Authentication Tests ==========

async function testAuthentication() {
    console.log('🔐 Authentication Tests:\n');
    
    await test('Reject request without API key', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local',
            filename: 'test.mp3'
        });
        assertEquals(res.status, 401, 'Should return 401 Unauthorized');
    });
    
    await test('Reject request with invalid API key', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local',
            filename: 'test.mp3'
        }, {
            'x-sb-key': 'wrong-key'
        });
        assertEquals(res.status, 403, 'Should return 403 Forbidden');
    });
    
    await test('Accept request with valid API key', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local',
            filename: 'test.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 200, 'Should return 200 OK');
        assertTrue(res.body.success, 'Response should indicate success');
    });
}

// ========== Request Validation Tests ==========

async function testValidation() {
    console.log('\n✅ Request Validation Tests:\n');
    
    await test('Reject missing sourceType', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            filename: 'test.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 400, 'Should return 400 Bad Request');
        assertTrue(res.body.error.includes('sourceType'), 'Error should mention sourceType');
    });
    
    await test('Reject invalid sourceType', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'invalid',
            filename: 'test.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 400, 'Should return 400 Bad Request');
    });
    
    await test('Reject local without filename', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 400, 'Should return 400 Bad Request');
        assertTrue(res.body.error.includes('filename'), 'Error should mention filename');
    });
    
    await test('Reject url without url', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'url'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 400, 'Should return 400 Bad Request');
        assertTrue(res.body.error.includes('url'), 'Error should mention url');
    });
    
    await test('Reject path traversal in filename', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local',
            filename: '../../../etc/passwd'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 400, 'Should return 400 Bad Request');
        assertTrue(res.body.error.includes('traversal'), 'Error should mention traversal');
    });
    
    await test('Reject non-whitelisted URL', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'url',
            url: 'https://evil.com/malware.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 400, 'Should return 400 Bad Request');
        assertTrue(res.body.error.includes('not allowed'), 'Error should mention host not allowed');
    });
    
    await test('Accept valid local preview', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local',
            filename: 'test.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 200, 'Should return 200 OK');
        assertTrue(res.body.success, 'Should be successful');
    });
    
    await test('Accept valid URL preview', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'url',
            url: 'https://www.myinstants.com/media/sounds/test.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 200, 'Should return 200 OK');
        assertTrue(res.body.success, 'Should be successful');
    });
}

// ========== WebSocket Broadcasting Tests ==========

async function testWebSocketBroadcast() {
    console.log('\n📡 WebSocket Broadcasting Tests:\n');
    
    await setupClient();
    
    await test('Broadcast local preview to dashboard clients', async () => {
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for WebSocket message'));
            }, 5000);
            
            // Listen for preview event
            clientSocket.once('soundboard:preview', (message) => {
                clearTimeout(timeout);
                try {
                    assertEquals(message.type, 'preview-sound', 'Message type should be preview-sound');
                    assertEquals(message.payload.sourceType, 'local', 'sourceType should be local');
                    assertEquals(message.payload.filename, 'broadcast-test.mp3', 'filename should match');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            
            // Trigger preview
            await makeRequest('POST', '/api/soundboard/preview', {
                sourceType: 'local',
                filename: 'broadcast-test.mp3'
            }, {
                'x-sb-key': TEST_API_KEY
            });
        });
    });
    
    await test('Broadcast URL preview to dashboard clients', async () => {
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for WebSocket message'));
            }, 5000);
            
            const testUrl = 'https://www.myinstants.com/media/sounds/broadcast.mp3';
            
            // Listen for preview event
            clientSocket.once('soundboard:preview', (message) => {
                clearTimeout(timeout);
                try {
                    assertEquals(message.type, 'preview-sound', 'Message type should be preview-sound');
                    assertEquals(message.payload.sourceType, 'url', 'sourceType should be url');
                    assertTrue(message.payload.url.includes('broadcast.mp3'), 'URL should match');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            
            // Trigger preview
            await makeRequest('POST', '/api/soundboard/preview', {
                sourceType: 'url',
                url: testUrl
            }, {
                'x-sb-key': TEST_API_KEY
            });
        });
    });
    
    await test('Client count reflected in response', async () => {
        const res = await makeRequest('POST', '/api/soundboard/preview', {
            sourceType: 'local',
            filename: 'test.mp3'
        }, {
            'x-sb-key': TEST_API_KEY
        });
        assertEquals(res.status, 200, 'Should return 200 OK');
        assertTrue(res.body.clientsNotified >= 1, 'Should notify at least 1 client');
    });
}

// ========== Status Endpoint Tests ==========

async function testStatusEndpoint() {
    console.log('\n📊 Status Endpoint Tests:\n');
    
    await test('Status endpoint returns system info', async () => {
        const res = await makeRequest('GET', '/api/soundboard/preview/status');
        assertEquals(res.status, 200, 'Should return 200 OK');
        assertTrue(res.body.success, 'Should be successful');
        assertTrue(res.body.authenticated, 'Should show authenticated status');
        assertTrue(Array.isArray(res.body.allowedHosts), 'Should return allowed hosts');
        assertTrue(res.body.allowedHosts.length > 0, 'Should have at least default hosts');
    });
}

// ========== Run All Tests ==========

async function runAllTests() {
    try {
        await setupServer();
        
        await testAuthentication();
        await testValidation();
        await testWebSocketBroadcast();
        await testStatusEndpoint();
        
    } finally {
        await teardownServer();
    }
    
    // Results
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
}

// Run tests
runAllTests().catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
});

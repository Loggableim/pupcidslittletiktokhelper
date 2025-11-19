/**
 * Weather Control Plugin - Basic Integration Tests
 * 
 * Tests the core functionality of the weather control plugin
 */

const assert = require('assert');
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_CONFIG = {
    enabled: true,
    rateLimitPerMinute: 10,
    permissions: {
        enabled: false, // Disable for testing
        allowAll: true
    }
};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const jsonBody = JSON.parse(body);
                    resolve({ status: res.statusCode, body: jsonBody });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// Test suite
async function runTests() {
    console.log('🌦️ Weather Control Plugin - Integration Tests\n');
    
    let passed = 0;
    let failed = 0;

    // Test 1: Get configuration
    try {
        console.log('Test 1: GET /api/weather/config');
        const response = await makeRequest('GET', '/api/weather/config');
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        assert.ok(response.body.config, 'Should have config object');
        assert.ok(response.body.config.effects, 'Should have effects configuration');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 2: Get supported effects
    try {
        console.log('Test 2: GET /api/weather/effects');
        const response = await makeRequest('GET', '/api/weather/effects');
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        assert.ok(Array.isArray(response.body.effects), 'Should have effects array');
        assert.ok(response.body.effects.includes('rain'), 'Should include rain effect');
        assert.ok(response.body.effects.includes('snow'), 'Should include snow effect');
        assert.ok(response.body.effects.includes('storm'), 'Should include storm effect');
        assert.ok(response.body.effects.includes('fog'), 'Should include fog effect');
        assert.ok(response.body.effects.includes('thunder'), 'Should include thunder effect');
        assert.ok(response.body.effects.includes('sunbeam'), 'Should include sunbeam effect');
        assert.ok(response.body.effects.includes('glitchclouds'), 'Should include glitchclouds effect');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 3: Update configuration
    try {
        console.log('Test 3: POST /api/weather/config');
        const response = await makeRequest('POST', '/api/weather/config', TEST_CONFIG);
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 4: Trigger rain effect
    try {
        console.log('Test 4: POST /api/weather/trigger (rain)');
        const response = await makeRequest('POST', '/api/weather/trigger', {
            action: 'rain',
            intensity: 0.5,
            duration: 5000,
            username: 'test-user'
        });
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        assert.ok(response.body.event, 'Should have event object');
        assert.strictEqual(response.body.event.action, 'rain', 'Should have correct action');
        assert.strictEqual(response.body.event.intensity, 0.5, 'Should have correct intensity');
        assert.strictEqual(response.body.event.duration, 5000, 'Should have correct duration');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 5: Trigger snow effect
    try {
        console.log('Test 5: POST /api/weather/trigger (snow)');
        const response = await makeRequest('POST', '/api/weather/trigger', {
            action: 'snow',
            intensity: 0.7,
            duration: 8000
        });
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        assert.strictEqual(response.body.event.action, 'snow', 'Should have correct action');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 6: Invalid action
    try {
        console.log('Test 6: POST /api/weather/trigger (invalid action)');
        const response = await makeRequest('POST', '/api/weather/trigger', {
            action: 'invalid-effect'
        });
        assert.strictEqual(response.status, 400, 'Should return 400 Bad Request');
        assert.strictEqual(response.body.success, false, 'Should have success: false');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 7: Rate limiting
    try {
        console.log('Test 7: Rate limiting (11 requests rapidly)');
        const requests = [];
        for (let i = 0; i < 11; i++) {
            requests.push(makeRequest('POST', '/api/weather/trigger', {
                action: 'rain',
                intensity: 0.3,
                duration: 1000,
                username: 'rate-limit-test'
            }));
        }
        
        const responses = await Promise.all(requests);
        const rateLimited = responses.filter(r => r.status === 429);
        assert.ok(rateLimited.length > 0, 'Should have at least one rate-limited response');
        console.log(`✅ PASSED (${rateLimited.length} requests rate-limited)\n`);
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 8: Intensity validation
    try {
        console.log('Test 8: Intensity validation (out of range)');
        const response = await makeRequest('POST', '/api/weather/trigger', {
            action: 'rain',
            intensity: 5.0, // Invalid, should be capped to 1.0
            duration: 5000
        });
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        assert.ok(response.body.event.intensity <= 1.0, 'Intensity should be capped at 1.0');
        assert.ok(response.body.event.intensity >= 0.0, 'Intensity should be at least 0.0');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 9: Duration validation
    try {
        console.log('Test 9: Duration validation (out of range)');
        const response = await makeRequest('POST', '/api/weather/trigger', {
            action: 'rain',
            intensity: 0.5,
            duration: 100000 // Invalid, should be capped to 60000
        });
        assert.strictEqual(response.status, 200, 'Should return 200 OK');
        assert.strictEqual(response.body.success, true, 'Should have success: true');
        assert.ok(response.body.event.duration <= 60000, 'Duration should be capped at 60000');
        assert.ok(response.body.event.duration >= 1000, 'Duration should be at least 1000');
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Test 10: All weather effects
    try {
        console.log('Test 10: Trigger all weather effects');
        const effects = ['rain', 'snow', 'storm', 'fog', 'thunder', 'sunbeam', 'glitchclouds'];
        
        for (const effect of effects) {
            const response = await makeRequest('POST', '/api/weather/trigger', {
                action: effect,
                intensity: 0.5,
                duration: 2000
            });
            assert.strictEqual(response.status, 200, `${effect} should return 200 OK`);
            assert.strictEqual(response.body.success, true, `${effect} should have success: true`);
            assert.strictEqual(response.body.event.action, effect, `Should have correct action for ${effect}`);
        }
        
        console.log('✅ PASSED\n');
        passed++;
    } catch (error) {
        console.log('❌ FAILED:', error.message, '\n');
        failed++;
    }

    // Print summary
    console.log('='.repeat(50));
    console.log(`Total Tests: ${passed + failed}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(50));

    return failed === 0;
}

// Check if server is running
async function checkServer() {
    try {
        const response = await makeRequest('GET', '/api/weather/effects');
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Main
(async () => {
    console.log('Checking if server is running...\n');
    
    const serverRunning = await checkServer();
    
    if (!serverRunning) {
        console.log('❌ Server is not running on http://localhost:3000');
        console.log('Please start the server first: npm start');
        process.exit(1);
    }

    console.log('✅ Server is running\n');
    
    const success = await runTests();
    process.exit(success ? 0 : 1);
})();

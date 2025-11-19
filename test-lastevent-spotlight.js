#!/usr/bin/env node

/**
 * LastEvent Spotlight Plugin - Comprehensive Test Suite
 * 
 * Tests all functionality of the plugin including:
 * - API endpoints
 * - Event handling
 * - Settings persistence
 * - Data retrieval
 * - All 6 overlay types
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const OVERLAY_TYPES = ['follower', 'like', 'chatter', 'share', 'gifter', 'subscriber'];

let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

/**
 * Make HTTP request
 */
function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: data ? JSON.parse(data) : null
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
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
 * Run a test
 */
async function test(name, testFn) {
    process.stdout.write(`  ${name}... `);
    try {
        await testFn();
        console.log('✅ PASS');
        testResults.passed++;
        testResults.tests.push({ name, status: 'PASS' });
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        testResults.failed++;
        testResults.tests.push({ name, status: 'FAIL', error: error.message });
    }
}

/**
 * Assert function
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

/**
 * Test Suite
 */
async function runTests() {
    console.log('\n🧪 LastEvent Spotlight Plugin - Test Suite\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Test 1: Settings API - Get all settings
    await test('GET /api/lastevent/settings returns all overlay settings', async () => {
        const res = await makeRequest('GET', '/api/lastevent/settings');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.success === true, 'Response should have success=true');
        assert(res.data.settings !== undefined, 'Response should have settings');
        OVERLAY_TYPES.forEach(type => {
            assert(res.data.settings[type] !== undefined, `Settings for ${type} should exist`);
        });
    });

    // Test 2: Settings API - Get specific overlay settings
    await test('GET /api/lastevent/settings/follower returns follower settings', async () => {
        const res = await makeRequest('GET', '/api/lastevent/settings/follower');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.success === true, 'Response should have success=true');
        assert(res.data.settings !== undefined, 'Response should have settings');
        assert(res.data.settings.fontFamily !== undefined, 'Settings should have fontFamily');
    });

    // Test 3-8: Test events for all overlay types
    for (const type of OVERLAY_TYPES) {
        await test(`POST /api/lastevent/test/${type} sends test event`, async () => {
            const res = await makeRequest('POST', `/api/lastevent/test/${type}`);
            assert(res.status === 200, `Expected status 200, got ${res.status}`);
            assert(res.data.success === true, 'Response should have success=true');
            assert(res.data.user !== undefined, 'Response should have user data');
            assert(res.data.user.uniqueId !== undefined, 'User should have uniqueId');
            assert(res.data.user.nickname !== undefined, 'User should have nickname');
            assert(res.data.user.eventType === type, `Event type should be ${type}`);
        });
    }

    // Test 9-14: Retrieve last user for all overlay types
    for (const type of OVERLAY_TYPES) {
        await test(`GET /api/lastevent/last/${type} retrieves saved user`, async () => {
            const res = await makeRequest('GET', `/api/lastevent/last/${type}`);
            assert(res.status === 200, `Expected status 200, got ${res.status}`);
            assert(res.data.success === true, 'Response should have success=true');
            assert(res.data.user !== undefined, 'Response should have user data');
            assert(res.data.type === type, `Type should be ${type}`);
        });
    }

    // Test 15-20: Overlay HTML loads for all types
    for (const type of OVERLAY_TYPES) {
        await test(`GET /overlay/lastevent/${type} loads HTML`, async () => {
            const res = await makeRequest('GET', `/overlay/lastevent/${type}`);
            assert(res.status === 200, `Expected status 200, got ${res.status}`);
            assert(typeof res.data === 'string', 'Response should be HTML string');
            assert(res.data.includes('<!DOCTYPE html>'), 'Response should contain HTML');
            assert(res.data.includes('overlay-container'), 'HTML should have overlay-container');
        });
    }

    // Test 21-26: Overlay JS loads for all types
    for (const type of OVERLAY_TYPES) {
        await test(`GET /plugins/lastevent-spotlight/overlays/${type}.js loads JS`, async () => {
            const res = await makeRequest('GET', `/plugins/lastevent-spotlight/overlays/${type}.js`);
            assert(res.status === 200, `Expected status 200, got ${res.status}`);
            assert(typeof res.data === 'string', 'Response should be JS string');
            assert(res.data.includes(`OVERLAY_TYPE = '${type}'`), `JS should define OVERLAY_TYPE as ${type}`);
        });
    }

    // Test 27: Animations library loads
    await test('GET /plugins/lastevent-spotlight/lib/animations.js loads', async () => {
        const res = await makeRequest('GET', '/plugins/lastevent-spotlight/lib/animations.js');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.includes('AnimationRegistry'), 'JS should contain AnimationRegistry');
        assert(res.data.includes('AnimationRenderer'), 'JS should contain AnimationRenderer');
    });

    // Test 28: Text effects library loads
    await test('GET /plugins/lastevent-spotlight/lib/text-effects.js loads', async () => {
        const res = await makeRequest('GET', '/plugins/lastevent-spotlight/lib/text-effects.js');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.includes('TextEffects'), 'JS should contain TextEffects');
    });

    // Test 29: Template renderer library loads
    await test('GET /plugins/lastevent-spotlight/lib/template-renderer.js loads', async () => {
        const res = await makeRequest('GET', '/plugins/lastevent-spotlight/lib/template-renderer.js');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.includes('TemplateRenderer'), 'JS should contain TemplateRenderer');
    });

    // Test 30: UI loads
    await test('GET /lastevent-spotlight/ui loads UI HTML', async () => {
        const res = await makeRequest('GET', '/lastevent-spotlight/ui');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.includes('LastEvent Spotlight'), 'UI should contain title');
        assert(res.data.includes('overlay-grid'), 'UI should have overlay-grid');
    });

    // Test 31: UI JS loads
    await test('GET /plugins/lastevent-spotlight/ui/main.js loads UI JS', async () => {
        const res = await makeRequest('GET', '/plugins/lastevent-spotlight/ui/main.js');
        assert(res.status === 200, `Expected status 200, got ${res.status}`);
        assert(res.data.includes('overlayTypes'), 'UI JS should define overlayTypes');
    });

    // Print results
    console.log('\n═══════════════════════════════════════════════════════\n');
    console.log(`📊 Test Results:\n`);
    console.log(`  ✅ Passed: ${testResults.passed}`);
    console.log(`  ❌ Failed: ${testResults.failed}`);
    console.log(`  📝 Total:  ${testResults.passed + testResults.failed}`);
    console.log('\n═══════════════════════════════════════════════════════\n');

    if (testResults.failed > 0) {
        console.log('Failed tests:');
        testResults.tests
            .filter(t => t.status === 'FAIL')
            .forEach(t => console.log(`  ❌ ${t.name}: ${t.error}`));
        console.log();
        process.exit(1);
    } else {
        console.log('🎉 All tests passed!\n');
        process.exit(0);
    }
}

// Run tests
runTests().catch(error => {
    console.error('\n❌ Test suite failed with error:', error.message);
    process.exit(1);
});

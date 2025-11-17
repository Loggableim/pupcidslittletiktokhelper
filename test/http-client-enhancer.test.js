/**
 * Test for HTTP Client Enhancer
 * 
 * This test validates the HTTP client enhancement system
 */

const assert = require('assert');
const HttpClientEnhancer = require('../modules/http-client-enhancer');

// Test suite
const tests = [
    {
        name: 'HttpClientEnhancer initializes correctly',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            assert.ok(enhancer, 'Enhancer should be created');
            assert.strictEqual(enhancer.defaultTimeout, 20000, 'Default timeout should be 20s');
        }
    },
    {
        name: 'Enhance sets timeout environment variable',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            // Clear env var first
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
            
            const config = enhancer.enhance({ timeout: 25000 });
            
            assert.strictEqual(process.env.TIKTOK_CLIENT_TIMEOUT, '25000', 'Should set TIKTOK_CLIENT_TIMEOUT');
            assert.strictEqual(config.timeout, 25000, 'Config should reflect timeout');
            assert.strictEqual(config.enhanced, true, 'Config should show enhanced');
            
            // Restore
            enhancer.restore();
        }
    },
    {
        name: 'Enhance uses default timeout when not specified',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            // Clear env var first
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
            
            const config = enhancer.enhance();
            
            assert.strictEqual(process.env.TIKTOK_CLIENT_TIMEOUT, '20000', 'Should use default timeout');
            
            // Restore
            enhancer.restore();
        }
    },
    {
        name: 'Restore clears environment variable',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            // Clear env var first
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
            
            enhancer.enhance({ timeout: 25000 });
            assert.ok(process.env.TIKTOK_CLIENT_TIMEOUT, 'Env var should be set');
            
            enhancer.restore();
            assert.strictEqual(process.env.TIKTOK_CLIENT_TIMEOUT, undefined, 'Env var should be cleared');
        }
    },
    {
        name: 'Restore preserves original value',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            // Set original value
            process.env.TIKTOK_CLIENT_TIMEOUT = '15000';
            
            enhancer.enhance({ timeout: 25000 });
            assert.strictEqual(process.env.TIKTOK_CLIENT_TIMEOUT, '25000', 'Env var should be enhanced');
            
            enhancer.restore();
            assert.strictEqual(process.env.TIKTOK_CLIENT_TIMEOUT, '15000', 'Env var should be restored to original');
            
            // Clean up
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
        }
    },
    {
        name: 'getConfiguration returns current and original values',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            // Set original value
            process.env.TIKTOK_CLIENT_TIMEOUT = '15000';
            
            const configBefore = enhancer.getConfiguration();
            assert.strictEqual(configBefore.currentTimeout, 15000, 'Should show current timeout');
            assert.strictEqual(configBefore.originalTimeout, 10000, 'Should show original default');
            
            enhancer.enhance({ timeout: 25000 });
            
            const configAfter = enhancer.getConfiguration();
            assert.strictEqual(configAfter.currentTimeout, 25000, 'Should show enhanced timeout');
            assert.strictEqual(configAfter.originalTimeout, 15000, 'Should show original timeout');
            assert.strictEqual(configAfter.enhanced, true, 'Should show enhanced');
            
            // Clean up
            enhancer.restore();
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
        }
    },
    {
        name: 'Verbose option logs configuration',
        fn: () => {
            const enhancer = new HttpClientEnhancer();
            
            // Capture console output
            const originalLog = console.log;
            let logOutput = '';
            console.log = (msg) => { logOutput += msg + '\n'; };
            
            delete process.env.TIKTOK_CLIENT_TIMEOUT;
            enhancer.enhance({ timeout: 30000, verbose: true });
            
            // Restore console
            console.log = originalLog;
            
            assert.ok(logOutput.includes('HTTP Client Enhanced'), 'Should log enhancement');
            assert.ok(logOutput.includes('30000'), 'Should log timeout value');
            
            // Clean up
            enhancer.restore();
        }
    }
];

// Run tests
async function runTests() {
    console.log('🧪 Running HTTP Client Enhancer Tests...\n');
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            await test.fn();
            console.log(`✅ ${test.name}`);
            passed++;
        } catch (error) {
            console.error(`❌ ${test.name}`);
            console.error(`   Error: ${error.message}`);
            if (error.stack) {
                console.error(`   Stack: ${error.stack.split('\n')[1]}`);
            }
            failed++;
        }
    }
    
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Fatal error running tests:', error);
        process.exit(1);
    });
}

module.exports = { runTests, tests };

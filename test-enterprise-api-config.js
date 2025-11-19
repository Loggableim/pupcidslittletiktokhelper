/**
 * Test: Verify Enterprise API Configuration
 * 
 * This test validates that the Enterprise API feature flag is properly
 * configured in the WebSocket URL generation.
 */

const { createWebSocketUrl } = require('@eulerstream/euler-websocket-sdk');

console.log('='.repeat(60));
console.log('Testing Enterprise API Configuration');
console.log('='.repeat(60));
console.log('');

// Test 1: URL without Enterprise API (old behavior)
console.log('Test 1: URL WITHOUT Enterprise API flag');
const urlWithout = createWebSocketUrl({
    uniqueId: 'testuser',
    apiKey: 'test_api_key_123'
});
console.log('Generated URL:', urlWithout);
console.log('Contains useEnterpriseApi=true:', urlWithout.includes('useEnterpriseApi=true'));
console.log('Contains useEnterpriseApi=false:', urlWithout.includes('useEnterpriseApi=false'));
console.log('');

// Test 2: URL with Enterprise API enabled (new behavior)
console.log('Test 2: URL WITH Enterprise API flag enabled');
const urlWith = createWebSocketUrl({
    uniqueId: 'testuser',
    apiKey: 'test_api_key_123',
    features: {
        useEnterpriseApi: true
    }
});
console.log('Generated URL:', urlWith);
console.log('Contains useEnterpriseApi=true:', urlWith.includes('useEnterpriseApi=true'));
console.log('Contains features.useEnterpriseApi=true:', urlWith.includes('features.useEnterpriseApi=true'));
console.log('');

// Test 3: Verify the fix is applied
console.log('Test 3: Validation');
if (urlWith.includes('useEnterpriseApi=true') || urlWith.includes('features.useEnterpriseApi=true')) {
    console.log('✅ SUCCESS: Enterprise API flag is properly set in the URL');
    console.log('');
    console.log('This configuration should:');
    console.log('  - Improve live stream detection accuracy');
    console.log('  - Enhance compatibility with enterprise/account API keys');
    console.log('  - Provide more reliable WebSocket connections');
    process.exit(0);
} else {
    console.log('❌ FAILED: Enterprise API flag is NOT in the URL');
    console.log('Expected to find: useEnterpriseApi=true or features.useEnterpriseApi=true');
    process.exit(1);
}

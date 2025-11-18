/**
 * Test script for OpenShockClient updateConfig method
 * Verifies that configuration can be updated dynamically
 */

const OpenShockClient = require('./plugins/openshock/helpers/openShockClient');

// Mock logger
const logger = {
    info: (msg, data) => console.log('ℹ️ ', msg, data || ''),
    warn: (msg, data) => console.warn('⚠️ ', msg, data || ''),
    error: (msg, data) => console.error('❌', msg, data || '')
};

async function testUpdateConfig() {
    console.log('='.repeat(60));
    console.log('Testing OpenShockClient updateConfig Method');
    console.log('='.repeat(60));

    // Test 1: Create client with initial config
    console.log('\n📝 Test 1: Create client with initial config');
    const client = new OpenShockClient('initial-api-key', 'https://api.example.com', logger);
    console.log('✅ Client created');
    console.log(`   - API Key: ${client.apiKey.substring(0, 10)}...`);
    console.log(`   - Base URL: ${client.baseUrl}`);
    console.log(`   - Is Configured: ${client.isConfigured}`);
    console.log(`   - Axios Base URL: ${client.axiosInstance.defaults.baseURL}`);
    console.log(`   - Axios Token Header: ${client.axiosInstance.defaults.headers['Open-Shock-Token'].substring(0, 10)}...`);

    // Test 2: Update API key only
    console.log('\n📝 Test 2: Update API key only');
    client.updateConfig({ apiKey: 'updated-api-key-12345' });
    console.log('✅ API key updated');
    console.log(`   - New API Key: ${client.apiKey.substring(0, 10)}...`);
    console.log(`   - Base URL (unchanged): ${client.baseUrl}`);
    console.log(`   - Is Configured: ${client.isConfigured}`);
    console.log(`   - Axios Token Header: ${client.axiosInstance.defaults.headers['Open-Shock-Token'].substring(0, 10)}...`);
    
    // Verify the axios instance was updated
    if (client.axiosInstance.defaults.headers['Open-Shock-Token'] === 'updated-api-key-12345') {
        console.log('✅ Axios headers correctly updated');
    } else {
        console.error('❌ Axios headers NOT updated!');
        process.exit(1);
    }

    // Test 3: Update base URL only
    console.log('\n📝 Test 3: Update base URL only');
    client.updateConfig({ baseUrl: 'https://api.newurl.com' });
    console.log('✅ Base URL updated');
    console.log(`   - API Key (unchanged): ${client.apiKey.substring(0, 10)}...`);
    console.log(`   - New Base URL: ${client.baseUrl}`);
    console.log(`   - Axios Base URL: ${client.axiosInstance.defaults.baseURL}`);
    
    // Verify the axios instance was updated
    if (client.axiosInstance.defaults.baseURL === 'https://api.newurl.com') {
        console.log('✅ Axios base URL correctly updated');
    } else {
        console.error('❌ Axios base URL NOT updated!');
        process.exit(1);
    }

    // Test 4: Update both at once
    console.log('\n📝 Test 4: Update both API key and base URL');
    client.updateConfig({ 
        apiKey: 'final-api-key-67890',
        baseUrl: 'https://api.final.com'
    });
    console.log('✅ Both updated');
    console.log(`   - Final API Key: ${client.apiKey.substring(0, 10)}...`);
    console.log(`   - Final Base URL: ${client.baseUrl}`);
    console.log(`   - Axios Base URL: ${client.axiosInstance.defaults.baseURL}`);
    console.log(`   - Axios Token Header: ${client.axiosInstance.defaults.headers['Open-Shock-Token'].substring(0, 10)}...`);
    
    // Verify both were updated
    if (client.axiosInstance.defaults.baseURL === 'https://api.final.com' &&
        client.axiosInstance.defaults.headers['Open-Shock-Token'] === 'final-api-key-67890') {
        console.log('✅ Both axios properties correctly updated');
    } else {
        console.error('❌ Axios properties NOT updated correctly!');
        process.exit(1);
    }

    // Test 5: Clear API key (set to empty)
    console.log('\n📝 Test 5: Clear API key');
    client.updateConfig({ apiKey: '' });
    console.log('✅ API key cleared');
    console.log(`   - API Key: "${client.apiKey}"`);
    console.log(`   - Is Configured: ${client.isConfigured}`);
    
    if (!client.isConfigured) {
        console.log('✅ Client correctly marked as not configured');
    } else {
        console.error('❌ Client should be marked as not configured!');
        process.exit(1);
    }

    // Test 6: Restore API key
    console.log('\n📝 Test 6: Restore API key');
    client.updateConfig({ apiKey: 'restored-key' });
    console.log('✅ API key restored');
    console.log(`   - API Key: ${client.apiKey}`);
    console.log(`   - Is Configured: ${client.isConfigured}`);
    
    if (client.isConfigured) {
        console.log('✅ Client correctly marked as configured');
    } else {
        console.error('❌ Client should be marked as configured!');
        process.exit(1);
    }

    // Test 7: Update with trailing slash in URL
    console.log('\n📝 Test 7: Update with trailing slash in URL');
    client.updateConfig({ baseUrl: 'https://api.test.com/' });
    console.log(`   - Base URL (trailing slash removed): ${client.baseUrl}`);
    
    if (client.baseUrl === 'https://api.test.com') {
        console.log('✅ Trailing slash correctly removed');
    } else {
        console.error('❌ Trailing slash should be removed!');
        process.exit(1);
    }

    // All tests passed
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\nThe updateConfig() method is working correctly.');
    console.log('Configuration changes are properly propagated to the axios instance.');
}

// Run tests
testUpdateConfig().catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
});

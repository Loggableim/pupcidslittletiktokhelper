/**
 * Simple OpenShock Command Test
 * This script tests sending commands to OpenShock devices
 * 
 * Usage: node test-openshock-command.js
 */

const OpenShockClient = require('./plugins/openshock/helpers/openShockClient');

const API_KEY = '6PP4UFqvQg1sWEyWKTD30dvbBMLfwtaW5sPwfopq8HKBSNIQYxdabBV0fANe623m';
const BASE_URL = 'https://api.openshock.app';

// Simple logger
const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args)
};

async function main() {
    console.log('='.repeat(60));
    console.log('OpenShock Command Test');
    console.log('='.repeat(60));
    console.log();

    // Create client
    const client = new OpenShockClient(API_KEY, BASE_URL, logger);
    
    try {
        // Step 1: Get devices
        console.log('Step 1: Fetching devices...');
        const devices = await client.getDevices();
        
        if (devices.length === 0) {
            console.error('❌ No devices found!');
            return;
        }
        
        console.log(`✅ Found ${devices.length} device(s):`);
        devices.forEach((device, index) => {
            console.log(`  ${index + 1}. ${device.name} (ID: ${device.id})`);
            console.log(`     Device: ${device.deviceName} (${device.deviceId})`);
            console.log(`     Model: ${device.model || 'Unknown'}`);
        });
        console.log();
        
        // Step 2: Test command with first device
        const testDevice = devices[0];
        console.log('Step 2: Sending test command...');
        console.log(`  Target: ${testDevice.name}`);
        console.log(`  Type: Vibrate`);
        console.log(`  Intensity: 50%`);
        console.log(`  Duration: 1000ms (1 second)`);
        console.log();
        
        console.log('⏳ Sending command...');
        const result = await client.sendVibrate(testDevice.id, 50, 1000);
        
        console.log();
        console.log('✅ Command sent successfully!');
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log();
        console.log('👀 CHECK YOUR LED NOW - It should be lighting up!');
        console.log();
        
        // Test all devices
        if (devices.length > 1) {
            console.log('Step 3: Testing all devices...');
            for (let i = 0; i < devices.length; i++) {
                const device = devices[i];
                console.log(`\n  Testing device ${i + 1}: ${device.name}...`);
                await client.sendVibrate(device.id, 30, 500);
                console.log(`  ✅ Command sent to ${device.name}`);
                
                // Wait a bit between commands
                if (i < devices.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            console.log('\n✅ All devices tested!');
        }
        
    } catch (error) {
        console.error('\n❌ Error occurred:');
        console.error('Message:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

main();

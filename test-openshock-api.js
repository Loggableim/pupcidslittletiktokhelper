/**
 * OpenShock API Test Script
 * Tests device listing and command sending to diagnose the issue
 */

const axios = require('axios');

const API_KEY = '6PP4UFqvQg1sWEyWKTD30dvbBMLfwtaW5sPwfopq8HKBSNIQYxdabBV0fANe623m';
const BASE_URL = 'https://api.openshock.app';

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
        'Open-Shock-Token': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OpenShockClient/1.0'
    }
});

async function testGetDevices() {
    console.log('\n=== Testing GET /1/shockers/own ===');
    try {
        const response = await client.get('/1/shockers/own');
        console.log('✅ Success!');
        console.log('Status:', response.status);
        console.log('Response structure:', JSON.stringify(response.data, null, 2));
        
        // Extract devices and shockers
        const devicesWithShockers = response.data?.data || response.data?.Data || response.data || [];
        console.log(`\nFound ${devicesWithShockers.length} device(s)`);
        
        const allShockers = [];
        for (const device of devicesWithShockers) {
            const shockers = device.shockers || device.Shockers || [];
            console.log(`  Device "${device.name || device.Name}": ${shockers.length} shocker(s)`);
            for (const shocker of shockers) {
                const shockerId = shocker.id || shocker.Id;
                const shockerName = shocker.name || shocker.Name;
                console.log(`    - Shocker ID: ${shockerId}, Name: ${shockerName}`);
                allShockers.push({
                    id: shockerId,
                    name: shockerName,
                    deviceId: device.id || device.Id,
                    deviceName: device.name || device.Name
                });
            }
        }
        
        return allShockers;
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        throw error;
    }
}

async function testControlCommand(shockerId, commandType, intensity, duration) {
    console.log(`\n=== Testing POST /2/shockers/control ===`);
    console.log(`Command: ${commandType}, Intensity: ${intensity}, Duration: ${duration}ms`);
    console.log(`Shocker ID: ${shockerId}`);
    
    // Test different request formats to see which one works
    const formats = [
        {
            name: 'Format 1: shocks array with id',
            body: {
                shocks: [{
                    id: shockerId,
                    type: commandType,
                    intensity: intensity,
                    duration: duration
                }]
            }
        },
        {
            name: 'Format 2: shocks array with shockerId',
            body: {
                shocks: [{
                    shockerId: shockerId,
                    type: commandType,
                    intensity: intensity,
                    duration: duration
                }]
            }
        },
        {
            name: 'Format 3: Direct object with id',
            body: {
                id: shockerId,
                type: commandType,
                intensity: intensity,
                duration: duration
            }
        }
    ];
    
    for (const format of formats) {
        console.log(`\nTrying ${format.name}...`);
        console.log('Request body:', JSON.stringify(format.body, null, 2));
        try {
            const response = await client.post('/2/shockers/control', format.body);
            console.log(`✅ Success with ${format.name}!`);
            console.log('Status:', response.status);
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return { success: true, format: format.name, response: response.data };
        } catch (error) {
            console.error(`❌ Failed with ${format.name}`);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Error:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error('Error:', error.message);
            }
        }
    }
    
    return { success: false };
}

async function main() {
    console.log('OpenShock API Test');
    console.log('==================\n');
    
    try {
        // Step 1: Get devices
        const shockers = await testGetDevices();
        
        if (shockers.length === 0) {
            console.log('\n⚠️  No shockers found. Cannot test control commands.');
            return;
        }
        
        // Step 2: Test control command with first shocker
        console.log(`\n\nTesting control command with first shocker...`);
        const testShocker = shockers[0];
        
        // Test with Vibrate (safest option)
        const result = await testControlCommand(
            testShocker.id,
            'Vibrate',  // Try capitalized
            30,         // Low intensity
            500         // Short duration
        );
        
        if (!result.success) {
            console.log('\n\nTrying with lowercase type...');
            await testControlCommand(
                testShocker.id,
                'vibrate',  // Try lowercase
                30,
                500
            );
        }
        
    } catch (error) {
        console.error('\n\nTest failed:', error.message);
        process.exit(1);
    }
}

main();

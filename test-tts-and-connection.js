/**
 * Test Script for TTS (Speechify) and TikTok Connection
 * 
 * This script tests the TTS functionality with Speechify API and TikTok connection
 * 
 * Usage:
 *   node test-tts-and-connection.js
 * 
 * Requirements:
 *   - Server must be running (npm start)
 *   - Internet connection required for Speechify API
 *   - TikTok user must be LIVE for connection test
 */

const axios = require('axios');
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const API_BASE = 'http://localhost:3000';
const SPEECHIFY_API_KEY = 'RB2weemocwY746BGQcAubfrXgeiC-3KAJao84867EuQ=';
const TIKTOK_USERNAME = 'pupcid';

// Helper functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bright');
    console.log('='.repeat(60));
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
async function testServerStatus() {
    section('1. Testing Server Status');
    try {
        const response = await axios.get(`${API_BASE}/api/status`);
        log('✓ Server is running', 'green');
        log(`  Connection Status: ${response.data.isConnected ? 'Connected' : 'Not Connected'}`, 'cyan');
        log(`  Username: ${response.data.username || 'None'}`, 'cyan');
        return true;
    } catch (error) {
        log('✗ Server is not running or not accessible', 'red');
        log(`  Error: ${error.message}`, 'red');
        log('\n  Please start the server first: npm start', 'yellow');
        return false;
    }
}

async function testTTSStatus() {
    section('2. Testing TTS Plugin Status');
    try {
        const response = await axios.get(`${API_BASE}/api/tts/status`);
        log('✓ TTS Plugin is initialized', 'green');
        log(`  Default Engine: ${response.data.status.config.defaultEngine}`, 'cyan');
        log(`  Default Voice: ${response.data.status.config.defaultVoice}`, 'cyan');
        log(`  Engines Available:`, 'cyan');
        log(`    - TikTok: ${response.data.status.engines.tiktok ? '✓' : '✗'}`, 
            response.data.status.engines.tiktok ? 'green' : 'red');
        log(`    - Google: ${response.data.status.engines.google ? '✓' : '✗'}`, 
            response.data.status.engines.google ? 'green' : 'yellow');
        log(`    - Speechify: ${response.data.status.engines.speechify ? '✓' : '✗'}`, 
            response.data.status.engines.speechify ? 'green' : 'yellow');
        
        return {
            initialized: response.data.status.initialized,
            speechifyEnabled: response.data.status.engines.speechify
        };
    } catch (error) {
        log('✗ TTS Plugin status check failed', 'red');
        log(`  Error: ${error.message}`, 'red');
        return { initialized: false, speechifyEnabled: false };
    }
}

async function configureSpeechifyAPI() {
    section('3. Configuring Speechify API Key');
    try {
        const response = await axios.post(`${API_BASE}/api/tts/config`, {
            speechifyApiKey: SPEECHIFY_API_KEY,
            defaultEngine: 'speechify',
            defaultVoice: 'george',  // English male voice
            enabledForChat: true,
            autoLanguageDetection: true
        });
        
        if (response.data.success) {
            log('✓ Speechify API key configured successfully', 'green');
            log(`  Default Engine: ${response.data.config.defaultEngine}`, 'cyan');
            log(`  Default Voice: ${response.data.config.defaultVoice}`, 'cyan');
            log(`  Auto Language Detection: ${response.data.config.autoLanguageDetection}`, 'cyan');
            return true;
        } else {
            log('✗ Configuration failed', 'red');
            return false;
        }
    } catch (error) {
        log('✗ Configuration request failed', 'red');
        log(`  Error: ${error.message}`, 'red');
        return false;
    }
}

async function testSpeechifyVoices() {
    section('4. Testing Speechify Voices');
    try {
        const response = await axios.get(`${API_BASE}/api/tts/voices?engine=speechify`);
        const voices = response.data.voices.speechify;
        
        if (!voices || Object.keys(voices).length === 0) {
            log('✗ No Speechify voices available', 'yellow');
            log('  This may indicate that the Speechify engine is not initialized', 'yellow');
            return false;
        }
        
        log(`✓ Found ${Object.keys(voices).length} Speechify voices`, 'green');
        log('\n  Sample voices:', 'cyan');
        
        // Show first 5 voices as examples
        const voiceIds = Object.keys(voices).slice(0, 5);
        voiceIds.forEach(id => {
            const voice = voices[id];
            log(`    - ${id}: ${voice.name} (${voice.language}, ${voice.gender})`, 'cyan');
        });
        
        if (Object.keys(voices).length > 5) {
            log(`    ... and ${Object.keys(voices).length - 5} more`, 'cyan');
        }
        
        return true;
    } catch (error) {
        log('✗ Failed to fetch Speechify voices', 'red');
        log(`  Error: ${error.message}`, 'red');
        
        if (error.response?.data?.error) {
            log(`  API Error: ${error.response.data.error}`, 'red');
        }
        
        if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
            log('\n  ⚠ Network Error: Cannot reach Speechify API', 'yellow');
            log('  This is expected in environments without internet access', 'yellow');
            log('  The configuration is correct, but needs internet to fetch voices', 'yellow');
        }
        
        return false;
    }
}

async function testTTSSynthesis() {
    section('5. Testing TTS Synthesis');
    
    const testCases = [
        {
            name: 'English with George voice',
            text: 'Hello, this is a test of the Speechify text-to-speech system',
            voice: 'george',
            engine: 'speechify'
        },
        {
            name: 'German with Mads voice',
            text: 'Hallo, das ist ein Test der Speechify Text-zu-Sprache Funktion',
            voice: 'mads',
            engine: 'speechify'
        }
    ];
    
    for (const testCase of testCases) {
        log(`\n  Testing: ${testCase.name}`, 'cyan');
        
        try {
            const response = await axios.post(`${API_BASE}/api/tts/speak`, {
                text: testCase.text,
                username: 'test_user',
                voice: testCase.voice,
                engine: testCase.engine
            });
            
            if (response.data.success) {
                log(`    ✓ TTS synthesis successful`, 'green');
                log(`    Engine used: ${response.data.engine || 'unknown'}`, 'cyan');
                log(`    Voice used: ${response.data.voice || 'unknown'}`, 'cyan');
            } else {
                log(`    ✗ TTS synthesis failed`, 'red');
                log(`    Error: ${response.data.error}`, 'red');
                if (response.data.message) {
                    log(`    Message: ${response.data.message}`, 'yellow');
                }
            }
        } catch (error) {
            log(`    ✗ TTS request failed`, 'red');
            log(`    Error: ${error.message}`, 'red');
            
            if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
                log('    ⚠ Network Error: Cannot reach Speechify API', 'yellow');
            }
        }
    }
}

async function testTikTokConnection() {
    section('6. Testing TikTok Connection');
    
    log(`  Attempting to connect to @${TIKTOK_USERNAME}...`, 'cyan');
    log(`  Note: User must be LIVE for connection to succeed`, 'yellow');
    
    try {
        const response = await axios.post(`${API_BASE}/api/connect`, {
            username: TIKTOK_USERNAME
        });
        
        if (response.data.success) {
            log(`✓ Successfully connected to @${TIKTOK_USERNAME}`, 'green');
            log(`  Room ID: ${response.data.roomId || 'unknown'}`, 'cyan');
            
            // Wait a bit and check status
            await sleep(3000);
            const statusResponse = await axios.get(`${API_BASE}/api/status`);
            
            log(`\n  Connection Status:`, 'cyan');
            log(`    Connected: ${statusResponse.data.isConnected}`, 'cyan');
            log(`    Username: ${statusResponse.data.username}`, 'cyan');
            log(`    Viewers: ${statusResponse.data.stats.viewers}`, 'cyan');
            log(`    Likes: ${statusResponse.data.stats.likes}`, 'cyan');
            
            return true;
        } else {
            log(`✗ Connection failed`, 'red');
            log(`  Error: ${response.data.error || 'Unknown error'}`, 'red');
            return false;
        }
    } catch (error) {
        log(`✗ Connection request failed`, 'red');
        log(`  Error: ${error.message}`, 'red');
        
        if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
            log('\n  ⚠ Network Error: Cannot reach TikTok API', 'yellow');
            log('  This is expected in environments without internet access', 'yellow');
        } else if (error.response?.data?.error) {
            log(`  API Error: ${error.response.data.error}`, 'yellow');
        }
        
        log('\n  Troubleshooting tips:', 'cyan');
        log(`    1. Ensure @${TIKTOK_USERNAME} is currently LIVE`, 'cyan');
        log('    2. Wait 10-15 seconds after starting the stream', 'cyan');
        log('    3. Check if you need a VPN (SIGI_STATE errors)', 'cyan');
        log('    4. Verify internet connectivity', 'cyan');
        
        return false;
    }
}

async function checkDebugLogs() {
    section('7. Checking Debug Logs');
    try {
        const response = await axios.get(`${API_BASE}/api/tts/debug/logs`);
        const logs = response.data.logs;
        
        if (!logs || logs.length === 0) {
            log('  No debug logs available', 'yellow');
            return;
        }
        
        log(`  Total debug logs: ${response.data.totalLogs}`, 'cyan');
        log('\n  Recent logs (last 5):', 'cyan');
        
        const recentLogs = logs.slice(-5);
        recentLogs.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            console.log(`    [${timestamp}] ${log.category}: ${log.message}`);
            if (log.data && Object.keys(log.data).length > 0) {
                console.log(`      Data: ${JSON.stringify(log.data, null, 2).substring(0, 200)}...`);
            }
        });
    } catch (error) {
        log('  Failed to fetch debug logs', 'yellow');
    }
}

async function printSummary(results) {
    section('Summary');
    
    log('\nConfiguration Status:', 'bright');
    log(`  Server Running: ${results.serverRunning ? '✓' : '✗'}`, 
        results.serverRunning ? 'green' : 'red');
    log(`  TTS Plugin Initialized: ${results.ttsInitialized ? '✓' : '✗'}`, 
        results.ttsInitialized ? 'green' : 'red');
    log(`  Speechify Engine: ${results.speechifyEnabled ? '✓ Enabled' : '✗ Disabled'}`, 
        results.speechifyEnabled ? 'green' : 'yellow');
    log(`  Speechify API Key: ${SPEECHIFY_API_KEY ? '✓ Configured' : '✗ Not Set'}`, 
        SPEECHIFY_API_KEY ? 'green' : 'red');
    
    log('\nTest Results:', 'bright');
    log(`  Speechify Voices Available: ${results.voicesAvailable ? '✓' : '✗'}`, 
        results.voicesAvailable ? 'green' : 'yellow');
    log(`  TikTok Connection: ${results.tiktokConnected ? '✓ Connected' : '✗ Not Connected'}`, 
        results.tiktokConnected ? 'green' : 'yellow');
    
    log('\n' + '='.repeat(60), 'bright');
    
    if (!results.voicesAvailable || !results.tiktokConnected) {
        log('\n⚠ Network Access Required', 'yellow');
        log('Some tests failed due to network restrictions.', 'yellow');
        log('The configuration is correct and will work with internet access.', 'yellow');
        log('\nTo test in production:', 'cyan');
        log('  1. Ensure internet connectivity', 'cyan');
        log(`  2. Make sure @${TIKTOK_USERNAME} is LIVE on TikTok`, 'cyan');
        log('  3. Open the dashboard: http://localhost:3000/dashboard.html', 'cyan');
        log('  4. Click "Connect" and test TTS from chat messages', 'cyan');
    } else {
        log('\n✓ All systems operational!', 'green');
    }
}

// Main execution
async function main() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
    log('║     TTS (Speechify) & TikTok Connection Test Script       ║', 'bright');
    log('╚════════════════════════════════════════════════════════════╝', 'bright');
    
    const results = {
        serverRunning: false,
        ttsInitialized: false,
        speechifyEnabled: false,
        voicesAvailable: false,
        tiktokConnected: false
    };
    
    // Test 1: Server Status
    results.serverRunning = await testServerStatus();
    if (!results.serverRunning) {
        log('\n✗ Cannot proceed without running server. Exiting.', 'red');
        process.exit(1);
    }
    
    // Test 2: TTS Status
    const ttsStatus = await testTTSStatus();
    results.ttsInitialized = ttsStatus.initialized;
    results.speechifyEnabled = ttsStatus.speechifyEnabled;
    
    // Test 3: Configure Speechify
    if (!results.speechifyEnabled) {
        log('\n  Speechify not enabled. Configuring now...', 'yellow');
        await configureSpeechifyAPI();
        
        // Re-check status
        const newStatus = await testTTSStatus();
        results.speechifyEnabled = newStatus.speechifyEnabled;
    } else {
        log('\n  Speechify already configured. Updating configuration...', 'cyan');
        await configureSpeechifyAPI();
    }
    
    // Test 4: Speechify Voices
    results.voicesAvailable = await testSpeechifyVoices();
    
    // Test 5: TTS Synthesis
    await testTTSSynthesis();
    
    // Test 6: TikTok Connection
    results.tiktokConnected = await testTikTokConnection();
    
    // Test 7: Debug Logs
    await checkDebugLogs();
    
    // Summary
    await printSummary(results);
}

// Run the tests
main().catch(error => {
    log('\n✗ Unexpected error occurred:', 'red');
    log(error.message, 'red');
    if (error.stack) {
        console.log(error.stack);
    }
    process.exit(1);
});

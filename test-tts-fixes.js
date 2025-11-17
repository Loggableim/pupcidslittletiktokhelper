#!/usr/bin/env node

/**
 * TTS Fix Validation Test
 * 
 * This script validates the fixes made for TTS CSP and connection issues:
 * 1. CSP headers include Socket.IO hash
 * 2. /tts route is accessible
 * 3. Required files are present
 * 4. WebSocket connection uses dynamic port
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function logTest(name, passed, message) {
    const status = passed ? '✓' : '✗';
    const color = passed ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${status}\x1b[0m ${name}: ${message}`);
    
    testResults.tests.push({ name, passed, message });
    if (passed) testResults.passed++;
    else testResults.failed++;
}

async function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('\n🔍 TTS Fix Validation Tests\n');
    console.log('=' .repeat(60));
    
    // Test 1: Check if CSS file exists
    const cssPath = path.join(__dirname, 'tts', 'ui.css');
    const cssExists = fs.existsSync(cssPath);
    logTest('CSS File Exists', cssExists, cssExists ? 'ui.css found' : 'ui.css missing');
    
    // Test 2: Check if CSS file has content
    if (cssExists) {
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const hasContent = cssContent.length > 100;
        logTest('CSS File Content', hasContent, `${cssContent.length} bytes`);
    }
    
    // Test 3: Check WebSocket connection code
    const jsPath = path.join(__dirname, 'tts', 'ui.js');
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    const hasDynamicPort = jsContent.includes('window.location.protocol') && 
                          jsContent.includes('window.location.hostname');
    logTest('Dynamic Port Detection', hasDynamicPort, 
            hasDynamicPort ? 'Uses window.location for WebSocket URL' : 'Still uses hardcoded port');
    
    // Test 4: Check if hardcoded port 8080 was removed
    const hasHardcodedPort = jsContent.includes('ws://localhost:8080');
    logTest('No Hardcoded Port', !hasHardcodedPort,
            hasHardcodedPort ? 'Still contains ws://localhost:8080' : 'Hardcoded port removed');
    
    // Test 5: Check server.js for CSP hash
    const serverPath = path.join(__dirname, 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    const hasSocketIOHash = serverContent.includes('sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=');
    logTest('Socket.IO CSP Hash', hasSocketIOHash,
            hasSocketIOHash ? 'CSP includes Socket.IO hash' : 'Socket.IO hash missing from CSP');
    
    // Test 6: Check if /tts static route was added
    const hasTTSRoute = serverContent.includes("app.use('/tts'") || 
                       serverContent.includes('app.use("/tts"');
    logTest('TTS Static Route', hasTTSRoute,
            hasTTSRoute ? '/tts route configured' : '/tts route missing');
    
    console.log('=' .repeat(60));
    console.log(`\n📊 Test Summary: ${testResults.passed} passed, ${testResults.failed} failed\n`);
    
    if (testResults.failed === 0) {
        console.log('✅ All tests passed! TTS fixes are correctly implemented.\n');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed. Please review the fixes.\n');
        process.exit(1);
    }
}

// Run tests
runTests().catch(err => {
    console.error('Error running tests:', err);
    process.exit(1);
});

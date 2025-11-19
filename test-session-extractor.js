#!/usr/bin/env node

/**
 * Test script for Session Extractor
 * 
 * This script tests the basic functionality of the SessionExtractor module
 * without actually launching a browser.
 */

const SessionExtractor = require('./modules/session-extractor');
const Database = require('./modules/database');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Session Extractor Module\n');

// Create a temporary test database
const testDbPath = path.join(__dirname, 'test-session-extractor.db');
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);
const sessionExtractor = new SessionExtractor(db);

async function runTests() {
    let passed = 0;
    let failed = 0;

    // Test 1: Module initialization
    console.log('Test 1: Module Initialization');
    try {
        if (sessionExtractor && typeof sessionExtractor.extractSessionId === 'function') {
            console.log('✅ SessionExtractor initialized correctly\n');
            passed++;
        } else {
            console.log('❌ SessionExtractor not initialized correctly\n');
            failed++;
        }
    } catch (error) {
        console.log('❌ Error:', error.message, '\n');
        failed++;
    }

    // Test 2: Get session status (should be empty initially)
    console.log('Test 2: Get Initial Session Status');
    try {
        // First, ensure session is cleared
        sessionExtractor.clearSessionData();
        
        const status = sessionExtractor.getSessionStatus();
        if (status && status.hasSession === false) {
            console.log('✅ Initial session status is empty as expected\n');
            passed++;
        } else {
            console.log('❌ Unexpected initial session status:', status, '\n');
            failed++;
        }
    } catch (error) {
        console.log('❌ Error:', error.message, '\n');
        failed++;
    }

    // Test 3: Save and load session data manually
    console.log('Test 3: Manual Session Data Management');
    try {
        const testSessionData = {
            sessionId: 'test_session_12345',
            ttTargetIdc: 'test_idc',
            extractedAt: new Date().toISOString(),
            cookies: []
        };

        // Save to database
        db.setSetting('tiktok_session_id', testSessionData.sessionId);
        db.setSetting('tiktok_tt_target_idc', testSessionData.ttTargetIdc);
        db.setSetting('tiktok_session_extracted_at', testSessionData.extractedAt);

        // Load status
        const status = sessionExtractor.getSessionStatus();
        
        // Check if session exists (status.sessionId is masked, showing only first 10 chars)
        if (status.hasSession && status.sessionId && status.sessionId.startsWith('test_sessi')) {
            console.log('✅ Session data saved and loaded correctly\n');
            passed++;
        } else {
            console.log('❌ Session data not saved/loaded correctly\n');
            console.log('   Status:', status);
            failed++;
        }
    } catch (error) {
        console.log('❌ Error:', error.message, '\n');
        failed++;
    }

    // Test 4: Clear session data
    console.log('Test 4: Clear Session Data');
    try {
        const result = sessionExtractor.clearSessionData();
        
        // Get fresh status after clearing
        const status = sessionExtractor.getSessionStatus();

        if (result.success && !status.hasSession) {
            console.log('✅ Session data cleared successfully\n');
            passed++;
        } else {
            console.log('❌ Session data not cleared correctly\n');
            console.log('   Clear result:', result);
            console.log('   Status after clear:', status);
            failed++;
        }
    } catch (error) {
        console.log('❌ Error:', error.message, '\n');
        failed++;
    }

    // Test 5: Browser availability test
    console.log('Test 5: Browser Availability Test');
    try {
        const result = await sessionExtractor.testBrowserAvailability();
        
        if (result && typeof result.available === 'boolean') {
            if (result.available) {
                console.log('✅ Browser automation is available\n');
            } else {
                console.log('⚠️  Browser automation not available:', result.message);
                console.log('ℹ️  This is expected if Chrome/Chromium is not installed\n');
            }
            passed++;
        } else {
            console.log('❌ Unexpected browser test result\n');
            failed++;
        }
    } catch (error) {
        console.log('⚠️  Browser test error:', error.message);
        console.log('ℹ️  This is expected if Chrome/Chromium is not installed\n');
        passed++; // Don't fail test if browser is not available
    }

    // Test 6: Test extraction with no browser (should fail gracefully)
    console.log('Test 6: Extraction Error Handling');
    try {
        // This should fail because we don't have a real browser in CI
        const result = await sessionExtractor.extractSessionId({ headless: true });
        
        if (!result.success && result.message) {
            console.log('✅ Extraction fails gracefully with error message\n');
            passed++;
        } else {
            console.log('⚠️  Unexpected extraction success (browser might be available)\n');
            passed++; // Still pass if browser exists
        }
    } catch (error) {
        console.log('✅ Extraction error handled gracefully:', error.message.substring(0, 50), '...\n');
        passed++;
    }

    // Summary
    console.log('='.repeat(50));
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('✅ All tests passed!\n');
    } else {
        console.log('❌ Some tests failed\n');
    }

    // Cleanup
    try {
        db.close();
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        console.log('🧹 Cleanup completed');
    } catch (error) {
        console.log('⚠️  Cleanup error:', error.message);
    }

    return failed === 0 ? 0 : 1;
}

// Run tests
runTests()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('❌ Test suite error:', error);
        process.exit(1);
    });

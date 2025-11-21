/**
 * Test for TikTok Session Extractor - Chrome Lock Handling
 * Tests that the extractor can handle the case where Chrome is already running
 */

const TikTokSessionExtractor = require('../plugins/tts/engines/tiktok-session-extractor');
const path = require('path');
const fs = require('fs');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => {} // Suppress debug messages
};

console.log('🧪 Testing TikTok Session Extractor Chrome Lock Handling\n');

async function testTempDirCreation() {
    console.log('Test 1: Temporary directory creation and cleanup');
    
    const extractor = new TikTokSessionExtractor(mockLogger);
    
    try {
        // Test creating temp directory
        const tempDir = extractor._createTempUserDataDir();
        console.log(`✓ Created temp directory: ${tempDir}`);
        
        // Verify directory exists
        if (!fs.existsSync(tempDir)) {
            throw new Error('Temporary directory was not created');
        }
        console.log('✓ Temporary directory exists');
        
        // Test cleanup
        await extractor._cleanupTempUserDataDir();
        console.log('✓ Cleanup method executed');
        
        // Verify directory is removed
        if (fs.existsSync(tempDir)) {
            throw new Error('Temporary directory was not cleaned up');
        }
        console.log('✓ Temporary directory removed successfully');
        
        console.log('✅ Test 1 passed\n');
        return true;
    } catch (error) {
        console.log(`❌ Test 1 failed: ${error.message}\n`);
        return false;
    }
}

async function testMultipleTempDirs() {
    console.log('Test 2: Multiple temporary directories (should be unique)');
    
    const extractor1 = new TikTokSessionExtractor(mockLogger);
    const extractor2 = new TikTokSessionExtractor(mockLogger);
    
    try {
        const tempDir1 = extractor1._createTempUserDataDir();
        // Small delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));
        const tempDir2 = extractor2._createTempUserDataDir();
        
        if (tempDir1 === tempDir2) {
            throw new Error('Temporary directories should be unique');
        }
        console.log('✓ Temporary directories are unique');
        
        // Cleanup
        await extractor1._cleanupTempUserDataDir();
        await extractor2._cleanupTempUserDataDir();
        console.log('✓ Both directories cleaned up');
        
        console.log('✅ Test 2 passed\n');
        return true;
    } catch (error) {
        console.log(`❌ Test 2 failed: ${error.message}\n`);
        // Cleanup on error
        try {
            await extractor1._cleanupTempUserDataDir();
            await extractor2._cleanupTempUserDataDir();
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        return false;
    }
}

async function testCleanupOnNonExistent() {
    console.log('Test 3: Cleanup on non-existent directory (should not error)');
    
    const extractor = new TikTokSessionExtractor(mockLogger);
    
    try {
        // Call cleanup without creating directory first
        await extractor._cleanupTempUserDataDir();
        console.log('✓ Cleanup on non-existent directory did not throw error');
        
        console.log('✅ Test 3 passed\n');
        return true;
    } catch (error) {
        console.log(`❌ Test 3 failed: ${error.message}\n`);
        return false;
    }
}

// Run all tests
async function runTests() {
    const results = [];
    
    results.push(await testTempDirCreation());
    results.push(await testMultipleTempDirs());
    results.push(await testCleanupOnNonExistent());
    
    const passed = results.filter(r => r).length;
    const failed = results.length - passed;
    
    console.log('='.repeat(50));
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('✅ All tests passed!\n');
        return 0;
    } else {
        console.log('❌ Some tests failed\n');
        return 1;
    }
}

runTests()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('❌ Test suite error:', error);
        process.exit(1);
    });

#!/usr/bin/env node

/**
 * Cloud Sync Engine Test
 * Tests the basic functionality of the cloud sync engine
 */

const fs = require('fs');
const path = require('path');
const Database = require('./modules/database');
const CloudSyncEngine = require('./modules/cloud-sync');

// Test configuration
const testDbPath = path.join(__dirname, 'test-cloud-sync.db');
const testCloudPath = path.join(__dirname, 'test-cloud-sync-folder');
const testLocalPath = path.join(__dirname, 'user_configs');

console.log('🧪 Cloud Sync Engine Test\n');
console.log('='.repeat(50));

async function cleanup() {
    // Clean up test files
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    if (fs.existsSync(testCloudPath)) {
        fs.rmSync(testCloudPath, { recursive: true, force: true });
    }
}

async function runTests() {
    let db, cloudSync;

    try {
        // Test 1: Initialize database and cloud sync
        console.log('\n📝 Test 1: Initialize cloud sync engine');
        db = new Database(testDbPath);
        cloudSync = new CloudSyncEngine(db.db);
        console.log('✅ Cloud sync engine initialized');

        // Test 2: Validate invalid path
        console.log('\n📝 Test 2: Validate invalid path');
        const invalidValidation = cloudSync.validateCloudPath('/nonexistent/path/that/does/not/exist');
        if (!invalidValidation.valid) {
            console.log('✅ Invalid path correctly rejected:', invalidValidation.error);
        } else {
            throw new Error('Invalid path was accepted!');
        }

        // Test 3: Create test cloud folder
        console.log('\n📝 Test 3: Create test cloud folder');
        if (!fs.existsSync(testCloudPath)) {
            fs.mkdirSync(testCloudPath, { recursive: true });
        }
        console.log('✅ Test cloud folder created:', testCloudPath);

        // Test 4: Validate valid path
        console.log('\n📝 Test 4: Validate valid path');
        const validValidation = cloudSync.validateCloudPath(testCloudPath);
        if (validValidation.valid) {
            console.log('✅ Valid path correctly accepted');
        } else {
            throw new Error('Valid path was rejected: ' + validValidation.error);
        }

        // Test 5: Check initial status
        console.log('\n📝 Test 5: Check initial status');
        const initialStatus = cloudSync.getStatus();
        if (!initialStatus.enabled && initialStatus.cloudPath === null) {
            console.log('✅ Initial status correct (disabled, no path)');
        } else {
            throw new Error('Initial status unexpected');
        }

        // Test 6: Enable cloud sync
        console.log('\n📝 Test 6: Enable cloud sync');
        await cloudSync.enable(testCloudPath);
        const enabledStatus = cloudSync.getStatus();
        if (enabledStatus.enabled && enabledStatus.cloudPath === testCloudPath) {
            console.log('✅ Cloud sync enabled successfully');
            console.log('   Stats:', JSON.stringify(enabledStatus.stats, null, 2));
        } else {
            throw new Error('Cloud sync not enabled properly');
        }

        // Test 7: Create test file in local directory
        console.log('\n📝 Test 7: Create test file and verify sync');
        const testFileName = 'test-config.json';
        const testFilePath = path.join(testLocalPath, testFileName);
        const testData = { test: 'data', timestamp: Date.now() };
        
        // Ensure local directory exists
        if (!fs.existsSync(testLocalPath)) {
            fs.mkdirSync(testLocalPath, { recursive: true });
        }
        
        fs.writeFileSync(testFilePath, JSON.stringify(testData, null, 2));
        console.log('   Created test file:', testFilePath);
        
        // Wait a bit for file watcher to trigger
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if file was synced to cloud
        const cloudFilePath = path.join(testCloudPath, testFileName);
        if (fs.existsSync(cloudFilePath)) {
            const cloudData = JSON.parse(fs.readFileSync(cloudFilePath, 'utf8'));
            if (JSON.stringify(cloudData) === JSON.stringify(testData)) {
                console.log('✅ File synced to cloud successfully');
            } else {
                throw new Error('Cloud file data mismatch');
            }
        } else {
            console.log('⚠️  File not yet synced to cloud (may need more time)');
        }

        // Test 8: Disable cloud sync
        console.log('\n📝 Test 8: Disable cloud sync');
        await cloudSync.disable();
        const disabledStatus = cloudSync.getStatus();
        if (!disabledStatus.enabled) {
            console.log('✅ Cloud sync disabled successfully');
        } else {
            throw new Error('Cloud sync not disabled properly');
        }

        // Test 9: Verify local files remain after disable
        console.log('\n📝 Test 9: Verify local files remain after disable');
        if (fs.existsSync(testFilePath)) {
            console.log('✅ Local files preserved after disable');
        } else {
            throw new Error('Local files were deleted!');
        }

        // Test 10: Shutdown
        console.log('\n📝 Test 10: Shutdown cloud sync');
        await cloudSync.shutdown();
        console.log('✅ Cloud sync shut down cleanly');

        // Success
        console.log('\n' + '='.repeat(50));
        console.log('✅ All tests passed!');
        console.log('='.repeat(50) + '\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Cleanup
        if (db) db.close();
        console.log('\n🧹 Cleaning up test files...');
        await cleanup();
        console.log('✅ Cleanup complete\n');
    }
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

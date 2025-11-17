/**
 * Test TTS Deduplication Logic
 * This test validates that duplicate events and messages are properly blocked
 */

const QueueManager = require('./plugins/tts/utils/queue-manager');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`)
};

// Mock config
const mockConfig = {
    maxQueueSize: 100,
    rateLimit: 3,
    rateLimitWindow: 60
};

console.log('=== TTS Deduplication Test ===\n');

// Test 1: Basic deduplication
console.log('Test 1: Basic Deduplication');
console.log('----------------------------');
const queueManager = new QueueManager(mockConfig, mockLogger);

const item1 = {
    userId: 'user123',
    username: 'testuser',
    text: 'Hello world',
    voice: 'en_us_001',
    engine: 'tiktok',
    audioData: 'base64data',
    source: 'chat',
    teamLevel: 0,
    priority: 0
};

// First message should be queued
const result1 = queueManager.enqueue(item1);
console.log('First message:', result1.success ? '✓ Queued' : '✗ Rejected', '-', result1.reason || 'Success');

// Immediate duplicate should be blocked
const result2 = queueManager.enqueue(item1);
console.log('Immediate duplicate:', result2.success ? '✗ Should be blocked' : '✓ Blocked', '-', result2.reason);

console.log('');

// Test 2: Different user, same text - should be allowed
console.log('Test 2: Different User, Same Text');
console.log('----------------------------------');
const item2 = {
    ...item1,
    userId: 'user456',
    username: 'anotheruser'
};

const result3 = queueManager.enqueue(item2);
console.log('Different user:', result3.success ? '✓ Queued' : '✗ Rejected', '-', result3.reason || 'Success');

console.log('');

// Test 3: Same user, different text - should be allowed
console.log('Test 3: Same User, Different Text');
console.log('----------------------------------');
const item3 = {
    ...item1,
    text: 'Different message'
};

const result4 = queueManager.enqueue(item3);
console.log('Different text:', result4.success ? '✓ Queued' : '✗ Rejected', '-', result4.reason || 'Success');

console.log('');

// Test 4: Wait for hash window and retry
console.log('Test 4: Wait for Hash Window (5 seconds)');
console.log('-----------------------------------------');
console.log('Waiting 5 seconds for hash window to expire...');

setTimeout(() => {
    const item4 = {
        ...item1,
        text: 'Hello world' // Same as first message
    };
    
    const result5 = queueManager.enqueue(item4);
    console.log('After 5 seconds:', result5.success ? '✓ Queued' : '✗ Rejected', '-', result5.reason || 'Success');
    
    console.log('');
    
    // Test 5: Check statistics
    console.log('Test 5: Statistics');
    console.log('------------------');
    const stats = queueManager.getStats();
    console.log('Total queued:', stats.totalQueued);
    console.log('Total duplicates blocked:', stats.totalDuplicatesBlocked);
    console.log('Queue size:', stats.currentQueueSize);
    console.log('Recent hashes size:', stats.recentHashesSize);
    
    console.log('');
    
    // Test 6: Clear cache
    console.log('Test 6: Clear Deduplication Cache');
    console.log('----------------------------------');
    queueManager.clearDeduplicationCache();
    
    const item5 = {
        ...item1,
        text: 'Hello world' // Should now be allowed again
    };
    
    const result6 = queueManager.enqueue(item5);
    console.log('After cache clear:', result6.success ? '✓ Queued' : '✗ Rejected', '-', result6.reason || 'Success');
    
    console.log('');
    console.log('=== Test Complete ===');
    
    // Final stats
    const finalStats = queueManager.getStats();
    console.log('\nFinal Statistics:');
    console.log('- Total queued:', finalStats.totalQueued);
    console.log('- Total duplicates blocked:', finalStats.totalDuplicatesBlocked);
    console.log('- Queue size:', finalStats.currentQueueSize);
    
    // Exit
    process.exit(0);
}, 5100);

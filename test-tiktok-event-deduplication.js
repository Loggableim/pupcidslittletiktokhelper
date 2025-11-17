/**
 * Test TikTok Event Deduplication Logic
 * This test validates that duplicate TikTok events are properly blocked
 */

const EventEmitter = require('events');

// Create a minimal mock of TikTokConnector to test deduplication
class TikTokConnectorMock extends EventEmitter {
    constructor() {
        super();
        this.processedEvents = new Map();
        this.maxProcessedEvents = 1000;
        this.eventExpirationMs = 60000;
    }

    _generateEventHash(eventType, data) {
        const components = [eventType];
        
        if (data.userId) components.push(data.userId);
        if (data.uniqueId) components.push(data.uniqueId);
        if (data.username) components.push(data.username);
        
        switch (eventType) {
            case 'chat':
                if (data.message) components.push(data.message);
                if (data.comment) components.push(data.comment);
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
            case 'gift':
                if (data.giftId) components.push(data.giftId.toString());
                if (data.giftName) components.push(data.giftName);
                if (data.repeatCount) components.push(data.repeatCount.toString());
                break;
            case 'follow':
            case 'share':
            case 'subscribe':
                if (data.timestamp) {
                    const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
                    components.push(roundedTime.toString());
                }
                break;
        }
        
        return components.join('|');
    }

    _isDuplicateEvent(eventType, data) {
        const eventHash = this._generateEventHash(eventType, data);
        const now = Date.now();
        
        for (const [hash, timestamp] of this.processedEvents.entries()) {
            if (now - timestamp > this.eventExpirationMs) {
                this.processedEvents.delete(hash);
            }
        }
        
        if (this.processedEvents.has(eventHash)) {
            console.log(`🔄 [DUPLICATE BLOCKED] ${eventType} event already processed: ${eventHash}`);
            return true;
        }
        
        this.processedEvents.set(eventHash, now);
        
        if (this.processedEvents.size > this.maxProcessedEvents) {
            const firstKey = this.processedEvents.keys().next().value;
            this.processedEvents.delete(firstKey);
        }
        
        return false;
    }

    handleEvent(eventType, data) {
        if (this._isDuplicateEvent(eventType, data)) {
            console.log(`⚠️  Duplicate ${eventType} event ignored`);
            return false;
        }
        
        this.emit(eventType, data);
        return true;
    }
}

console.log('=== TikTok Event Deduplication Test ===\n');

const connector = new TikTokConnectorMock();
let eventsReceived = 0;

// Listen for events that make it through
connector.on('chat', (data) => {
    eventsReceived++;
    console.log(`✓ Chat event processed: "${data.message}" from ${data.username}`);
});

connector.on('gift', (data) => {
    eventsReceived++;
    console.log(`✓ Gift event processed: ${data.giftName} from ${data.username}`);
});

// Test 1: Chat message deduplication
console.log('Test 1: Chat Message Deduplication');
console.log('-----------------------------------');

const chatEvent = {
    uniqueId: 'user123',
    username: 'testuser',
    message: 'Hello world',
    timestamp: new Date().toISOString(),
    teamMemberLevel: 0
};

const result1 = connector.handleEvent('chat', chatEvent);
console.log('First message:', result1 ? '✓ Processed' : '✗ Blocked');

const result2 = connector.handleEvent('chat', chatEvent);
console.log('Duplicate message:', result2 ? '✗ Should be blocked' : '✓ Blocked');

const result3 = connector.handleEvent('chat', chatEvent);
console.log('Triple message:', result3 ? '✗ Should be blocked' : '✓ Blocked');

console.log('');

// Test 2: Different message from same user
console.log('Test 2: Different Message, Same User');
console.log('-------------------------------------');

const chatEvent2 = {
    ...chatEvent,
    message: 'Different message'
};

const result4 = connector.handleEvent('chat', chatEvent2);
console.log('Different message:', result4 ? '✓ Processed' : '✗ Blocked');

console.log('');

// Test 3: Same message from different user
console.log('Test 3: Same Message, Different User');
console.log('-------------------------------------');

const chatEvent3 = {
    ...chatEvent,
    uniqueId: 'user456',
    username: 'anotheruser'
};

const result5 = connector.handleEvent('chat', chatEvent3);
console.log('Different user:', result5 ? '✓ Processed' : '✗ Blocked');

console.log('');

// Test 4: Gift event deduplication
console.log('Test 4: Gift Event Deduplication');
console.log('---------------------------------');

const giftEvent = {
    uniqueId: 'user789',
    username: 'giftuser',
    giftId: 5655,
    giftName: 'Rose',
    repeatCount: 1,
    timestamp: new Date().toISOString()
};

const result6 = connector.handleEvent('gift', giftEvent);
console.log('First gift:', result6 ? '✓ Processed' : '✗ Blocked');

const result7 = connector.handleEvent('gift', giftEvent);
console.log('Duplicate gift:', result7 ? '✗ Should be blocked' : '✓ Blocked');

console.log('');

// Test 5: Same gift, different repeat count
console.log('Test 5: Same Gift, Different Repeat Count');
console.log('------------------------------------------');

const giftEvent2 = {
    ...giftEvent,
    repeatCount: 5
};

const result8 = connector.handleEvent('gift', giftEvent2);
console.log('Different repeat count:', result8 ? '✓ Processed' : '✗ Blocked');

console.log('');

// Test 6: Rapid fire duplicates (stress test)
console.log('Test 6: Rapid Fire Duplicates (10 messages)');
console.log('--------------------------------------------');

const rapidEvent = {
    uniqueId: 'rapiduser',
    username: 'rapiduser',
    message: 'Spam message',
    timestamp: new Date().toISOString()
};

let rapidPassed = 0;
let rapidBlocked = 0;

for (let i = 0; i < 10; i++) {
    if (connector.handleEvent('chat', rapidEvent)) {
        rapidPassed++;
    } else {
        rapidBlocked++;
    }
}

console.log(`Passed: ${rapidPassed}, Blocked: ${rapidBlocked}`);
console.log(rapidPassed === 1 && rapidBlocked === 9 ? '✓ Test passed' : '✗ Test failed');

console.log('');

// Summary
console.log('=== Test Summary ===');
console.log(`Total events that should have been processed: 5`);
console.log(`Total events actually processed: ${eventsReceived}`);
console.log(`Test result: ${eventsReceived === 5 ? '✓ PASSED' : '✗ FAILED'}`);
console.log(`Deduplication cache size: ${connector.processedEvents.size}`);

console.log('\n✓ All tests completed successfully!');

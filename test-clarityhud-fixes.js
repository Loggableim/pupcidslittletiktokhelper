/**
 * Test for ClarityHUD fixes
 * 
 * Tests:
 * 1. Gift name resolution from database catalog
 * 2. Chat message field mapping
 * 3. Correct username field extraction
 */

const ClarityHUDBackend = require('./plugins/clarityhud/backend/api.js');

// Mock API
class MockAPI {
  constructor() {
    this.emittedEvents = [];
    this.logs = [];
    this.db = null;
  }

  emit(event, data) {
    this.emittedEvents.push({ event, data });
    console.log(`[EMIT] ${event}:`, JSON.stringify(data, null, 2));
  }

  log(message, level = 'info') {
    this.logs.push({ message, level });
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  getDatabase() {
    return this.db;
  }

  setDatabase(db) {
    this.db = db;
  }

  async getConfig(key) {
    return null;
  }

  async setConfig(key, value) {
    return true;
  }

  registerRoute() {}
}

// Mock database
class MockDatabase {
  constructor() {
    this.giftCatalog = {
      5655: { id: 5655, name: 'Rose', diamond_count: 1 },
      5509: { id: 5509, name: 'TikTok', diamond_count: 1 },
      6064: { id: 6064, name: 'Heart Me', diamond_count: 10 }
    };
  }

  getGift(id) {
    return this.giftCatalog[id] || null;
  }
}

async function testGiftNameResolution() {
  console.log('\n========== Test 1: Gift Name Resolution ==========');
  
  const api = new MockAPI();
  const db = new MockDatabase();
  api.setDatabase(db);
  
  const backend = new ClarityHUDBackend(api);
  await backend.initialize();
  
  // Test case 1: Gift with name in event data
  console.log('\n--- Test 1a: Gift with name in event data ---');
  const giftWithName = {
    username: 'testuser',
    nickname: 'Test User',
    giftId: 5655,
    giftName: 'Rose',
    coins: 2,
    repeatCount: 1,
    giftType: 0
  };
  
  await backend.handleGiftEvent(giftWithName);
  const event1 = api.emittedEvents[api.emittedEvents.length - 1];
  console.log('Result:', event1.data.gift.name === 'Rose' ? '✅ PASS' : '❌ FAIL');
  console.log(`Expected: 'Rose', Got: '${event1.data.gift.name}'`);
  
  // Test case 2: Gift without name but with ID (should lookup from catalog)
  console.log('\n--- Test 1b: Gift without name but with ID (catalog lookup) ---');
  const giftWithoutName = {
    username: 'testuser2',
    nickname: 'Test User 2',
    giftId: 6064,
    giftName: null,
    coins: 20,
    repeatCount: 1,
    giftType: 0
  };
  
  await backend.handleGiftEvent(giftWithoutName);
  const event2 = api.emittedEvents[api.emittedEvents.length - 1];
  console.log('Result:', event2.data.gift.name === 'Heart Me' ? '✅ PASS' : '❌ FAIL');
  console.log(`Expected: 'Heart Me', Got: '${event2.data.gift.name}'`);
  
  // Test case 3: Gift without name and unknown ID (should fallback to 'Gift')
  console.log('\n--- Test 1c: Gift without name and unknown ID (fallback) ---');
  const unknownGift = {
    username: 'testuser3',
    nickname: 'Test User 3',
    giftId: 99999,
    giftName: null,
    coins: 10,
    repeatCount: 1,
    giftType: 0
  };
  
  await backend.handleGiftEvent(unknownGift);
  const event3 = api.emittedEvents[api.emittedEvents.length - 1];
  console.log('Result:', event3.data.gift.name === 'Gift' ? '✅ PASS' : '❌ FAIL');
  console.log(`Expected: 'Gift', Got: '${event3.data.gift.name}'`);
  console.log('Note: Should be "Gift" not "Unknown Gift"');
}

async function testChatMessageField() {
  console.log('\n========== Test 2: Chat Message Field Mapping ==========');
  
  const api = new MockAPI();
  const backend = new ClarityHUDBackend(api);
  await backend.initialize();
  
  // Test case 1: Chat with 'message' field (standard from TikTok module)
  console.log('\n--- Test 2a: Chat with message field ---');
  const chatWithMessage = {
    username: 'chatter1',
    nickname: 'Chatter One',
    message: 'Hello from message field!'
  };
  
  await backend.handleChatEvent(chatWithMessage);
  const event1 = api.emittedEvents[api.emittedEvents.length - 1];
  console.log('Result:', event1.data.message === 'Hello from message field!' ? '✅ PASS' : '❌ FAIL');
  console.log(`Expected: 'Hello from message field!', Got: '${event1.data.message}'`);
  
  // Test case 2: Chat with 'comment' field (legacy compatibility)
  console.log('\n--- Test 2b: Chat with comment field (legacy) ---');
  const chatWithComment = {
    username: 'chatter2',
    nickname: 'Chatter Two',
    comment: 'Hello from comment field!'
  };
  
  await backend.handleChatEvent(chatWithComment);
  const event2 = api.emittedEvents[api.emittedEvents.length - 1];
  console.log('Result:', event2.data.message === 'Hello from comment field!' ? '✅ PASS' : '❌ FAIL');
  console.log(`Expected: 'Hello from comment field!', Got: '${event2.data.message}'`);
}

async function testUsernameFieldExtraction() {
  console.log('\n========== Test 3: Username Field Extraction ==========');
  
  const api = new MockAPI();
  const backend = new ClarityHUDBackend(api);
  await backend.initialize();
  
  // Test case: Event with 'username' field (standard from TikTok module)
  console.log('\n--- Test 3a: Event with username field ---');
  const followEvent = {
    username: 'follower123',
    nickname: 'Follower Name'
  };
  
  await backend.handleFollowEvent(followEvent);
  const event1 = api.emittedEvents[api.emittedEvents.length - 1];
  console.log('Result:', event1.data.user.uniqueId === 'follower123' ? '✅ PASS' : '❌ FAIL');
  console.log(`Expected: 'follower123', Got: '${event1.data.user.uniqueId}'`);
}

async function runAllTests() {
  console.log('========================================');
  console.log('ClarityHUD Backend Fix Tests');
  console.log('========================================');
  
  try {
    await testGiftNameResolution();
    await testChatMessageField();
    await testUsernameFieldExtraction();
    
    console.log('\n========================================');
    console.log('All tests completed!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

runAllTests();
